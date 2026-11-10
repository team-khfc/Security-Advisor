import type { MockState } from '@/features/request';
import type { Actor } from '@/lib/types';
import { DomainError } from '@/lib/problem';
import type { FirewallRule } from '@/features/policy/types';

/** 모의 데이터의 현재 상태를 집계한다. 정확한 단계 시각이 없는 모의 이력은 평균을 만들지 않는다. */
export function mockInsights(
  state: MockState,
  actor: Actor,
  now: string,
  rules: FirewallRule[] = [],
) {
  if (actor.role !== 'ADMIN')
    throw new DomainError(403, 'FORBIDDEN', '기관 관리자만 업무 지표를 조회할 수 있습니다.');
  const count = (values: string[]) =>
    values.reduce<Record<string, number>>((result, key) => {
      result[key] = (result[key] ?? 0) + 1;
      return result;
    }, {});
  const requests = state.requests;
  const supplements = requests.flatMap((r) => r.supplements);
  const reviewed = new Set(
    state.auditEvents.filter((e) => e.action === 'REQUEST_REVIEW').map((e) => e.targetId),
  );
  const finalized = requests.filter((r) => r.status === 'FINALIZED');
  const ratio = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 1000 : null);
  const statuses: Record<string, string> = {
    DRAFT: 'DRAFTING',
    CONSULTING: 'IN_REVIEW',
    FINALIZED: 'CONFIRMED',
  };
  const timings: Record<string, string> = {
    WITHIN: 'ON_TRACK',
    DUE_SOON: 'IMMINENT',
    OVERDUE: 'OVERDUE',
  };
  const deadlines = requests.flatMap((r) => r.deadlines.filter((d) => d.active));
  return {
    requestsByDocType: count(requests.map((r) => r.docType)),
    requestsByStatus: count(requests.map((r) => statuses[r.status] ?? r.status)),
    requestsByStage: count(
      requests
        .filter((r) => !['FINALIZED', 'CLOSED', 'WITHDRAWN'].includes(r.status))
        .map((r) => String(r.stage)),
    ),
    averageBusinessDaysByStage: { '1': null, '2': null, '3': null, '4': null },
    completedByStage: { '1': 0, '2': 0, '3': 0, '4': 0 },
    activeDeadlines: count(deadlines.map((d) => timings[d.timing] ?? d.timing)),
    overdueDeadlines: deadlines.filter((d) => d.timing === 'OVERDUE').length,
    supplements: count(supplements.map((s) => s.status)),
    supplementsPerRequest: ratio(supplements.length, reviewed.size),
    stageReturnRate: ratio(
      requests.filter((r) => reviewed.has(r.id) && r.returns.length).length,
      reviewed.size,
    ),
    firstPassRate: ratio(
      finalized.filter((r) => !r.supplements.length && !r.returns.length).length,
      finalized.length,
    ),
    aiProposals: state.auditEvents.filter((e) => e.action === 'ANSWER_AI_PROPOSED').length,
    aiProposalsConfirmedUnchanged: 0,
    aiProposalsModified: 0,
    aiProposalConfirmRate: null,
    firewallRules: count(rules.map((r) => r.effectiveStatus)),
    averageReviewDays: null,
    completedReviewCount: 0,
    calculatedAt: now,
  };
}
