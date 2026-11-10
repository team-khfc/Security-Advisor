import { z } from 'zod';
import { DomainError } from '@/lib/problem';
import type { Actor } from '@/lib/types';
import type { MockState } from '@/features/request';
import {
  blankLlmValues,
  configurationValues,
  configurationValuesSchema,
  purposeLabels,
  type LlmConfiguration,
  type LlmHistory,
  type LlmTest,
  type LlmManagement,
} from '@/features/llm/configurationTypes';

const copy = <T>(value: T): T => structuredClone(value);
function fail(status: number, message: string, code = `LLM_${status}`): never {
  throw new DomainError(status, code, message);
}
const commandSchema = configurationValuesSchema.extend({
  expectedRevision: z.number().int().nonnegative().nullable().optional(),
  reason: z.string().max(500).optional(),
});
const labels: Record<string, string> = {
  name: '구성 이름',
  provider: '연결 방식',
  baseUrl: '연결 주소',
  model: '모델명',
  apiKeyEnv: '키 참조',
  purposes: '사용 용도',
  temperature: '응답 다양성',
  maxTokens: '응답 토큰 한도',
  timeoutSeconds: '시간 제한(초)',
  priority: '우선순위',
  active: '사용 여부',
};

/** 외부 호출을 하지 않는 합성 저장소. 연결 성공을 가장하지 않는다. */
export class MockLlmConfigurations {
  private rows: LlmConfiguration[] = [
    {
      ...blankLlmValues('OPENROUTER_API_KEY'),
      name: '합성 기본 모델',
      baseUrl: 'https://openrouter.ai/api',
      model: 'synthetic/model',
      active: true,
      purposes: ['INTERVIEW', 'SUMMARY', 'DOCUMENT', 'INQUIRY'],
      llmConfigurationId: 1,
      revision: 0,
      keyConfigured: false,
    },
  ];
  private records: LlmHistory[] = [
    {
      historyId: 1,
      configurationId: 1,
      configurationRevision: 0,
      action: 'BASELINE',
      changedBy: 'system',
      changedAt: '2026-11-10T00:00:00Z',
      reason: null,
      restoredFromId: null,
      values: configurationValues(this.rows[0]),
    },
  ];
  private tests: LlmTest[] = [];
  constructor(private state: MockState) {}
  bindState(state: MockState) {
    this.state = state;
  }
  private admin(actor: Actor) {
    if (actor.role !== 'ADMIN') fail(403, '기관 관리자만 AI 모델 구성을 관리할 수 있습니다.');
  }
  list(actor: Actor) {
    this.admin(actor);
    return copy(this.rows);
  }
  item(actor: Actor, id: number) {
    this.admin(actor);
    const row = this.rows.find((r) => r.llmConfigurationId === id);
    if (!row) fail(404, '모델 구성을 찾을 수 없습니다.');
    return copy(row);
  }
  management(actor: Actor): LlmManagement {
    this.admin(actor);
    return {
      mode: 'FAKE',
      allowedHosts: ['openrouter.ai', 'api.openai.com', 'ollama'],
      keyReferences: ['OPENAI_API_KEY', 'OPENROUTER_API_KEY', 'OLLAMA_API_KEY'].map((name) => ({
        name,
        configured: false,
      })),
      routes: Object.keys(purposeLabels).map((purpose) => ({
        purpose: purpose as keyof typeof purposeLabels,
        configurationId: null,
        modelReference: null,
        status: 'SIMULATED',
      })),
    };
  }
  private validated(actor: Actor, id: number | null, input: unknown) {
    this.admin(actor);
    const parsed = commandSchema.safeParse(input);
    if (!parsed.success) fail(422, '모델 구성의 필수 값과 범위를 확인해 주세요.');
    const command = parsed.data,
      current = id === null ? null : this.item(actor, id);
    if (current && current.revision !== command.expectedRevision)
      fail(409, '다른 관리자가 수정했습니다. 최신 구성을 확인해 주세요.', 'REVISION_CONFLICT');
    const url = new URL(command.baseUrl),
      management = this.management(actor);
    if (
      !['https:', 'http:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !management.allowedHosts.includes(url.hostname)
    )
      fail(422, '설치에서 허용한 연결 주소만 사용할 수 있습니다.');
    if (!management.keyReferences.some((k) => k.name === command.apiKeyEnv))
      fail(422, '설치에서 허용한 키 참조를 선택해 주세요.');
    if (
      new Set(command.purposes).size !== command.purposes.length ||
      Math.abs(command.temperature * 100 - Math.round(command.temperature * 100)) > 1e-8
    )
      fail(422, '용도 중복과 응답 다양성의 소수 자릿수를 확인해 주세요.');
    command.purposes.sort();
    return { command, current };
  }
  compare(actor: Actor, id: number | null, input: unknown) {
    const { command, current } = this.validated(actor, id, input),
      candidate = configurationValues(command),
      before = current ? configurationValues(current) : null;
    const format = (key: string, value: unknown) =>
      key === 'purposes'
        ? (value as (keyof typeof purposeLabels)[]).map((p) => purposeLabels[p]).join(', ')
        : typeof value === 'boolean'
          ? value
            ? '사용'
            : '사용 중지'
          : String(value);
    return {
      currentRevision: current?.revision ?? null,
      current: before,
      candidate,
      changes: Object.entries(candidate)
        .filter(
          ([key, value]) =>
            !before || JSON.stringify(before[key as keyof typeof before]) !== JSON.stringify(value),
        )
        .map(([key, value]) => ({
          field: key,
          label: labels[key],
          before: before ? format(key, before[key as keyof typeof before]) : '없음',
          after: format(key, value),
        })),
    };
  }
  save(
    actor: Actor,
    id: number | null,
    input: unknown,
    now: string,
    restoredFromId: number | null = null,
  ) {
    const { command, current } = this.validated(actor, id, input),
      comparison = this.compare(actor, id, command);
    if (!comparison.changes.length) fail(422, '현재 구성과 다른 내용이 없습니다.');
    if (this.rows.some((r) => r.name === command.name && r.llmConfigurationId !== id))
      fail(409, '같은 이름의 구성이 이미 있습니다.', 'CONFLICT');
    const row = {
      ...comparison.candidate,
      llmConfigurationId: id ?? this.rows.length + 1,
      revision: current ? current.revision + 1 : 0,
      keyConfigured: false,
    };
    if (id === null) this.rows.push(row);
    else this.rows[this.rows.findIndex((r) => r.llmConfigurationId === id)] = row;
    const action = restoredFromId ? 'RESTORED' : id === null ? 'CREATED' : 'UPDATED';
    this.records.push({
      historyId: this.records.length + 1,
      configurationId: row.llmConfigurationId,
      configurationRevision: row.revision,
      action,
      changedBy: actor.username,
      changedAt: now,
      reason: command.reason?.trim() || null,
      restoredFromId,
      values: copy(comparison.candidate),
    });
    this.audit(actor, `LLM_CONFIGURATION_${action}`, row.llmConfigurationId, row.revision, now);
    return copy(row);
  }
  history(actor: Actor, id: number, page: number, size: number) {
    this.item(actor, id);
    if (!Number.isInteger(page) || page < 0 || !Number.isInteger(size) || size < 1 || size > 100)
      fail(422, '페이지 범위를 확인해 주세요.');
    const all = this.records.filter((r) => r.configurationId === id).toReversed();
    return {
      content: copy(all.slice(page * size, (page + 1) * size)),
      page,
      size,
      totalElements: all.length,
    };
  }
  restore(actor: Actor, id: number, input: unknown, now: string) {
    this.admin(actor);
    const parsed = z
      .object({
        historyId: z.number().int().positive(),
        expectedRevision: z.number().int().nonnegative(),
        reason: z.string().trim().min(1).max(500),
      })
      .safeParse(input);
    if (!parsed.success) fail(422, '복원할 이력과 사유를 입력해 주세요.');
    const old = this.records.find(
      (r) => r.configurationId === id && r.historyId === parsed.data.historyId,
    );
    if (!old) fail(404, '해당 구성의 이력을 찾을 수 없습니다.');
    return this.save(
      actor,
      id,
      { ...old.values, expectedRevision: parsed.data.expectedRevision, reason: parsed.data.reason },
      now,
      old.historyId,
    );
  }
  test(actor: Actor, input: unknown, now: string) {
    this.admin(actor);
    const parsed = z
      .object({
        configurationId: z.number().nullable().optional(),
        expectedRevision: z.number().nullable().optional(),
        configuration: commandSchema,
      })
      .safeParse(input);
    if (!parsed.success) fail(422, '연결 시험 입력을 확인해 주세요.');
    const body = parsed.data,
      id = body.configurationId ?? null;
    const { command, current } = this.validated(actor, id, {
      ...body.configuration,
      expectedRevision: body.expectedRevision,
    });
    const result: LlmTest = {
      testId: this.tests.length + 1,
      configurationId: id,
      configurationRevision: current?.revision ?? null,
      status: 'FAILED',
      outcome: 'SIMULATED',
      message:
        '모의 환경에서는 실제 연결을 시험하지 않습니다. 실제 서버 연결 모드에서 시험해 주세요.',
      elapsedMillis: 0,
      testedAt: now,
      stale: false,
      testedValues: configurationValues(command),
    };
    this.tests.push(result);
    this.audit(actor, 'LLM_CONNECTION_TESTED', result.testId, 0, now);
    return copy(result);
  }
  result(actor: Actor, id: number) {
    this.admin(actor);
    const row = this.tests.find((r) => r.testId === id);
    if (!row) fail(404, '시험 결과를 찾을 수 없습니다.');
    return {
      ...copy(row),
      stale:
        row.configurationId !== null &&
        this.item(actor, row.configurationId).revision !== row.configurationRevision,
    };
  }
  private audit(actor: Actor, action: string, id: number, revision: number, now: string) {
    this.state.auditEvents.push({
      id: crypto.randomUUID(),
      actorId: actor.id,
      actorName: actor.displayName,
      actorRole: actor.role,
      targetType: 'LlmConfiguration',
      targetId: String(id),
      targetRevision: revision,
      action,
      reason: null,
      fieldKeys: [],
      requestId: crypto.randomUUID(),
      createdAt: now,
    });
  }
}
