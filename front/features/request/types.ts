import { z } from 'zod';
import { infrastructurePlanSchema } from './infrastructurePlan';
import { reassignmentReasonSchema } from '@/lib/assignmentStatus';
import type { Actor } from '@/lib/types';

const roleSchema = z.enum(['APPLICANT', 'INFRA', 'SECURITY', 'ADMIN']);

/** 게시본에서 확장할 수 있는 Back 서류 코드 규칙이다. */
export const documentTypeSchema = z.string().regex(/^[A-Z][A-Z0-9_]{1,29}$/);
export const requestStatusSchema = z.enum([
  'DRAFT',
  'CONSULTING',
  'SUPPLEMENT_REQUESTED',
  'FINAL_REVIEW',
  'SUBMITTED',
  'FINALIZED',
  'CLOSED',
  'WITHDRAWN',
]);
export const reviewFieldSchema = z.enum(['INFRA', 'SECURITY']);
export const stageSchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);

export const answerSchema = z.object({
  revision: z.number().optional(),
  needsReview: z.boolean().optional(),
  key: z.string(),
  label: z.string(),
  inputType: z
    .enum([
      'TEXT',
      'LONG_TEXT',
      'BOOLEAN',
      'DATE_RANGE',
      'NUMBER',
      'IP_ADDRESS',
      'PORT',
      'PROTOCOL',
    ])
    .optional(),
  hint: z.string().nullable().optional(),
  scope: z.enum(['CASE', 'REQUEST']),
  ownerRole: roleSchema,
  required: z.boolean(),
  value: z.string(),
  source: z.enum(['USER_ANSWER', 'AI_INFERRED', 'STAFF_INPUT', 'STAFF_CONFIRMED']).nullable(),
  evidence: z.string().nullable(),
  confirmed: z.boolean(),
  notApplicable: z.boolean(),
  confirmation: z
    .object({
      actorId: z.string(),
      actorName: z.string(),
      role: roleSchema.optional(),
      at: z.string(),
    })
    .nullable(),
});

const summaryShape = {
  id: z.string(),
  caseId: z.string(),
  caseTitle: z.string(),
  department: z.string(),
  docType: documentTypeSchema,
  stage: stageSchema,
  status: requestStatusSchema,
  statusLabel: z.string().optional(),
  revision: z.number().int().nonnegative(),
  updatedAt: z.string(),
};

