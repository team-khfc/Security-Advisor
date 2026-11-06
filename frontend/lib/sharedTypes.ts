import { z } from 'zod';

/** 역할과 기관 설정 스냅샷은 인증·협의·기관 설정에서 동일하게 해석하는 공통 계약이다. */
export const roleSchema = z.enum(['APPLICANT', 'SECURITY', 'INFRA', 'ADMIN']);
export type Role = z.infer<typeof roleSchema>;
export const extraQuestionSchema = z.object({
  key: z.string(),
  label: z.string(),
  reason: z.string(),
  ownerRole: z.enum(['APPLICANT', 'SECURITY', 'INFRA']),
  required: z.boolean(),
});
export type ExtraQuestion = z.infer<typeof extraQuestionSchema>;
export const modelSchema = z.object({
  provider: z.enum(['EXAMPLE', 'OPENAI', 'OPENAI_COMPATIBLE']),
  endpoint: z.string(),
  model: z.string(),
  keyReference: z.string(),
  temperature: z.number(),
  maxTokens: z.number(),
  timeoutSeconds: z.number(),
});
export const policySchema = z.object({
  institutionName: z.string(),
  reviewMode: z.literal('INFRA_FIRST'),
  requireSecurity: z.boolean(),
  requireInfra: z.boolean(),
  questions: z.array(extraQuestionSchema),
  documentFooter: z.string(),
  model: modelSchema,
});
export type Policy = z.infer<typeof policySchema>;
export const ROLE_LABELS: Record<Role, string> = {
  APPLICANT: '일반 사용자',
  SECURITY: '정보보안',
  INFRA: 'ICT인프라',
  ADMIN: '기관 관리자',
};
