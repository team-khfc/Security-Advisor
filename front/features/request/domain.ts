import { canConfirmAnswer, answerValueError } from './answerFieldPolicy';
import { DomainError } from '@/lib/problem';
import type { Actor } from '@/lib/types';
import { createEmptyCommonAnswers, createEmptyRequestAnswers, MOCK_MEMBERS } from '@/mocks/seed';
import type {
  Answer,
  AnswerInput,
  BusinessCase,
  CommandInput,
  CreateCaseInput,
  Deadline,
  MockState,
  RequestStatus,
  ReviewField,
  ReviewerDirectory,
  SecurityRequest,
  Stage,
} from './types';

const TERMINAL_STATUSES: readonly RequestStatus[] = ['FINALIZED', 'CLOSED', 'WITHDRAWN'];
const REVIEW_FIELDS: readonly ReviewField[] = ['INFRA', 'SECURITY'];
const STAGE_STATUSES: Record<Stage, readonly RequestStatus[]> = {
  1: ['DRAFT'],
  2: ['CONSULTING', 'SUPPLEMENT_REQUESTED'],
  3: ['FINAL_REVIEW', 'SUPPLEMENT_REQUESTED'],
  4: ['SUBMITTED', 'FINALIZED'],
};
const DEFAULT_REVIEWER_IDS: Record<ReviewField, string> = {
  INFRA: 'demo-infra',
  SECURITY: 'demo-security',
};

function requireRule(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new DomainError(422, code, message);
}

function requirePermission(condition: unknown, message: string): asserts condition {
  if (!condition) throw new DomainError(403, 'FORBIDDEN', message);
}

function requireActive(actor: Actor) {
  if (!actor.active) throw new DomainError(401, 'INACTIVE_SESSION', '다시 로그인해 주세요.');
}

function assertRevision(current: number, expected: number) {
  if (!Number.isSafeInteger(expected) || expected < 1) {
    throw new DomainError(400, 'INVALID_REVISION', '올바른 수정본 번호가 필요합니다.');
  }
  if (current !== expected) {
    throw new DomainError(
      409,
      'REVISION_CONFLICT',
      `다른 변경이 먼저 저장되었습니다. 작성한 값을 유지한 채 최신 수정본(${current})을 확인해 주세요.`,
    );
  }
}

function id(state: MockState, prefix: string): string {
  state.sequence += 1;
  return `${prefix}-${crypto.randomUUID()}`;
}

function getRequest(state: MockState, requestId: string): SecurityRequest {
  const request = state.requests.find((item) => item.id === requestId);
  if (!request) throw new DomainError(404, 'REQUEST_NOT_FOUND', '신청을 찾을 수 없습니다.');
  return request;
}

function getCase(state: MockState, caseId: string): BusinessCase {
  const businessCase = state.cases.find((item) => item.id === caseId);
  if (!businessCase) throw new DomainError(404, 'CASE_NOT_FOUND', '사업 건을 찾을 수 없습니다.');
  return businessCase;
}

function isOwner(request: SecurityRequest | BusinessCase, actor: Actor): boolean {
  return actor.role === 'APPLICANT' && request.ownerId === actor.id;
}

function isReviewer(actor: Actor): actor is Actor & { role: ReviewField } {
  return actor.role === 'INFRA' || actor.role === 'SECURITY';
}

function isAssigned(request: SecurityRequest, actor: Actor): boolean {
  return (
    actor.active &&
    isReviewer(actor) &&
    actor.id !== request.ownerId &&
    request.assignments.some(
      (assignment) =>
        assignment.active && assignment.field === actor.role && assignment.assigneeId === actor.id,
    )
  );
}

function assertReadable(request: SecurityRequest, actor: Actor) {
  requireActive(actor);
  const canRead =
    actor.role === 'ADMIN' ||
    isOwner(request, actor) ||
    (isReviewer(actor) && request.reviews.some((review) => review.field === actor.role));
  if (!canRead) throw new DomainError(404, 'REQUEST_NOT_FOUND', '신청을 찾을 수 없습니다.');
}

/** 종료된 신청에는 이후 업무 명령을 적용하지 않는다. */
export function isTerminal(request: SecurityRequest): boolean {
  return TERMINAL_STATUSES.includes(request.status);
}

function mutable(request: SecurityRequest): boolean {
  return !isTerminal(request) && request.stage < 4;
}

function validAnswer(answer: Answer): boolean {
  return (
    Boolean(answer.source) &&
    answer.confirmed &&
    answer.confirmation !== null &&
    (answer.notApplicable || Boolean(answer.value.trim()))
  );
}

function infraCompleted(request: SecurityRequest): boolean {
  return !request.reviews.some(
    (review) => review.field === 'INFRA' && review.status !== 'COMPLETE',
  );
}

function assertStageStatus(request: SecurityRequest) {
  requireRule(
    request.status === 'CLOSED' ||
      request.status === 'WITHDRAWN' ||
      STAGE_STATUSES[request.stage]?.includes(request.status),
    'INVALID_STAGE_STATUS',
    '신청 단계와 상태의 조합이 올바르지 않습니다.',
  );
}

