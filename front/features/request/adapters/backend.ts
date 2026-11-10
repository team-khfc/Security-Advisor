import { z } from 'zod';
import type { Role } from '@/lib/types';
import {
  answerDto,
  caseDto,
  publicationDto,
  requestDto,
  requestListDto,
  reviewDto,
  assignmentDto,
  supplementDto,
  returnDto,
  deadlineDto,
  submissionDto,
  finalConfirmationDto,
  auditDto,
} from '../apiTypes';
import {
  securityRequestSchema,
  type Answer,
  type BusinessCase,
  type SecurityRequest,
} from '../types';
import { submissionBlockers } from '../readiness';

type Publication = z.infer<typeof publicationDto>;
const statusMap = {
  DRAFTING: 'DRAFT',
  IN_REVIEW: 'CONSULTING',
  CONFIRMED: 'FINALIZED',
  SUPPLEMENT_REQUESTED: 'SUPPLEMENT_REQUESTED',
  FINAL_REVIEW: 'FINAL_REVIEW',
  SUBMITTED: 'SUBMITTED',
  CLOSED: 'CLOSED',
  WITHDRAWN: 'WITHDRAWN',
} as const;

/** 질문 메타데이터는 게시본에서만 가져오고 답변 revision을 보존한다. */
export function adaptAnswers(
  values: z.infer<typeof answerDto>[],
  publication: Publication,
  scope: 'CASE' | 'REQUEST',
  docType?: string,
): Answer[] {
  return publication.fieldSchema.fields
    .filter(
      (f) => f.scope === scope && (!docType || !f.docTypes.length || f.docTypes.includes(docType)),
    )
    .map((f) => {
      const a = values.find((v) => v.fieldKey === f.key);
      return {
        key: f.key,
        label: f.label,
        inputType: f.type,
        hint: f.hint,
        scope: f.scope,
        ownerRole: f.askRole,
        required: f.required,
        value: a?.value ?? '',
        source: a?.valueSource ?? null,
        evidence: a?.evidence ?? null,
        confirmed: a?.confirmed ?? false,
        notApplicable: a?.notApplicable ?? (a?.value === '미해당' && Boolean(a?.valueSource)),
        confirmation:
          a?.confirmedBy && a.confirmedAt
            ? { actorId: a.confirmedBy, actorName: a.confirmedBy, at: a.confirmedAt }
            : null,
        revision: a?.revision,
        needsReview: a?.needsReview ?? false,
      };
    });
}

