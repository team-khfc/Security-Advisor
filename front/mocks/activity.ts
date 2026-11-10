import { STATUS_LABELS } from '@/features/request/types';
import type { Actor } from '@/lib/types';
import type { MockState, SecurityRequest } from '@/features/request/types';
import { finalReviewReadiness } from '@/features/request/readiness';
import { handoffFields } from '@/features/request/turns';
import { DomainError } from '@/lib/problem';
import type { ContractMapper } from './contractMapper';

/** 모의 모드에서도 읽음 이력과 현재 역할·배정의 업무 목록을 분리한다. */
export class MockActivity {
  private notices: {
    notificationId: number;
    recipient: string;
    role: string;
    requestId: string;
    kind: string;
    title: string;
    link: string;
    createdAt: string;
    readAt: string | null;
  }[] = [];
  private events = new Set<string>();
  private nextId = 1;

  sync(state: MockState, members: Actor[], wire: ContractMapper) {
    for (const event of state.auditEvents) {
      if (this.events.has(event.id)) continue;
      this.events.add(event.id);
      const request = state.requests.find((r) => r.id === event.requestId);
      if (!request) continue;
      const staff = ['REQUEST_REVIEW', 'REASSIGN', 'ANSWER_SUPPLEMENT', 'SUBMIT'].includes(
        event.action,
      );
      const applicant = [
        'REQUEST_SUPPLEMENT',
        'RETURN',
        'COMPLETE_REVIEW',
        'FINALIZE',
        'CLOSE',
      ].includes(event.action);
      if (!staff && !applicant) continue;
      for (const member of members.filter(
        (m) =>
          this.allowed(m, request) &&
          (staff ? ['INFRA', 'SECURITY'].includes(m.role) : m.role === 'APPLICANT'),
      )) {
        this.notices.push({
          notificationId: this.nextId++,
          recipient: member.id,
          role: member.role,
          requestId: request.id,
          kind: event.action,
          title: `신청 #${wire.id(request.id)} 업무 처리 소식`,
          link: `/requests/${wire.id(request.id)}`,
          createdAt: event.createdAt,
          readAt: null,
        });
      }
    }
  }

  private allowed(actor: Actor, request: SecurityRequest) {
    return (
      actor.active &&
      (actor.role === 'ADMIN' ||
        (actor.role === 'APPLICANT'
          ? request.ownerId === actor.id
          : request.assignments.some(
              (a) =>
                a.active &&
                !a.reassignmentReason &&
                a.field === actor.role &&
                a.assigneeId === actor.id,
            )))
    );
  }

  notifications(actor: Actor, state: MockState) {
    return this.notices
      .filter(
        (n) =>
          n.recipient === actor.id &&
          n.role === actor.role &&
          state.requests.some((r) => r.id === n.requestId && this.allowed(actor, r)),
      )
      .toReversed();
  }

  read(actor: Actor, state: MockState, id: number) {
    const n = this.notifications(actor, state).find((n) => n.notificationId === id);
    if (!n) throw new DomainError(404, 'NOT_FOUND', '알림을 찾을 수 없습니다.');
    n.readAt ??= new Date().toISOString();
    return n;
  }

  todos(actor: Actor, state: MockState, wire: ContractMapper) {
    const items: {
      key: string;
      kind: string;
      securityRequestId: number;
      title: string;
      link: string;
      context: {
        caseTitle: string;
        department: string;
        docType: string;
        statusLabel: string;
        stage: number;
        updatedAt: string;
      };
    }[] = [];
    const add = (r: SecurityRequest, kind: string, action: string, id = r.id) =>
      items.push({
        key: `${kind}:${id}`,
        kind,
        securityRequestId: wire.id(r.id),
        context: {
          caseTitle: r.caseTitle,
          department: r.department,
          docType: r.docType,
          statusLabel: STATUS_LABELS[r.status],
          stage: r.stage,
          updatedAt: r.updatedAt,
        },
        title: `신청 #${wire.id(r.id)} · ${action}`,
        link: `/requests/${wire.id(r.id)}`,
      });
    for (const r of state.requests) {
      if (!this.allowed(actor, r) || ['FINALIZED', 'CLOSED', 'WITHDRAWN'].includes(r.status))
        continue;
      if (actor.role === 'ADMIN') {
        if (handoffFields(r).length) add(r, 'REASSIGNMENT', '담당자 재배정');
      } else if (actor.role === 'APPLICANT') {
        if (r.status === 'FINAL_REVIEW') add(r, 'FINAL_REVIEW', '최종 초안 확인·제출');
        for (const s of r.supplements.filter((s) => s.status === 'OPEN'))
          add(r, 'SUPPLEMENT_OPEN', '보완 답변 작성', s.id);
      } else {
        if (
          r.stage === 2 &&
          r.reviews.some((v) => v.field === actor.role && v.status !== 'COMPLETE')
        )
          add(r, 'REVIEW', '담당자 협의');
        for (const s of r.supplements.filter(
          (s) => s.field === actor.role && s.status === 'ANSWERED',
        ))
          add(r, 'SUPPLEMENT_ANSWERED', '보완 답변 검토·해소', s.id);
        const ready = finalReviewReadiness(r, actor);
        if (r.status === 'SUBMITTED' && (!ready.confirmReason || !ready.finalizeReason))
          add(r, 'FINAL_CONFIRMATION', '최종 확인·서류 확정');
      }
    }
    return items.sort(
      (a, b) => b.securityRequestId - a.securityRequestId || a.key.localeCompare(b.key),
    );
  }
}
