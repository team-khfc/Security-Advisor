import { z } from 'zod';
import { ruleStatusLabels, type FirewallRule } from '@/features/policy/types';
import type { MockState } from '@/features/request/types';
import type { Actor } from '@/lib/types';
import { DomainError } from '@/lib/problem';
import { ContractMapper } from './contractMapper';
import { makeRequest } from './seed';

function fail(status: number, detail: string): never {
  throw new DomainError(status, `POLICY_${status}`, detail);
}
function period(value: string) {
  const [start, end] = value.split('~').map((s) => s.trim());
  const valid = (date: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    !Number.isNaN(Date.parse(date)) &&
    new Date(date).toISOString().slice(0, 10) === date;
  if (!valid(start) || (end && !valid(end)) || (end && end < start))
    fail(422, '사용 기간을 확인해 주세요.');
  return { start, end: end || null };
}

/** 합성 모드에서도 확정 제출본 값·역할·사유·revision·별도 연장 신청을 보존한다. */
export class MockPolicies {
  private rules = new Map<number, FirewallRule>();
  private sync(state: MockState, wire: ContractMapper) {
    for (const request of state.requests.filter(
      (r) => r.status === 'FINALIZED' && r.docType === 'FIREWALL',
    )) {
      const snapshot = request.submissions.find((s) => s.id === request.currentSubmissionId);
      if (
        !snapshot ||
        [...this.rules.values()].some((r) => r.submissionId === wire.id(snapshot.id))
      )
        continue;
      const values = new Map(
        [...snapshot.commonAnswers, ...snapshot.answers].map((a) => [a.key, a.value]),
      );
      const value = (modern: string, legacy: string) =>
        values.get(modern) || values.get(legacy) || '';
      const range = period(value('firewall.period', 'period'));
      const ports = value('firewall.port', 'port')
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean);
      ports.forEach((port, index) => {
        const id = this.rules.size + 1;
        this.rules.set(id, {
          firewallRuleId: id,
          securityRequestId: wire.id(request.id),
          submissionId: wire.id(snapshot.id),
          ruleNo: index + 1,
          source: value('network.source', 'sourceIp'),
          destination: value('network.destination', 'destinationIp'),
          protocol: value('firewall.protocol', 'protocol'),
          port,
          startDate: range.start,
          endDate: range.end,
          reviewDate: range.end
            ? null
            : `${Number(range.start.slice(0, 4)) + 1}${range.start.slice(4)}`,
          status: 'PENDING_APPLY',
          effectiveStatus: 'PENDING_APPLY',
          appliedBy: null,
          appliedAt: null,
          applicationNote: null,
          reason: null,
          renewalRequestId: null,
          revision: 0,
        });
      });
    }
  }
  private view(rule: FirewallRule, now: number) {
    const today = new Date(now + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const soon = new Date(now + 9 * 60 * 60 * 1000 + 30 * 86400000).toISOString().slice(0, 10);
    const effective =
      rule.status === 'APPLIED' && rule.endDate
        ? rule.endDate < today
          ? 'EXPIRED'
          : rule.endDate <= soon
            ? 'EXPIRING'
            : 'APPLIED'
        : rule.status;
    return {
      ...rule,
      effectiveStatus: effective,
      statusLabel: ruleStatusLabels[rule.status],
      effectiveStatusLabel: ruleStatusLabels[effective],
    };
  }
  /** 세션·CSRF 검증을 마친 경계에서만 호출한다. */
  handle(
    state: MockState,
    wire: ContractMapper,
    actor: Actor,
    url: URL,
    method: string,
    body: unknown,
    now: number,
  ): Response {
    this.sync(state, wire);
    const parts = url.pathname.split('/');
    const forRequest = parts[2] === 'security-requests';
    const id = Number(parts[3]);
    const sub = parts[4];
    const visible = (r: FirewallRule) =>
      actor.role !== 'APPLICANT' ||
      state.requests.find((v) => wire.id(v.id) === r.securityRequestId)?.ownerId === actor.id;
    if (method === 'GET') {
      const status = url.searchParams.get('effectiveStatus');
      const rules = [...this.rules.values()]
        .filter(visible)
        .filter((r) => !forRequest || r.securityRequestId === id)
        .map((r) => this.view(r, now));
      return Response.json(rules.filter((r) => !status || r.effectiveStatus === status).reverse());
    }
    const rule = this.rules.get(id);
    if (!rule || !visible(rule)) fail(404, '규칙을 찾을 수 없습니다.');
    const original = state.requests.find((r) => wire.id(r.id) === rule.securityRequestId)!;
    const at = new Date(now).toISOString();
    const audit = (action: string, reason: string | null) =>
      state.auditEvents.push({
        id: `policy-audit-${++state.sequence}`,
        actorId: actor.id,
        actorName: actor.displayName,
        actorRole: actor.role,
        targetType: 'SecurityRequest',
        targetId: original.id,
        targetRevision: original.revision,
        action,
        reason,
        fieldKeys: [],
        requestId: `policy-trace-${state.sequence}`,
        createdAt: at,
      });
    if (sub === 'renewal-requests' && method === 'POST') {
      if (actor.role !== 'APPLICANT' || original.ownerId !== actor.id)
        fail(403, '신청자만 연장 신청을 만들 수 있습니다.');
      const command = z
        .object({ newPeriod: z.string().min(1).max(30), note: z.string().max(1000).optional() })
        .parse(body);
      period(command.newPeriod);
      if (rule.status !== 'APPLIED') fail(422, '적용 완료된 규칙만 연장할 수 있습니다.');
      const previous = state.requests.find((r) => wire.id(r.id) === rule.renewalRequestId);
      if (previous && !['FINALIZED', 'CLOSED', 'WITHDRAWN'].includes(previous.status))
        fail(422, '진행 중인 연장 신청이 이미 있습니다.');
      const business = state.cases.find((c) => c.id === original.caseId)!;
      const created = makeRequest(business, 'FIREWALL', `renewal-${++state.sequence}`);
      created.createdAt = at;
      created.updatedAt = at;
      created.answers = structuredClone(original.answers).map((a) => ({
        ...a,
        source: 'USER_ANSWER',
        confirmed: true,
        confirmation: null,
        needsReview: false,
        revision: 0,
      }));
      const overrides = new Map([
        ['firewall.period', command.newPeriod],
        ['firewall.port', rule.port],
        ['firewall.protocol', rule.protocol],
      ]);
      if (command.note?.trim())
        overrides.set('firewall.purpose', `[기존 규칙 ${id} 연장] ${command.note.trim()}`);
      for (const [key, value] of overrides) {
        const answer = created.answers.find((a) => a.key === key);
        if (answer) answer.value = value;
        else
          created.answers.push({
            key,
            label: key,
            scope: 'REQUEST',
            ownerRole: 'APPLICANT',
            required: true,
            value,
            source: 'USER_ANSWER',
            evidence: null,
            confirmed: true,
            notApplicable: false,
            confirmation: null,
          });
      }
      state.requests.push(created);
      rule.renewalRequestId = wire.id(created.id);
      rule.revision++;
      audit('FIREWALL_RULE_RENEWAL_REQUESTED', command.note || null);
      return Response.json(
        {
          rule: this.view(rule, now),
          request: wire.summary(created),
          prefilledFieldKeys: created.answers.map((a) => a.key),
        },
        { status: 201 },
      );
    }
    if (actor.role !== 'INFRA') fail(403, 'ICT인프라 담당자만 처리 결과를 기록할 수 있습니다.');
    if (method !== 'PUT' || !['application', 'revocation'].includes(sub))
      fail(404, '처리 경로를 찾을 수 없습니다.');
    const command = z
      .object({
        expectedRevision: z.number().int().nonnegative(),
        result: z.enum(['APPLIED', 'NOT_APPLICABLE']).optional(),
        note: z.string().max(2000).optional(),
        reason: z.string().max(2000).optional(),
      })
      .parse(body);
    if (command.expectedRevision !== rule.revision)
      fail(409, '규칙이 변경되었습니다. 입력을 유지하고 최신 상태를 확인해 주세요.');
    if (sub === 'application' && !command.result) fail(400, '적용 결과를 선택해 주세요.');
    const next = sub === 'revocation' ? 'REVOKED' : command.result!;
    if (rule.status !== (next === 'REVOKED' ? 'APPLIED' : 'PENDING_APPLY'))
      fail(422, '현재 규칙 상태에서는 처리할 수 없습니다.');
    if (next !== 'APPLIED' && !command.reason?.trim()) fail(422, '사유를 입력해 주세요.');
    rule.status = next;
    rule.appliedBy = actor.username;
    rule.appliedAt = at;
    if (next === 'APPLIED') rule.applicationNote = command.note?.trim() || null;
    else rule.reason = command.reason!.trim();
    rule.revision++;
    audit(`FIREWALL_RULE_${next}`, command.reason?.trim() || null);
    return Response.json(this.view(rule, now));
  }
}
