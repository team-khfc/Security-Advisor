import { z } from 'zod';
import type { Actor } from '@/lib/types';
import type { MockState, ReviewField } from '@/features/request/types';
import type { ReassignmentReason } from '@/lib/assignmentStatus';
import { DomainError } from '@/lib/problem';

interface Pool {
  reviewerPoolId: number;
  field: ReviewField;
  memberUsername: string;
  active: boolean;
  defaultReviewer: boolean;
}
/** 독립 프론트 실행에서도 계정 역할과 담당자 등록을 구분하는 합성 API다. */
export class MockReviewerPools {
  private pools: Pool[] = [];
  constructor(members: Actor[]) {
    for (const m of members.filter((m) => m.role === 'INFRA' || m.role === 'SECURITY'))
      this.pools.push({
        reviewerPoolId: this.pools.length + 1,
        field: m.role as ReviewField,
        memberUsername: m.username,
        active: m.active,
        defaultReviewer: true,
      });
  }
  reason(
    username: string | undefined,
    field: ReviewField,
    members: Actor[],
  ): ReassignmentReason | null {
    if (!username) return 'UNASSIGNED';
    const member = members.find((m) => m.username === username);
    if (!member?.active) return 'ACCOUNT_INACTIVE';
    if (member.role !== field) return 'ROLE_CHANGED';
    const p = this.pools.find((p) => p.memberUsername === username && p.field === field);
    return !p ? 'NOT_REGISTERED' : !p.active ? 'POOL_INACTIVE' : null;
  }
  directory(members: Actor[]) {
    return members.map((m) => ({
      ...m,
      registered:
        !['INFRA', 'SECURITY'].includes(m.role) ||
        this.reason(m.username, m.role as ReviewField, members) === null,
      defaultReviewer: this.pools.some(
        (p) =>
          p.memberUsername === m.username && p.field === m.role && p.defaultReviewer && p.active,
      ),
    }));
  }
  handle(
    actor: Actor,
    state: MockState,
    members: Actor[],
    method: string,
    id: string | undefined,
    sub: string | undefined,
    body: unknown,
  ) {
    if (actor.role !== 'ADMIN')
      throw new DomainError(403, 'FORBIDDEN', '기관 관리자만 담당자를 관리할 수 있습니다.');
    const response = (p: Pool) => {
      const reason = this.reason(p.memberUsername, p.field, members);
      return { ...p, eligible: reason === null, unavailableReason: reason };
    };
    if (method === 'GET') return this.pools.map(response);
    const record = (p: Pool, action: string, reason: string | null) =>
      state.auditEvents.push({
        id: crypto.randomUUID(),
        actorId: actor.id,
        actorName: actor.displayName,
        actorRole: actor.role,
        targetType: 'REVIEWER_POOL',
        targetId: String(p.reviewerPoolId),
        targetRevision: 1,
        action,
        reason,
        fieldKeys: [],
        requestId: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
      });
    const eligibleAccount = (p: Pool) => {
      const m = members.find((m) => m.username === p.memberUsername);
      if (!m?.active || m.role !== p.field)
        throw new DomainError(
          422,
          'INELIGIBLE_REVIEWER',
          '현재 역할의 활성 계정만 등록·기본 지정할 수 있습니다.',
        );
    };
    const makeDefault = (p: Pool) => {
      eligibleAccount(p);
      if (!p.active)
        throw new DomainError(
          422,
          'INELIGIBLE_REVIEWER',
          '비활성 등록은 기본 담당자가 될 수 없습니다.',
        );
      this.pools
        .filter((v) => v.field === p.field)
        .forEach((v) => {
          v.defaultReviewer = v === p;
        });
      record(p, 'REVIEWER_POOL_DEFAULT_CHANGED', null);
    };
    if (method === 'POST' && !id) {
      const input = z
        .object({
          field: z.enum(['INFRA', 'SECURITY']),
          memberUsername: z.string(),
          defaultReviewer: z.boolean(),
        })
        .parse(body);
      let p = this.pools.find(
        (p) => p.field === input.field && p.memberUsername === input.memberUsername,
      );
      if (p?.active) throw new DomainError(422, 'DUPLICATE_REVIEWER', '이미 등록된 담당자입니다.');
      const next = p ?? {
        ...input,
        reviewerPoolId: this.pools.length + 1,
        active: true,
        defaultReviewer: false,
      };
      eligibleAccount(next);
      if (!p) {
        this.pools.push(next);
        p = next;
      }
      p.active = true;
      record(p, 'REVIEWER_POOL_ADDED', null);
      if (input.defaultReviewer) makeDefault(p);
      return response(p);
    }
    const p = this.pools.find((p) => String(p.reviewerPoolId) === id);
    if (!p) throw new DomainError(404, 'NOT_FOUND', '담당자 등록을 찾을 수 없습니다.');
    if (method === 'PUT' && sub === 'default') {
      makeDefault(p);
      return response(p);
    }
    if (method === 'PUT' && sub === 'activation') {
      const input = z
        .object({ active: z.boolean(), reason: z.string().trim().min(1).max(500) })
        .parse(body);
      if (input.active) eligibleAccount(p);
      p.active = input.active;
      if (!p.active) p.defaultReviewer = false;
      record(p, p.active ? 'REVIEWER_POOL_ADDED' : 'REVIEWER_POOL_DEACTIVATED', input.reason);
      return { pool: response(p), reassignmentNeededRequestIds: [] };
    }
    throw new DomainError(404, 'NOT_FOUND', '지원하지 않는 담당자 요청입니다.');
  }
}
