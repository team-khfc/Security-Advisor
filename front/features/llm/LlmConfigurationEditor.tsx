import { useEffect, useState, type FormEvent } from 'react';
import { Field, Modal, Notice } from '@/components/ui';
import { ApiError } from '@/lib/httpClient';
import { LlmChanges, LlmConfigurationContent } from './LlmConfigurationContent';
import { useLlmActions } from './useLlmConfigurations';
import {
  blankLlmValues,
  configurationValues,
  configurationValuesSchema,
  purposeLabels,
  type LlmValues,
  type LlmConfiguration,
  type LlmManagement,
  type LlmHistory,
  type LlmComparison,
  type LlmTest,
} from './configurationTypes';

/** 비교·연결 시험은 설정을 적용하지 않으며 충돌 때 미저장 입력을 보존한다. */
export function LlmConfigurationEditor({
  initial,
  management,
  restore,
  onClose,
  onSaved,
}: {
  initial: LlmConfiguration | null;
  management: LlmManagement;
  restore?: LlmHistory;
  onClose: () => void;
  onSaved: () => void;
}) {
  const actions = useLlmActions();
  const [base, setBase] = useState(initial);
  const [value, setValue] = useState<LlmValues>(
    () =>
      restore?.values ??
      (initial
        ? configurationValues(initial)
        : blankLlmValues(
            management.keyReferences.find((k) => k.configured)?.name ??
              management.keyReferences[0]?.name,
          )),
  );
  const [baseline, setBaseline] = useState(() =>
    JSON.stringify(initial ? configurationValues(initial) : value),
  );
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [comparison, setComparison] = useState<LlmComparison | null>(null);
  const [result, setResult] = useState<LlmTest | null>(null);
  const [conflict, setConflict] = useState(false);
  const [latest, setLatest] = useState<LlmConfiguration | null>(null);
  const [discard, setDiscard] = useState(false);
  const busy =
    actions.compare.isPending ||
    actions.save.isPending ||
    actions.test.isPending ||
    actions.latest.isPending;
  const dirty = JSON.stringify(value) !== baseline || reason.length > 0;
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);
  const command = { ...value, expectedRevision: base?.revision ?? null, reason };
  function change<K extends keyof LlmValues>(key: K, next: LlmValues[K]) {
    setValue((v) => ({ ...v, [key]: next }));
    setComparison(null);
    setResult(null);
    setErrors([]);
  }
  function fail(error: unknown) {
    if (
      base &&
      error instanceof ApiError &&
      error.status === 409 &&
      error.code === 'REVISION_CONFLICT'
    ) {
      setConflict(true);
      setComparison(null);
      setResult(null);
    }
    setErrors([
      error instanceof Error ? error.message : '요청하지 못했습니다. 다시 시도해 주세요.',
    ]);
  }
  function valid() {
    const parsed = configurationValuesSchema.safeParse(value);
    const issues = parsed.success ? [] : parsed.error.issues.map((i) => i.message);
    if (restore && !reason.trim()) issues.push('복원 사유를 입력해 주세요.');
    if (reason.length > 500) issues.push('변경 사유는 500자 이하여야 합니다.');
    setErrors(issues);
    return issues.length === 0;
  }
  async function compare(event: FormEvent) {
    event.preventDefault();
    if (!valid() || conflict) return;
    try {
      setComparison(
        await actions.compare.mutateAsync({ id: base?.llmConfigurationId ?? null, command }),
      );
    } catch (error) {
      fail(error);
    }
  }
  async function test() {
    if (!valid() || conflict) return;
    setResult(null);
    try {
      setResult(await actions.test.mutateAsync({ id: base?.llmConfigurationId ?? null, command }));
    } catch (error) {
      fail(error);
    }
  }
  async function save() {
    if (!comparison || conflict || !valid()) return;
    try {
      await actions.save.mutateAsync({
        id: base?.llmConfigurationId ?? null,
        command: { ...command, expectedRevision: comparison.currentRevision },
        historyId: restore?.historyId,
      });
      onSaved();
    } catch (error) {
      fail(error);
    }
  }
  async function loadLatest() {
    if (!base) return;
    try {
      setLatest(await actions.latest.mutateAsync(base.llmConfigurationId));
    } catch (error) {
      fail(error);
    }
  }
  function close() {
    if (!busy) {
      if (dirty) setDiscard(true);
      else onClose();
    }
  }
  const title = restore
    ? '이전 모델 구성 복원'
    : initial
      ? 'AI 모델 구성 편집'
      : 'AI 모델 구성 추가';
  return (
    <Modal open title={title} onClose={close}>
      <p>적용하면 이후 AI 호출부터 사용합니다. 기존 답변·제출본·지식 기준은 그대로 보존합니다.</p>
      {restore && (
        <Notice>
          이력 #{restore.historyId}의 값을 현재 구성과 비교하고 새 변경으로 복원합니다.
        </Notice>
      )}
      {errors.length > 0 && (
        <div role="alert">
          <Notice tone="danger">
            <ul>
              {errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </Notice>
        </div>
      )}
      {conflict && (
        <Notice tone="warning">
          <p>다른 관리자가 수정했습니다. 내 입력은 보존했습니다. 최신 값을 확인해 주세요.</p>
          <button className="btn" disabled={busy} onClick={() => void loadLatest()}>
            최신 구성 확인
          </button>
        </Notice>
      )}
      {latest && (
        <section className="card">
          <h3>서버 최신 구성</h3>
          <LlmConfigurationContent values={latest} />
          <button
            className="btn"
            disabled={busy}
            onClick={() => {
              setBase(latest);
              setValue(restore?.values ?? configurationValues(latest));
              setBaseline(JSON.stringify(configurationValues(latest)));
              setLatest(null);
              setConflict(false);
              setComparison(null);
              setResult(null);
              setErrors([]);
            }}
          >
            {restore ? '최신 기준으로 복원 다시 검토' : '내 입력을 최신 값으로 교체'}
          </button>
        </section>
      )}
      <form className="knowledge-form llm-form" onSubmit={(event) => void compare(event)}>
        <fieldset disabled={busy || !!restore}>
          <legend>모델 연결 구성</legend>
          <div className="knowledge-grid">
            <Field label="구성 이름" htmlFor="llm-name">
              <input
                id="llm-name"
                className="input"
                value={value.name}
                required
                maxLength={100}
                onChange={(e) => change('name', e.target.value)}
              />
            </Field>
            <Field label="모델명" htmlFor="llm-model">
              <input
                id="llm-model"
                className="input"
                value={value.model}
                required
                maxLength={100}
                onChange={(e) => change('model', e.target.value)}
              />
            </Field>
          </div>
          <Field
            label="연결 주소"
            htmlFor="llm-url"
            hint={`설치에서 허용한 호스트: ${management.allowedHosts.join(', ')}`}
          >
            <input
              id="llm-url"
              className="input"
              type="url"
              value={value.baseUrl}
              required
              maxLength={300}
              aria-describedby="llm-url-hint"
              onChange={(e) => change('baseUrl', e.target.value)}
            />
          </Field>
          <Field
            label="키 참조"
            htmlFor="llm-key"
            hint="실제 API 키는 입력하지 않습니다. 서버 설치 설정에 등록된 참조를 선택하세요."
          >
            <select
              id="llm-key"
              className="input"
              value={value.apiKeyEnv}
              aria-describedby="llm-key-hint"
              onChange={(e) => change('apiKeyEnv', e.target.value)}
            >
              <option value="">키 참조 선택</option>
              {!management.keyReferences.some((k) => k.name === value.apiKeyEnv) &&
                value.apiKeyEnv && (
                  <option value={value.apiKeyEnv}>{value.apiKeyEnv} · 현재 허용되지 않음</option>
                )}
              {management.keyReferences.map((k) => (
                <option key={k.name} value={k.name}>
                  {k.name} · {k.configured ? '설정됨' : '미설정'}
                </option>
              ))}
            </select>
          </Field>
          <fieldset>
            <legend>사용 용도</legend>
            {Object.entries(purposeLabels).map(([key, label]) => (
              <label className="knowledge-option" key={key}>
                <input
                  type="checkbox"
                  checked={value.purposes.includes(key as keyof typeof purposeLabels)}
                  onChange={(e) =>
                    change(
                      'purposes',
                      e.target.checked
                        ? [...value.purposes, key as keyof typeof purposeLabels]
                        : value.purposes.filter((p) => p !== key),
                    )
                  }
                />{' '}
                {label}
              </label>
            ))}
          </fieldset>
          <div className="knowledge-grid">
            {(
              [
                ['temperature', '응답 다양성', 0, 2, 0.01],
                ['maxTokens', '응답 토큰 한도', 64, 32000, 1],
                ['timeoutSeconds', '시간 제한(초)', 5, 600, 1],
                ['priority', '우선순위', 0, 10000, 1],
              ] as const
            ).map(([key, label, min, max, step]) => (
              <Field key={key} label={label} htmlFor={`llm-${key}`}>
                <input
                  className="input"
                  id={`llm-${key}`}
                  type="number"
                  min={min}
                  max={max}
                  step={step}
                  required
                  value={Number.isNaN(value[key]) ? '' : value[key]}
                  onChange={(e) => change(key, e.target.valueAsNumber)}
                />
              </Field>
            ))}
          </div>
          <p className="help">
            같은 용도는 우선순위 숫자가 낮은 활성 구성부터 선택합니다. 키가 설정되지 않은 구성은
            선택하지 않습니다.
          </p>
          <label className="knowledge-option">
            <input
              type="checkbox"
              checked={value.active}
              onChange={(e) => change('active', e.target.checked)}
            />{' '}
            이 구성 사용
          </label>
        </fieldset>
        <Field label={restore ? '복원 사유' : '변경 사유'} htmlFor="llm-reason">
          <textarea
            id="llm-reason"
            className="input"
            maxLength={500}
            required={!!restore}
            disabled={busy}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setComparison(null);
            }}
          />
        </Field>
        <section className="card">
          <h3>연결 시험</h3>
          <p>
            합성 문장만 실제 모델로 전송합니다. 연결 시험은 설정을 저장하지 않습니다. 최대
            30초·512토큰이며 모델 이용료가 발생할 수 있습니다.
          </p>
          <button
            type="button"
            className="btn"
            disabled={busy || conflict}
            onClick={() => void test()}
          >
            {actions.test.isPending ? '연결 시험 중…' : '연결 시험'}
          </button>
          {result && (
            <div role="status">
              <Notice tone={result.status === 'SUCCEEDED' && !result.stale ? 'success' : 'warning'}>
                <strong>
                  {result.outcome === 'SIMULATED'
                    ? '모의 시험 결과'
                    : result.status === 'SUCCEEDED'
                      ? '연결 성공'
                      : '연결 실패'}
                </strong>
                <p>{result.message}</p>
                <p>
                  {result.elapsedMillis}ms · {new Date(result.testedAt).toLocaleString('ko-KR')}
                </p>
                {result.stale && (
                  <p>시험 중 설정이 변경됐습니다. 최신 구성을 다시 확인해 주세요.</p>
                )}
              </Notice>
            </div>
          )}
        </section>
        {comparison && (
          <section className="card" aria-label="적용 전 변경 검토">
            <h3>적용 전 변경 검토</h3>
            {comparison.changes.length ? (
              <LlmChanges comparison={comparison} />
            ) : (
              <p>현재 구성과 다른 내용이 없습니다.</p>
            )}
            <p>변경 사유: {reason || '입력 안 함'}</p>
            {value.active &&
              !management.keyReferences.find((k) => k.name === value.apiKeyEnv)?.configured && (
                <Notice tone="warning">
                  키가 미설정되어 이 구성은 업무 호출에 선택되지 않습니다.
                </Notice>
              )}
            <p>
              연결 성공은 답변 품질이나 모든 용도의 동작을 보장하지 않습니다. 적용 후 상단의 용도별
              선택 상태를 확인하세요.
            </p>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || conflict || !comparison.changes.length}
              onClick={() => void save()}
            >
              {actions.save.isPending ? '적용 중…' : restore ? '이 구성으로 복원' : '변경 적용'}
            </button>
          </section>
        )}
        <div className="llm-actions">
          <button
            type="submit"
            className={comparison ? 'btn' : 'btn btn-primary'}
            disabled={busy || conflict}
          >
            변경 비교
          </button>
          <button type="button" className="btn" disabled={busy} onClick={close}>
            닫기
          </button>
        </div>
      </form>
      {discard && (
        <Notice tone="warning">
          <p>아직 적용하지 않은 입력이 있습니다.</p>
          <button className="btn" onClick={() => setDiscard(false)}>
            계속 편집
          </button>{' '}
          <button className="btn" onClick={onClose}>
            저장하지 않고 닫기
          </button>
        </Notice>
      )}
    </Modal>
  );
}
