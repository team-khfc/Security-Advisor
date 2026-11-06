'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { useSession, useMemoryDraft } from '@/features/auth';
import { useRequestMutation, type SecurityRequest } from '@/features/request';
import { requestJson } from '@/lib/http';
import { Badge, ErrorNotice, Icon, Notice } from '@/components/ui';
const evidenceSchema = z.object({
  kind: z.enum(['REQUEST', 'PUBLIC_KNOWLEDGE', 'PRIVATE_CONTEXT']),
  title: z.string(),
  version: z.string(),
  section: z.string(),
  url: z.string(),
  excerpt: z.string(),
});
const aiTextSchema = z.object({
  id: z.string(),
  requestId: z.string(),
  inputRevision: z.number(),
  revision: z.number(),
  modelConfigurationRevision: z.number(),
  status: z.enum(['SUCCEEDED', 'STALE']),
  mode: z.enum(['EXAMPLE', 'LIVE']),
  provider: z.string(),
  model: z.string(),
  answer: z.string(),
  source: z.literal('AI_INFERRED'),
  confirmed: z.literal(false),
  stale: z.boolean(),
  evidence: z.array(evidenceSchema),
  publicReferences: z.array(evidenceSchema),
  institutionFacts: z.array(evidenceSchema),
});
/** AI 생성 결과의 예시/실제 모드·출처·미확정 상태를 한곳에서 보여 준다. */
export function AiResult({ result }: { result: z.infer<typeof aiTextSchema> }) {
  return (
    <div className="ai-result">
      <div className="row-between">
        <Badge tone={result.mode === 'EXAMPLE' ? 'gray' : 'blue'}>
          {result.mode === 'EXAMPLE' ? '예시 모드 · 외부 LLM 호출 없음' : '실제 모델 응답'}
        </Badge>
        <Badge tone="amber">AI 제안 · 미확정</Badge>
      </div>
      <p className="source-meta">
        {result.provider} · {result.model} · 모델 설정 r{result.modelConfigurationRevision}
      </p>
      {result.stale && (
        <Notice error>
          생성 도중 신청 내용이 바뀌었습니다. 최신 내용을 확인한 뒤 다시 생성해 주세요.
        </Notice>
      )}
      <div className="assistant-answer">{result.answer}</div>
      <details className="source-meta">
        <summary>참고한 근거 {result.evidence.length}개</summary>
        {result.evidence.map((item, index) => (
          <div key={`${index}-${item.title}`}>
            <strong>{item.title}</strong>
            <p>
              {item.version} · {item.section} ·{' '}
              {item.kind === 'PUBLIC_KNOWLEDGE'
                ? '공개 지식'
                : item.kind === 'PRIVATE_CONTEXT'
                  ? '기관 컨텍스트'
                  : '신청 정보'}
            </p>
            <p>{item.excerpt}</p>
          </div>
        ))}
      </details>
      {result.publicReferences.length > 0 && (
        <details className="source-meta">
          <summary>공개 자료 검색 결과 · {result.publicReferences.length}개</summary>
          {result.publicReferences.map((item, index) => (
            <div key={`${index}-${item.title}`}>
              <strong>{item.title}</strong>
              <p>
                {item.version} · {item.section}
              </p>
              <p>{item.excerpt}</p>
              {/^https:\/\//.test(item.url) && (
                <a href={item.url} target="_blank" rel="noopener noreferrer">
                  공식 공개 원문 · 새 창
                </a>
              )}
            </div>
          ))}
        </details>
      )}
      {result.institutionFacts.length > 0 && (
        <details className="source-meta">
          <summary>기관 등록 자료 · 외부 AI에 전송하지 않은 참고 정보</summary>
          <p>
            AI가 생성한 사실이 아닙니다. 접근 권한 안에서 조회한 기관 등록 자료를 담당자가 별도로
            확인합니다.
          </p>
          {result.institutionFacts.map((item, index) => (
            <div key={`${index}-${item.title}`}>
              <strong>{item.title}</strong>
              <p>
                {item.version} · {item.section}
              </p>
              <p>{item.excerpt}</p>
            </div>
          ))}
        </details>
      )}
    </div>
  );
}
/** 담당자 질의는 명시적으로 실행하며 제안이 업무 사실을 자동 확정하지 않는다. */
export function StaffAssistant({ procedure }: { procedure: SecurityRequest }) {
  const { user } = useSession();
  const [question, setQuestion] = useMemoryDraft(`assistant:${procedure.id}`, '');
  const mutation = useMutation({
    mutationFn: () =>
      requestJson(`/security-requests/${procedure.id}/assistant`, aiTextSchema, {
        method: 'POST',
        body: JSON.stringify({ expectedRevision: procedure.revision, question }),
      }),
  });
  if (!['SECURITY', 'INFRA'].includes(user.role)) return null;
  const ended = ['CLOSED', 'WITHDRAWN', 'CONFIRMED'].includes(procedure.status);
  return (
    <section className="sf-panel">
      <div className="panel-heading">
        <h2>
          <Icon name="sparkle" /> 담당자 AI 도우미
        </h2>
        <Badge>제안 전용</Badge>
      </div>
      <p className="field-hint">
        신청 정보와 근거를 바탕으로 검토 관점을 정리합니다. 내부 IP·시스템의 존재 여부는 담당자가
        확인합니다.
      </p>
      <ErrorNotice error={mutation.error} />
      <form
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
      >
        <div className="sf-field">
          <label htmlFor="assistant-question">확인하고 싶은 내용</label>
          <textarea
            id="assistant-question"
            maxLength={1000}
            rows={3}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            disabled={mutation.isPending || ended}
            placeholder="예: 외부 연계에서 추가로 확인할 보안 항목을 알려주세요."
          />
        </div>
        <button
          className="button"
          type="submit"
          disabled={!question.trim() || mutation.isPending || ended}
        >
          <Icon name="sparkle" />
          {mutation.isPending ? '근거 확인 중…' : 'AI에게 검토 질문'}
        </button>
      </form>
      {mutation.data && <AiResult result={mutation.data} />}
    </section>
  );
}
/** 최종 초안 생성과 사람이 확인하는 동작을 분리하고 현재 서버 수정본만 확정한다. */
export function FinalDraftPanel({ procedure }: { procedure: SecurityRequest }) {
  const { user } = useSession();
  const client = useQueryClient();
  const confirm = useRequestMutation(procedure.id);
  const [checkedFor, setCheckedFor] = useState<string>();
  const generate = useMutation({
    mutationFn: () =>
      requestJson(`/security-requests/${procedure.id}/final-draft`, aiTextSchema, {
        method: 'POST',
        body: JSON.stringify({ expectedRevision: procedure.revision }),
      }),
    onSuccess: async () => {
      setCheckedFor(undefined);
      await client.invalidateQueries({
        queryKey: ['request', user.institutionId, user.userId, procedure.id],
      });
      await client.invalidateQueries({ queryKey: ['requests'] });
    },
  });
  const draft = procedure.finalDraft;
  return (
    <section className="sf-panel">
      <div className="panel-heading">
        <h2>
          <Icon name="sparkle" /> AI 최종 초안
        </h2>
        <Badge tone={draft?.confirmed ? 'green' : 'amber'}>
          {draft?.confirmed ? '사용자 확인 완료' : '미확정'}
        </Badge>
      </div>
      <Notice>
        담당자 협의 내용을 최종 초안으로 정리합니다. 생성 후에도 미확정이며, 사용자 확인 전에는
        제출할 수 없습니다.
      </Notice>
      <ErrorNotice error={generate.error ?? confirm.error} />
      {draft ? (
        <>
          <div className="assistant-answer">{draft.summary}</div>
          <p className="source-meta">출처: AI 추론 · 근거: {draft.evidence}</p>
          {draft.confirmation && (
            <p className="source-meta">사람 확인: {draft.confirmation.actorName}</p>
          )}
        </>
      ) : (
        <p className="muted">생성된 최종 초안이 없습니다. 직접 확인한 업무 값은 계속 보존됩니다.</p>
      )}
      {generate.data && (
        <details className="analysis-run">
          <summary>이번 생성의 실행 모드와 근거 확인</summary>
          <AiResult result={generate.data} />
        </details>
      )}
      {user.role === 'APPLICANT' && procedure.stage === 3 && (
        <>
          <div className="analysis-actions">
            <button
              className="button"
              type="button"
              disabled={
                !procedure.allowedActions.includes('FINAL_DRAFT_ANALYZE') ||
                generate.isPending ||
                confirm.isPending
              }
              onClick={() => generate.mutate()}
            >
              <Icon name="sparkle" />
              {generate.isPending
                ? '최종 초안 생성 중…'
                : draft
                  ? '최종 초안 다시 생성'
                  : 'AI 최종 초안 생성'}
            </button>
          </div>
          {draft && !draft.confirmed && (
            <>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={checkedFor === draft.analysisId}
                  onChange={(event) =>
                    setCheckedFor(event.target.checked ? draft.analysisId : undefined)
                  }
                  disabled={confirm.isPending}
                />
                AI가 보완한 문장과 근거를 직접 검토했습니다.
              </label>
              <button
                className="button"
                type="button"
                disabled={
                  checkedFor !== draft.analysisId || confirm.isPending || generate.isPending
                }
                onClick={() =>
                  confirm.mutate({
                    endpoint: `/final-draft/${draft.analysisId}/confirm`,
                    body: { expectedRevision: procedure.revision },
                  })
                }
              >
                {confirm.isPending ? '확인 저장 중…' : '최종 초안 사람 확인 기록'}
              </button>
            </>
          )}
        </>
      )}
    </section>
  );
}