function seoulDate(value: Date): string {
  return new Date(value.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function isBusinessDay(value: Date, holidays: readonly string[]): boolean {
  const day = new Date(value.getTime() + 9 * 60 * 60 * 1000).getUTCDay();
  return day !== 0 && day !== 6 && !holidays.includes(seoulDate(value));
}

/** 모의 서버의 기한 계산이며 운영에서는 Back이 게시본 정책으로 계산한 값을 사용한다. */
export function calculateDueAt(
  start: string,
  businessDays = 5,
  holidays: readonly string[] = [],
): string {
  const parsed = new Date(start);
  requireRule(
    !Number.isNaN(parsed.getTime()) && Number.isInteger(businessDays) && businessDays > 0,
    'INVALID_DEADLINE_POLICY',
    '처리 기한 정책을 확인해 주세요.',
  );
  requireRule(businessDays <= 365, 'INVALID_DEADLINE_POLICY', '기한은 365영업일 이내여야 합니다.');
  const cursor = new Date(`${seoulDate(parsed)}T00:00:00+09:00`);
  let remaining = businessDays;
  while (remaining > 0) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (isBusinessDay(cursor, holidays)) remaining -= 1;
  }
  return `${seoulDate(cursor)}T23:59:59+09:00`;
}

/** 임박·경과 표시는 조회 시 계산하며 저장된 기한과 업무 상태는 변경하지 않는다. */
export function deadlineTiming(deadline: Deadline, now = new Date()): Deadline['timing'] {
  if (!deadline.active) return 'CLOSED';
  if (now.getTime() > new Date(deadline.dueAt).getTime()) return 'OVERDUE';
  const previous = new Date(`${seoulDate(new Date(deadline.dueAt))}T00:00:00+09:00`);
  do {
    previous.setUTCDate(previous.getUTCDate() - 1);
  } while (!isBusinessDay(previous, []));
  return seoulDate(now) >= seoulDate(previous) ? 'DUE_SOON' : 'WITHIN';
}

function closeDeadlines(
  request: SecurityRequest,
  at: string,
  predicate: (deadline: Deadline) => boolean = () => true,
) {
  for (const deadline of request.deadlines.filter((item) => item.active && predicate(item))) {
    deadline.active = false;
    deadline.closedAt = at;
    deadline.timing = 'CLOSED';
  }
}

function addDeadline(
  state: MockState,
  request: SecurityRequest,
  kind: Deadline['kind'],
  field: ReviewField | null,
  at: string,
) {
  closeDeadlines(request, at, (item) => item.kind === kind && item.field === field);
  request.deadlines.push({
    id: id(state, 'deadline'),
    field,
    kind,
    dueAt: calculateDueAt(at),
    active: true,
    closedAt: null,
    timing: 'WITHIN',
  });
}

function addAudit(
  state: MockState,
  actor: Actor,
  target: SecurityRequest | BusinessCase,
  action: string,
  at: string,
  reason: string | null = null,
  fieldKeys: string[] = [],
) {
  state.auditEvents.unshift({
    id: id(state, 'audit'),
    actorId: actor.id,
    actorName: actor.displayName,
    actorRole: actor.role,
    targetType: 'docType' in target ? 'SecurityRequest' : 'BusinessCase',
    targetId: target.id,
    targetRevision: target.revision,
    action,
    reason,
    fieldKeys: [...fieldKeys],
    requestId: crypto.randomUUID(),
    createdAt: at,
  });
}

function reason(input: CommandInput): string {
  const value = input.reason?.trim();
  requireRule(value, 'REASON_REQUIRED', '사유를 입력해 주세요.');
  requireRule(value.length <= 2000, 'REASON_TOO_LONG', '사유는 2,000자 이내로 입력해 주세요.');
  return value;
}

function targetFields(request: SecurityRequest, input: CommandInput): string[] {
  const keys = [...new Set(input.fieldKeys ?? [])];
  requireRule(keys.length > 0, 'FIELDS_REQUIRED', '보완할 항목을 하나 이상 선택해 주세요.');
  const known = new Set([...request.commonAnswers, ...request.answers].map((item) => item.key));
  requireRule(
    keys.length <= 50 && keys.every((key) => known.has(key)),
    'UNKNOWN_FIELD',
    '이 신청에 있는 항목만 선택해 주세요.',
  );
  return keys;
}

function markReviewsForRecheck(request: SecurityRequest, fieldKeys: string[]) {
  if (!fieldKeys.length) return;
  const changed = [...request.commonAnswers, ...request.answers].filter((answer) =>
    fieldKeys.includes(answer.key),
  );
  const affectsInfra = changed.some((answer) => answer.ownerRole !== 'SECURITY');
  const changesAllocation = changed.some((answer) => answer.ownerRole === 'INFRA');
  for (const review of request.reviews) {
    if (review.field === 'SECURITY' || affectsInfra) {
      if (review.status === 'COMPLETE' || review.status === 'ALLOCATED') review.status = 'RECHECK';
    }
    if (changesAllocation && review.field === 'INFRA') review.allocationCompleted = false;
  }
}

function assertAnswerInputs(inputs: AnswerInput[]) {
  if (
    !Array.isArray(inputs) ||
    inputs.length === 0 ||
    inputs.length > 50 ||
    new Set(inputs.map((item) => item.key)).size !== inputs.length ||
    inputs.some(
      (item) =>
        typeof item.key !== 'string' ||
        typeof item.value !== 'string' ||
        item.value.length > 4000 ||
        typeof item.confirmed !== 'boolean' ||
        typeof item.notApplicable !== 'boolean',
    )
  ) {
    throw new DomainError(400, 'INVALID_ANSWERS', '답변 형식과 중복 항목을 확인해 주세요.');
  }
}

function updateAnswers(
  answers: Answer[],
  actor: Actor,
  inputs: AnswerInput[],
  at: string,
): { changed: string[]; confirmed: string[] } {
  assertAnswerInputs(inputs);
  const changed: string[] = [];
  const confirmed: string[] = [];
  for (const input of inputs) {
    const answer = answers.find((item) => item.key === input.key);
    if (!answer) throw new DomainError(400, 'UNKNOWN_FIELD', '존재하지 않는 답변 항목입니다.');
    const unchanged = answer.value === input.value && answer.notApplicable === input.notApplicable;
    const confirmsAi =
      isReviewer(actor) && canConfirmAnswer(answer, actor.role) && unchanged && input.confirmed;
    requirePermission(
      answer.ownerRole === actor.role || confirmsAi,
      '자신의 담당 항목만 수정할 수 있습니다. 다른 분야는 담당자에게 확인해 주세요.',
    );
    requireRule(
      !input.confirmed || input.notApplicable || Boolean(input.value.trim()),
      'EMPTY_CONFIRMATION',
      '값이 없는 항목은 확인 완료로 표시할 수 없습니다.',
    );

    if (input.value.trim() || input.confirmed || input.notApplicable) {
      const issue = answerValueError(answer, input.notApplicable ? '미해당' : input.value);
      requireRule(!issue, 'INVALID_ANSWER_VALUE', issue ?? '답변 형식을 확인해 주세요.');
    }
    if (!unchanged) changed.push(answer.key);
    if (input.confirmed) confirmed.push(answer.key);
    if (confirmsAi) {
      answer.source = 'STAFF_CONFIRMED';
    } else if (!unchanged || !answer.source) {
      answer.source = actor.role === 'APPLICANT' ? 'USER_ANSWER' : 'STAFF_INPUT';
      if (!unchanged) answer.evidence = null;
    }
    const previousConfirmation = unchanged && !confirmsAi ? answer.confirmation : null;
    answer.value = input.value;
    answer.confirmed = input.confirmed;
    answer.notApplicable = input.notApplicable;
    answer.confirmation = input.confirmed
      ? (previousConfirmation ?? {
          actorId: actor.id,
          actorName: actor.displayName,
          role: actor.role,
          at,
        })
      : answer.source === 'STAFF_CONFIRMED'
        ? previousConfirmation
        : null;
  }
  return { changed, confirmed };
}

/** 제출 조건은 화면의 버튼 표시와 별개로 모의 서버에서도 검사한다. */
export function submissionBlockers(request: SecurityRequest): string[] {
  const answers = [...request.commonAnswers, ...request.answers];
  const blockers: string[] = [];
  if (answers.some((answer) => answer.required && (answer.notApplicable || !answer.value.trim()))) {
    blockers.push('필수 항목을 작성해 주세요.');
  }
  if (answers.some((answer) => (answer.required || answer.value) && !validAnswer(answer))) {
    blockers.push('미확정 값이 있습니다. AI 제안과 담당자 확인 필요 항목을 확인해 주세요.');
  }
  if (request.supplements.some((item) => item.status !== 'RESOLVED')) {
    blockers.push('미해결 보완 요청이 있습니다.');
  }
  if (
    !REVIEW_FIELDS.every((field) =>
      request.reviews.some((review) => review.field === field && review.status === 'COMPLETE'),
    )
  ) {
    blockers.push('ICT인프라와 정보보안 협의가 모두 완료되어야 합니다.');
  }
  if (request.highlightedFields.length)
    blockers.push('반환된 보완 필요 항목을 다시 확인해 주세요.');
  return blockers;
}

function allowedActions(request: SecurityRequest, actor: Actor): string[] {
  const actions = ['DOWNLOAD'];
  if (isTerminal(request)) return actions;
  if (isOwner(request, actor)) {
    actions.push('WITHDRAW');
    if (request.stage <= 3) actions.push('SAVE_ANSWERS', 'EDIT_CASE', 'EDIT_ANSWERS');
    if (request.stage === 1) actions.push('REQUEST_REVIEW');
    if (
      (request.stage === 2 || request.stage === 3) &&
      request.supplements.some((item) => item.status === 'OPEN')
    ) {
      actions.push('ANSWER_SUPPLEMENT');
    }
    if (request.stage === 3) actions.push('RETURN', 'SUBMIT', 'GENERATE_DRAFT');
  }
  if (actor.role === 'ADMIN' && (request.stage >= 2 || request.assignments.length > 0)) {
    actions.push('REASSIGN');
  }
  if (!isAssigned(request, actor)) return actions;
  const canConsult = actor.role === 'INFRA' || infraCompleted(request);
  if (request.stage !== 2 || canConsult) actions.push('CLOSE');
  if (request.stage === 2) {
    actions.push('SAVE_ANSWERS', 'EDIT_CASE', 'EDIT_ANSWERS', 'RETURN', 'REQUEST_SUPPLEMENT');
    actions.push('COMPLETE_REVIEW');
    if (
      request.supplements.some((item) => item.field === actor.role && item.status === 'ANSWERED')
    ) {
      actions.push('RESOLVE_SUPPLEMENT');
    }
  }
  if (request.stage === 4 && request.status === 'SUBMITTED') {
    actions.push('RETURN');
    const confirmations = request.finalConfirmations.filter(
      (item) => item.submissionId === request.currentSubmissionId,
    );
    if (
      !confirmations.some((item) => item.field === actor.role) &&
      (actor.role === 'INFRA' || confirmations.some((item) => item.field === 'INFRA'))
    ) {
      actions.push('FINAL_CONFIRM');
    }
    if (
      actor.role === 'SECURITY' &&
      REVIEW_FIELDS.every((field) => confirmations.some((item) => item.field === field))
    ) {
      actions.push('FINALIZE');
    }
  }
  return [...new Set(actions)];
}

/** 조회 가능한 자원만 반환하며 권한 표시·제출 차단 사유·기한 표시는 매번 계산한다. */
export function requestForActor(
  state: MockState,
  request: SecurityRequest,
  actor: Actor,
): SecurityRequest {
  assertReadable(request, actor);
  const result = structuredClone(request);
  if (request.stage === 4) {
    const currentCase = state.cases.find((item) => item.id === request.caseId);
    if (currentCase && currentCase.revision > request.caseRevision) {
      result.changedCommonFields = currentCase.answers
        .filter((answer) => {
          const previous = request.commonAnswers.find((item) => item.key === answer.key);
          return (
            previous &&
            (previous.value !== answer.value || previous.notApplicable !== answer.notApplicable)
          );
        })
        .map((answer) => answer.key);
    }
  }
  result.allowedActions = allowedActions(request, actor);
  result.blockers = submissionBlockers(request);
  result.deadlines = result.deadlines.map((deadline) => ({
    ...deadline,
    timing: deadlineTiming(deadline),
  }));
  return result;
}

function authorizeCommand(request: SecurityRequest, actor: Actor, input: CommandInput) {
  if (input.action === 'REASSIGN') {
    requirePermission(actor.role === 'ADMIN', '기관 관리자만 담당자를 재배정할 수 있습니다.');
  } else if (
    ['REQUEST_REVIEW', 'ANSWER_SUPPLEMENT', 'SUBMIT', 'WITHDRAW', 'GENERATE_DRAFT'].includes(
      input.action,
    ) ||
    (input.action === 'RETURN' && request.stage === 3)
  ) {
    requirePermission(isOwner(request, actor), '이 신청의 작성자만 수행할 수 있습니다.');
  } else if (input.action === 'SAVE_ANSWERS') {
    requirePermission(
      isOwner(request, actor) || isAssigned(request, actor),
      '작성자 또는 배정된 담당자만 답변을 저장할 수 있습니다.',
    );
  } else {
    requirePermission(
      isAssigned(request, actor),
      '해당 분야에 배정된 활성 담당자만 수행할 수 있습니다.',
    );
  }
  if (input.field && input.action !== 'REASSIGN') {
    requirePermission(input.field === actor.role, '다른 분야의 검토를 수행할 수 없습니다.');
  }
  requireRule(
    !isTerminal(request),
    'TERMINAL_REQUEST',
    '확정·종결·철회된 신청은 변경할 수 없습니다.',
  );
  requireRule(
    allowedActions(request, actor).includes(input.action),
    'INVALID_TRANSITION',
    '현재 단계 또는 선행 처리 조건에서는 이 작업을 수행할 수 없습니다.',
  );
}

function autoAssign(
  state: MockState,
  request: SecurityRequest,
  members: ReviewerDirectory,
  at: string,
) {
  for (const field of REVIEW_FIELDS) {
    const current = request.assignments.find((item) => item.active && item.field === field);
    const eligible = (candidateId: string) =>
      members.find(
        (item) =>
          item.id === candidateId &&
          item.active &&
          item.registered !== false &&
          item.role === field &&
          item.id !== request.ownerId,
      );
    if (current) continue;
    const sibling = state.requests
      .filter((item) => item.caseId === request.caseId && item.id !== request.id)
      .flatMap((item) => item.assignments)
      .find((item) => item.active && item.field === field && eligible(item.assigneeId));
    const configured = members.find((m) => m.role === field && m.defaultReviewer)?.id;
    const hasRegistrationData = members.some((m) => m.registered !== undefined);
    const chosen = eligible(
      sibling?.assigneeId ?? configured ?? (hasRegistrationData ? '' : DEFAULT_REVIEWER_IDS[field]),
    );
    if (!chosen) continue;
    request.assignments.push({
      id: id(state, 'assignment'),
      field,
      assigneeId: chosen.id,
      assigneeName: chosen.displayName,
      active: true,
      reason: '게시본의 기본 담당자 자동 배정',
      assignedAt: at,
    });
  }
}

function finishReview(request: SecurityRequest, actor: Actor, input: CommandInput, at: string) {
  requireRule(
    actor.role !== 'SECURITY' || infraCompleted(request),
    'INFRA_REVIEW_REQUIRED',
    'ICT인프라의 협의 단계가 끝나지 않았습니다.',
  );
  const comment = input.comment?.trim();
  requireRule(
    comment && comment.length <= 2000,
    'REVIEW_COMMENT_REQUIRED',
    '검토 의견을 2,000자 이내로 입력해 주세요.',
  );
  requireRule(
    [...request.commonAnswers, ...request.answers]
      .filter(
        (answer) =>
          answer.required && (answer.ownerRole === actor.role || answer.ownerRole === 'APPLICANT'),
      )
      .every(validAnswer),
    'UNCONFIRMED_REVIEW_VALUES',
    '담당 분야와 신청자 필수 항목을 먼저 확인해 주세요.',
  );
  requireRule(
    !request.supplements.some((item) => item.field === actor.role && item.status !== 'RESOLVED'),
    'UNRESOLVED_SUPPLEMENTS',
    '담당 분야의 보완 요청을 먼저 해결해 주세요.',
  );
  const review = request.reviews.find((item) => item.field === actor.role);
  requireRule(review, 'REVIEW_NOT_FOUND', '검토 분야를 확인해 주세요.');
  review.status = 'COMPLETE';
  review.comment = comment;
  review.completedBy = actor.id;
  review.completedAt = at;
  closeDeadlines(request, at, (item) => item.kind === 'CONSULTATION' && item.field === actor.role);
  if (request.reviews.every((item) => item.status === 'COMPLETE')) {
    request.stage = 3;
    request.status = 'FINAL_REVIEW';
    request.changedCommonFields = [];
    request.highlightedFields = [];
    closeDeadlines(request, at);
  }
}

function returnStage(
  state: MockState,
  request: SecurityRequest,
  actor: Actor,
  input: CommandInput,
  at: string,
) {
  const message = reason(input);
  const keys = targetFields(request, input);
  const target = input.targetStage;
  requireRule(
    (request.stage === 2 && target === 1) ||
      (request.stage === 3 && (target === 1 || target === 2)) ||
      (request.stage === 4 && target === 3),
    'INVALID_STAGE_RETURN',
    '허용되지 않은 차수 반환입니다.',
  );
  request.returns.push({
    id: id(state, 'stage-return'),
    fromStage: request.stage,
    targetStage: target,
    fieldKeys: keys,
    reason: message,
    actorName: actor.displayName,
    createdAt: at,
  });
  request.stage = target;
  request.status = target === 1 ? 'DRAFT' : target === 2 ? 'CONSULTING' : 'FINAL_REVIEW';
  request.highlightedFields = [...new Set([...request.highlightedFields, ...keys])];
  request.currentSubmissionId = null;
  if (target < 3) markReviewsForRecheck(request, keys);
  closeDeadlines(request, at);
  if (target === 2) {
    for (const field of REVIEW_FIELDS) addDeadline(state, request, 'CONSULTATION', field, at);
  } else {
    addDeadline(state, request, 'SUPPLEMENT', null, at);
  }
}

function handleSupplement(
  state: MockState,
  request: SecurityRequest,
  actor: Actor,
  input: CommandInput,
  at: string,
) {
  if (input.action === 'REQUEST_SUPPLEMENT') {
    requireRule(isReviewer(actor), 'INVALID_REVIEW_FIELD', '담당 분야를 확인해 주세요.');
    const keys = targetFields(request, input);
    request.supplements.push({
      id: id(state, 'supplement'),
      field: actor.role,
      fieldKeys: keys,
      reason: reason(input),
      answer: null,
      status: 'OPEN',
      requestedBy: actor.id,
      createdAt: at,
      resolvedAt: null,
    });
    request.status = 'SUPPLEMENT_REQUESTED';
    request.highlightedFields = [...new Set([...request.highlightedFields, ...keys])];
    const review = request.reviews.find((item) => item.field === actor.role);
    if (review) review.status = 'SUPPLEMENT_REQUESTED';
    addDeadline(state, request, 'SUPPLEMENT', null, at);
    return;
  }
  const supplement = request.supplements.find((item) => item.id === input.supplementId);
  if (!supplement)
    throw new DomainError(404, 'SUPPLEMENT_NOT_FOUND', '보완 요청을 찾을 수 없습니다.');
  if (input.action === 'ANSWER_SUPPLEMENT') {
    requireRule(
      supplement.status === 'OPEN',
      'INVALID_SUPPLEMENT_STATE',
      '답변 대기 중인 보완 요청만 답할 수 있습니다.',
    );
    const answer = (input.answer ?? input.comment)?.trim();
    requireRule(
      answer && answer.length <= 4000,
      'SUPPLEMENT_ANSWER_REQUIRED',
      '보완 답변을 4,000자 이내로 입력해 주세요.',
    );
    supplement.answer = answer;
    supplement.status = 'ANSWERED';
    const review = request.reviews.find((item) => item.field === supplement.field);
    if (review) review.status = 'RECHECK';
  } else {
    requirePermission(
      supplement.field === actor.role,
      '보완을 요청한 분야의 배정 담당자가 확인해 주세요.',
    );
    requireRule(
      supplement.status === 'ANSWERED',
      'INVALID_SUPPLEMENT_STATE',
      '사용자 답변 이후에 보완을 확인할 수 있습니다.',
    );
    supplement.status = 'RESOLVED';
    supplement.resolvedAt = at;
    request.highlightedFields = request.highlightedFields.filter(
      (key) =>
        !supplement.fieldKeys.includes(key) ||
        request.supplements.some(
          (item) =>
            item.id !== supplement.id && item.status !== 'RESOLVED' && item.fieldKeys.includes(key),
        ),
    );
  }
  if (!request.supplements.some((item) => item.status === 'OPEN')) {
    request.status = request.stage === 2 ? 'CONSULTING' : 'FINAL_REVIEW';
    closeDeadlines(request, at, (item) => item.kind === 'SUPPLEMENT');
  }
}

/** 명령 실패 시 원본을 그대로 보존하여 모의 API에서도 부분 저장을 만들지 않는다. */
export function executeCommand(
  state: MockState,
  actor: Actor,
  requestId: string,
  input: CommandInput,
  members: ReviewerDirectory = MOCK_MEMBERS,
): MockState {
  const original = getRequest(state, requestId);
  assertReadable(original, actor);
  assertStageStatus(original);
  if (input.action === 'SUBMIT' && input.idempotencyKey) {
    const previous = state.requests
      .flatMap((request) => request.submissions.map((submission) => ({ request, submission })))
      .find((item) => item.submission.idempotencyKey === input.idempotencyKey);
    if (previous) {
      requirePermission(isOwner(original, actor), '이 신청의 작성자만 제출할 수 있습니다.');
      if (
        previous.request.id === requestId &&
        original.stage === 4 &&
        original.currentSubmissionId === previous.submission.id
      )
        return structuredClone(state);
      throw new DomainError(
        409,
        'IDEMPOTENCY_CONFLICT',
        '이 제출 키는 이미 사용되었습니다. 새 제출에는 새 키를 사용해 주세요.',
      );
    }
  }
  authorizeCommand(original, actor, input);
  assertRevision(original.revision, input.expectedRevision);
  const next = structuredClone(state);
  const request = getRequest(next, requestId);
  const at = new Date().toISOString();

  switch (input.action) {
    case 'REQUEST_REVIEW': {
      requireRule(
        [...request.commonAnswers, ...request.answers]
          .filter((answer) => answer.ownerRole === 'APPLICANT' && answer.required)
          .every(validAnswer),
        'APPLICANT_VALUES_REQUIRED',
        '신청자 필수 항목을 먼저 작성·확인해 주세요. 기술 항목은 담당자에게 넘길 수 있습니다.',
      );
      request.stage = 2;
      request.status = 'CONSULTING';
      autoAssign(next, request, members, at);
      closeDeadlines(request, at);
      for (const field of REVIEW_FIELDS) addDeadline(next, request, 'CONSULTATION', field, at);
      break;
    }
    case 'COMPLETE_ALLOCATION': {
      requirePermission(
        actor.role === 'INFRA',
        'ICT인프라 담당자만 자원 할당을 완료할 수 있습니다.',
      );
      requireRule(
        [...request.commonAnswers, ...request.answers]
          .filter((answer) => answer.required && answer.ownerRole === 'INFRA')
          .every(validAnswer),
        'ALLOCATION_VALUES_REQUIRED',
        '출발지·목적지·통신 방식·포트·기간을 먼저 입력·확인해 주세요.',
      );
      const review = request.reviews.find((item) => item.field === 'INFRA');
      requireRule(review, 'REVIEW_NOT_FOUND', 'ICT인프라 협의를 찾을 수 없습니다.');
      if (review.allocationCompleted) return next;
      review.allocationCompleted = true;
      review.status = 'ALLOCATED';
      break;
    }
    case 'COMPLETE_REVIEW':
      requireRule(
        !request.infrastructurePlan?.draft && !request.infrastructurePlan?.aiPending,
        'INVALID_STAGE',
        'ICT인프라 검토 정보를 확인 저장한 후 협의를 완료해 주세요.',
      );
      finishReview(request, actor, input, at);
      break;
    case 'REQUEST_SUPPLEMENT':
    case 'ANSWER_SUPPLEMENT':
    case 'RESOLVE_SUPPLEMENT':
      handleSupplement(next, request, actor, input, at);
      break;
    case 'RETURN':
      returnStage(next, request, actor, input, at);
      break;
    case 'SAVE_ANSWERS': {
      const result = updateAnswers(request.answers, actor, input.answers ?? [], at);
      markReviewsForRecheck(request, result.changed);
      request.highlightedFields = request.highlightedFields.filter(
        (key) => !result.confirmed.includes(key),
      );
      break;
    }
    case 'GENERATE_DRAFT': {
      const summary: Answer = {
        key: 'finalSummary',
        label: 'AI 최종 초안 요약',
        scope: 'REQUEST',
        ownerRole: 'APPLICANT',
        required: true,
        value: `사업 «${request.caseTitle}»의 ${request.docType === 'FIREWALL' ? '통신 허용 신청' : '보안성검토 신청'} 초안입니다. 공개 자료와 합성 데이터의 이용 목적 및 담당자 협의 내용을 확인한 뒤 제출해 주세요.`,
        source: 'AI_INFERRED',
        evidence: '합성 모의 응답 · 현재 사업명과 서류 유형을 기반으로 구성한 예시입니다.',
        confirmed: false,
        notApplicable: false,
        confirmation: null,
      };
      const index = request.answers.findIndex((answer) => answer.key === summary.key);
      if (index < 0) request.answers.push(summary);
      else request.answers[index] = summary;
      break;
    }
    case 'SUBMIT': {
      const blockers = submissionBlockers(request);
      requireRule(!blockers.length, 'SUBMISSION_BLOCKED', blockers.join(' '));
      requireRule(
        input.idempotencyKey && input.idempotencyKey.length <= 128,
        'IDEMPOTENCY_KEY_REQUIRED',
        '중복 제출 방지 키가 필요합니다.',
      );
      const submissionId = id(next, 'submission');
      request.submissions.push({
        id: submissionId,
        number: request.submissions.length + 1,
        requestRevision: request.revision,
        caseRevision: request.caseRevision,
        publicationVersion: request.publicationVersion,
        commonAnswers: structuredClone(request.commonAnswers),
        answers: structuredClone(request.answers),
        snapshot: { infrastructurePlan: structuredClone(request.infrastructurePlan ?? null) },
        idempotencyKey: input.idempotencyKey,
        createdAt: at,
      });
      request.currentSubmissionId = submissionId;
      request.stage = 4;
      request.status = 'SUBMITTED';
      closeDeadlines(request, at);
      addDeadline(next, request, 'FINALIZATION', null, at);
      break;
    }
    case 'FINAL_CONFIRM': {
      requireRule(isReviewer(actor), 'INVALID_REVIEW_FIELD', '최종 확인 분야를 확인해 주세요.');
      requireRule(
        request.currentSubmissionId,
        'SUBMISSION_REQUIRED',
        '제출본이 있어야 최종 확인할 수 있습니다.',
      );
      request.finalConfirmations.push({
        id: id(next, 'final-confirmation'),
        submissionId: request.currentSubmissionId,
        field: actor.role,
        actorName: actor.displayName,
        confirmedAt: at,
      });
      break;
    }
    case 'FINALIZE':
      requirePermission(
        actor.role === 'SECURITY',
        '배정된 정보보안 담당자만 서류를 확정할 수 있습니다.',
      );
      request.status = 'FINALIZED';
      break;
    case 'CLOSE':
      reason(input);
      request.status = 'CLOSED';
      break;
    case 'WITHDRAW':
      reason(input);
      request.status = 'WITHDRAWN';
      break;
    case 'REASSIGN': {
      const message = reason(input);
      const field = input.field;
      requireRule(
        field === 'INFRA' || field === 'SECURITY',
        'INVALID_REVIEW_FIELD',
        '재배정할 분야를 선택해 주세요.',
      );
      const reviewer = members.find(
        (item) =>
          item.id === input.assigneeId &&
          item.role === field &&
          item.active &&
          item.registered !== false,
      );
      requireRule(
        reviewer && reviewer.id !== request.ownerId,
        'INVALID_ASSIGNEE',
        '신청자 본인이 아닌 활성 담당자를 선택해 주세요.',
      );
      const previous = request.assignments.filter((item) => item.field === field && item.active);
      requireRule(
        !previous.some((item) => item.assigneeId === reviewer.id),
        'ALREADY_ASSIGNED',
        '이미 배정된 담당자입니다.',
      );
      previous.forEach((item) => {
        item.active = false;
      });
      request.assignments.push({
        id: id(next, 'assignment'),
        field,
        assigneeId: reviewer.id,
        assigneeName: reviewer.displayName,
        active: true,
        reason: message,
        assignedAt: at,
      });
      break;
    }
  }
  if (isTerminal(request)) closeDeadlines(request, at);
  request.revision += 1;
  request.updatedAt = at;
  request.allowedActions = [];
  request.blockers = [];
  assertStageStatus(request);
  addAudit(
    next,
    actor,
    request,
    input.action,
    at,
    input.reason?.trim() ?? null,
    input.fieldKeys ?? input.answers?.map((answer) => answer.key) ?? [],
  );
  return next;
}

function assertCaseWrite(state: MockState, businessCase: BusinessCase, actor: Actor) {
  requireActive(actor);
  const related = state.requests.filter((request) => request.caseId === businessCase.id);
  const readable =
    isOwner(businessCase, actor) ||
    actor.role === 'ADMIN' ||
    related.some((request) => isAssigned(request, actor));
  if (!readable) throw new DomainError(404, 'CASE_NOT_FOUND', '사업 건을 찾을 수 없습니다.');
  requireRule(
    related.some(mutable),
    'IMMUTABLE_CASE',
    '제출·종료된 신청의 공통 정보는 수정할 수 없습니다.',
  );
  requirePermission(
    isOwner(businessCase, actor) ||
      related.some(
        (request) =>
          mutable(request) &&
          request.stage === 2 &&
          isAssigned(request, actor) &&
          (actor.role === 'INFRA' || infraCompleted(request)),
      ),
    '작성자 또는 협의 중인 신청에 배정된 담당자만 공통 답변을 수정할 수 있습니다.',
  );
}

function propagateCommonAnswers(
  state: MockState,
  businessCase: BusinessCase,
  changed: string[],
  confirmed: string[],
  at: string,
) {
  for (const request of state.requests.filter(
    (item) => item.caseId === businessCase.id && mutable(item),
  )) {
    request.commonAnswers = structuredClone(businessCase.answers);
    request.caseRevision = businessCase.revision;
    request.revision += 1;
    request.updatedAt = at;
    request.changedCommonFields = [...new Set([...request.changedCommonFields, ...changed])];
    request.highlightedFields = request.highlightedFields.filter((key) => !confirmed.includes(key));
    markReviewsForRecheck(request, changed);
  }
}

/** 공통 답변 변경은 진행 중 신청에만 전파하고 제출본·종료 신청은 보존한다. */
export function saveCaseAnswers(
  state: MockState,
  actor: Actor,
  caseId: string,
  expectedRevision: number,
  answers: AnswerInput[],
): MockState {
  const original = getCase(state, caseId);
  assertCaseWrite(state, original, actor);
  assertRevision(original.revision, expectedRevision);
  const next = structuredClone(state);
  const businessCase = getCase(next, caseId);
  const at = new Date().toISOString();
  const result = updateAnswers(businessCase.answers, actor, answers, at);
  businessCase.revision += 1;
  businessCase.updatedAt = at;
  propagateCommonAnswers(next, businessCase, result.changed, result.confirmed, at);
  addAudit(
    next,
    actor,
    businessCase,
    'SAVE_CASE_ANSWERS',
    at,
    null,
    answers.map((answer) => answer.key),
  );
  return next;
}

/** 분석 작업에 저장된 후보만 받아 사용자 공통 질문의 미확정 AI 제안으로 반영한다. */
export function applyAnalysis(
  state: MockState,
  actor: Actor,
  caseId: string,
  expectedRevision: number,
  suggestions: { key: string; value: string; evidence: string }[],
): MockState {
  const original = getCase(state, caseId);
  assertCaseWrite(state, original, actor);
  requirePermission(isOwner(original, actor), '사업 건의 작성자만 분석 후보를 적용할 수 있습니다.');
  assertRevision(original.revision, expectedRevision);
  requireRule(
    suggestions.length > 0 &&
      suggestions.length <= 20 &&
      new Set(suggestions.map((item) => item.key)).size === suggestions.length,
    'INVALID_ANALYSIS',
    '분석 후보 항목을 확인해 주세요.',
  );
  const next = structuredClone(state);
  const businessCase = getCase(next, caseId);
  const at = new Date().toISOString();
  const changed: string[] = [];
  for (const suggestion of suggestions) {
    const answer = businessCase.answers.find((item) => item.key === suggestion.key);
    requireRule(
      answer && answer.scope === 'CASE' && answer.ownerRole === 'APPLICANT',
      'AI_FACT_FORBIDDEN',
      '내부 시스템·IP·포트 등 기술 정보는 AI로 추정할 수 없습니다.',
    );
    requireRule(
      suggestion.value.trim() &&
        suggestion.value.length <= 4000 &&
        suggestion.evidence.trim() &&
        suggestion.evidence.length <= 2000,
      'ANALYSIS_EVIDENCE_REQUIRED',
      '분석 후보에는 값과 원문 근거가 필요합니다.',
    );
    const issue = answerValueError(answer, suggestion.value);
    requireRule(!issue, 'INVALID_ANSWER_VALUE', issue ?? '답변 형식을 확인해 주세요.');
    if ((answer.key === 'project.summary' || answer.key === 'purpose') && answer.confirmed)
      continue;
    if (answer.value !== suggestion.value || answer.notApplicable) changed.push(answer.key);
    answer.value = suggestion.value;
    answer.source = 'AI_INFERRED';
    answer.evidence = suggestion.evidence;
    answer.confirmed = false;
    answer.notApplicable = suggestion.value.trim() === '미해당';
    answer.confirmation = null;
  }
  businessCase.revision += 1;
  businessCase.updatedAt = at;
  propagateCommonAnswers(next, businessCase, changed, [], at);
  addAudit(
    next,
    actor,
    businessCase,
    'APPLY_ANALYSIS',
    at,
    null,
    suggestions.map((item) => item.key),
  );
  return next;
}

/** 새 사업의 서류를 한 번에 생성하며 기관·역할 같은 입력값으로 소유자를 정하지 않는다. */
export function createCase(
  state: MockState,
  actor: Actor,
  input: CreateCaseInput,
): { state: MockState; caseId: string } {
  requireActive(actor);
  requirePermission(actor.role === 'APPLICANT', '일반 사용자 계정으로 사업을 신청해 주세요.');
  if (
    typeof input.title !== 'string' ||
    typeof input.department !== 'string' ||
    typeof input.description !== 'string'
  ) {
    throw new DomainError(400, 'INVALID_CASE', '사업명·부서·개요의 입력 형식을 확인해 주세요.');
  }
  requireRule(
    input.title.trim() && input.department.trim(),
    'CASE_VALUES_REQUIRED',
    '사업명과 부서를 입력해 주세요.',
  );
  requireRule(
    input.title.length <= 120 && input.department.length <= 80 && input.description.length <= 4000,
    'CASE_VALUES_TOO_LONG',
    '사업명 120자, 부서 80자, 개요 4,000자 이내로 입력해 주세요.',
  );
  requireRule(
    Array.isArray(input.docTypes) &&
      input.docTypes.length > 0 &&
      input.docTypes.length <= 2 &&
      new Set(input.docTypes).size === input.docTypes.length &&
      input.docTypes.every((type) => type === 'FIREWALL' || type === 'SECURITY_REVIEW'),
    'INVALID_DOCUMENT_TYPES',
    '서류 유형을 한 개 이상, 중복 없이 선택해 주세요.',
  );
  const next = structuredClone(state);
  const at = new Date().toISOString();
  const businessCase: BusinessCase = {
    id: id(next, 'case'),
    title: input.title.trim(),
    department: input.department.trim(),
    description: input.description.trim(),
    ownerId: actor.id,
    ownerName: actor.displayName,
    revision: 1,
    publicationVersion: 1,
    answers: createEmptyCommonAnswers(),
    createdAt: at,
    updatedAt: at,
  };
  if (businessCase.description) {
    updateAnswers(
      businessCase.answers,
      actor,
      [{ key: 'purpose', value: businessCase.description, confirmed: true, notApplicable: false }],
      at,
    );
  }
  next.cases.unshift(businessCase);
  for (const docType of input.docTypes) {
    const requestId = id(next, 'request');
    next.requests.unshift({
      id: requestId,
      caseId: businessCase.id,
      caseTitle: businessCase.title,
      department: businessCase.department,
      docType,
      ownerId: actor.id,
      ownerName: actor.displayName,
      stage: 1,
      status: 'DRAFT',
      revision: 1,
      caseRevision: businessCase.revision,
      publicationVersion: businessCase.publicationVersion,
      commonAnswers: structuredClone(businessCase.answers),
      answers: createEmptyRequestAnswers(docType),
      reviews: REVIEW_FIELDS.map((field) => ({
        id: `${requestId}-${field.toLowerCase()}`,
        field,
        status: 'PENDING',
        allocationCompleted: false,
        comment: null,
        completedBy: null,
        completedAt: null,
      })),
      assignments: [],
      supplements: [],
      returns: [],
      deadlines: [],
      submissions: [],
      finalConfirmations: [],
      currentSubmissionId: null,
      changedCommonFields: [],
      highlightedFields: [],
      blockers: [],
      allowedActions: [],
      createdAt: at,
      updatedAt: at,
    });
  }
  addAudit(next, actor, businessCase, 'CREATE_CASE', at);
  return { state: next, caseId: businessCase.id };
}
