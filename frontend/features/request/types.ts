import { z } from 'zod';
import { policySchema, roleSchema } from '@/lib/sharedTypes';

/** 출처·확인과 현재 수정본을 함께 검증하여 AI 후보를 확정 사실로 수용하지 않는다. */
export const sourceSchema = z.object({
  kind: z.enum(['USER_ANSWER', 'AI_INFERRED', 'STAFF_INPUT', 'STAFF_CONFIRMED']),
  evidence: z.string(),
  actorName: z.string(),
  at: z.string(),
});
export const confirmationSchema = z.object({
  actorName: z.string(),
  role: roleSchema,
  at: z.string(),
});
export const answerSchema = z.object({
  key: z.string(),
  label: z.string(),
  reason: z.string(),
  ownerRole: roleSchema,
  requiredAt: z.enum(['CONSULT', 'SUBMIT', 'OPTIONAL']),
  value: z.string(),
  status: z.enum(['EMPTY', 'PROPOSED', 'CONFIRMED', 'NOT_APPLICABLE']),
  source: sourceSchema.nullable(),
  confirmation: confirmationSchema.nullable(),
});
export type Answer = z.infer<typeof answerSchema>;
export const networkInputSchema = z.object({
  id: z.string().optional(),
  sourceName: z.string(),
  sourceIp: z.string(),
  destinationName: z.string(),
  destinationIp: z.string(),
  port: z.string(),
  protocol: z.string(),
  direction: z.string(),
  startsOn: z.string(),
  endsOn: z.string(),
  purpose: z.string(),
});
export type NetworkInput = z.infer<typeof networkInputSchema>;
export const networkSchema = networkInputSchema.extend({
  id: z.string(),
  source: sourceSchema.nullable(),
  confirmation: confirmationSchema.nullable(),
});
export const reviewSchema = z.object({
  role: roleSchema,
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETE', 'INVALIDATED']),
  revision: z.number().nullable(),
  comment: z.string(),
  actorName: z.string().nullable(),
  at: z.string().nullable(),
});
export const returnItemSchema = z.object({
  id: z.string(),
  fieldKey: z.string(),
  label: z.string(),
  reason: z.string(),
  fromStage: z.number(),
  toStage: z.number(),
  status: z.enum(['OPEN', 'RESOLVED']),
  requestedByRole: roleSchema,
  requestedBy: z.string(),
  createdAt: z.string(),
  resolvedAt: z.string().nullable(),
  affected: z.boolean(),
  previousValue: z.string().nullish(),
});
export type ReturnItem = z.infer<typeof returnItemSchema>;
export const requestSchema = z.object({
  id: z.string(),
  title: z.string(),
  documentType: z.enum(['FIREWALL', 'SECURITY_REVIEW']),
  department: z.string(),
  description: z.string(),
  ownerName: z.string(),
  status: z.enum([
    'DRAFT',
    'COLLABORATING',
    'FINAL_REVIEW',
    'SUBMITTED',
    'CONFIRMED',
    'CLOSED',
    'WITHDRAWN',
  ]),
  stage: z.number().int().min(1).max(4),
  allocation: z.object({
    status: z.enum(['PENDING', 'COMPLETE', 'INVALIDATED']),
    revision: z.number().nullable(),
    comment: z.string(),
    actorName: z.string().nullable(),
    at: z.string().nullable(),
  }),
  finalReviews: z.array(reviewSchema),
  returnItems: z.array(returnItemSchema),
  terminalReason: z.string().nullable(),
  finalDraft: z
    .object({
      analysisId: z.string(),
      summary: z.string(),
      evidence: z.string(),
      source: z.literal('AI_INFERRED'),
      confirmed: z.boolean(),
      confirmation: confirmationSchema.nullable(),
    })
    .nullable(),
  submissionVersion: z.number(),
  revision: z.number(),
  policyVersion: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
  answers: z.array(answerSchema),
  rules: z.array(networkSchema),
  reviews: z.array(reviewSchema),
  supplements: z.array(
    z.object({
      id: z.string(),
      question: z.string(),
      answer: z.string(),
      requestedByRole: roleSchema,
      requestedBy: z.string(),
      status: z.enum(['OPEN', 'ANSWERED', 'RESOLVED']),
      createdAt: z.string(),
      resolvedAt: z.string().nullable(),
    }),
  ),
  timeline: z.array(
    z.object({
      id: z.string(),
      action: z.string(),
      description: z.string(),
      actorName: z.string(),
      at: z.string(),
    }),
  ),
  blockers: z.array(z.string()),
  allowedActions: z.array(z.string()),
  policy: policySchema,
});
export type SecurityRequest = z.infer<typeof requestSchema>;
export const analysisSchema = z.object({
  id: z.string(),
  procedureId: z.string(),
  revision: z.number(),
  status: z.enum(['RUNNING', 'SUCCEEDED', 'FAILED', 'STALE']),
  mode: z.enum(['EXAMPLE', 'LIVE']),
  provider: z.string(),
  model: z.string(),
  createdAt: z.string(),
  error: z.string().nullable(),
  suggestions: z.array(
    z.object({ key: z.string(), label: z.string(), value: z.string(), evidence: z.string() }),
  ),
  references: z.array(
    z.object({ title: z.string(), version: z.string(), section: z.string(), url: z.string() }),
  ),
});
export type Analysis = z.infer<typeof analysisSchema>;
