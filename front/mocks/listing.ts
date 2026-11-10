import type { Actor } from '@/lib/types';
import { DOCUMENT_LABELS, type SecurityRequest, type MockState } from '@/features/request/types';
import { DomainError } from '@/lib/problem';
import type { ContractMapper } from './contractMapper';

function paging(params: URLSearchParams) {
  const page = Number(params.get('page') ?? 0),
    size = Number(params.get('size') ?? 20);
  if (!Number.isInteger(page) || page < 0 || !Number.isInteger(size) || size < 1 || size > 100)
    throw new DomainError(400, 'INVALID_PAGINATION', '페이지 값이 올바르지 않습니다.');
  return { page, size };
}
function allowed(r: SecurityRequest, actor: Actor) {
  return (
    actor.role === 'ADMIN' ||
    (actor.role === 'APPLICANT'
      ? r.ownerId === actor.id
      : r.assignments.some((a) => a.active && a.assigneeId === actor.id))
  );
}
function overview(r: SecurityRequest, actor: Actor, wire: ContractMapper) {
  const fields = (r.requiredReviewFields ?? (['INFRA', 'SECURITY'] as const)).map((field) => {
    const review = r.reviews.find((v) => v.field === field);
    return {
      field,
      reassignmentReason:
        r.stage >= 2 && !['FINALIZED', 'CLOSED', 'WITHDRAWN'].includes(r.status)
          ? (r.assignments.find((a) => a.active && a.field === field)?.reassignmentReason ??
            (r.assignments.some((a) => a.active && a.field === field) ? null : 'UNASSIGNED'))
          : null,
      assigneeUsername: wire.username(
        r.assignments.find((a) => a.active && a.field === field)?.assigneeId ?? null,
      ),
      reviewStatus: review
        ? ((
            { PENDING: 'WAITING', IN_REVIEW: 'IN_PROGRESS', COMPLETE: 'COMPLETED' } as Record<
              string,
              string
            >
          )[review.status] ?? review.status)
        : null,
      allocated: review?.allocationCompleted ?? false,
      confirmed: r.finalConfirmations.some(
        (c) => c.field === field && c.submissionId === r.currentSubmissionId,
      ),
    };
  });
  const own = fields.find((f) => f.field === actor.role);
  const myTurn =
    !['FINALIZED', 'CLOSED', 'WITHDRAWN'].includes(r.status) &&
    (actor.role === 'APPLICANT'
      ? ['DRAFT', 'SUPPLEMENT_REQUESTED', 'FINAL_REVIEW'].includes(r.status)
      : actor.role === 'ADMIN'
        ? r.stage >= 2 && fields.some((f) => !!f.reassignmentReason)
        : !!own &&
          own.assigneeUsername === actor.username &&
          ((r.stage === 2 &&
            own.reviewStatus !== 'COMPLETED' &&
            !r.supplements.some((s) => s.field === actor.role && s.status === 'OPEN') &&
            (actor.role === 'INFRA' || !fields.some((f) => f.field === 'INFRA' && !f.allocated))) ||
            (r.stage === 4 &&
              !!r.currentSubmissionId &&
              (actor.role === 'INFRA' ||
                !fields.some((f) => f.field === 'INFRA' && !f.confirmed)) &&
              (!own.confirmed ||
                (actor.role ===
                  (fields.some((f) => f.field === 'SECURITY') ? 'SECURITY' : 'INFRA') &&
                  fields.every((f) => f.confirmed))))));
  return {
    myTurn,
    fields,
    dueDate:
      r.deadlines
        .filter(
          (d) =>
            d.active &&
            (!['INFRA', 'SECURITY'].includes(actor.role) || !d.field || d.field === actor.role),
        )
        .map((d) => d.dueAt.slice(0, 10))
        .sort()[0] ?? null,
    submissionId: r.currentSubmissionId ? wire.id(r.currentSubmissionId) : null,
    needsReview: [...r.answers, ...r.commonAnswers].some((a) => a.needsReview),
  };
}

