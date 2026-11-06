import { z } from 'zod';

/** 공개 자료의 제목·버전·절과 URL을 보존해 기관의 비공개 사실과 분리한다. */
export const referenceSchema = z.object({
  title: z.string(),
  version: z.string(),
  section: z.string(),
  url: z.string(),
  summary: z.string(),
});
export type KnowledgeReference = z.infer<typeof referenceSchema>;
