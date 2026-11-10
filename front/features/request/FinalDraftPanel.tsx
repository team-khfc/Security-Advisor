'use client';

import { useEffect, useRef, useState } from 'react';
import { Badge, Notice } from '@/components/ui';
import { useInputDraft } from '@/lib/inputDrafts';
import type { SecurityRequest } from './types';
import { type FinalDraft, useFinalDraftCommand } from './useFinalDraft';

/** AI 제안과 사람 확인을 분리하고 미저장 편집 중에는 제출을 잠근다. */
export function FinalDraftPanel({
  request,
  actorId,
  draft,
  onDirtyChange,
}: {
  request: SecurityRequest;
  actorId: string;
  draft: FinalDraft | null;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const input = useInputDraft<string>(
    actorId,
    `final-report:${request.id}:${draft?.finalDraftId ?? 'new'}:${draft?.revision ?? 0}`,
  );
  const text = input.draft ?? draft?.text ?? '';
  const dirty = text !== (draft?.text ?? '');
  const command = useFinalDraftCommand(request.id);
  const [message, setMessage] = useState('');
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const focusAfterCommand = useRef<'editor' | 'status' | null>(null);
  useEffect(() => {
    if (command.isPending || !focusAfterCommand.current) return;
    const target = focusAfterCommand.current === 'editor' ? editorRef.current : statusRef.current;
    target?.focus();
    focusAfterCommand.current = null;
  }, [command.isPending, message]);
  useEffect(() => {
    onDirtyChange(dirty || command.isPending);
  }, [dirty, command.isPending, onDirtyChange]);

  const generate = async () => {
    const trigger = document.activeElement;
    setMessage('');
    try {
      await command.mutateAsync({ action: 'generate', expectedRevision: request.revision });
      input.clearDraft();
      if (document.activeElement === trigger || document.activeElement === document.body) {
        focusAfterCommand.current = 'editor';
      }
      setMessage('초안을 작성했습니다. 내용을 읽고 수정한 뒤 확인해 주세요.');
    } catch {
      /* 오류는 mutation 상태로 표시하고 입력은 유지한다. */
    }
  };
  const confirm = async () => {
    const trigger = document.activeElement;
    setMessage('');
    try {
      const current =
        !draft || draft.stale
          ? await command.mutateAsync({
              action: 'manual',
              expectedRevision: request.revision,
              text,
            })
          : draft;
      await command.mutateAsync({
        action: 'confirm',
        draftId: current.finalDraftId,
        expectedRevision: current.revision,
        text,
      });
      input.clearDraft();
      if (document.activeElement === trigger || document.activeElement === document.body) {
        focusAfterCommand.current = 'status';
      }
      setMessage('최종 초안을 확인했습니다. 최종 제출 확인으로 이동해 제출해 주세요.');
    } catch {
      /* 서버 충돌·실패 시 편집 내용을 보존한다. */
    }
  };

  return (
    <section className="card final-draft-panel" aria-labelledby="final-draft-heading">
      <h2 className="h-panel" id="final-draft-heading" tabIndex={-1}>
        최종 보고서 초안
      </h2>
      <p className="help">
        저장된 답변으로 AI 초안을 만들거나 직접 작성하세요. 확인한 내용은 제출본과 PDF에 함께
        보존됩니다.
      </p>
      {draft && (
        <div className="btn-row">
          <Badge tone={draft.confirmed && !draft.stale && !dirty ? 'success' : 'warning'}>
            {draft.stale
              ? '원본 변경 · 재확인 필요'
              : dirty
                ? '수정 중 · 확인 필요'
                : draft.confirmed
                  ? '사용자 확인 완료'
                  : '미확정'}
          </Badge>
          <span className="help">
            {draft.valueSource === 'AI_INFERRED' ? 'AI 추론' : '사용자 작성'}
            {draft.modelReference ? ` · ${draft.modelReference}` : ''}
          </span>
        </div>
      )}
      {draft?.stale && (
        <Notice tone="warning">
          원본 답변이 바뀌었습니다. AI 초안을 다시 생성하거나, 최신 답변에 맞게 직접 수정하고 확인해
          주세요.
        </Notice>
      )}
      <div className="btn-row">
        <button
          type="button"
          className="btn"
          onClick={() => void generate()}
          disabled={command.isPending || dirty}
        >
          {command.isPending && command.variables?.action === 'generate'
            ? 'AI 초안 작성 중…'
            : draft
              ? 'AI 초안 다시 작성'
              : 'AI 최종 초안 작성'}
        </button>
      </div>
      <label className="form-label" htmlFor="final-report-text">
        최종 보고서 내용
      </label>
      <textarea
        ref={editorRef}
        id="final-report-text"
        className="input"
        rows={9}
        maxLength={12000}
        value={text}
        disabled={command.isPending}
        onChange={(event) => input.saveDraft(event.target.value)}
        placeholder="AI 초안을 불러오거나 사업 목적, 요청 내용과 보안 유의사항을 직접 작성해 주세요."
      />
      <p className="help">
        {text.length.toLocaleString()} / 12,000자
        {dirty ? ' · 아직 확인하지 않은 수정 내용이 있습니다.' : ''}
      </p>
      {command.error && (
        <Notice tone="danger">
          {command.error.message} 입력한 내용은 유지됩니다. 다시 시도하거나 직접 작성해 주세요.
        </Notice>
      )}
      {message && !draft?.stale && !dirty && (
        <p ref={statusRef} role="status" tabIndex={-1}>
          {message}
        </p>
      )}
      {draft?.confirmed && !draft.stale && !dirty && (
        <a className="btn" href="#review-heading">
          최종 제출 확인으로 이동
        </a>
      )}
      <div className="btn-row">
        <button
          type="button"
          className="btn"
          disabled={
            command.isPending || !text.trim() || (!!draft?.confirmed && !draft.stale && !dirty)
          }
          onClick={() => void confirm()}
        >
          내용 확인·저장
        </button>
        {dirty && (
          <button
            type="button"
            className="btn btn-tertiary"
            disabled={command.isPending}
            onClick={() => {
              input.clearDraft();
              editorRef.current?.focus();
            }}
          >
            저장된 내용으로 되돌리기
          </button>
        )}
      </div>
    </section>
  );
}
