import type { Actor } from '@/lib/types';
import { FIELD_LABELS, type ReviewField, type SecurityRequest } from './types';

/** 게시본의 필요 분야를 우선 사용하고 모의 데이터는 실제 협의 목록을 따른다. */
export function reviewFields(request: SecurityRequest): ReviewField[] {
  const fields =
    request.requiredReviewFields ??
    (request.reviews.length
      ? request.reviews.map((review) => review.field)
      : ['INFRA', 'SECURITY']);
  return (['INFRA', 'SECURITY'] as const).filter((field) => fields.includes(field));
}

export function pendingReviews(request: SecurityRequest) {
  return reviewFields(request).filter(
    (field) =>
      !request.reviews.some((review) => review.field === field && review.status === 'COMPLETE'),
  );
}

/** 현재 제출본의 확인만 인정한다. 이 안내는 서버의 권한·revision 검사를 대체하지 않는다. */
export function finalReviewReadiness(request: SecurityRequest, actor: Actor) {
  const required = reviewFields(request);
  const pending = required.filter(
    (field) =>
      !request.currentSubmissionId ||
      !request.finalConfirmations.some(
        (confirmation) =>
          confirmation.submissionId === request.currentSubmissionId && confirmation.field === field,
      ),
  );
  const field = actor.role === 'INFRA' || actor.role === 'SECURITY' ? actor.role : undefined;
  const assigned =
    field &&
    required.includes(field) &&
    request.assignments.some(
      (assignment) =>
        assignment.active && assignment.field === field && assignment.assigneeId === actor.id,
    );
  const confirmer = required.includes('SECURITY') ? 'SECURITY' : 'INFRA';
  const active =
    request.stage === 4 && request.status === 'SUBMITTED' && !!request.currentSubmissionId;
  const ownConfirmed = !!field && required.includes(field) && !pending.includes(field);
  const confirmReason = !active
    ? '최신 제출본을 확인한 뒤 진행할 수 있습니다.'
    : !assigned
      ? '이 분야에 배정된 담당자만 최종 확인할 수 있습니다.'
      : ownConfirmed
        ? '현재 제출본의 담당 분야 최종 확인을 완료했습니다.'
        : field === 'SECURITY' && pending.includes('INFRA')
          ? 'ICT인프라 담당자의 최종 확인 후 정보보안 담당자가 확인할 수 있습니다.'
          : '';
  const finalizeReason = !active
    ? '최신 제출본을 확인한 뒤 진행할 수 있습니다.'
    : !assigned || field !== confirmer
      ? '확정 분야에 배정된 담당자만 서류를 확정할 수 있습니다.'
      : pending.length
        ? `${pending.map((item) => FIELD_LABELS[item]).join('·')} 최종 확인이 끝나면 서류를 확정할 수 있습니다.`
        : '';
  return { pending, confirmer, ownConfirmed, confirmReason, finalizeReason };
}

/** 조회된 답변·협의·보완의 명시적인 미완료 사실을 제출 전 안내한다. */
export function submissionBlockers(request: SecurityRequest) {
  const blockers = pendingReviews(request).map(
    (field) => `${FIELD_LABELS[field]} 협의가 완료되지 않았습니다.`,
  );
  for (const answer of [...request.commonAnswers, ...request.answers]) {
    if (answer.required && (!answer.value.trim() || answer.notApplicable))
      blockers.push(`${answer.label}: 필수 답변을 입력해 주세요.`);
    else if (
      answer.needsReview ||
      ((answer.revision !== undefined || answer.value.trim()) &&
        (!answer.source || !answer.confirmed))
    )
      blockers.push(`${answer.label}: 답변을 확인해 주세요.`);
  }
  if (request.supplements.some((supplement) => supplement.status !== 'RESOLVED'))
    blockers.push('담당자의 보완 요청이 아직 해결되지 않았습니다.');
  return [...new Set([...request.blockers, ...blockers])];
}
