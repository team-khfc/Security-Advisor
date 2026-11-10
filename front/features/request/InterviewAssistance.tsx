'use client';

import { useId, useState, type ReactNode } from 'react';
import { Badge, Icon, Notice } from '@/components/ui';
import type { Answer } from './types';
import type { InterviewTurn } from './useInterview';
import type { InterviewAssistanceState } from './useInterviewAssistance';

/** 도움말은 입력창을 늘리지 않고 대화 영역에서 안내한다. */
export function InterviewAssistance({
  state,
  question,
}: {
  state: InterviewAssistanceState;
  question: Answer;
}) {
  return (
    <div className="interview-assistance">
      <div className="btn-row">
        <button
          type="button"
          className="btn btn-sm"
          aria-expanded={state.showHelp}
          onClick={state.toggleHelp}
        >
          왜 필요한가요?
        </button>
        <button
          type="button"
          className="btn btn-sm"
          disabled={state.busy}
          onClick={() => void state.send('SUGGEST')}
        >
          <Icon name="sparkles" /> AI 추천답변 받기
        </button>
      </div>
      {state.showHelp && (
        <div className="interview-help">
          <p>
            {state.help.data?.whyAsked ||
              question.hint ||
              '담당자가 사업의 보안 검토 범위를 파악하는 데 필요한 항목입니다.'}
          </p>
          {state.help.isFetching && <p role="status">관련 자료를 찾고 있습니다…</p>}
          {state.help.error && (
            <Notice tone="warning">
              {state.help.error.message} 게시본의 작성 안내를 참고해 주세요.
            </Notice>
          )}
          {state.help.data?.snippets.map((s) => (
            <blockquote key={s.snippetId}>
              <p>{s.body}</p>
              <cite>{s.citation}</cite>
            </blockquote>
          ))}
          {state.help.data && !state.help.data.snippets.length && (
            <p className="help">이 항목에 연결된 공개자료 근거가 없습니다.</p>
          )}
        </div>
      )}
    </div>
  );
}