export const requestSummarySchema = z.object(summaryShape);
export const businessCaseSchema = z.object({
  id: z.string(),
  publicationId: z.number().optional(),
  knowledgePublicationId: z.number().optional(),
  title: z.string(),
  department: z.string(),
  description: z.string(),
  ownerId: z.string(),
  ownerName: z.string(),
  revision: z.number().int().nonnegative(),
  publicationVersion: z.number().int().nonnegative(),
  answers: z.array(answerSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const reviewSchema = z.object({
  revision: z.number().optional(),
  statusLabel: z.string().optional(),
  checklist: z.record(z.string(), z.boolean()).optional(),
  id: z.string(),
  field: reviewFieldSchema,
  status: z.enum([
    'PENDING',
    'ALLOCATED',
    'IN_REVIEW',
    'SUPPLEMENT_REQUESTED',
    'COMPLETE',
    'RECHECK',
  ]),
  allocationCompleted: z.boolean(),
  comment: z.string().nullable(),
  completedBy: z.string().nullable(),
  completedAt: z.string().nullable(),
});

export const assignmentSchema = z.object({
  reassignmentReason: reassignmentReasonSchema.nullish(),
  id: z.string(),
  field: reviewFieldSchema,
  assigneeId: z.string(),
  assigneeName: z.string(),
  active: z.boolean(),
  reason: z.string().nullable(),
  assignedAt: z.string(),
});

export const supplementSchema = z.object({
  revision: z.number().optional(),
  id: z.string(),
  field: reviewFieldSchema,
  fieldKeys: z.array(z.string()),
  reason: z.string(),
  answer: z.string().nullable(),
  status: z.enum(['OPEN', 'ANSWERED', 'RESOLVED']),
  requestedBy: z.string(),
  createdAt: z.string(),
  resolvedAt: z.string().nullable(),
});

export const deadlineSchema = z.object({
  paused: z.boolean().optional(),
  id: z.string(),
  field: reviewFieldSchema.nullable(),
  kind: z.enum(['CONSULTATION', 'SUPPLEMENT', 'FINALIZATION']),
  dueAt: z.string(),
  active: z.boolean(),
  closedAt: z.string().nullable(),
  timing: z.enum(['WITHIN', 'DUE_SOON', 'OVERDUE', 'CLOSED']),
});

export const submissionSchema = z.object({
  snapshot: z.unknown().optional(),
  id: z.string(),
  number: z.number().int().nonnegative(),
  requestRevision: z.number().int().nonnegative(),
  caseRevision: z.number().int().nonnegative(),
  publicationVersion: z.number().int().nonnegative(),
  commonAnswers: z.array(answerSchema),
  answers: z.array(answerSchema),
  idempotencyKey: z.string(),
  createdAt: z.string(),
});

export const securityRequestSchema = z.object({
  infrastructurePlan: infrastructurePlanSchema.optional(),
  listOverview: z
    .object({
      myTurn: z.boolean(),
      dueDate: z.string().nullable(),
      submissionId: z.number().nullable(),
      needsReview: z.boolean(),
      fields: z.array(
        z.object({
          field: reviewFieldSchema,
          assigneeUsername: z.string().nullable(),
          reviewStatus: z.string().nullable(),
          allocated: z.boolean(),
          confirmed: z.boolean(),
          reassignmentReason: reassignmentReasonSchema.nullish(),
        }),
      ),
    })
    .optional(),
  ...summaryShape,
  ownerId: z.string(),
  ownerName: z.string(),
  caseRevision: z.number().int().nonnegative(),
  publicationVersion: z.number().int().nonnegative(),
  commonAnswers: z.array(answerSchema),
  answers: z.array(answerSchema),
  reviews: z.array(reviewSchema),
  assignments: z.array(assignmentSchema),
  supplements: z.array(supplementSchema),
  returns: z.array(
    z.object({
      id: z.string(),
      fromStage: stageSchema,
      targetStage: stageSchema,
      fieldReasons: z.record(z.string(), z.string()).optional(),
      fieldKeys: z.array(z.string()),
      reason: z.string(),
      actorName: z.string(),
      createdAt: z.string(),
    }),
  ),
  deadlines: z.array(deadlineSchema),
  submissions: z.array(submissionSchema),
  finalConfirmations: z.array(
    z.object({
      id: z.string(),
      submissionId: z.string(),
      field: reviewFieldSchema,
      actorName: z.string(),
      confirmedAt: z.string(),
    }),
  ),
  currentSubmissionId: z.string().nullable(),
  requiredReviewFields: z.array(reviewFieldSchema).optional(),
  changedCommonFields: z.array(z.string()),
  highlightedFields: z.array(z.string()),
  blockers: z.array(z.string()),
  allowedActions: z.array(z.string()),
  createdAt: z.string(),
});

export const auditEventSchema = z.object({
  id: z.string(),
  actorId: z.string(),
  actorName: z.string(),
  actorRole: roleSchema,
  targetType: z.string(),
  targetId: z.string(),
  targetRevision: z.number(),
  action: z.string(),
  reason: z.string().nullable(),
  fieldKeys: z.array(z.string()),
  requestId: z.string(),
  createdAt: z.string(),
});

export const reviewerPoolSchema = z.object({
  field: reviewFieldSchema,
  defaultReviewerId: z.string().nullable(),
  reviewers: z.array(z.object({ userId: z.string(), displayName: z.string(), role: roleSchema })),
});

export type BusinessCase = z.infer<typeof businessCaseSchema>;
export type SecurityRequest = z.infer<typeof securityRequestSchema>;
export type RequestSummary = z.infer<typeof requestSummarySchema>;
export type Answer = z.infer<typeof answerSchema>;
export type DocumentType = z.infer<typeof documentTypeSchema>;
export type RequestStatus = z.infer<typeof requestStatusSchema>;
export type ReviewField = z.infer<typeof reviewFieldSchema>;
export type Stage = z.infer<typeof stageSchema>;
export type Review = z.infer<typeof reviewSchema>;
export type Assignment = z.infer<typeof assignmentSchema>;
export type Supplement = z.infer<typeof supplementSchema>;
export type Deadline = z.infer<typeof deadlineSchema>;
export type Submission = z.infer<typeof submissionSchema>;
export type ReviewerPool = z.infer<typeof reviewerPoolSchema>;
export type AuditEvent = z.infer<typeof auditEventSchema>;

/** 하위 신청 요약은 조회 시 계산하며 사업 건의 상태로 저장하지 않는다. */
export interface BusinessCaseDetail extends BusinessCase {
  requests: RequestSummary[];
}

export interface CreateCaseInput {
  title: string;
  department: string;
  description: string;
  docTypes: DocumentType[];
}

export interface AnswerInput {
  expectedRevision?: number;
  key: string;
  value: string;
  confirmed: boolean;
  notApplicable: boolean;
}

export type CommandAction =
  | 'REQUEST_REVIEW'
  | 'COMPLETE_ALLOCATION'
  | 'COMPLETE_REVIEW'
  | 'REQUEST_SUPPLEMENT'
  | 'ANSWER_SUPPLEMENT'
  | 'RESOLVE_SUPPLEMENT'
  | 'RETURN'
  | 'SUBMIT'
  | 'FINAL_CONFIRM'
  | 'FINALIZE'
  | 'CLOSE'
  | 'WITHDRAW'
  | 'REASSIGN'
  | 'SAVE_ANSWERS'
  | 'GENERATE_DRAFT';

export interface CommandInput {
  action: CommandAction;
  expectedRevision: number;
  reason?: string;
  fieldKeys?: string[];
  targetStage?: number;
  answers?: AnswerInput[];
  comment?: string;
  checklist?: Record<string, boolean>;
  fieldReasons?: Record<string, string>;
  answer?: string;
  assigneeId?: string;
  field?: ReviewField;
  supplementId?: string;
  idempotencyKey?: string;
}

export interface MockState {
  cases: BusinessCase[];
  requests: SecurityRequest[];
  auditEvents: AuditEvent[];
  sequence: number;
}

export interface CaseAnalysis {
  id: string;
  caseId: string;
  revision: number;
  status: 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'STALE';
  mode: 'EXAMPLE' | 'LIVE';
  provider: string;
  model: string;
  error: string | null;
  suggestions: { key: string; value: string; evidence: string }[];
  createdAt: string;
}

export interface AnalysisInput {
  caseId: string;
  expectedRevision: number;
  text: string;
  file?: File;
}

export const DOCUMENT_LABELS: Record<DocumentType, string> = {
  FIREWALL: '방화벽신청서',
  SECURITY_REVIEW: '보안성검토 신청서',
};
export const STATUS_LABELS: Record<RequestStatus, string> = {
  DRAFT: '작성 중',
  CONSULTING: '협의 중',
  SUPPLEMENT_REQUESTED: '보완 요청',
  FINAL_REVIEW: '최종 검토 중',
  SUBMITTED: '제출됨',
  FINALIZED: '확정',
  CLOSED: '종결(반려)',
  WITHDRAWN: '철회',
};
export const REVIEW_STATUS_LABELS: Record<Review['status'], string> = {
  PENDING: '검토 대기',
  ALLOCATED: '할당 완료',
  IN_REVIEW: '검토 중',
  SUPPLEMENT_REQUESTED: '보완 요청',
  COMPLETE: '협의 완료',
  RECHECK: '재검토',
};
export const STAGE_LABELS = ['작성', '담당자 협의', '사용자 최종 검토', '확정·관리'] as const;
export const FIELD_LABELS: Record<ReviewField, string> = {
  INFRA: 'ICT인프라',
  SECURITY: '정보보안',
};

export type ReviewerDirectory = readonly (Actor & {
  registered?: boolean;
  defaultReviewer?: boolean;
})[];
