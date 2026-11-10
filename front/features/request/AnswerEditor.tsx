'use client';

import { useEffect, useState } from 'react';
import { Badge, Icon, Notice } from '@/components/ui';
import { DateRangeAnswer } from './DateRangeAnswer';
import { networkFormatHelp } from './networkAnswerFormat';
import { canConfirmAnswer, answerValueError } from './answerFieldPolicy';
import { useInputDraft } from '@/lib/inputDrafts';
import type { Actor } from '@/lib/types';
import type { Answer, AnswerInput } from './types';

const sourceLabels = {
  USER_ANSWER: '사용자 답변',
  AI_INFERRED: 'AI 추론',
  STAFF_INPUT: '담당자 입력',
  STAFF_CONFIRMED: '담당자 확인',
};

/** 값의 출처와 사람의 확인 기록은 서로 구분해 보여 준다. */
export function SourceBadge({ answer }: { answer: Answer }) {
  if (!answer.source) return <Badge tone="warning">담당자 확인 필요</Badge>;
  const aiConfirmed = answer.confirmed && Boolean(answer.confirmation) && !answer.needsReview;
  const confirmationLabel =
    answer.confirmation?.role === 'APPLICANT'
      ? '사용자 확인'
      : answer.confirmation?.role
        ? '담당자 확인'
        : '확인됨';
  return (
    <span
      className={`badge src ${answer.source === 'AI_INFERRED' ? (aiConfirmed ? 'b-info' : 'b-outline') : answer.source === 'STAFF_CONFIRMED' ? 'b-success' : answer.source === 'STAFF_INPUT' ? 'b-info' : 'b-neutral'}`}
    >
      {sourceLabels[answer.source]}
      {answer.source === 'AI_INFERRED' && (aiConfirmed ? ` · ${confirmationLabel}` : ' · 미확정')}
      {answer.confirmation && answer.source !== 'USER_ANSWER' && (
        <span className="source-person">({answer.confirmation.actorName})</span>
      )}
    </span>
  );
}

