import { z } from 'zod';
import { policySchema } from '@/lib/sharedTypes';

/** 설정 초안·게시본·기존 신청의 스냅샷을 구분하기 위한 응답 계약이다. */
export const settingsSchema = z.object({
  revision: z.number(),
  publishedVersion: z.number(),
  draft: policySchema,
  published: policySchema,
  history: z.array(
    z.object({ version: z.number(), publishedAt: z.string(), publishedBy: z.string() }),
  ),
});
export type Settings = z.infer<typeof settingsSchema>;
export const contextSchema = z.object({
  id: z.string(),
  title: z.string(),
  category: z.string(),
  content: z.string(),
  createdAt: z.string(),
  createdBy: z.string(),
});
export type InstitutionContext = z.infer<typeof contextSchema>;