/** 모의 화면도 실제 서버와 같은 검색·페이지·권한 계약을 사용한다. */
export function mockRequestListing(
  requests: SecurityRequest[],
  actor: Actor,
  params: URLSearchParams,
  wire: ContractMapper,
) {
  const { page, size } = paging(params),
    query = (params.get('query') ?? '').trim().toLocaleLowerCase('ko-KR');
  const rows = requests
    .filter((r) => allowed(r, actor))
    .map((r) => ({
      r,
      item: { ...wire.list(r), createdAt: r.createdAt, overview: overview(r, actor, wire) },
    }))
    .filter(({ r, item }) => {
      const caseId = params.get('businessCaseId'),
        kind = params.get('documentKind'),
        supp = params.get('supplementState');
      const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(
        new Date(r.createdAt),
      );
      return (
        (!caseId || String(item.businessCaseId) === caseId) &&
        (!params.get('status') || item.status === params.get('status')) &&
        (!params.get('docType') || item.docType === params.get('docType')) &&
        (!query ||
          `${r.caseTitle} ${r.department} ${item.applicantUsername} ${item.securityRequestId} ${r.docType} ${DOCUMENT_LABELS[r.docType] ?? r.docType}`
            .toLocaleLowerCase('ko-KR')
            .includes(query)) &&
        (!params.get('from') || date >= params.get('from')!) &&
        (!params.get('to') || date <= params.get('to')!) &&
        (!kind ||
          kind === 'all' ||
          (kind === 'finalized'
            ? r.status === 'FINALIZED'
            : kind === 'submitted'
              ? r.status !== 'FINALIZED' && !!r.currentSubmissionId
              : r.status !== 'FINALIZED' && !r.currentSubmissionId)) &&
        (!supp ||
          supp === 'all' ||
          r.supplements.some(
            (s) =>
              supp === 'any' ||
              (supp === 'pending' ? s.status !== 'RESOLVED' : s.status === 'RESOLVED'),
          ))
      );
    });
  const summary = {
    all: rows.length,
    mine: rows.filter((v) => v.item.overview.myTurn).length,
    staff: rows.filter((v) => ['CONSULTING', 'SUBMITTED'].includes(v.r.status)).length,
    done: rows.filter((v) => v.r.status === 'FINALIZED').length,
  };
  const inbox = params.get('inbox') ?? 'all',
    sort = params.get('sort') ?? 'createdAt,desc';
  const filtered = rows
    .filter(
      (v) =>
        inbox === 'all' ||
        (inbox === 'mine'
          ? v.item.overview.myTurn
          : inbox === 'staff'
            ? ['CONSULTING', 'SUBMITTED'].includes(v.r.status)
            : v.r.status === 'FINALIZED'),
    )
    .sort((a, b) => {
      if (sort === 'dueDate,asc') {
        const delta = (a.item.overview.dueDate ?? '9999').localeCompare(
          b.item.overview.dueDate ?? '9999',
        );
        if (delta) return delta;
      }
      const direction = sort.endsWith(',asc') && sort !== 'dueDate,asc' ? 1 : -1;
      const delta = sort.startsWith('id,')
        ? 0
        : sort.startsWith('updatedAt,')
          ? a.r.updatedAt.localeCompare(b.r.updatedAt)
          : a.r.createdAt.localeCompare(b.r.createdAt);
      return direction * (delta || a.item.securityRequestId - b.item.securityRequestId);
    });
  return {
    content: filtered.slice(page * size, (page + 1) * size).map((v) => v.item),
    page,
    size,
    totalElements: filtered.length,
    summary,
  };
}

/** 신청자 보안 메타 제외와 담당자 배정 범위를 전체 건수에도 적용한다. */
export function mockAuditListing(
  state: MockState,
  actor: Actor,
  params: URLSearchParams,
  wire: ContractMapper,
) {
  const { page, size } = paging(params),
    query = (params.get('query') ?? '').trim().toLocaleLowerCase('ko-KR');
  const requests = state.requests.filter((r) => allowed(r, actor));
  const entries = state.auditEvents
    .map((event) => ({ event, item: wire.audit(event) }))
    .filter(({ event, item }) => {
      const visible =
        actor.role === 'ADMIN' ||
        (requests.some(
          (r) =>
            (item.targetType === 'SECURITY_REQUEST' && event.targetId === r.id) ||
            (item.targetType === 'BUSINESS_CASE' && event.targetId === r.caseId),
        ) &&
          (actor.role !== 'APPLICANT' ||
            ![
              'LOGIN_SUCCEEDED',
              'LOGIN_FAILED',
              'LOGIN_LOCKED',
              'DOCUMENT_DOWNLOADED',
              'PRIVATE_CONTEXT_VIEWED',
              'LLM_CALLED',
              'LLM_CALL_FAILED',
            ].includes(item.action)));
      return (
        visible &&
        (!params.get('targetType') || item.targetType === params.get('targetType')) &&
        (!params.get('targetId') || item.targetId === params.get('targetId')) &&
        (!params.get('action') || item.action === params.get('action')) &&
        (!query ||
          `${item.targetId} ${item.actorUsername} ${item.reason ?? ''} ${item.summary ?? ''} ${item.action}`
            .toLocaleLowerCase('ko-KR')
            .includes(query))
      );
    })
    .map((v) => v.item);
  const throughId = params.has('throughId')
    ? Number(params.get('throughId'))
    : Math.max(0, ...entries.map((e) => e.auditEventId));
  const rows = entries
    .filter((e) => e.auditEventId <= throughId)
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.auditEventId - a.auditEventId);
  return {
    content: rows.slice(page * size, (page + 1) * size),
    page,
    size,
    totalElements: rows.length,
    throughId,
  };
}
