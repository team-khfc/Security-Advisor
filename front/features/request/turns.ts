import { FIELD_LABELS, type SecurityRequest } from './types';
import { pendingReviews, reviewFields } from './readiness';

/** 종료 기록은 바꾸지 않고 진행 중 신청의 분야별 인계 필요 사유를 모은다. */
export function handoffFields(request: SecurityRequest) {
  if (request.stage < 2 || ['FINALIZED', 'CLOSED', 'WITHDRAWN'].includes(request.status)) return [];
  if (request.listOverview) return request.listOverview.fields.filter((f) => f.reassignmentReason);
  return reviewFields(request)
    .map((field) => {
      const assignment = request.assignments.find((a) => a.active && a.field === field);
      return {
        field,
        reassignmentReason: assignment ? assignment.reassignmentReason : ('UNASSIGNED' as const),
      };
    })
    .filter((f) => f.reassignmentReason);
}

/**
 * 내 차례가 아닐 때 담당자·관리자 목록에 보이는 진행 안내(시안의 상태 아래 회색 줄).
 * 현재 신청 상태와 검토·최종 확인 기록만 읽어 글자로 옮긴다.
 */
export function waitingLine(request: SecurityRequest) {
  const handoff = handoffFields(request);
  if (handoff.length)
    return `${handoff.map((f) => FIELD_LABELS[f.field]).join('·')} 담당자 재배정 필요`;
  const fields = request.listOverview?.fields;
  if (fields) {
    if (request.status === 'SUBMITTED') {
      const pending = fields.filter((field) => !field.confirmed);
      return pending.length ? `${FIELD_LABELS[pending[0].field]} 최종 확인 대기` : '서류 확정 대기';
    }
    if (request.status === 'CONSULTING')
      return fields
        .filter((field) => field.reviewStatus !== 'COMPLETED')
        .map((field) => `${FIELD_LABELS[field.field]} 협의 중`)
        .join(', ');
    if (request.status === 'FINAL_REVIEW')
      return fields.some((field) => field.reviewStatus !== 'COMPLETED')
        ? '담당자 재검토 대기'
        : '신청자 최종 제출 대기';
  }
  switch (request.status) {
    case 'DRAFT':
      return '신청자 작성 중';
    case 'SUPPLEMENT_REQUESTED':
      return '신청자 보완 답변 대기';
    case 'FINAL_REVIEW':
      return (request.requiredReviewFields || request.reviews.length) &&
        pendingReviews(request).length
        ? '담당자 재검토 대기'
        : '신청자 최종 제출 대기';
    case 'CONSULTING': {
      const infra = request.reviews.find((review) => review.field === 'INFRA');
      const security = request.reviews.find((review) => review.field === 'SECURITY');
      const parts: string[] = [];
      const required = reviewFields(request);
      if (required.includes('INFRA') && infra?.status !== 'COMPLETE')
        parts.push(`${FIELD_LABELS.INFRA} 협의 중`);
      if (
        required.includes('SECURITY') &&
        (!required.includes('INFRA') || infra?.status === 'COMPLETE') &&
        security?.status !== 'COMPLETE'
      )
        parts.push(`${FIELD_LABELS.SECURITY} 검토 중`);
      return parts.join(', ');
    }
    case 'SUBMITTED': {
      const required = reviewFields(request);
      const pending = required.filter(
        (field) =>
          !request.finalConfirmations.some(
            (confirmation) =>
              confirmation.field === field &&
              confirmation.submissionId === request.currentSubmissionId,
          ),
      );
      return pending.length
        ? `${FIELD_LABELS[pending[0]]} 최종 확인 대기`
        : `${FIELD_LABELS[required.includes('SECURITY') ? 'SECURITY' : 'INFRA']} 서류 확정 대기`;
    }
    default:
      return '';
  }
}
