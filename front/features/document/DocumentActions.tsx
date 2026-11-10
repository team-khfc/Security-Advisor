'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge, ErrorState, LoadingState, Modal, Notice } from '@/components/ui';
import { requestJson } from '@/lib/httpClient';
import type { SecurityRequest } from '@/features/request/types';
import { useFinalDraft } from '@/features/request/useFinalDraft';
import { generatedDocumentSchema, type GeneratedDocument } from './types';
import { PdfDownloadButton } from './PdfDownloadButton';

const sourceLabels: Record<string, string> = {
  USER_ANSWER: '사용자 답변',
  AI_INFERRED: 'AI 추론',
  STAFF_INPUT: '담당자 입력',
  STAFF_CONFIRMED: '담당자 확인',
};

/** 동일 원본의 생성 요청은 공유하고 수정·반환·확정 후에는 새 문서를 준비한다. */
export function DocumentActions({
  request,
  submissionId,
  disabled = false,
  previewLabel = '문서 미리보기',
}: {
  request: SecurityRequest;
  submissionId?: string;
  disabled?: boolean;
  previewLabel?: string;
}) {
  const draft = useFinalDraft(request.id, !submissionId && request.stage === 3 && !disabled);
  const identity = JSON.stringify([
    request.id,
    submissionId ?? null,
    request.status,
    request.currentSubmissionId,
    ...(!submissionId ? [request.revision, request.caseRevision, draft.data ?? null] : []),
  ]);
  return (
    <DocumentActionsContent
      key={identity}
      identity={identity}
      requestId={request.id}
      submissionId={submissionId}
      disabled={disabled}
      previewLabel={previewLabel}
    />
  );
}

function DocumentActionsContent({
  identity,
  requestId,
  submissionId,
  disabled,
  previewLabel,
}: {
  identity: string;
  requestId: string;
  submissionId?: string;
  disabled: boolean;
  previewLabel: string;
}) {
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const prepare = () =>
    client.fetchQuery({
      queryKey: ['generated-document', identity],
      staleTime: Infinity,
      retry: false,
      queryFn: async () => {
        const result = generatedDocumentSchema.safeParse(
          await requestJson<unknown>(
            `/api/security-requests/${encodeURIComponent(requestId)}/generated-documents`,
            {
              method: 'POST',
              body: {
                ...(submissionId ? { submissionId: Number(submissionId) } : {}),
                aiSupplement: false,
              },
            },
          ),
        );
        if (
          !result.success ||
          String(result.data.securityRequestId) !== requestId ||
          String(result.data.submissionId ?? '') !== (submissionId ?? '')
        ) {
          throw new Error('요청한 문서 내용을 확인할 수 없습니다. 다시 시도해 주세요.');
        }
        return result.data;
      },
    });
  const preview = useMutation({ mutationFn: prepare });
  return (
    <>
      <div className="document-actions btn-row">
        <button
          type="button"
          className="btn btn-sm"
          disabled={disabled}
          onClick={() => {
            setOpen(true);
            preview.mutate();
          }}
        >
          {previewLabel}
        </button>
        <PdfDownloadButton getDocument={prepare} disabled={disabled} />
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="문서 미리보기">
        {preview.isPending && <LoadingState />}
        {preview.error && <ErrorState error={preview.error} onRetry={() => preview.mutate()} />}
        {preview.isSuccess && (
          <>
            <GeneratedDocumentPreview document={preview.data} />
            <div className="dlg-actions">
              <PdfDownloadButton getDocument={async () => preview.data} />
              <button type="button" className="btn" onClick={() => setOpen(false)}>
                닫기
              </button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}

function GeneratedDocumentPreview({ document: doc }: { document: GeneratedDocument }) {
  return (
    <div className="generated-document">
      <Badge
        tone={doc.kind === 'CONFIRMED' ? 'success' : doc.kind === 'SUBMITTED' ? 'info' : 'neutral'}
      >
        {doc.kindLabel} · 문서 v{doc.version}
      </Badge>
      <h3 className="h-panel">{doc.title}</h3>
      <p className="help">
        문서 번호 {doc.generatedDocumentId} · 신청 {doc.securityRequestId}
        {doc.submissionId ? ` · 제출본 번호 ${doc.submissionId}` : ''}
        <br />
        생성{' '}
        {new Intl.DateTimeFormat('ko-KR', {
          dateStyle: 'short',
          timeStyle: 'short',
          timeZone: 'Asia/Seoul',
        }).format(new Date(doc.generatedAt))}{' '}
        (한국 시간)
      </p>
      <Notice tone={doc.unconfirmedCount ? 'warning' : 'info'}>
        미확정 항목 {doc.unconfirmedCount}개. 아래 내용과 PDF는 같은 서버 문서입니다.
        {doc.kind === 'DRAFT'
          ? ' 생성 시점에 저장된 초안이며, 수정 후에는 새 문서로 확인합니다.'
          : ' 제출 당시의 내용을 보존한 문서입니다.'}
      </Notice>
      <div className="generated-document-body" tabIndex={0} aria-label="문서 내용">
        {doc.sections.map((section, index) => (
          <section key={index}>
            <h4>{section.title}</h4>
            <dl>
              {section.values.map((value, valueIndex) => (
                <div className="generated-document-value" key={`${value.fieldKey}-${valueIndex}`}>
                  <dt>{value.label}</dt>
                  <dd className="generated-document-text">{value.display}</dd>
                  <dd className="help">
                    출처:{' '}
                    {value.valueSource
                      ? (sourceLabels[value.valueSource] ?? '확인 필요')
                      : '확인 필요'}{' '}
                    · {value.status}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
        {doc.aiSupplement && (
          <section>
            <h4>AI 보충 의견 · 미확정</h4>
            <p className="generated-document-text">{doc.aiSupplement}</p>
          </section>
        )}
      </div>
      <p className="help">
        AI 추론은 사람이 확인하기 전까지 미확정입니다. 서류 확정은 실제 방화벽 적용을 의미하지
        않습니다.
      </p>
    </div>
  );
}
