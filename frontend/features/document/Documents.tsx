'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { useSession } from '@/features/auth';
import type { SecurityRequest } from '@/features/request';
import { NetworkTable } from '@/features/request';
import { downloadDocument, requestJson } from '@/lib/http';
import { documentLabel, formatAnswerValue, formatDate, shortId } from '@/lib/format';
import { Badge, Icon, Modal, ErrorNotice } from '@/components/ui';
/** 문서 내용을 React 텍스트로 렌더링해 업로드·AI 출력의 HTML이나 명령문을 실행하지 않는다. */
export function DocumentPreview({ procedure }: { procedure: SecurityRequest }) {
  const submitted = procedure.stage === 4;
  return (
    <article className="document-preview">
      <p className="draft-watermark">
        {procedure.status === 'CONFIRMED'
          ? '확정 서류 · 장비 적용 별도'
          : submitted
            ? '제출본 · 양측 최종 확인 대기'
            : '검토 초안 · 미확정 항목 포함 가능'}
      </p>
      <h3>{documentLabel(procedure.documentType)}</h3>
      <p>{procedure.title}</p>
      <p className="source-meta">
        신청번호 {shortId(procedure.id)} · 수정본 v{procedure.revision} · 기관 설정 v
        {procedure.policyVersion}
      </p>
      {procedure.finalDraft && (
        <section className="final-draft-document">
          <h4>최종 검토 요약</h4>
          <p className="readonly-value">{procedure.finalDraft.summary}</p>
          <p className="source-meta">
            AI 추론 · {procedure.finalDraft.confirmed ? '사람 확인 완료' : '미확정'} ·{' '}
            {procedure.finalDraft.evidence}
          </p>
        </section>
      )}
      <dl>
        {procedure.answers.map((answer) => (
          <div key={answer.key} id={`document-${answer.key}`} tabIndex={-1}>
            <dt>{answer.label}</dt>
            <dd>{formatAnswerValue(answer.key, answer.value)}</dd>
            <dd className="source-meta">
              {answer.source?.kind === 'AI_INFERRED'
                ? 'AI 제안'
                : answer.source?.kind === 'USER_ANSWER'
                  ? '사용자 답변'
                  : answer.source?.kind === 'STAFF_CONFIRMED'
                    ? '담당자 확인'
                    : answer.source
                      ? '담당자 입력'
                      : '출처 없음 · 담당자 확인 필요'}{' '}
              ·{' '}
              {answer.status === 'CONFIRMED' || answer.status === 'NOT_APPLICABLE'
                ? '확인 완료'
                : '미확정'}
            </dd>
            {answer.source?.evidence && (
              <dd className="source-meta">근거: {answer.source.evidence}</dd>
            )}
          </div>
        ))}
      </dl>
      {procedure.documentType === 'FIREWALL' && <NetworkTable procedure={procedure} />}
      <p className="source-meta">{procedure.policy.documentFooter}</p>
      <p className="source-meta">
        검토·서류 확정 상태는 실제 방화벽 적용이나 서비스 운영 승인을 의미하지 않습니다.
      </p>
    </article>
  );
}
/** 읽기 미리보기와 서버 문서 다운로드를 구분하고 공개 시안에서는 다운로드를 비활성화한다. */
export function DocumentPanel({
  procedure,
  preview = false,
  compact = false,
}: {
  procedure: SecurityRequest;
  preview?: boolean;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const submitted = procedure.stage === 4;
  return (
    <section className={compact ? undefined : 'sf-panel'}>
      {!compact && (
        <div className="panel-heading">
          <h2>문서</h2>
          <Badge tone={submitted ? 'green' : 'gray'}>{submitted ? '제출본' : '검토 초안'}</Badge>
        </div>
      )}
      <ErrorNotice error={error} />
      <div className={compact ? 'document-card-actions' : 'document-row'}>
        {!compact && (
          <>
            <span className="document-symbol">
              <Icon name="file" width={26} height={26} />
            </span>
            <div>
              <h3>
                {documentLabel(procedure.documentType)} {submitted ? '제출본' : '초안'}
              </h3>
              <p>
                수정본 v{procedure.revision} · 기관 설정 v{procedure.policyVersion} ·{' '}
                {formatDate(procedure.updatedAt, true)}
              </p>
            </div>
          </>
        )}
        <button className="button" type="button" onClick={() => setOpen(true)}>
          미리보기
        </button>
        <button
          className="text-button"
          type="button"
          disabled={preview || busy}
          onClick={() => {
            setBusy(true);
            setError(undefined);
            void downloadDocument(procedure.id)
              .catch(setError)
              .finally(() => setBusy(false));
          }}
        >
          <Icon name="download" width={18} height={18} />
          HTML 다운로드
        </button>
      </div>
      {!preview && procedure.submissionVersion > 0 && <SubmissionHistory procedure={procedure} />}
      <Modal
        open={open}
        title={submitted ? '제출본 확인' : '검토 초안 미리보기'}
        onClose={() => setOpen(false)}
      >
        <DocumentPreview procedure={procedure} />
        <div className="dialog-actions">
          <button className="button primary" type="button" onClick={() => setOpen(false)}>
            닫기
          </button>
        </div>
      </Modal>
    </section>
  );
}

/** 반환 이후에도 서버에 보관된 각 제출 차수의 불변 문서를 조회한다. */
export function SubmissionHistory({ procedure }: { procedure: SecurityRequest }) {
  const { user } = useSession();
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState<number>();
  const query = useQuery({
    queryKey: [
      'submissions',
      user.institutionId,
      user.userId,
      procedure.id,
      procedure.submissionVersion,
    ],
    queryFn: ({ signal }) =>
      requestJson(
        `/security-requests/${procedure.id}/submissions`,
        z.array(z.object({ version: z.number(), revision: z.number(), submittedAt: z.string() })),
        { signal },
      ),
  });
  return (
    <details className="submission-history">
      <summary>보관된 제출본 {procedure.submissionVersion}차수 확인</summary>
      <ErrorNotice error={query.error ?? error} />
      {query.isPending ? (
        <p role="status">제출 이력을 불러오고 있습니다.</p>
      ) : (
        <ul>
          {query.data?.map((item) => (
            <li key={item.version}>
              <span>
                {item.version}차 제출본 · 수정본 v{item.revision}
                <small>{formatDate(item.submittedAt, true)}</small>
              </span>
              <button
                className="text-button"
                type="button"
                disabled={busy !== undefined}
                onClick={() => {
                  setBusy(item.version);
                  setError(undefined);
                  void downloadDocument(procedure.id, item.version)
                    .catch(setError)
                    .finally(() => setBusy(undefined));
                }}
              >
                <Icon name="download" width={18} />
                {busy === item.version ? '내려받는 중…' : 'HTML 다운로드'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
