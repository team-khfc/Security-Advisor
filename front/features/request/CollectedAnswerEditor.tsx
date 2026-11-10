'use client';

import { useRef, useState } from 'react';
import { Notice } from '@/components/ui';
import { AnswerView, SourceBadge } from './AnswerEditor';
import type { Answer, AnswerInput } from './types';

/** 우측에서 한 항목만 저장하고 다른 미저장 입력과 담당자 항목은 유지한다. */
export function CollectedAnswerEditor({
  answers,
  revision,
  disabled,
  onSave,
  onEditingChange,
}: {
  answers: Answer[];
  revision: number;
  disabled: boolean;
  onSave: (revision: number, answer: AnswerInput) => Promise<void>;
  onEditingChange: (editing: boolean) => void;
}) {
  const [edit, setEdit] = useState<{
    key: string;
    value: string;
    notApplicable: boolean;
    revision: number;
    answerRevision?: number;
  }>();
  const [pending, setPending] = useState(false);
  const saving = useRef(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const close = () => {
    setEdit(undefined);
    setError('');
    onEditingChange(false);
  };
  return (
    <div className="collected-editor">
      {saved && (
        <p role="status" className="help save-success">
          {saved}: 저장했습니다. 도우미가 다음 질문·추천부터 수정한 내용을 참고합니다.
        </p>
      )}
      {answers.map((answer) => {
        const active = edit?.key === answer.key;
        const conflict =
          active && (edit.revision !== revision || edit.answerRevision !== answer.revision);
        return (
          <div key={answer.key} className="collected-field">
            {active ? (
              <form
                aria-label={`${answer.label} 수정`}
                onSubmit={async (event) => {
                  event.preventDefault();
                  if (pending || saving.current || disabled || conflict) return;
                  saving.current = true;
                  setPending(true);
                  setError('');
                  try {
                    await onSave(edit.revision, {
                      key: answer.key,
                      value: edit.value,
                      notApplicable: edit.notApplicable,
                      confirmed: true,
                      expectedRevision: edit.answerRevision,
                    });
                    setSaved(answer.label);
                    close();
                  } catch (cause) {
                    setError(
                      cause instanceof Error
                        ? cause.message
                        : '저장하지 못했습니다. 입력값을 유지합니다.',
                    );
                  } finally {
                    saving.current = false;
                    setPending(false);
                  }
                }}
              >
                <label htmlFor={`collected-${answer.key}`}>{answer.label}</label>
                <textarea
                  id={`collected-${answer.key}`}
                  className="input"
                  rows={3}
                  maxLength={4000}
                  value={edit.notApplicable ? '' : edit.value}
                  disabled={pending || disabled || edit.notApplicable}
                  onChange={(event) => setEdit({ ...edit, value: event.target.value })}
                />
                <SourceBadge answer={answer} />
                {answer.evidence && <p className="help">근거: {answer.evidence}</p>}
                {!answer.required && (
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={edit.notApplicable}
                      disabled={pending || disabled}
                      onChange={(event) =>
                        setEdit({
                          ...edit,
                          notApplicable: event.target.checked,
                          value: edit.value === '미해당' ? '' : edit.value,
                        })
                      }
                    />
                    미해당 (해당 없음)
                  </label>
                )}
                {conflict && !pending && (
                  <Notice tone="warning">
                    서버 내용이 변경되었습니다. 최신 값:{' '}
                    {answer.notApplicable ? '미해당' : answer.value || '미입력'}
                    <button
                      type="button"
                      className="btn btn-sm"
                      disabled={pending || disabled}
                      onClick={() =>
                        setEdit({ ...edit, revision, answerRevision: answer.revision })
                      }
                    >
                      내 입력을 유지하고 최신 값 기준으로 저장 준비
                    </button>
                  </Notice>
                )}
                {error && <Notice tone="danger">{error} 입력은 유지됩니다.</Notice>}
                <p className="help">저장하면 이 항목의 채팅 입력도 수정한 값으로 갱신됩니다.</p>
                <div className="btn-row">
                  <button
                    className="btn btn-sm"
                    disabled={
                      pending || disabled || conflict || (!edit.notApplicable && !edit.value.trim())
                    }
                  >
                    {pending ? '저장 중…' : '확인하고 저장'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-tertiary"
                    disabled={pending}
                    onClick={close}
                  >
                    취소
                  </button>
                </div>
              </form>
            ) : (
              <>
                <AnswerView answers={[answer]} />
                <button
                  type="button"
                  className="btn btn-sm"
                  aria-label={`${answer.label} 수정`}
                  disabled={disabled || Boolean(edit)}
                  onClick={() => {
                    setEdit({
                      key: answer.key,
                      value: answer.value,
                      notApplicable: answer.notApplicable,
                      revision,
                      answerRevision: answer.revision,
                    });
                    setError('');
                    setSaved('');
                    onEditingChange(true);
                  }}
                >
                  수정
                </button>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
