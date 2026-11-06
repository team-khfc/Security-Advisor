'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { modelSchema } from '@/lib/sharedTypes';
import { requestJson } from '@/lib/http';
import { useSession, useMemoryDraft } from '@/features/auth';
import { createVersionedDraft, reconcileVersionedDraft } from '@/lib/versionedDraft';
import { Badge, ErrorNotice, Heading, Loading, Notice } from '@/components/ui';
const purposes = ['DOCUMENT_ANALYSIS', 'STAFF_ASSISTANT', 'FINAL_DRAFT'] as const;
const labels = {
  DOCUMENT_ANALYSIS: '문서 분석·정보 추출',
  STAFF_ASSISTANT: '담당자 AI 도우미',
  FINAL_DRAFT: '사용자 최종 초안',
};
const connectionSchema = z.object({ purpose: z.enum(purposes), connection: modelSchema });
export const modelSettingsSchema = z.object({
  revision: z.number(),
  mode: z.enum(['SYNTHETIC', 'LIVE']),
  connections: z.array(connectionSchema),
  history: z.array(
    z.object({
      revision: z.number(),
      createdAt: z.string(),
      author: z.string(),
      connections: z.array(connectionSchema),
    }),
  ),
});
type ModelSettings = z.infer<typeof modelSettingsSchema>;
type Connection = z.infer<typeof connectionSchema>;
const exampleConnections: Connection[] = purposes.map((purpose) => ({
  purpose,
  connection: {
    provider: 'EXAMPLE',
    endpoint: '',
    model: 'extractive-demo',
    keyReference: '',
    temperature: 0.2,
    maxTokens: 1200,
    timeoutSeconds: 30,
  },
}));
/** 목적별 연결을 편집하되 비밀 키 자체는 입력받지 않는다. */
export function ModelConnectionFields({
  connections,
  onChange,
  disabled = false,
}: {
  connections: Connection[];
  onChange?: (connections: Connection[]) => void;
  disabled?: boolean;
}) {
  const change = (purpose: Connection['purpose'], patch: Partial<Connection['connection']>) =>
    onChange?.(
      connections.map((item) =>
        item.purpose === purpose ? { ...item, connection: { ...item.connection, ...patch } } : item,
      ),
    );
  return (
    <div className="admin-content-stack">
      {connections.map(({ purpose, connection }) => (
        <section className="sf-panel" key={purpose}>
          <div className="panel-heading">
            <h2>{labels[purpose]}</h2>
            <Badge tone={connection.provider === 'EXAMPLE' ? 'gray' : 'blue'}>
              {connection.provider === 'EXAMPLE' ? '예시 모드' : '실제 연결 구성'}
            </Badge>
          </div>
          <div className="field-grid">
            <div className="sf-field">
              <label htmlFor={`${purpose}-provider`}>모델 제공 방식</label>
              <select
                id={`${purpose}-provider`}
                disabled={disabled}
                value={connection.provider}
                onChange={(event) => {
                  const provider = event.target.value as Connection['connection']['provider'];
                  change(purpose, {
                    provider,
                    endpoint: provider === 'EXAMPLE' ? '' : connection.endpoint,
                    model: provider === 'EXAMPLE' ? 'extractive-demo' : '',
                    keyReference:
                      provider === 'OPENAI'
                        ? 'SECURITYADVISOR_OPENAI_API_KEY'
                        : provider === 'OPENAI_COMPATIBLE'
                          ? 'SECURITYADVISOR_OPENAI_COMPATIBLE_API_KEY'
                          : '',
                  });
                }}
              >
                <option value="EXAMPLE">예시 분석 · 외부 LLM 호출 없음</option>
                <option value="OPENAI">OpenAI</option>
                <option value="OPENAI_COMPATIBLE">OpenAI 호환 모델 · Gemma 등</option>
              </select>
            </div>
            <div className="sf-field">
              <label htmlFor={`${purpose}-model`}>모델 식별자</label>
              <input
                id={`${purpose}-model`}
                maxLength={120}
                disabled={disabled}
                value={connection.model}
                onChange={(event) => change(purpose, { model: event.target.value })}
              />
            </div>
          </div>
          <div className="sf-field">
            <label htmlFor={`${purpose}-endpoint`}>허용된 HTTPS 엔드포인트</label>
            <input
              id={`${purpose}-endpoint`}
              type="url"
              maxLength={500}
              disabled={disabled || connection.provider === 'EXAMPLE'}
              value={connection.endpoint}
              onChange={(event) => change(purpose, { endpoint: event.target.value })}
            />
            <p className="field-hint">서버의 허용 목록 검사를 통과한 주소만 사용할 수 있습니다.</p>
          </div>
          <div className="sf-field">
            <label htmlFor={`${purpose}-key`}>비밀값 환경변수 참조</label>
            <input
              id={`${purpose}-key`}
              value={connection.keyReference || '예시 모드 · 키 사용 없음'}
              readOnly
            />
            <p className="field-hint">
              실제 API 키는 서버 환경변수로 관리합니다. 이 화면에는 키 값이 전달되지 않습니다.
            </p>
          </div>
          <div className="field-grid">
            {(
              [
                ['temperature', '온도', 0, 1, 0.1],
                ['maxTokens', '최대 출력 토큰', 256, 4096, 1],
                ['timeoutSeconds', '제한 시간(초)', 5, 60, 1],
              ] as const
            ).map(([key, label, min, max, step]) => (
              <div className="sf-field" key={key}>
                <label htmlFor={`${purpose}-${key}`}>{label}</label>
                <input
                  id={`${purpose}-${key}`}
                  type="number"
                  min={min}
                  max={max}
                  step={step}
                  disabled={disabled}
                  value={connection[key]}
                  onChange={(event) => change(purpose, { [key]: Number(event.target.value) })}
                />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
/** 읽기전용 디자인에서도 목적별 연결 구조와 실행 한계를 같은 폼으로 확인한다. */
export function ModelSettingsPreview() {
  return (
    <>
      <Notice>
        합성 예시 설정입니다. 세 가지 AI 업무가 서로 다른 모델 연결을 사용할 수 있습니다. 실제 LLM
        호출 성공을 의미하지 않습니다.
      </Notice>
      <ModelConnectionFields connections={exampleConnections} disabled />
    </>
  );
}
/** 모델 구성은 기관 질문 게시 버전과 분리해 최신 DB 설정으로 관리한다. */
export function ModelConnectionsPage() {
  const { user } = useSession();
  const query = useQuery({
    queryKey: ['models', user.institutionId, user.userId],
    queryFn: ({ signal }) => requestJson('/institution/models', modelSettingsSchema, { signal }),
    enabled: user.role === 'ADMIN',
  });
  if (user.role !== 'ADMIN') return <Notice>모델 연결은 기관 관리자 계정에서 관리합니다.</Notice>;
  if (query.isPending) return <Loading />;
  if (query.error) return <ErrorNotice error={query.error} retry={() => void query.refetch()} />;
  return <ModelEditor settings={query.data} onRefresh={() => query.refetch()} />;
}
function ModelEditor({
  settings,
  onRefresh,
}: {
  settings: ModelSettings;
  onRefresh: () => Promise<{ data?: ModelSettings }>;
}) {
  const { user } = useSession();
  const client = useQueryClient();
  const [draft, setDraft] = useMemoryDraft(
    'model-connections',
    createVersionedDraft(settings.revision, settings.connections),
  );
  const [message, setMessage] = useState('');
  const synchronized = reconcileVersionedDraft(draft, settings.revision, settings.connections);
  if (synchronized !== draft) setDraft(synchronized);
  const mutation = useMutation({
    mutationFn: () =>
      requestJson('/institution/models', modelSettingsSchema, {
        method: 'PUT',
        body: JSON.stringify({ expectedRevision: draft.revision, connections: draft.value }),
      }),
    onSuccess: (response) => {
      client.setQueryData(['models', user.institutionId, user.userId], response);
      setDraft(createVersionedDraft(response.revision, response.connections));
      setMessage(
        `모델 설정 r${response.revision}을 저장했습니다. 실제 실행 여부는 각 AI 요청 결과에서 확인합니다.`,
      );
    },
  });
  return (
    <>
      <Heading
        title="AI 모델 연결"
        description="문서 분석·담당자 도우미·최종 초안의 연결 구성을 목적별로 관리합니다."
      >
        <Badge tone="blue">최신 모델 설정 r{settings.revision}</Badge>
      </Heading>
      <nav className="section-nav" aria-label="기관 설정 분류">
        {[
          ['questions', '인터뷰 질문'],
          ['workflow', '검토 절차·양식'],
          ['versions', '설정 버전'],
          ['models', 'AI 모델'],
          ['context', '기관 컨텍스트'],
        ].map(([tab, label]) => (
          <Link
            key={tab}
            className={tab === 'models' ? 'selected' : ''}
            href={`/admin/${tab}`}
            aria-current={tab === 'models' ? 'page' : undefined}
          >
            {label}
          </Link>
        ))}
      </nav>
      <Notice>
        질문·양식의 게시본과 별도로 최신 연결 설정을 사용합니다. 예시 모드는 신청값을 발췌하며 외부
        LLM을 호출하지 않습니다. 연결 실패를 성공한 예시 응답으로 바꾸지 않습니다.
      </Notice>
      <ErrorNotice error={mutation.error} />
      {mutation.error && (
        <button
          className="text-button"
          type="button"
          onClick={() =>
            void onRefresh().then((response) => {
              if (response.data)
                setDraft((current) => ({ ...current, revision: response.data!.revision }));
            })
          }
        >
          최신 버전 확인 · 입력 유지
        </button>
      )}
      {message && (
        <p className="action-feedback" role="status">
          {message}
        </p>
      )}
      <ModelConnectionFields
        connections={draft.value}
        disabled={mutation.isPending}
        onChange={(connections) => {
          setMessage('');
          setDraft({ ...draft, value: connections });
        }}
      />
      <div className="form-actions">
        <button
          className="button primary"
          type="button"
          disabled={
            mutation.isPending ||
            JSON.stringify(draft.value) === JSON.stringify(settings.connections)
          }
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? '저장 확인 중…' : '목적별 모델 연결 저장'}
        </button>
      </div>
      <section className="sf-panel">
        <h2>모델 설정 변경 이력</h2>
        {settings.history.length ? (
          <ul className="notes-list">
            {settings.history.map((entry) => (
              <li key={entry.revision}>
                r{entry.revision} · {entry.author} · {entry.createdAt}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">아직 변경 이력이 없습니다.</p>
        )}
      </section>
    </>
  );
}
