'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { useSession, useMemoryDraft } from '@/features/auth';
import { contextSchema } from './types';
import { requestJson } from '@/lib/http';
import { formatDate } from '@/lib/format';
import { Heading, Badge, Notice, ErrorNotice, Loading, Empty, Icon } from '@/components/ui';
/** 기관별 참고 정보는 공개 지식과 분리하고 외부 AI 요청의 입력으로 전달하지 않는다. */
export function ContextsPage() {
  const session = useSession();
  const client = useQueryClient();
  const [query, setQuery] = useState('');
  const key = ['contexts', session.user.institutionId, session.user.userId];
  const data = useQuery({
    queryKey: key,
    queryFn: ({ signal }) =>
      requestJson('/institution/contexts', z.array(contextSchema), { signal }),
    enabled: session.user.role !== 'APPLICANT',
  });
  const [draft, setDraft, clear] = useMemoryDraft('new-context', {
    title: '',
    category: '',
    content: '',
  });
  const mutation = useMutation({
    mutationFn: () =>
      requestJson('/institution/contexts', contextSchema, {
        method: 'POST',
        body: JSON.stringify(draft),
      }),
    onSuccess: () => {
      clear();
      setDraft({ title: '', category: '', content: '' });
      void client.invalidateQueries({ queryKey: key });
    },
  });
  if (session.user.role === 'APPLICANT')
    return <Notice>기관 컨텍스트는 기관 관리자와 전문 담당자의 업무 화면입니다.</Notice>;
  return (
    <>
      <Heading
        title="기관 컨텍스트"
        description="기관의 참고 정보와 공개된 보안 지식을 분리해 관리합니다."
      >
        <Badge>기관 내부 참고</Badge>
      </Heading>
      <Notice>
        이 프로토타입에는 합성 정보만 등록해 주세요. 기관별 컨텍스트는 외부 AI 분석에 전달하지
        않습니다.
      </Notice>
      {session.user.role === 'ADMIN' && (
        <form
          className="sf-panel form-panel"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate();
          }}
        >
          <div className="panel-heading">
            <h2>참고 정보 등록</h2>
            <Icon name="lock" />
          </div>
          <ErrorNotice error={mutation.error} />
          <div className="field-grid">
            <div className="sf-field">
              <label htmlFor="context-title">
                제목 <span className="required">필수</span>
              </label>
              <input
                id="context-title"
                required
                maxLength={100}
                value={draft.title}
                disabled={mutation.isPending}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              />
            </div>
            <div className="sf-field">
              <label htmlFor="context-category">
                분류 <span className="required">필수</span>
              </label>
              <input
                id="context-category"
                required
                maxLength={40}
                value={draft.category}
                disabled={mutation.isPending}
                onChange={(event) => setDraft({ ...draft, category: event.target.value })}
                placeholder="예: 합성 업무 안내"
              />
            </div>
          </div>
          <div className="sf-field">
            <label htmlFor="context-content">
              참고 내용 <span className="required">필수</span>
            </label>
            <textarea
              id="context-content"
              required
              rows={5}
              maxLength={10000}
              value={draft.content}
              disabled={mutation.isPending}
              onChange={(event) => setDraft({ ...draft, content: event.target.value })}
            />
          </div>
          <button className="button primary" type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? '등록 확인 중…' : '기관 참고 정보 등록'}
          </button>
          {mutation.isSuccess && (
            <p className="action-feedback" role="status">
              기관 참고 정보를 저장했습니다.
            </p>
          )}
        </form>
      )}
      <section className="sf-panel" style={{ marginTop: 24 }}>
        <div className="panel-heading">
          <h2>등록된 참고 정보</h2>
          <Badge>{data.data?.length ?? 0}건</Badge>
        </div>
        <div className="search-input">
          <Icon name="search" />
          <input
            aria-label="기관 참고 정보 검색"
            placeholder="제목·분류 검색"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <ErrorNotice error={data.error} retry={() => void data.refetch()} />
        {data.isPending ? (
          <Loading />
        ) : (
          data.data
            ?.filter((entry) => `${entry.title} ${entry.category}`.includes(query))
            .map((entry) => (
              <article className="evidence-item context-card" key={entry.id}>
                <Badge>{entry.category}</Badge>
                <h3>{entry.title}</h3>
                <pre>{entry.content}</pre>
                <p className="source-meta">
                  담당자 입력 · {entry.createdBy} · {formatDate(entry.createdAt, true)}
                </p>
              </article>
            ))
        )}
        {data.data?.length === 0 && (
          <Empty
            title="등록된 참고 정보가 없습니다"
            description="기관 관리자가 합성 업무 참고 정보를 등록할 수 있습니다."
          />
        )}
      </section>
    </>
  );
}
