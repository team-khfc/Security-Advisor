import { z } from 'zod';
import { reassignmentReasonSchema } from '@/lib/assignmentStatus';

const id = z.number().int().nonnegative();
const text = z.string().nullable();
export const roleDto = z.enum(['APPLICANT', 'INFRA', 'SECURITY', 'ADMIN']);
const field = z.enum(['INFRA', 'SECURITY']);
export const docTypeDto = z.string().regex(/^[A-Z][A-Z0-9_]{1,29}$/);
export const statusDto = z.enum([
  'DRAFTING',
  'IN_REVIEW',
  'SUPPLEMENT_REQUESTED',
  'FINAL_REVIEW',
  'SUBMITTED',
  'CONFIRMED',
  'CLOSED',
  'WITHDRAWN',
]);
export const answerDto = z.object({
  answerId: id,
  notApplicable: z.boolean().optional(),
  fieldKey: z.string(),
  scope: z.enum(['CASE', 'REQUEST']),
  value: text,
  valueSource: z.enum(['USER_ANSWER', 'AI_INFERRED', 'STAFF_INPUT', 'STAFF_CONFIRMED']).nullable(),
  evidence: text,
  confirmed: z.boolean(),
  confirmedBy: text,
  confirmedAt: text,
  needsReview: z.boolean(),
  revision: id,
});
export const publicationDto = z.object({
  publicationId: id,
  version: id,
  fieldSchema: z.object({
    docTypes: z
      .array(z.object({ code: z.string(), reviewFields: z.array(field).nullish() }))
      .optional(),
    fields: z.array(
      z.object({
        key: z.string(),
        label: z.string(),
        type: z
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
        docTypes: z.array(z.string()),
        required: z.boolean(),
        askRole: roleDto,
      }),
    ),
  }),
});
export const requestDto = z.object({
  securityRequestId: id,
  businessCaseId: id,
  docType: docTypeDto,
  stage: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  status: statusDto,
  statusLabel: z.string(),
  revision: id,
  answers: z.array(answerDto),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export const requestListDto = requestDto.omit({ answers: true, createdAt: true }).extend({
  caseTitle: z.string(),
  department: text,
  applicantUsername: z.string(),
  createdAt: z.string().optional(),
  overview: z
    .object({
      myTurn: z.boolean(),
      dueDate: text,
      submissionId: id.nullable(),
      needsReview: z.boolean(),
      fields: z.array(
        z.object({
          field,
          assigneeUsername: text,
          reviewStatus: text,
          allocated: z.boolean(),
          confirmed: z.boolean(),
          reassignmentReason: reassignmentReasonSchema.nullish(),
        }),
      ),
    })
    .nullish(),
});
export const caseDto = z.object({
  businessCaseId: id,
  applicantUsername: z.string(),
  title: z.string(),
  summary: text,
  department: text,
  publicationId: id,
  knowledgePublicationId: id.default(1),
  revision: id,
  caseAnswers: z.array(answerDto),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export const caseListDto = z.object({
  businessCaseId: id,
  title: z.string(),
  department: text,
  progressSummary: z.string(),
  createdAt: z.string(),
});
export const reviewDto = z.object({
  reviewId: id,
  field,
  status: z.enum([
    'WAITING',
    'ALLOCATED',
    'IN_PROGRESS',
    'SUPPLEMENT_REQUESTED',
    'COMPLETED',
    'RECHECK',
  ]),
  statusLabel: z.string(),
  allocated: z.boolean(),
  opinion: text,
  completedBy: text,
  completedAt: text,
  revision: id,
  checklist: z.record(z.string(), z.boolean()),
});
export const assignmentDto = z.object({
  reassignmentReason: reassignmentReasonSchema.nullish(),
  assignmentId: id,
  field,
  assigneeUsername: z.string(),
  active: z.boolean(),
  reason: text,
  assignedAt: z.string(),
});
export const supplementDto = z.object({
  supplementId: id,
  reviewId: id,
  field,
  fieldKeys: z.array(z.string()),
  reason: z.string(),
  status: z.enum(['OPEN', 'ANSWERED', 'RESOLVED']),
  requestedBy: z.string(),
  requestedAt: z.string(),
  answerNote: text,
  answeredAt: text,
  resolvedAt: text,
  revision: id,
});
export const returnDto = z.object({
  stageReturnId: id,
  fromStage: z.number(),
  toStage: z.number(),
  reason: z.string(),
  fieldKeys: z.array(z.string()),
  fieldReasons: z.record(z.string(), z.string()),
  returnedBy: z.string(),
  returnedAt: z.string(),
});
export const deadlineDto = z.object({
  deadlineId: id,
  field: field.nullable(),
  kind: z.enum(['REVIEW', 'SUPPLEMENT_RESPONSE', 'FINAL_CONFIRMATION']),
  dueDate: z.string(),
  active: z.boolean(),
  endedAt: text,
  status: z.enum(['ON_TRACK', 'IMMINENT', 'OVERDUE', 'ENDED']),
  paused: z.boolean(),
});
export const submissionDto = z.object({
  submissionId: id,
  sequenceNo: id,
  latest: z.boolean(),
  submittedAt: z.string(),
  publicationId: id.optional(),
  snapshot: z.unknown().optional(),
});
export const finalConfirmationDto = z.object({
  finalConfirmationId: id,
  submissionId: id,
  field,
  confirmedBy: z.string(),
  confirmedAt: z.string(),
});
export const auditDto = z.object({
  auditEventId: id,
  actorUsername: z
    .string()
    .nullable()
    .transform((value) => value ?? '시스템'),
  actorRole: roleDto.nullable(),
  targetType: z.string(),
  targetId: z.string(),
  targetRevision: id.nullable(),
  action: z.string(),
  reason: text,
  summary: text,
  requestId: text,
  occurredAt: z.string(),
});
export const analysisDto = z.object({
  analysisJobId: id,
  businessCaseId: id,
  status: z.enum(['QUEUED', 'RUNNING', 'NEEDS_REVIEW', 'FAILED']),
  summary: text,
  modelReference: text,
  errorMessage: text,
});
export const applicationDto = z.object({
  job: analysisDto,
  summaryProposal: answerDto.nullable(),
  proposals: z.array(z.object({ securityRequestId: id, result: z.unknown() })),
  warnings: z.array(z.string()),
});

/** Spring Page와 명시적 PageResponse의 페이지 메타데이터를 정규화한다. */
export function pageDto<T extends z.ZodType>(item: T) {
  return z.union([
    z.object({
      content: z.array(item),
      page: z.object({ number: id, size: id, totalElements: id, totalPages: id }),
    }),
    z.object({ content: z.array(item), page: id, size: id, totalElements: id }).transform((v) => ({
      content: v.content,
      page: {
        number: v.page,
        size: v.size,
        totalElements: v.totalElements,
        totalPages: Math.ceil(v.totalElements / v.size),
      },
    })),
  ]);
}
