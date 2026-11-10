'use client';

import { useEffect, useState } from 'react';
import { useSession } from '@/features/auth';
import {
  Badge,
  ErrorState,
  ListPager,
  LoadingState,
  Modal,
  Notice,
  PageHeading,
  Field,
} from '@/components/ui';
import { ApiError, requestJson } from '@/lib/httpClient';
import {
  useKnowledgeDraft,
  useKnowledgeHistory,
  useKnowledgeList,
  useKnowledgeSnapshot,
  useRefreshKnowledge,
} from './useKnowledge';
import {
  comparisonSchema,
  draftSchema,
  publicationSchema,
  type KnowledgeComparison,
  type KnowledgeDraft,
  type PrivateContext,
  type Snippet,
} from './types';
import { KnowledgeItemEditor } from './KnowledgeItemEditor';
import { KnowledgeChanges, PrivateContent, SnippetContent } from './KnowledgeContent';

/** 관리 권한을 확인한 뒤에만 비공개 초안 조회를 시작한다. */
export function KnowledgePage() {
  const session = useSession();
  if (session.isPending) return <LoadingState />;
  if (session.data?.member.role !== 'ADMIN')
    return <Notice tone="warning">기관 관리자만 지식·비공개 정보를 관리할 수 있습니다.</Notice>;
  return <KnowledgeManager key={session.data.member.id} />;
}
function KnowledgeManager() {
  const draft = useKnowledgeDraft();
  const refresh = useRefreshKnowledge();
  const [tab, setTab] = useState(0);
  const [review, setReview] = useState<KnowledgeComparison | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [note, setNote] = useState<KnowledgeDraft | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  async function compare() {
    setBusy(true);
    setError(null);
    try {
      const comparison = comparisonSchema.parse(
        await requestJson('/api/knowledge-drafts/current/comparison'),
      );
      const metadata = draftSchema.parse(await requestJson('/api/knowledge-drafts/current'));
      if (comparison.revision !== metadata.revision)
        throw new Error('비교 중 초안이 변경되었습니다. 최신 변경을 다시 비교해 주세요.');
      setReviewNote(metadata.note ?? '');
      setReview(comparison);
    } catch (error) {
      setError(error);
    } finally {
      setBusy(false);
    }
  }
  async function publish() {
    if (review?.revision == null) return;
    setBusy(true);
    setError(null);
    try {
      const result = publicationSchema.parse(
        await requestJson('/api/knowledge-drafts/current/publications', {
          method: 'POST',
          body: { expectedRevision: review.revision },
        }),
      );
      setReview(null);
      setMessage(`지식 게시본 v${result.version} 게시를 완료했습니다. 새 사업부터 적용합니다.`);
      await refresh();
    } catch (error) {
      setError(error);
    } finally {
      setBusy(false);
    }
  }
  if (draft.isPending) return <LoadingState />;
  if (!draft.data) return <ErrorState error={draft.error} onRetry={() => void draft.refetch()} />;
  return (
    <>
      <PageHeading
        title="지식·비공개 정보 관리"
        description="공개자료 근거와 기관 내부 사실을 구분해 관리합니다. 초안을 저장하고 변경 내용을 확인한 뒤 게시하세요."
      />
      <div className="org-bar">
        <div className="verbar">
          <Badge tone="success">지식 게시본 v{draft.data.currentPublishedVersion}</Badge>
          <Badge>새 사업부터 적용</Badge>
        </div>
        <p>
          기존 사업·추가 신청은 생성 당시 지식을 유지합니다. 비공개 정보의 열람 권한 축소와 사용
          중지는 현재 게시본 기준으로 적용합니다.
        </p>
      </div>
      {message && (
        <div role="status">
          <Notice tone="success">{message}</Notice>
        </div>
      )}
      {error != null && review === null && (
        <ErrorState error={error} onRetry={() => void compare()} />
      )}
      <div className="knowledge-publish-bar">
        <p>
          공개 지식 {draft.data.snippetCount}건 · 비공개 정보 {draft.data.privateContextCount}건
        </p>
        <div className="btn-row">
          <button type="button" className="btn" onClick={() => setNote(draft.data ?? null)}>
            게시 메모 편집
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => void compare()}
          >
            변경 검토·게시
          </button>
        </div>
      </div>
      <p className="help">
        최근 저장: {draft.data.updatedBy} · {new Date(draft.data.updatedAt).toLocaleString('ko-KR')}{' '}
        · 게시 메모: {draft.data.note || '없음'}
      </p>
      <div role="tablist" className="tabs" aria-label="지식 관리 항목">
        {['공개 지식', '기관 비공개 정보', '게시 이력'].map((label, index) => (
          <button
            type="button"
            role="tab"
            id={`knowledge-tab-${index}`}
            aria-controls="knowledge-panel"
            aria-selected={tab === index}
            tabIndex={tab === index ? 0 : -1}
            key={label}
            onClick={() => setTab(index)}
            onKeyDown={(event) => {
              if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
              event.preventDefault();
              const next =
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? 2
                    : (tab + (event.key === 'ArrowRight' ? 1 : -1) + 3) % 3;
              setTab(next);
              document.getElementById(`knowledge-tab-${next}`)?.focus();
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <section
        role="tabpanel"
        id="knowledge-panel"
        aria-labelledby={`knowledge-tab-${tab}`}
        tabIndex={0}
      >
        {tab < 2 ? (
          <KnowledgeList
            key={tab}
            kind={tab === 0 ? 'public' : 'private'}
            onSaved={async () => {
              await refresh();
              setMessage('초안을 저장했습니다. 게시 전까지 현재 업무에 반영되지 않습니다.');
            }}
          />
        ) : (
          <KnowledgeHistory />
        )}
      </section>
      {note && (
        <KnowledgeNote
          initial={note}
          onClose={() => setNote(null)}
          onSaved={async () => {
            setNote(null);
            await refresh();
            setMessage('게시 메모 초안을 저장했습니다.');
          }}
        />
      )}
      <Modal
        open={review !== null}
        title="지식 변경 검토·게시"
        onClose={() => {
          if (!busy) {
            setReview(null);
            setError(null);
          }
        }}
      >
        {review && (
          <>
            <p>
              지식 게시본 v{review.fromVersion} 대비 변경입니다. 비공개 내용은 이 관리자 화면에서만
              표시하며 감사 이력에 원문을 복제하지 않습니다.
            </p>
            {error != null && (
              <div role="alert">
                <Notice tone="danger">
                  {error instanceof Error ? error.message : '게시하지 못했습니다.'}
                </Notice>
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={() => void compare()}
                >
                  최신 변경 다시 비교
                </button>
              </div>
            )}
            <p className="knowledge-text">게시 메모: {reviewNote || '없음'}</p>
            <KnowledgeChanges comparison={review} />
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || !review.changes.length || error != null}
              onClick={() => void publish()}
            >
              {busy ? '처리 중…' : `지식 v${review.fromVersion + 1} 게시`}
            </button>
          </>
        )}
      </Modal>
    </>
  );
}

function KnowledgeList({ kind, onSaved }: { kind: 'public' | 'private'; onSaved: () => void }) {
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [editor, setEditor] = useState<{ item: Snippet | PrivateContext | null } | null>(null);
  const query = useKnowledgeList(kind, q, page);
  return (
    <div className="card">
      <form
        className="knowledge-search"
        onSubmit={(e) => {
          e.preventDefault();
          setQ(search);
          setPage(0);
        }}
      >
        <Field
          label={kind === 'public' ? '자료명·본문 검색' : '정보 이름 검색'}
          htmlFor="knowledge-search"
        >
          <input
            id="knowledge-search"
            type="search"
            className="input"
            value={search}
            maxLength={200}
            onChange={(e) => setSearch(e.target.value)}
          />
        </Field>
        <button className="btn" type="submit">
          검색
        </button>
        <button className="btn btn-primary" type="button" onClick={() => setEditor({ item: null })}>
          {kind === 'public' ? '공개 지식 추가' : '비공개 정보 추가'}
        </button>
      </form>
      {query.isPending ? (
        <LoadingState />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <>
          <ul className="knowledge-list">
            {query.data.content.map((item) => (
              <li
                key={'knowledgeSnippetId' in item ? item.knowledgeSnippetId : item.privateContextId}
              >
                <div>
                  <strong>{'sourceTitle' in item ? item.sourceTitle : item.name}</strong>
                  <p className="help">
                    {'sourceVersion' in item
                      ? `${item.sourceVersion} · ${item.sourceLocator}`
                      : `열람: ${item.visibleRoles.map((role) => ({ INFRA: 'ICT인프라', SECURITY: '정보보안', ADMIN: '기관 관리자' })[role]).join(', ')}`}
                  </p>
                </div>
                <Badge tone={item.active ? 'success' : 'neutral'}>
                  {item.active ? '사용 예정' : '사용 중지'}
                </Badge>
                <button
                  type="button"
                  className="btn"
                  aria-label={`${'sourceTitle' in item ? item.sourceTitle : item.name} 편집`}
                  onClick={() => setEditor({ item })}
                >
                  편집
                </button>
              </li>
            ))}
          </ul>
          {!query.data.content.length && <p>조건에 맞는 초안이 없습니다.</p>}
          <ListPager
            page={page}
            size={10}
            total={query.data.totalElements}
            onChange={setPage}
            label="지식 목록 페이지"
          />
        </>
      )}
      {editor && (
        <KnowledgeItemEditor
          kind={kind}
          initial={editor.item}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            onSaved();
          }}
        />
      )}
    </div>
  );
}
function KnowledgeHistory() {
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const history = useKnowledgeHistory(page);
  const content = useKnowledgeSnapshot(selected);
  return (
    <div className="card">
      <h2 className="h-panel">지식 게시 이력</h2>
      {history.isPending ? (
        <LoadingState />
      ) : history.isError ? (
        <ErrorState error={history.error} onRetry={() => void history.refetch()} />
      ) : (
        <>
          <ul className="knowledge-list">
            {history.data.content.map((item) => (
              <li key={item.knowledgePublicationId}>
                <div>
                  <strong>지식 게시본 v{item.version}</strong>
                  <p>
                    {new Date(item.publishedAt).toLocaleString('ko-KR')} ·{' '}
                    {item.publishedBy ?? '초기 설치'}
                  </p>
                  <p className="knowledge-text">{item.note || '메모 없음'}</p>
                </div>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setSelected(item.knowledgePublicationId)}
                >
                  v{item.version} 내용 보기
                </button>
              </li>
            ))}
          </ul>
          <ListPager
            page={page}
            size={10}
            total={history.data.totalElements}
            onChange={setPage}
            label="지식 게시 이력 페이지"
          />
        </>
      )}
      <Modal
        open={selected !== null}
        title="지식 게시본과 변경 이력"
        onClose={() => setSelected(null)}
      >
        {content.isPending ? (
          <LoadingState />
        ) : content.isError ? (
          <ErrorState error={content.error} onRetry={() => void content.refetch()} />
        ) : (
          content.data && (
            <>
              <h3>게시본 v{content.data.comparison.toVersion}</h3>
              <details>
                <summary>공개 지식 {content.data.snapshot.snippets.length}건 보기</summary>
                {content.data.snapshot.snippets.map((item) => (
                  <SnippetContent key={item.knowledgeSnippetId} item={item} />
                ))}
              </details>
              <details>
                <summary>비공개 정보 {content.data.snapshot.privateContexts.length}건 보기</summary>
                {content.data.snapshot.privateContexts.map((item) => (
                  <PrivateContent key={item.privateContextId} item={item} />
                ))}
              </details>
              <h3>게시 당시 변경 내용</h3>
              <KnowledgeChanges comparison={content.data.comparison} />
            </>
          )
        )}
      </Modal>
    </div>
  );
}
function KnowledgeNote({
  initial,
  onClose,
  onSaved,
}: {
  initial: KnowledgeDraft;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [note, setNote] = useState(initial.note ?? '');
  const [revision, setRevision] = useState(initial.revision);
  const [latest, setLatest] = useState<KnowledgeDraft | null>(null);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [baseline, setBaseline] = useState(initial.note ?? '');
  const dirty = note !== baseline;
  useEffect(() => {
    if (!dirty) return;
    const prevent = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', prevent);
    return () => window.removeEventListener('beforeunload', prevent);
  }, [dirty]);
  return (
    <Modal
      open
      title="게시 메모 초안"
      onClose={() => {
        if (!busy) {
          if (dirty) setDiscard(true);
          else onClose();
        }
      }}
    >
      <p>
        게시 이력에 함께 남길 변경 목적을 입력하세요. 비공개 원문과 비밀값을 메모에 복사하지 마세요.
      </p>
      {discard && (
        <Notice tone="warning">
          <p>저장하지 않은 메모가 있습니다.</p>
          <button type="button" className="btn" onClick={() => setDiscard(false)}>
            계속 편집
          </button>
          <button type="button" className="btn" onClick={onClose}>
            메모를 버리고 닫기
          </button>
        </Notice>
      )}
      {error && <p role="alert">{error}</p>}
      <Field label="게시 메모" htmlFor="knowledge-note">
        <textarea
          id="knowledge-note"
          className="input"
          maxLength={500}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
      <button
        type="button"
        className="btn btn-primary"
        disabled={busy || conflict}
        onClick={async () => {
          setBusy(true);
          try {
            await requestJson('/api/knowledge-drafts/current', {
              method: 'PUT',
              body: { expectedRevision: revision, note },
            });
            onSaved();
          } catch (error) {
            if (error instanceof ApiError && error.status === 409) setConflict(true);
            setError(error instanceof Error ? error.message : '메모를 저장하지 못했습니다.');
          } finally {
            setBusy(false);
          }
        }}
      >
        메모 초안 저장
      </button>
      {conflict && (
        <>
          <p>내 메모는 보존했습니다. 최신 내용을 확인하고 필요한 부분을 복사하세요.</p>
          <button
            type="button"
            className="btn"
            onClick={async () => {
              try {
                setLatest(draftSchema.parse(await requestJson('/api/knowledge-drafts/current')));
              } catch (error) {
                setError(
                  error instanceof Error ? error.message : '최신 초안을 불러오지 못했습니다.',
                );
              }
            }}
          >
            최신 메모 확인
          </button>
        </>
      )}
      {latest && (
        <section>
          <h3>서버 최신 메모</h3>
          <p className="knowledge-text">{latest.note || '없음'}</p>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setNote(latest.note ?? '');
              setBaseline(latest.note ?? '');
              setRevision(latest.revision);
              setConflict(false);
              setLatest(null);
              setError('');
            }}
          >
            내 메모를 대체하고 최신본으로 편집
          </button>
        </section>
      )}
    </Modal>
  );
}