/** 질문 카드의 답변 입력과 분리된 AI 질문·파일 첨부 영역이다. */
export function InterviewComposer({
  state,
  attachment,
  answers,
  onModeChange,
  questionKey,
}: {
  state: InterviewAssistanceState;
  attachment?: ReactNode;
  answers?: ReactNode;
  onModeChange?: (answer: boolean) => void;
  questionKey?: string;
}) {
  const id = useId();
  const [modeChoice, setModeChoice] = useState({
    key: questionKey,
    mode: answers ? 'answer' : 'ai',
  });
  const mode = modeChoice.key === questionKey ? modeChoice.mode : answers ? 'answer' : 'ai';
  const tabs = [
    { key: 'ai', label: 'AI에게 질문' },
    ...(answers ? [{ key: 'answer', label: '답변하기' }] : []),
    ...(attachment ? [{ key: 'file', label: '파일 첨부' }] : []),
  ];
  const select = (key: string) => {
    setModeChoice({ key: questionKey, mode: key });
    onModeChange?.(key === 'answer');
  };
  return (
    <>
      <div className="interview-input-modes" role="tablist" aria-label="입력 방식">
        {tabs.map((tab, index) => (
          <button
            key={tab.key}
            id={`${id}-${tab.key}`}
            type="button"
            role="tab"
            aria-selected={mode === tab.key}
            aria-controls={`${id}-panel`}
            tabIndex={mode === tab.key ? 0 : -1}
            disabled={state.busy}
            onClick={() => select(tab.key)}
            onKeyDown={(event) => {
              const next =
                event.key === 'ArrowRight'
                  ? (index + 1) % tabs.length
                  : event.key === 'ArrowLeft'
                    ? (index + tabs.length - 1) % tabs.length
                    : event.key === 'Home'
                      ? 0
                      : event.key === 'End'
                        ? tabs.length - 1
                        : null;
              if (next === null) return;
              event.preventDefault();
              select(tabs[next].key);
              event.currentTarget.parentElement
                ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
                [next]?.focus();
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`${id}-panel`}
        aria-labelledby={`${id}-${mode}`}
        className="interview-input-panel"
      >
        {mode === 'file' ? (
          <>
            <p className="help">
              문서를 선택한 뒤 대화에 표시되는 ‘첨부 문서 분석’을 눌러 주세요. 선택만으로 전송되지
              않습니다.
            </p>
            {attachment}
          </>
        ) : mode === 'answer' && answers ? (
          answers
        ) : (
          <div className="qrow">
            <label className="sr-only" htmlFor="interview-ai-prompt">
              이 항목을 AI에게 물어보기
            </label>
            <textarea
              id="interview-ai-prompt"
              className="input"
              rows={2}
              maxLength={4000}
              placeholder="궁금한 점을 적어 주세요. AI 질문은 신청서 답변으로 저장되지 않습니다."
              value={state.prompt}
              disabled={state.ask.isPending || state.apply.isPending}
              onChange={(e) => state.setPrompt(e.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key !== 'Enter' ||
                  event.shiftKey ||
                  event.nativeEvent.isComposing ||
                  event.keyCode === 229
                )
                  return;
                event.preventDefault();
                if (state.prompt.trim() && !state.busy) event.currentTarget.form?.requestSubmit();
              }}
            />
            <button
              type="submit"
              className="btn btn-primary"
              disabled={state.busy || !state.prompt.trim()}
            >
              {state.ask.isPending ? '답변 기다리는 중…' : '질문 보내기'}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

/** 후보·근거·적용 상태를 해당 AI 메시지 안에서 한 번만 보여 준다. */
export function InterviewTurnMessage({
  turn,
  question,
  active,
  state,
  onSelect,
}: {
  turn: InterviewTurn;
  question?: Answer;
  active: boolean;
  state: InterviewAssistanceState;
  onSelect?: () => void;
}) {
  const applied = turn.applied || state.apply.data?.interviewTurnId === turn.interviewTurnId;
  return (
    <>
      <p className="m-me">{turn.question}</p>
      <div className="m-ai">
        <span className="av" aria-hidden="true">
          <Icon name="sparkles" size={18} />
        </span>
        <div className="body">
          <div className="bubble interview-proposal" aria-label="AI 설명과 추천답변">
            <strong>{question?.label ?? '항목 도움말'}</strong>
            <Badge tone="warning">
              {turn.modelReference.includes('fake') ? '모의 AI' : 'AI'} ·{' '}
              {turn.mode === 'ASK'
                ? '설명'
                : applied
                  ? '추천답변 적용됨'
                  : turn.proposedValue
                    ? '추천답변 미확정'
                    : '추가 정보 필요'}
            </Badge>
            <p className="interview-ai-text">{turn.reply}</p>
            {turn.proposedValue && (
              <>
                <strong>답변 후보</strong>
                <p className="interview-ai-text candidate">{turn.proposedValue}</p>
              </>
            )}
            {turn.evidence.length > 0 && (
              <details className="interview-evidence">
                <summary>참고한 근거 {turn.evidence.length}개</summary>
                <ul className="help" aria-label="AI 답변 근거">
                  {turn.evidence.map((e) => (
                    <li key={e.tag}>{e.label}</li>
                  ))}
                </ul>
              </details>
            )}
            {applied ? (
              <>
                <p className="help">
                  {question?.confirmed
                    ? '추천을 적용한 뒤 사용자가 내용을 확인했습니다.'
                    : '미확정 답변으로 적용했습니다. 내용을 확인한 뒤 답변을 저장해 주세요.'}
                </p>
                {question &&
                  (!question.confirmed || question.needsReview) &&
                  !active &&
                  onSelect && (
                    <button
                      type="button"
                      className="btn btn-sm"
                      disabled={state.apply.isPending}
                      onClick={onSelect}
                    >
                      적용한 답변 확인하기
                    </button>
                  )}
              </>
            ) : (
              turn.proposedValue &&
              !turn.flagged && (
                <>
                  {question?.confirmed && (
                    <p className="help">
                      이미 확인한 답변은 보호됩니다. 추천 내용을 참고해 직접 수정할 수 있습니다.
                    </p>
                  )}
                  {state.isStale(turn) && (
                    <Notice tone="warning">
                      추천 이후 입력이 변경되었습니다. 최신 내용으로 다시 추천받아 주세요.
                    </Notice>
                  )}
                  {active ? (
                    <button
                      type="button"
                      className="btn interview-apply-now"
                      disabled={state.busy || question?.confirmed || state.isStale(turn)}
                      onClick={() => void state.applyTurn(turn)}
                    >
                      {state.apply.isPending ? '적용 중…' : '즉시 반영'}
                    </button>
                  ) : (
                    question &&
                    onSelect && (
                      <button
                        type="button"
                        className="btn btn-sm"
                        disabled={state.apply.isPending}
                        onClick={onSelect}
                      >
                        이 항목으로 이동
                      </button>
                    )
                  )}
                </>
              )
            )}
            <p className="help">
              {turn.proposedValue
                ? '즉시 반영을 누르면 답변 후보가 해당 항목에 저장됩니다. AI 출처와 확인 필요 표시는 유지됩니다.'
                : '이 응답에는 반영할 답변 후보가 없습니다. 필요한 정보를 추가해 질문해 주세요.'}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