/** 원문을 HTML로 해석하지 않고 값·근거·재검토 대상만 안전하게 표시한다. */
export function AnswerView({
  answers,
  highlighted = [],
  evidenceDisplay = 'disclosure',
}: {
  answers: Answer[];
  highlighted?: string[];
  evidenceDisplay?: 'disclosure' | 'inline';
}) {
  return (
    <dl className="answer-list">
      {answers.map((answer) => (
        <div
          id={`field-${answer.key}`}
          className={`answer-item ${highlighted.includes(answer.key) ? 'needs-supplement' : ''}`}
          key={answer.key}
        >
          <dt>
            {answer.label}
            {highlighted.includes(answer.key) && (
              <Badge tone="warning">
                <Icon name="alert" size={14} /> 보완 필요 · 재검토
              </Badge>
            )}
          </dt>
          <dd>
            {/* 값도 출처도 없으면 출처 배지가 같은 '담당자 확인 필요'를 알리므로 글자를 반복하지 않는다. */}
            {(answer.notApplicable || answer.value || answer.source) && (
              <p>{answer.notApplicable ? '미해당' : answer.value || '담당자 확인 필요'}</p>
            )}
            <SourceBadge answer={answer} />
            {answer.evidence && evidenceDisplay === 'inline' ? (
              <p className="src-ev">근거: {answer.evidence}</p>
            ) : answer.evidence ? (
              <details className="evidence">
                <summary>AI 추론 근거 보기</summary>
                <p>{answer.evidence}</p>
              </details>
            ) : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}

interface AnswerEditorProps {
  answers: Answer[];
  revision: number;
  actor: Actor;
  highlighted?: string[];
  onSave: (expectedRevision: number, answers: AnswerInput[]) => Promise<unknown>;
  title?: string;
  draftKey?: string;
}

interface AnswerDraft {
  baseRevision: number;
  values: Record<string, AnswerInput>;
  confirmedForeignKeys: string[];
}

/** 새 조회 결과가 도착해도 미저장 입력을 덮어쓰지 않고 충돌을 비교한다. */
export function AnswerEditor({
  answers,
  revision,
  actor,
  highlighted = [],
  onSave,
  title = '답변 수정',
  draftKey,
}: AnswerEditorProps) {
  const eligible = answers.filter(
    (answer) =>
      answer.ownerRole === actor.role ||
      (canConfirmAnswer(answer, actor.role) &&
        (answer.source === 'AI_INFERRED' || answer.needsReview)),
  );
  const {
    draft: storedDraft,
    saveDraft,
    clearDraft,
  } = useInputDraft<AnswerDraft>(actor.id, draftKey);
  const [localDraft, setLocalDraft] = useState<{ actorId: string; draft: AnswerDraft } | null>(
    null,
  );
  const draft = draftKey
    ? storedDraft
    : localDraft?.actorId === actor.id
      ? localDraft.draft
      : undefined;
  const compactFirewall =
    actor.role === 'APPLICANT' &&
    eligible.some((answer) => answer.scope === 'REQUEST' && answer.key.startsWith('firewall.'));
  const values = draft?.values;
  const baseRevision = draft?.baseRevision ?? revision;
  const dirty = Boolean(draft);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const conflict = dirty && revision !== baseRevision;
  const writeDraft = (next: AnswerDraft) => {
    if (draftKey) saveDraft(next);
    else setLocalDraft({ actorId: actor.id, draft: next });
  };

  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  if (!eligible.length) return null;
  const inputValue = (answer: Answer): AnswerInput => ({
    key: answer.key,
    expectedRevision: answer.revision,
    value: answer.value,
    confirmed: answer.ownerRole === actor.role ? answer.confirmed : false,
    notApplicable: answer.notApplicable,
  });
  const update = (key: string, change: Partial<AnswerInput>) => {
    const current =
      values ?? Object.fromEntries(eligible.map((answer) => [answer.key, inputValue(answer)]));
    const answer = eligible.find((item) => item.key === key)!;
    const confirmedForeignKeys = new Set(draft?.confirmedForeignKeys ?? []);
    if (answer.ownerRole !== actor.role && change.confirmed !== undefined) {
      if (change.confirmed) confirmedForeignKeys.add(key);
      else confirmedForeignKeys.delete(key);
    }
    writeDraft({
      baseRevision: dirty ? baseRevision : revision,
      values: { ...current, [key]: { ...(current[key] ?? inputValue(answer)), ...change } },
      confirmedForeignKeys: [...confirmedForeignKeys],
    });
    setSaved(false);
  };

  return (
    <form
      className="answer-editor"
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        setError(null);
        try {
          for (const answer of eligible) {
            const input = values?.[answer.key] ?? inputValue(answer);
            if (!input.value.trim() && !input.confirmed && !input.notApplicable) continue;
            const issue = answerValueError(answer, input.notApplicable ? '미해당' : input.value);
            if (issue) throw new Error(issue);
          }
          await onSave(
            dirty ? baseRevision : revision,
            eligible
              .filter(
                (answer) =>
                  answer.ownerRole === actor.role ||
                  draft?.confirmedForeignKeys?.includes(answer.key),
              )
              .map((answer) => values?.[answer.key] ?? inputValue(answer)),
          );
          clearDraft();
          setLocalDraft(null);
          setSaved(true);
        } catch (cause) {
          setError(
            cause instanceof Error
              ? cause.message
              : '답변을 저장하지 못했습니다. 입력값은 유지됩니다.',
          );
        } finally {
          setPending(false);
        }
      }}
    >
      <h3 className="h-panel">{title}</h3>
      <p className="help">
        현재 역할의 담당 항목을 수정합니다. 인계받은 항목도 기존 내용을 이어서 수정할 수 있습니다.
        AI 추론과 재검토 대상은 내용을 읽고 확인해 주세요. 다른 역할의 항목은 값을 바꾸지 않고
        확인만 기록합니다.
      </p>
      {draftKey && dirty && (
        <p className="help" role="status">
          저장하지 않은 입력은 이 탭에서 같은 계정으로 돌아오면 복원됩니다. 새로고침하거나 탭을
          닫으면 사라집니다.
        </p>
      )}
      {conflict && (
        <Notice tone="warning">
          <strong>서버에 새 내용이 있습니다.</strong>
          <p>현재 화면의 입력을 유지했습니다. 서버의 최신 값과 비교한 후 다시 저장해 주세요.</p>
          <details>
            <summary>서버 최신 값 보기</summary>
            <AnswerView answers={eligible} />
          </details>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => {
              if (draft) writeDraft({ ...draft, baseRevision: revision });
              setError(null);
            }}
          >
            내 입력을 유지하고 최신 버전 기준으로 저장 준비
          </button>
        </Notice>
      )}
      {error && <Notice tone="danger">{error} 입력값은 지워지지 않았습니다.</Notice>}
      {saved && (
        <p className="save-success" role="status">
          <Icon name="check" size={16} /> 답변을 저장했습니다.
        </p>
      )}
      <div className={compactFirewall ? 'firewall-answer-fields' : undefined}>
        {eligible.map((answer) => {
          const value = values?.[answer.key] ?? inputValue(answer);
          const compactNetwork =
            compactFirewall && ['firewall.protocol', 'firewall.port'].includes(answer.key);
          const calendar = compactFirewall && answer.key === 'firewall.period';
          const shortPurpose = compactFirewall && answer.key === 'firewall.purpose';
          const changeValue = (value: string) =>
            update(answer.key, { value, confirmed: false, notApplicable: false });
          const inputId = `edit-${answer.scope}-${answer.key}`;
          return (
            <div
              className={`field ${compactNetwork ? 'firewall-network-field' : ''} ${shortPurpose ? 'firewall-purpose-field' : ''} ${highlighted.includes(answer.key) ? 'needs-supplement' : ''}`}
              key={answer.key}
            >
              <label htmlFor={inputId}>
                {answer.label}{' '}
                {compactNetwork && !answer.required ? (
                  <span className="help">(선택)</span>
                ) : (
                  answer.required &&
                  actor.role !== 'APPLICANT' && <span className="required">(필수)</span>
                )}
              </label>
              {highlighted.includes(answer.key) && (
                <p className="help warning-text">
                  <Icon name="alert" size={16} /> 보완 필요 · 이전 값을 보존했습니다.
                </p>
              )}
              {answer.inputType && networkFormatHelp[answer.inputType] && (
                <p className="help">
                  {networkFormatHelp[answer.inputType]} 목록은 쉼표나 줄바꿈으로 구분합니다.
                </p>
              )}
              {calendar ? (
                <DateRangeAnswer
                  label={answer.label}
                  required={false}
                  value={value.notApplicable ? '' : value.value}
                  disabled={pending || value.notApplicable}
                  onChange={changeValue}
                />
              ) : compactNetwork ? (
                <input
                  className="input"
                  id={inputId}
                  type="text"
                  maxLength={4000}
                  value={value.notApplicable ? '' : value.value}
                  disabled={pending || value.notApplicable}
                  onChange={(event) => changeValue(event.target.value)}
                  aria-describedby={`${inputId}-source`}
                />
              ) : (
                <textarea
                  className="input"
                  id={inputId}
                  rows={2}
                  maxLength={4000}
                  value={value.notApplicable ? '' : value.value}
                  readOnly={answer.ownerRole !== actor.role}
                  disabled={pending || value.notApplicable}
                  onChange={(event) =>
                    update(answer.key, {
                      value: event.target.value,
                      confirmed: false,
                      notApplicable: false,
                    })
                  }
                  aria-describedby={`${inputId}-source`}
                />
              )}
              <div id={`${inputId}-source`}>
                <SourceBadge answer={answer} />
                {answer.evidence && <p className="help evidence-text">근거: {answer.evidence}</p>}
              </div>
              {!compactFirewall && (
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={value.confirmed}
                    disabled={pending}
                    onChange={(event) => update(answer.key, { confirmed: event.target.checked })}
                  />
                  이 항목의 내용을 확인했습니다
                </label>
              )}
              {!answer.required && (
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={value.notApplicable}
                    disabled={pending || answer.ownerRole !== actor.role}
                    onChange={(event) =>
                      update(answer.key, {
                        notApplicable: event.target.checked,
                        value: value.value === '미해당' ? '' : value.value,
                        confirmed: event.target.checked,
                      })
                    }
                  />
                  미해당 (해당 없음)
                </label>
              )}
            </div>
          );
        })}
      </div>
      {compactFirewall && (
        <label className="check-row">
          <input
            type="checkbox"
            disabled={pending || conflict}
            checked={
              eligible.some((answer) => {
                const value = values?.[answer.key] ?? inputValue(answer);
                return value.value.trim() || value.notApplicable;
              }) &&
              eligible.every((answer) => {
                const value = values?.[answer.key] ?? inputValue(answer);
                return !(value.value.trim() || value.notApplicable) || value.confirmed;
              })
            }
            onChange={(event) => {
              const checked = event.target.checked;
              writeDraft({
                baseRevision,
                confirmedForeignKeys: [],
                values: Object.fromEntries(
                  eligible.map((answer) => {
                    const value = values?.[answer.key] ?? inputValue(answer);
                    return [
                      answer.key,
                      {
                        ...value,
                        confirmed: checked && Boolean(value.value.trim() || value.notApplicable),
                      },
                    ];
                  }),
                ),
              });
              setSaved(false);
            }}
          />
          작성한 답변의 내용을 확인했습니다
        </label>
      )}
      <div className="btn-row">
        <button className="btn" disabled={pending || conflict}>
          {pending ? '저장 중…' : '답변 저장'}
        </button>
        <span className="help" role="status">
          {dirty ? '저장하지 않은 변경 있음' : `기준 수정본 ${revision}`}
        </span>
      </div>
    </form>
  );
}
