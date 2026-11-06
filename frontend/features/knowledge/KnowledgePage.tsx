'use client';
import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { z } from 'zod';
import { referenceSchema } from './types';
import { requestJson } from '@/lib/http';
import { Heading, Badge, Notice, Loading, ErrorNotice, Icon, Empty } from '@/components/ui';
/** 공개 자료의 버전·절·원문을 표시하여 기관 내부 사실의 확인 근거로 혼동하지 않게 한다. */
export function KnowledgePage() {
  const [search, setSearch] = useState('');
  const semantic = useMutation({
    mutationFn: () =>
      requestJson(
        `/knowledge/search?q=${encodeURIComponent(search)}`,
        z.object({
          embeddingMethod: z.literal('LOCAL_FEATURE_HASH_256'),
          scope: z.literal('OFFICIAL_PUBLIC_PAGE_SUMMARIES'),
          corpusVersion: z.string(),
          fullDocumentsIndexed: z.literal(false),
          results: z.array(
            z.object({
              sourceId: z.string(),
              title: z.string(),
              version: z.string(),
              section: z.string(),
              url: z.string(),
              excerpt: z.string(),
              score: z.number(),
            }),
          ),
        }),
      ),
  });
  const query = useQuery({
    queryKey: ['knowledge'],
    queryFn: ({ signal }) => requestJson('/knowledge', z.array(referenceSchema), { signal }),
  });
  return (
    <>
      <Heading
        title="보안 지식 안내"
        description="공개된 참고 자료로 용어를 이해하고, 기관의 실제 사실은 담당자에게 확인하세요."
      />
      <Notice>
        공개 자료의 제한된 참고 범위를 제공합니다. 내부 IP·서버·비공개 규정에 대한 확인을 대신하지
        않습니다.
      </Notice>
      <section className="sf-panel">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (search.trim()) semantic.mutate();
          }}
        >
          <div className="search-input">
            <Icon name="search" />
            <input
              aria-label="공개 참고 자료 검색"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="제목이나 키워드로 찾기"
            />
          </div>
          <button className="button" type="submit" disabled={!search.trim() || semantic.isPending}>
            {semantic.isPending ? '공개 근거 검색 중…' : '공개 근거 검색'}
          </button>
        </form>
        <ErrorNotice error={semantic.error} />
        {semantic.data && (
          <section className="knowledge-results">
            <Notice>
              공식 공개 페이지의 편집 요약을 검색한 결과입니다. PDF·가이드 전문은 색인하지
              않았습니다. 검색 결과가 기관 내부 사실을 증명하지 않습니다.
            </Notice>
            {semantic.data.results.length ? (
              semantic.data.results.map((entry) => (
                <article className="evidence-item" key={entry.sourceId}>
                  <h3>{entry.title}</h3>
                  <p className="source-meta">
                    {entry.version} · {entry.section}
                  </p>
                  <p>{entry.excerpt}</p>
                  {/^https:\/\//.test(entry.url) && (
                    <a
                      href={entry.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-button"
                    >
                      공식 원문 확인 · 새 창<Icon name="arrow" width={16} />
                    </a>
                  )}
                </article>
              ))
            ) : (
              <Empty
                title="관련 공개 근거를 찾지 못했습니다"
                description="다른 용어로 검색하거나 담당자에게 확인해 주세요."
              />
            )}
          </section>
        )}
        <ErrorNotice error={query.error} retry={() => void query.refetch()} />
        {query.isPending ? (
          <Loading />
        ) : (
          query.data
            ?.filter((entry) => `${entry.title} ${entry.section} ${entry.summary}`.includes(search))
            .map((entry) => (
              <article className="evidence-item" key={`${entry.title}-${entry.section}`}>
                <div className="row-between">
                  <h2>{entry.title}</h2>
                  <Badge tone="blue">공개 자료</Badge>
                </div>
                <p className="source-meta">
                  {entry.version} · {entry.section}
                </p>
                <p>{entry.summary}</p>
                {/^https:\/\//.test(entry.url) && (
                  <a
                    href={entry.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-button"
                  >
                    공식 원문 확인 · 새 창<Icon name="arrow" width={16} height={16} />
                  </a>
                )}
              </article>
            ))
        )}
        {query.data?.length === 0 && (
          <Empty
            title="공개 참고 자료가 없습니다"
            description="등록된 공개 자료가 없으므로 기관 담당자에게 문의해 주세요."
          />
        )}
      </section>
      <section className="sf-panel" style={{ marginTop: 24 }}>
        <h2>어떤 내용을 준비하면 되나요?</h2>
        <dl className="summary-list">
          <div>
            <dt>신청자</dt>
            <dd>
              사업 목적, 이용 대상, 처리할 정보, 외부 전송 여부, 운영 기간과 데이터 흐름을 설명해
              주세요.
            </dd>
          </div>
          <div>
            <dt>ICT인프라 담당자</dt>
            <dd>실제 운영 환경과 출발지·목적지·포트·프로토콜·적용 기간을 확인합니다.</dd>
          </div>
          <div>
            <dt>정보보안 담당자</dt>
            <dd>접근 통제, 보유·파기 기준, 로그 관리 등 담당 분야의 근거를 확인합니다.</dd>
          </div>
          <div>
            <dt>AI 제안</dt>
            <dd>
              입력 문서를 바탕으로 정보 후보를 제안합니다. 확정은 사람이 하며, 모르는 내부 사실은
              만들지 않습니다.
            </dd>
          </div>
        </dl>
      </section>
    </>
  );
}
