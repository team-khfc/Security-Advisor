import { z } from 'zod';

export const snippetSchema = z.object({
  knowledgeSnippetId: z.number(),
  sourceTitle: z.string(),
  sourceVersion: z.string(),
  sourceLocator: z.string(),
  citation: z.string(),
  fieldKeys: z.array(z.string()),
  docTypes: z.array(z.string()),
  body: z.string(),
  active: z.boolean(),
  revision: z.number(),
});
export const contextSchema = z.object({
  privateContextId: z.number(),
  kind: z.enum(['SERVER', 'NETWORK_ZONE', 'ASSET', 'NOTE']),
  name: z.string(),
  aliases: z.array(z.string()),
  attributes: z.record(z.string(), z.string()),
  visibleRoles: z.array(z.enum(['INFRA', 'SECURITY', 'ADMIN'])),
  note: z.string().nullable(),
  active: z.boolean(),
  revision: z.number(),
});
export const draftSchema = z.object({
  knowledgeDraftId: z.number(),
  basedOnVersion: z.number(),
  currentPublishedVersion: z.number(),
  revision: z.number(),
  note: z.string().nullable(),
  updatedBy: z.string(),
  updatedAt: z.string(),
  snippetCount: z.number(),
  privateContextCount: z.number(),
});
export const publicationSchema = z.object({
  knowledgePublicationId: z.number(),
  version: z.number(),
  publishedAt: z.string(),
  publishedBy: z.string().nullable(),
  note: z.string().nullable(),
  previousVersion: z.number().nullable(),
});
export const snapshotSchema = z.object({
  snippets: z.array(snippetSchema),
  privateContexts: z.array(contextSchema),
});
export const comparisonSchema = z.object({
  fromVersion: z.number(),
  toVersion: z.number().nullable(),
  revision: z.number().nullable(),
  changes: z.array(
    z.object({
      kind: z.string(),
      itemId: z.number(),
      label: z.string(),
      before: z.string(),
      after: z.string(),
    }),
  ),
});
export const pageSchema = <T extends z.ZodType>(item: T) =>
  z.object({
    content: z.array(item),
    page: z.number(),
    size: z.number(),
    totalElements: z.number(),
  });
export type Snippet = z.infer<typeof snippetSchema>;
export type PrivateContext = z.infer<typeof contextSchema>;
export type KnowledgeDraft = z.infer<typeof draftSchema>;
export type KnowledgeComparison = z.infer<typeof comparisonSchema>;
export const kindLabels = {
  SERVER: '서버',
  NETWORK_ZONE: '망 구역',
  ASSET: '자산',
  NOTE: '기관 참고 정보',
};
export const roleLabels = { INFRA: 'ICT인프라', SECURITY: '정보보안', ADMIN: '기관 관리자' };
export const blankSnippet = (): Snippet => ({
  knowledgeSnippetId: 0,
  sourceTitle: '',
  sourceVersion: '',
  sourceLocator: '',
  citation: '',
  fieldKeys: [],
  docTypes: [],
  body: '',
  active: true,
  revision: 0,
});
export const blankContext = (): PrivateContext => ({
  privateContextId: 0,
  kind: 'SERVER',
  name: '',
  aliases: [],
  attributes: {},
  visibleRoles: ['INFRA', 'SECURITY'],
  note: '',
  active: true,
  revision: 0,
});

/** 관리 입력은 원문을 그대로 보존하며 서버 저장 전에 크기와 필수 값을 안내한다. */
export function validateSnippet(s: Snippet): string[] {
  const errors: string[] = [];
  for (const [label, value, max] of [
    ['자료명', s.sourceTitle, 200],
    ['판본', s.sourceVersion, 50],
    ['출처 위치', s.sourceLocator, 200],
    ['발췌 본문', s.body, 4000],
  ] as const)
    if (!value.trim() || value.length > max) errors.push(`${label}은 1~${max}자로 입력해 주세요.`);
  if (!s.fieldKeys.length) errors.push('적용 질문을 하나 이상 선택해 주세요.');
  return errors;
}
export function validateContext(c: PrivateContext): string[] {
  const errors: string[] = [];
  if (!c.name.trim() || c.name.length > 200) errors.push('정보 이름은 1~200자로 입력해 주세요.');
  if (!c.visibleRoles.length) errors.push('열람 역할을 하나 이상 선택해 주세요.');
  if (c.aliases.length > 20 || c.aliases.some((a) => !a.trim() || a.length > 100))
    errors.push('별칭은 100자 이하로 최대 20개까지 입력해 주세요.');
  const entries = Object.entries(c.attributes);
  if (
    !entries.length ||
    entries.length > 50 ||
    entries.some(
      ([key, value]) => !key.trim() || key.length > 100 || !value.trim() || value.length > 2000,
    )
  )
    errors.push('속성을 1~50개 입력해 주세요. 이름은 100자, 값은 2000자 이하입니다.');
  if ((c.note?.length ?? 0) > 2000) errors.push('관리 메모는 2000자 이하로 입력해 주세요.');
  return errors;
}
