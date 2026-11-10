import { z } from 'zod';

export const inquirySchema = z.object({
  inquiryId: z.number().int().positive(),
  securityRequestId: z.number().int().positive(),
  staffUsername: z.string(),
  field: z.enum(['INFRA', 'SECURITY']),
  title: z.string(),
  createdAt: z.string(),
});
export const inquiryMessageSchema = z.object({
  inquiryMessageId: z.number().int().positive(),
  inquiryId: z.number().int().positive(),
  role: z.enum(['USER', 'ASSISTANT']),
  text: z.string(),
  evidence: z.array(z.object({ tag: z.string(), label: z.string().nullable() })),
  modelReference: z.string().nullable(),
  flagged: z.boolean(),
  createdAt: z.string(),
});
export const inquiryTurnSchema = z.object({
  question: inquiryMessageSchema,
  answer: inquiryMessageSchema,
});
export type Inquiry = z.infer<typeof inquirySchema>;
export type InquiryMessage = z.infer<typeof inquiryMessageSchema>;
