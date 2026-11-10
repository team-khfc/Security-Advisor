'use client';

import { useEffect, useRef, useState } from 'react';
import { ErrorState, LoadingState, Notice } from '@/components/ui';
import { clearInputDraft, setInputDraft, useInputDraft } from '@/lib/inputDrafts';
import type { Actor } from '@/lib/types';
import { useInquiries } from './useInquiries';

/** 검토의 참고 대화만 제공한다. 신청 답변·검토 의견·확정값을 변경하는 동작은 없다. */
export function StaffInquiryPanel({ requestId, actor }: { requestId: string; actor: Actor }) {
  return (
    <InquiryWorkspace
      key={requestId + ':' + actor.id + ':' + actor.role}
      requestId={requestId}
      actor={actor}
    />
  );
}

function InquiryWorkspace({ requestId, actor }: { requestId: string; actor: Actor }) {
  const [selection, setSelection] = useState<number | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const busyRef = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const conversationRef = useRef<HTMLDivElement>(null);
  // 먼저 목록을 읽고 최신 대화를 기본 선택한다. null은 사용자가 선택한 새 대화다.
  const history = useInquiries(requestId, actor, selection);
  const selected = history.selected;
  const latestMessage = history.messages.data?.at(-1)?.inquiryMessageId;
  useEffect(() => {
    const conversation = conversationRef.current;
    if (conversation) conversation.scrollTop = conversation.scrollHeight;
  }, [selected, latestMessage]);
  const draftKey = (id: number | null) =>
    'inquiry:' + actor.role + ':' + requestId + ':' + (id ?? 'new');
  const { draft, saveDraft, clearDraft } = useInputDraft<string>(actor.id, draftKey(selected));
  const text = draft ?? '';
  const prompts =
    actor.role === 'INFRA'
      ? [
          '현재 자료에서 네트워크 구성과 추가로 확인할 항목을 근거와 함께 정리해 줘.',
          '방화벽의 출발지·목적지·포트·사용 기간에서 빠진 내용을 확인해 줘.',
        ]
      : [
          '개인정보 처리와 외부 전송에 관한 검토 항목을 근거와 함께 정리해 줘.',
          '접근 권한과 기록 보관에서 보완할 항목을 정리해 줘.',
        ];

  async function send() {
    if (busyRef.current || !text.trim() || text.length > 4000) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    let id = selected;
    try {
      if (id === null) {
        const inquiry = await history.open.mutateAsync(text.trim().slice(0, 80));
        id = inquiry.inquiryId;
        // 생성 후 전송에 실패해도 같은 대화에서 재시도한다.
        setInputDraft(actor.id, draftKey(id), text);
        clearDraft();
        setSelection(id);
      }
      await history.ask.mutateAsync({ id, text: text.trim() });
      clearInputDraft(actor.id, draftKey(id));
      setNotice('AI 답변을 받았습니다. 대화와 근거를 확인해 주세요.');
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : '답변을 받지 못했습니다. 다시 시도해 주세요.',
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
      inputRef.current?.focus();
    }
  }
  if (history.list.isPending)
    return (
      <section className="card staff-inquiry">
        <h2 id="staff-inquiry-heading" tabIndex={-1}>
          AI 검토 도우미
        </h2>
        <LoadingState />
      </section>
    );
  if (history.list.error)
    return (
      <section className="card staff-inquiry">
        <h2 id="staff-inquiry-heading" tabIndex={-1}>
          AI 검토 도우미
        </h2>
        <ErrorState error={history.list.error} onRetry={() => void history.list.refetch()} />
      </section>
    );
  return (
    <section className="card staff-inquiry" aria-labelledby="staff-inquiry-heading">
      <h2 className="h-panel" id="staff-inquiry-heading" tabIndex={-1}>
        AI 검토 도우미
      </h2>
      <p>
        이 신청의 답변과 업로드 자료를 바탕으로 검토할 내용을 물어보세요. 대화는 본인만 볼 수
        있습니다.
      </p>
      <Notice>
        AI 답변은 검토 참고용입니다. 답변·검토 의견·확정값에는 자동 반영되지 않습니다.
      </Notice>
      <details className="inquiry-scope">
        <summary>AI가 참고하는 자료와 한계</summary>
        <p>
          현재 사업의 답변, 최근 업로드 문서 3개, AI 분석 요약 3개와 검색된 공개 지식·역할별 기관
          사실을 참고합니다. 원문은 파일 앞 20,000자 중 최대 6,000자만 발췌하므로 전체 내용을 검토한
          결과가 아닙니다.
        </p>
        <p>
          이전 답변과 근거는 질문 당시 자료 기준입니다. 자료가 변경되면 다시 질문하세요. 미확정
          답변과 AI 요약은 담당자가 확인해야 합니다.
        </p>
      </details>
      <div className="inquiry-toolbar">
        <label htmlFor="staff-inquiry-select">내 AI 대화</label>
        <select
          className="input"
          id="staff-inquiry-select"
          value={selected ?? ''}
          disabled={busy}
          onChange={(event) => {
            setSelection(event.target.value ? Number(event.target.value) : null);
            setError('');
            setNotice('');
          }}
        >
          <option value="">새 대화</option>
          {history.list.data.map((i) => (
            <option key={i.inquiryId} value={i.inquiryId}>
              {i.title}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={() => {
            setSelection(null);
            setError('');
            setNotice('');
            inputRef.current?.focus();
          }}
        >
          새 대화
        </button>
      </div>
      <div
        className="inquiry-messages"
        ref={conversationRef}
        role="region"
        aria-label="AI 검토 대화"
        tabIndex={0}
        aria-busy={busy || history.messages.isFetching}
      >
        {selected === null ? (
          <p className="inquiry-empty">궁금한 점을 입력하면 새 대화를 시작합니다.</p>
        ) : history.messages.error ? (
          <ErrorState
            error={history.messages.error}
            onRetry={() => void history.messages.refetch()}
          />
        ) : history.messages.isPending ? (
          <LoadingState />
        ) : !history.messages.data?.length ? (
          <p className="inquiry-empty">이 대화에 첫 질문을 남겨보세요.</p>
        ) : (
          history.messages.data.map((message) => (
            <article
              key={message.inquiryMessageId}
              className={'inquiry-message inquiry-message-' + message.role.toLowerCase()}
            >
              <div className="inquiry-message-heading">
                <strong>{message.role === 'USER' ? '내 질문' : 'AI 검토 답변'}</strong>
                <time dateTime={message.createdAt}>
                  {new Date(message.createdAt).toLocaleString('ko-KR')}
                </time>
              </div>
              <p className="inquiry-message-text">{message.text}</p>
              {message.role === 'ASSISTANT' && (
                <>
                  {message.flagged && (
                    <Notice tone="warning">
                      일부 답변의 근거를 확인하지 못했거나 내부 정보가 가려졌습니다. 원문과 담당자
                      확인이 필요합니다.
                    </Notice>
                  )}
                  {message.evidence.length ? (
                    <details className="inquiry-evidence" open>
                      <summary>답변 근거 {message.evidence.length}개</summary>
                      <ul>
                        {message.evidence.map((e) => (
                          <li key={e.tag}>
                            <strong>[{e.tag}]</strong>{' '}
                            {e.label ?? '이전 대화에 근거 설명이 저장되지 않았습니다.'}
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : (
                    <Notice>표시할 근거가 없습니다. 답변을 사실로 확정하기 전에 확인하세요.</Notice>
                  )}
                </>
              )}
            </article>
          ))
        )}
        {busy && <p>자료를 확인하고 답변을 작성하고 있습니다…</p>}
      </div>
      <form
        className="inquiry-composer"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <div className="inquiry-suggestions" aria-label="질문 예시">
          {prompts.map((prompt) => (
            <button
              type="button"
              className="btn"
              key={prompt}
              disabled={busy}
              onClick={() => {
                saveDraft(prompt);
                inputRef.current?.focus();
              }}
            >
              {prompt}
            </button>
          ))}
        </div>
        <label htmlFor="staff-inquiry-prompt">AI에게 질문하기</label>
        <textarea
          className="input"
          ref={inputRef}
          id="staff-inquiry-prompt"
          value={text}
          rows={3}
          maxLength={4000}
          readOnly={busy}
          aria-describedby="staff-inquiry-help"
          onChange={(event) => (event.target.value ? saveDraft(event.target.value) : clearDraft())}
          onKeyDown={(event) => {
            if (
              (event.ctrlKey || event.metaKey) &&
              event.key === 'Enter' &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              void send();
            }
          }}
        />
        <div className="inquiry-send">
          <span id="staff-inquiry-help">
            Enter 줄바꿈 · Ctrl/⌘+Enter 전송 · {text.length}/4,000자
          </span>
          <button className="btn primary" type="submit" aria-disabled={busy || !text.trim()}>
            {busy ? '답변 작성 중…' : '질문 보내기'}
          </button>
        </div>
        {error && (
          <p role="alert">
            {error} 입력한 질문은 유지됩니다. 전송 결과가 불확실하면 대화 기록을 확인한 뒤 재시도해
            주세요.
          </p>
        )}
        <p className="sr-only" role="status">
          {busy ? 'AI가 답변을 작성하고 있습니다.' : notice}
        </p>
      </form>
    </section>
  );
}
