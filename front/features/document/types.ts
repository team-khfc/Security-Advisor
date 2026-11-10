import { z } from 'zod';

/** Back의 GeneratedDocumentResponse. 화면에서 본문·확정 여부를 재구성하지 않는다. */
export const generatedDocumentSchema = z.object({
  generatedDocumentId: z.number().int().positive(),
  securityRequestId: z.number().int().positive(),
  submissionId: z.number().int().positive().nullable(),
  kind: z.enum(['DRAFT', 'SUBMITTED', 'CONFIRMED']),
  kindLabel: z.string(),
  version: z.number().int().positive(),
  title: z.string(),
  sections: z.array(
    z.object({
      title: z.string(),
      values: z.array(
        z.object({
          fieldKey: z.string(),
          label: z.string(),
          scope: z.string(),
          value: z.string().nullable(),
          valueSource: z.string().nullable(),
          confirmed: z.boolean(),
          needsReview: z.boolean(),
          display: z.string(),
          status: z.string(),
        }),
      ),
    }),
  ),
  markdown: z.string(),
  aiSupplement: z.string().nullable(),
  modelReference: z.string().nullable(),
  unconfirmedCount: z.number().int().nonnegative(),
  generatedBy: z.string(),
  generatedAt: z.string(),
});

export type GeneratedDocument = z.infer<typeof generatedDocumentSchema>;