/** 서버 식별자와 사용자명을 화면 표시용 필드로 옮긴다. */
export function adaptCase(value: z.infer<typeof caseDto>, publication: Publication): BusinessCase {
  return {
    id: String(value.businessCaseId),
    title: value.title,
    description: value.summary ?? '',
    department: value.department ?? '',
    ownerId: value.applicantUsername,
    ownerName: value.applicantUsername,
    revision: value.revision,
    publicationVersion: publication.version,
    publicationId: publication.publicationId,
    knowledgePublicationId: value.knowledgePublicationId,
    answers: adaptAnswers(value.caseAnswers, publication, 'CASE'),
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

/** 버튼 노출 후보만 정한다. 전이 허용 여부와 오류 사유는 행위 API가 판단한다. */
export function actionCandidates(stage: number, status: string, role?: Role): string[] {
  if (['CONFIRMED', 'CLOSED', 'WITHDRAWN'].includes(status)) return ['DOWNLOAD'];
  if (role === 'APPLICANT')
    return [
      'DOWNLOAD',
      'WITHDRAW',
      ...(stage <= 3 ? ['SAVE_ANSWERS', 'EDIT_CASE', 'EDIT_ANSWERS'] : []),
      ...(stage === 1 ? ['REQUEST_REVIEW'] : []),
      ...(stage === 2 ? ['ANSWER_SUPPLEMENT'] : []),
      ...(stage === 3 ? ['SUBMIT', 'ANSWER_SUPPLEMENT', 'GENERATE_DRAFT'] : []),
    ];
  if (role === 'ADMIN') return ['DOWNLOAD', 'REASSIGN'];
  if (role === 'INFRA' || role === 'SECURITY')
    return [
      'DOWNLOAD',
      'CLOSE',
      ...(stage === 2
        ? [
            'SAVE_ANSWERS',
            'EDIT_CASE',
            'EDIT_ANSWERS',
            'RETURN',
            'REQUEST_SUPPLEMENT',
            'RESOLVE_SUPPLEMENT',
            'COMPLETE_REVIEW',
          ]
        : []),
      ...(stage === 3 ? ['RETURN'] : []),
      ...(stage === 4 ? ['RETURN', 'FINAL_CONFIRM', 'FINALIZE'] : []),
    ];
  return ['DOWNLOAD'];
}

/** 목록 DTO는 상세 집계가 없으므로 해당 화면 필드는 빈 표시값으로 둔다. */
export function adaptList(value: z.infer<typeof requestListDto>, role?: Role): SecurityRequest {
  return securityRequestSchema.parse({
    id: String(value.securityRequestId),
    caseId: String(value.businessCaseId),
    caseTitle: value.caseTitle,
    department: value.department ?? '',
    docType: value.docType,
    stage: value.stage,
    status: statusMap[value.status],
    statusLabel: value.statusLabel,
    revision: value.revision,
    updatedAt: value.updatedAt,
    createdAt: value.createdAt ?? value.updatedAt,
    listOverview: value.overview ?? undefined,
    ownerId: value.applicantUsername,
    ownerName: value.applicantUsername,
    caseRevision: 0,
    publicationVersion: 0,
    commonAnswers: [],
    answers: [],
    reviews: [],
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
    allowedActions: actionCandidates(value.stage, value.status, role),
  });
}

export interface RequestParts {
  reviews: z.infer<typeof reviewDto>[];
  assignments: z.infer<typeof assignmentDto>[];
  supplements: z.infer<typeof supplementDto>[];
  returns: z.infer<typeof returnDto>[];
  deadlines: z.infer<typeof deadlineDto>[];
  submissions: z.infer<typeof submissionDto>[];
  finalConfirmations: z.infer<typeof finalConfirmationDto>[];
}

/** 독립 조회 결과와 게시본을 조립한다. 최종 권한·전이 검사는 서버가 수행한다. */
export function adaptRequest(
  value: z.infer<typeof requestDto>,
  businessCase: BusinessCase,
  publication: Publication,
  parts: RequestParts,
  role?: Role,
): SecurityRequest {
  const base = adaptList(
    {
      ...value,
      caseTitle: businessCase.title,
      department: businessCase.department,
      applicantUsername: businessCase.ownerId,
    },
    role,
  );
  const reviews = parts.reviews.map((v) => ({
    id: String(v.reviewId),
    field: v.field,
    status: (
      {
        WAITING: 'PENDING',
        IN_PROGRESS: 'IN_REVIEW',
        COMPLETED: 'COMPLETE',
        ALLOCATED: 'ALLOCATED',
        SUPPLEMENT_REQUESTED: 'SUPPLEMENT_REQUESTED',
        RECHECK: 'RECHECK',
      } as const
    )[v.status],
    statusLabel: v.statusLabel,
    allocationCompleted: v.allocated,
    comment: v.opinion,
    completedBy: v.completedBy,
    completedAt: v.completedAt,
    revision: v.revision,
    checklist: v.checklist,
  }));
  const configuredFields = publication.fieldSchema.docTypes?.find(
    (type) => type.code === value.docType,
  )?.reviewFields;
  const requiredReviewFields = configuredFields?.length
    ? configuredFields
    : (['INFRA', 'SECURITY'] as const);
  const applicableKeys = new Set(
    publication.fieldSchema.fields
      .filter((field) => !field.docTypes.length || field.docTypes.includes(value.docType))
      .map((field) => field.key),
  );
  const adapted: SecurityRequest = {
    ...base,
    createdAt: value.createdAt,
    caseRevision: businessCase.revision,
    publicationVersion: publication.version,
    commonAnswers: businessCase.answers.filter((answer) => applicableKeys.has(answer.key)),
    answers: adaptAnswers(value.answers, publication, 'REQUEST', value.docType),
    reviews,
    requiredReviewFields: [...requiredReviewFields],
    allowedActions: base.allowedActions.filter(
      (action) =>
        action !== 'FINALIZE' ||
        role === (requiredReviewFields.includes('SECURITY') ? 'SECURITY' : 'INFRA'),
    ),
    assignments: parts.assignments.map((v) => ({
      reassignmentReason: v.reassignmentReason,
      id: String(v.assignmentId),
      field: v.field,
      assigneeId: v.assigneeUsername,
      assigneeName: v.assigneeUsername,
      active: v.active,
      reason: v.reason,
      assignedAt: v.assignedAt,
    })),
    supplements: parts.supplements.map((v) => ({
      id: String(v.supplementId),
      field: v.field,
      fieldKeys: v.fieldKeys,
      reason: v.reason,
      answer: v.answerNote,
      status: v.status,
      requestedBy: v.requestedBy,
      createdAt: v.requestedAt,
      resolvedAt: v.resolvedAt,
      revision: v.revision,
    })),
    returns: parts.returns.map((v) => ({
      id: String(v.stageReturnId),
      fromStage: v.fromStage as 1 | 2 | 3 | 4,
      targetStage: v.toStage as 1 | 2 | 3 | 4,
      fieldKeys: v.fieldKeys,
      fieldReasons: v.fieldReasons,
      reason: v.reason,
      actorName: v.returnedBy,
      createdAt: v.returnedAt,
    })),
    deadlines: parts.deadlines.map((v) => ({
      id: String(v.deadlineId),
      field: v.field,
      kind: (
        {
          REVIEW: 'CONSULTATION',
          SUPPLEMENT_RESPONSE: 'SUPPLEMENT',
          FINAL_CONFIRMATION: 'FINALIZATION',
        } as const
      )[v.kind],
      dueAt: v.dueDate,
      active: v.active,
      closedAt: v.endedAt,
      timing: (
        { ON_TRACK: 'WITHIN', IMMINENT: 'DUE_SOON', OVERDUE: 'OVERDUE', ENDED: 'CLOSED' } as const
      )[v.status],
      paused: v.paused,
    })),
    submissions: parts.submissions.map((v) => {
      const snapshot = z
        .object({
          answers: z.array(
            answerDto.omit({
              answerId: true,
              evidence: true,
              confirmed: true,
              needsReview: true,
              revision: true,
            }),
          ),
        })
        .parse(v.snapshot);
      const values = snapshot.answers.map((a, index) => ({
        ...a,
        answerId: index,
        evidence: null,
        confirmed: a.valueSource === 'USER_ANSWER' || !!a.confirmedBy,
        needsReview: false,
        revision: 0,
      }));
      return {
        id: String(v.submissionId),
        number: v.sequenceNo,
        createdAt: v.submittedAt,
        snapshot: v.snapshot,
        requestRevision: 0,
        caseRevision: 0,
        publicationVersion: v.publicationId ?? 0,
        commonAnswers: adaptAnswers(values, publication, 'CASE'),
        answers: adaptAnswers(values, publication, 'REQUEST', value.docType),
        idempotencyKey: '',
      };
    }),
    finalConfirmations: parts.finalConfirmations.map((v) => ({
      id: String(v.finalConfirmationId),
      submissionId: String(v.submissionId),
      field: v.field,
      actorName: v.confirmedBy,
      confirmedAt: v.confirmedAt,
    })),
    currentSubmissionId: parts.submissions.find((v) => v.latest)?.submissionId.toString() ?? null,
    changedCommonFields: businessCase.answers.filter((a) => a.needsReview).map((a) => a.key),
    highlightedFields: value.answers.filter((a) => a.needsReview).map((a) => a.fieldKey),
  };
  if (adapted.stage === 3) adapted.blockers = submissionBlockers(adapted);
  return adapted;
}

/** HTTP 추적 ID와 업무 대상 식별자를 분리한다. */
export function adaptAudit(v: z.infer<typeof auditDto>) {
  return {
    id: String(v.auditEventId),
    actorId: v.actorUsername,
    actorName: v.actorUsername,
    actorRole: v.actorRole,
    targetType: v.targetType,
    targetId: v.targetId,
    targetRevision: v.targetRevision ?? 0,
    action: v.action,
    reason: v.reason,
    summary: v.summary,
    fieldKeys: [],
    requestId: v.requestId ?? '',
    createdAt: v.occurredAt,
  };
}
