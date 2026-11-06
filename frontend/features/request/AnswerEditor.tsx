'use client';
import { useState } from 'react';
import { useMemoryDraft, useSession } from '@/features/auth';
import { ROLE_LABELS } from '@/lib/sharedTypes';
import { type Answer, type SecurityRequest, type ReturnItem } from './types';
import { formatAnswerValue, formatDate } from '@/lib/format';
import { createVersionedDraft, reconcileVersionedDraft } from '@/lib/versionedDraft';
import { ErrorNotice, Notice, Badge } from '@/components/ui';
import { useRequestMutation, useRequest } from './useRequests';

export interface DraftAnswer {
  key: string;
  value: string;
  confirmed: boolean;
  notApplicable: boolean;
}
/** 서버의 값과 확인 상태를 분리된 편집 모델로 옮겨 확인 여부를 암묵적으로 승격하지 않는다. */
export function toDraftAnswer(answer: Answer): DraftAnswer {
  return {
    key: answer.key,
    value: answer.value,
    confirmed: answer.status === 'CONFIRMED' || answer.status === 'NOT_APPLICABLE',
    notApplicable: answer.status === 'NOT_APPLICABLE',
  };
}
/** 원래 AI·사용자 출처와 이후 담당자의 확인을 별도로 보존해 표시한다. */
export function SourceEvidence({ answer }: { answer: Answer }) {
  const kinds = {
    USER_ANSWER: '사용자 답변',
    AI_INFERRED: 'AI 추론',
    STAFF_INPUT: '담당자 입력',
    STAFF_CONFIRMED: '담당자 확인',
  };
  return (
    <div className="source-meta">
      <p>
        {answer.source
          ? `${kinds[answer.source.kind]} · ${answer.source.actorName} · ${formatDate(answer.source.at, true)}`
          : '출처 없음 · 담당자 확인 필요'}
      </p>
      {answer.source?.evidence && <p>원문 근거: {answer.source.evidence}</p>}
      {answer.confirmation && (
        <p>
          확인: {answer.confirmation.actorName} · {ROLE_LABELS[answer.confirmation.role]} ·{' '}
          {formatDate(answer.confirmation.at, true)}
        </p>
      )}
    </div>
  );
}
/** 값과 확인 체크를 분리하고 모르는 외부 전송 여부는 확정할 수 없게 한다. */
export function AnswerFields({
  answers,
  values,
  disabled,
  onChange,
  returnItems = [],
}: {
  answers: Answer[];
  values: DraftAnswer[];
  disabled: boolean;
  onChange?: (key: string, patch: Partial<DraftAnswer>) => void;
  returnItems?: ReturnItem[];
}) {
  return (
    <>
      {answers.map((answer) => {
        const value = values.find((entry) => entry.key === answer.key) ?? toDraftAnswer(answer);
        const id = `answer-${answer.key}`;
        const returned = returnItems.find(
          (item) => item.fieldKey === answer.key && item.status === 'OPEN',
        );
        return (
          <div
            className={`sf-field answer-input ${returned ? 'returned-field' : ''}`}
            key={answer.key}
          >
            {returned && (
              <p className="returned-reason">
                <strong>↩ 보완 필요</strong> {returned.reason}
              </p>
            )}
            <label htmlFor={id}>
              {answer.label}
              <span className={answer.requiredAt === 'OPTIONAL' ? 'optional' : 'required'}>
                {answer.requiredAt === 'OPTIONAL'
                  ? '선택'
                  : answer.requiredAt === 'CONSULT'
                    ? '협의 요청 전 필수'
                    : '최종 제출 전 필수'}
              </span>
            </label>
            <p className="field-hint" id={`${id}-hint`}>
              {answer.reason} · 작성: {ROLE_LABELS[answer.ownerRole]}
            </p>
            {answer.key === 'externalTransfer' ? (
              <select
                id={id}
                value={value.value || 'UNKNOWN'}
                aria-describedby={`${id}-hint`}
                disabled={disabled}
                onChange={(event) =>
                  onChange?.(answer.key, { value: event.target.value, confirmed: false })
                }
              >
                <option value="UNKNOWN">아직 모름 · 담당자 확인 필요</option>
                <option value="NO">외부 전송 없음</option>
                <option value="YES">외부 전송 있음</option>
              </select>
            ) : (
              <textarea
                id={id}
                rows={3}
                value={value.value}
                maxLength={4000}
                disabled={disabled}
                aria-describedby={`${id}-hint`}
                placeholder="모르는 내용은 비워 두고 담당자와 확인해 주세요."
                onChange={(event) =>
                  onChange?.(answer.key, { value: event.target.value, confirmed: false })
                }
              />
            )}
            <SourceEvidence answer={answer} />
            {returned && value.value !== (returned.previousValue ?? answer.value) && (
              <details className="previous-value">
                <summary>보완 전 저장된 값 보기</summary>
                <p className="readonly-value">
                  {formatAnswerValue(answer.key, returned.previousValue ?? answer.value)}
                </p>
              </details>
            )}
            {answer.requiredAt === 'OPTIONAL' && (
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={value.notApplicable}
                  disabled={disabled}
                  onChange={(event) =>
                    onChange?.(answer.key, {
                      notApplicable: event.target.checked,
                      confirmed: false,
                    })
                  }
                />
                해당 없음 · 입력란에 사유 작성
              </label>
            )}
            <label className="check-label">
              <input
                type="checkbox"
                checked={value.confirmed}
                disabled={
                  disabled ||
                  !value.value.trim() ||
                  (answer.key === 'externalTransfer' && value.value === 'UNKNOWN')
                }
                onChange={(event) => onChange?.(answer.key, { confirmed: event.target.checked })}
              />
              {answer.ownerRole === 'APPLICANT'
                ? '근거와 답변 내용을 직접 확인했습니다'
                : '담당 분야의 근거와 내용을 확인했습니다'}
            </label>
            {answer.key === 'externalTransfer' && (!value.value || value.value === 'UNKNOWN') && (
              <p className="field-hint">‘아직 모름’은 확정할 수 없습니다.</p>
            )}
          </div>
        );
      })}
    </>
  );
}
/** 저장하지 않은 입력만 충돌 기준과 함께 유지하고 미편집 초안은 최신 서버 수정본에 동기화한다. */
export function AnswerEditor({
  procedure,
  compact = false,
  onSaved,
}: {
  procedure: SecurityRequest;
  compact?: boolean;
  onSaved?: () => void;
}) {
  const { user } = useSession();
  const relevant = procedure.answers.filter((answer) => answer.ownerRole === user.role);
  const [draft, setDraft, clear] = useMemoryDraft(
    `answers:${procedure.id}`,
    createVersionedDraft(procedure.revision, relevant.map(toDraftAnswer)),
  );
  const mutation = useRequestMutation(procedure.id);
  const latest = useRequest(procedure.id);
  const [feedback, setFeedback] = useState('');
  const [compared, setCompared] = useState(false);
  const synchronized = reconcileVersionedDraft(
    draft,
    procedure.revision,
    relevant.map(toDraftAnswer),
  );
  if (synchronized !== draft) setDraft(synchronized);
  const allowed = procedure.allowedActions.includes('EDIT');
  async function save() {
    setFeedback('');
    try {
      const response = await mutation.mutateAsync({
        endpoint: '/answers',
        method: 'PATCH',
        body: { expectedRevision: draft.revision, answers: draft.value },
      });
      setDraft(
        createVersionedDraft(
          response.revision,
          response.answers.filter((answer) => answer.ownerRole === user.role).map(toDraftAnswer),
        ),
      );
      clear();
      setFeedback('답변과 확인 상태를 저장했습니다.');
      setCompared(false);
      onSaved?.();
    } catch {
      /* 입력은 현재 신원으로 분리한 메모리 초안에 유지한다. */
    }
  }
  async function compareLatest() {
    const result = await latest.refetch();
    if (result.data) {
      setDraft((current) => ({ ...current, revision: result.data.revision }));
      setCompared(true);
    }
  }
  return (
    <>
      <ErrorNotice error={mutation.error} />
      {mutation.error && (
        <button
          type="button"
          className="text-button"
          onClick={() => void compareLatest()}
          disabled={latest.isFetching}
        >
          최신 저장 내용과 비교
        </button>
      )}
      {compared && (
        <Notice>
          최신 수정본 v{draft.revision}을 확인했습니다. 아래에 유지한 입력과 비교한 후 저장해
          주세요.
          <dl>
            {relevant.map((answer) => (
              <div key={answer.key}>
                <dt>{answer.label} · 서버 저장값</dt>
                <dd>{formatAnswerValue(answer.key, answer.value)}</dd>
              </div>
            ))}
          </dl>
        </Notice>
      )}
      <AnswerFields
        answers={relevant}
        returnItems={procedure.returnItems}
        values={draft.value}
        disabled={!allowed || mutation.isPending}
        onChange={(key, patch) => {
          setFeedback('');
          setDraft((current) => ({
            ...current,
            value: current.value.map((value) =>
              value.key === key ? { ...value, ...patch } : value,
            ),
          }));
        }}
      />
      {!relevant.length && <Notice>현재 역할에 배정된 질문이 없습니다.</Notice>}
      <button
        className={`button ${compact ? 'full' : ''}`}
        type="button"
        disabled={!allowed || mutation.isPending || !relevant.length}
        onClick={() => void save()}
      >
        {mutation.isPending ? '저장 확인 중…' : '답변·확인 상태 저장'}
      </button>
      {feedback && (
        <p className="action-feedback" role="status">
          {feedback}
        </p>
      )}
      <p className="role-caption">
        답변 변경 시 기존 검토는 재확인 대상이 됩니다. 저장 기준: 수정본 v{draft.revision}
      </p>
    </>
  );
}
/** 출처 없는 값이나 미확정 AI 후보가 담당자 확인을 받은 사실로 보이지 않게 한다. */
export function EvidenceList({
  answers,
  returnItems = [],
}: {
  answers: Answer[];
  returnItems?: ReturnItem[];
}) {
  return (
    <div className="evidence-list">
      {answers.map((answer) => (
        <div
          id={`evidence-${answer.key}`}
          tabIndex={-1}
          className={`evidence-item ${returnItems.some((item) => item.fieldKey === answer.key && item.status === 'OPEN') ? 'returned-field' : ''}`}
          key={answer.key}
        >
          {returnItems
            .filter((item) => item.fieldKey === answer.key && item.status === 'OPEN')
            .map((item) => (
              <p className="returned-reason" key={item.id}>
                <strong>↩ 보완 필요</strong> {item.reason}
              </p>
            ))}
          <div className="row-between">
            <h3>{answer.label}</h3>
            <Badge
              tone={
                answer.status === 'CONFIRMED' || answer.status === 'NOT_APPLICABLE'
                  ? 'green'
                  : 'amber'
              }
            >
              {answer.status === 'CONFIRMED'
                ? '확인 완료'
                : answer.status === 'NOT_APPLICABLE'
                  ? '해당 없음 · 확인'
                  : answer.source?.kind === 'AI_INFERRED'
                    ? 'AI 제안 · 미확정'
                    : '담당자 확인 필요'}
            </Badge>
          </div>
          <p className="evidence-value readonly-value">
            {formatAnswerValue(answer.key, answer.value)}
          </p>
          <SourceEvidence answer={answer} />
          {returnItems
            .filter(
              (item) =>
                item.fieldKey === answer.key &&
                item.previousValue != null &&
                item.previousValue !== answer.value,
            )
            .map((item) => (
              <details className="previous-value" key={item.id}>
                <summary>{formatDate(item.createdAt)} 반환 전 값 보기</summary>
                <p className="readonly-value">
                  {formatAnswerValue(answer.key, item.previousValue ?? '')}
                </p>
              </details>
            ))}
        </div>
      ))}
    </div>
  );
}
