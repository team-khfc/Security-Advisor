import { z } from 'zod';

export const purposeLabels = {
  INTERVIEW: '인터뷰',
  SUMMARY: '문서 요약',
  DOCUMENT: '초안 생성',
  INQUIRY: '담당자 질의',
} as const;
export type LlmPurpose = keyof typeof purposeLabels;
export const configurationValuesSchema = z.object({
  name: z.string().trim().min(1, '구성 이름을 입력해 주세요.').max(100),
  provider: z.literal('OPENAI_COMPATIBLE'),
  baseUrl: z.string().trim().url('올바른 연결 주소를 입력해 주세요.').max(300),
  model: z.string().trim().min(1, '모델명을 입력해 주세요.').max(100),
  apiKeyEnv: z
    .string()
    .regex(/^[A-Z][A-Z0-9_]{2,99}$/, '키 값 대신 설치된 키 참조를 선택해 주세요.'),
  purposes: z
    .array(z.enum(['INTERVIEW', 'SUMMARY', 'DOCUMENT', 'INQUIRY']))
    .min(1, '용도를 하나 이상 선택해 주세요.')
    .max(4),
  temperature: z.number().min(0).max(2),
  maxTokens: z.number().int().min(64).max(32000),
  timeoutSeconds: z.number().int().min(5).max(600),
  priority: z.number().int().min(0).max(10000),
  active: z.boolean(),
});
export const llmConfigurationSchema = configurationValuesSchema.extend({
  llmConfigurationId: z.number(),
  keyConfigured: z.boolean(),
  revision: z.number(),
});
export const llmComparisonSchema = z.object({
  currentRevision: z.number().nullable(),
  current: configurationValuesSchema.nullable(),
  candidate: configurationValuesSchema,
  changes: z.array(
    z.object({ field: z.string(), label: z.string(), before: z.string(), after: z.string() }),
  ),
});
export const llmManagementSchema = z.object({
  mode: z.enum(['FAKE', 'LIVE']),
  allowedHosts: z.array(z.string()),
  keyReferences: z.array(z.object({ name: z.string(), configured: z.boolean() })),
  routes: z.array(
    z.object({
      purpose: z.enum(['INTERVIEW', 'SUMMARY', 'DOCUMENT', 'INQUIRY']),
      configurationId: z.number().nullable(),
      modelReference: z.string().nullable(),
      status: z.enum(['READY', 'UNAVAILABLE', 'SIMULATED']),
    }),
  ),
});
export const llmHistorySchema = z.object({
  historyId: z.number(),
  configurationId: z.number(),
  configurationRevision: z.number(),
  action: z.string(),
  changedBy: z.string(),
  changedAt: z.string(),
  reason: z.string().nullable(),
  restoredFromId: z.number().nullable(),
  values: configurationValuesSchema,
});
export const llmHistoryPageSchema = z.object({
  content: z.array(llmHistorySchema),
  page: z.number(),
  size: z.number(),
  totalElements: z.number(),
});
export const llmTestSchema = z.object({
  testId: z.number(),
  configurationId: z.number().nullable(),
  configurationRevision: z.number().nullable(),
  status: z.enum(['SUCCEEDED', 'FAILED']),
  outcome: z.string(),
  message: z.string(),
  elapsedMillis: z.number(),
  testedAt: z.string(),
  stale: z.boolean(),
  testedValues: configurationValuesSchema,
});
export type LlmValues = z.infer<typeof configurationValuesSchema>;
export type LlmConfiguration = z.infer<typeof llmConfigurationSchema>;
export type LlmManagement = z.infer<typeof llmManagementSchema>;
export type LlmComparison = z.infer<typeof llmComparisonSchema>;
export type LlmHistory = z.infer<typeof llmHistorySchema>;
export type LlmTest = z.infer<typeof llmTestSchema>;
export type LlmCommand = LlmValues & { expectedRevision: number | null; reason: string };
export const historyLabels: Record<string, string> = {
  BASELINE: '기존 구성',
  CREATED: '새 구성',
  UPDATED: '변경 적용',
  RESTORED: '이전 구성 복원',
};

/** 입력은 화면 메모리에만 보관하며 실제 키 값은 받지 않는다. */
export function blankLlmValues(keyReference = ''): LlmValues {
  return {
    name: '',
    provider: 'OPENAI_COMPATIBLE',
    baseUrl: '',
    model: '',
    apiKeyEnv: keyReference,
    purposes: ['INTERVIEW'],
    temperature: 0.2,
    maxTokens: 1024,
    timeoutSeconds: 60,
    priority: 100,
    active: false,
  };
}
/** 서버 관리 메타데이터를 제거하고 편집·비교할 값만 가져온다. */
export function configurationValues(value: LlmConfiguration | LlmValues): LlmValues {
  return configurationValuesSchema.parse(value);
}
