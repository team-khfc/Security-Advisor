'use client';

import { DocumentActions } from './DocumentActions';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { Badge, EmptyState, ErrorState, Icon, LoadingState, PageHeading } from '@/components/ui';
import {
  DOCUMENT_LABELS,
  STATUS_LABELS,
  useRequests,
  type Answer,
  type SecurityRequest,
} from '@/features/request';

type DocumentFilter = 'all' | 'draft' | 'submitted' | 'finalized';

const PAGE_SIZE = 6;

function displayedAnswers(request: SecurityRequest): Answer[] {
  const submission = request.submissions.find((item) => item.id === request.currentSubmissionId);
  return submission
    ? [...submission.commonAnswers, ...submission.answers]
    : [...request.commonAnswers, ...request.answers];
}

function documentKind(request: SecurityRequest) {
  if (request.status === 'FINALIZED') return 'finalized';
  if (request.currentSubmissionId) return 'submitted';
  return 'draft';
}

function documentLabel(request: SecurityRequest) {
  const submission = request.submissions.find((item) => item.id === request.currentSubmissionId);
  if (request.status === 'FINALIZED')
    return `확정본 · 제출본 ${submission?.number ?? request.submissions.length}`;
  if (submission) return `제출본 ${submission.number}`;
  return request.stage === 1 ? '작성 초안' : '검토 초안';
}

/** 초안은 최신 저장값으로, 제출본은 저장 당시 스냅샷으로 구분해 표시한다. */
export function DocumentList() {
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<DocumentFilter>('all');
  const [page, setPage] = useState(1);
  const requests = useRequests(true, {
    page: page - 1,
    size: PAGE_SIZE,
    query: search,
    documentKind: kind,
    sort: 'createdAt,desc',
  });

  function searchDocuments(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearch(searchDraft.trim());
    setPage(1);
  }

  function resetFilters() {
    setSearch('');
    setSearchDraft('');
    setKind('all');
    setPage(1);
  }

  if (requests.isPending) return <LoadingState />;
  if (requests.isError)
    return (
      <ErrorState
        error={requests.error}
        onRetry={() => {
          void requests.refetch();
        }}
      />
    );
  const list = requests.pagination
    ? (requests.data ?? [])
    : (requests.data ?? []).filter((request) => {
        if (kind !== 'all' && documentKind(request) !== kind) return false;
        return (
          !search ||
          `${request.caseTitle} ${request.id} ${DOCUMENT_LABELS[request.docType] ?? request.docType}`
            .toLocaleLowerCase('ko-KR')
            .includes(search.toLocaleLowerCase('ko-KR'))
        );
      });
  const pages = Math.max(1, requests.pagination?.totalPages ?? Math.ceil(list.length / PAGE_SIZE));
  const currentPage = Math.max(1, Math.min(page, pages));
  const visible = requests.pagination
    ? list
    : list.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const pageStart = Math.max(1, Math.min(currentPage - 3, pages - 6));
  const pageNumbers = Array.from({ length: Math.min(7, pages) }, (_, index) => pageStart + index);

  if (page !== currentPage) setPage(currentPage);

  return (
    <>
      <PageHeading title="문서함" />
      <form className="filter-box document-filter" onSubmit={searchDocuments}>
        <div className="field">
          <label htmlFor="document-search">사업명·신청번호</label>
          <input
            className="input"
            type="search"
            id="document-search"
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
            placeholder="사업명 또는 신청번호를 입력해 주세요"
          />
        </div>
        <div className="field">
          <label htmlFor="document-kind">문서 구분</label>
          <select
            className="input"
            id="document-kind"
            value={kind}
            onChange={(event) => {
              setKind(event.target.value as DocumentFilter);
              setPage(1);
            }}
          >
            <option value="all">전체</option>
            <option value="draft">작성·검토 초안</option>
            <option value="submitted">제출본</option>
            <option value="finalized">확정본</option>
          </select>
        </div>
        <div className="btn-row">
          <button type="submit" className="btn">
            검색
          </button>
          <button type="button" className="btn btn-tertiary" onClick={resetFilters}>
            검색 초기화
          </button>
        </div>
      </form>
      <p className="filter-state" role="status">
        문서 {requests.pagination?.totalElements ?? list.length}건
        {list.length > 0 && ` · ${currentPage} / ${pages}페이지`}. 초안은 최신 저장 내용, 제출본은
        제출 당시의 내용입니다.
      </p>
      {list.length ? (
        <div className="docs document-grid">
          {visible.map((request) => {
            const answers = displayedAnswers(request);
            const unconfirmed = answers.filter(
              (answer) => answer.source === 'AI_INFERRED' && !answer.confirmed,
            ).length;
            const missing = answers.filter(
              (answer) =>
                answer.required &&
                !answer.notApplicable &&
                (!answer.value.trim() || !answer.source),
            ).length;
            const submitted = request.submissions.find(
              (item) => item.id === request.currentSubmissionId,
            );
            const updatedAt = submitted?.createdAt ?? request.updatedAt;
            const label = documentLabel(request);
            return (
              <article className="card doc" key={request.id}>
                <div className="doc-h">
                  <Badge
                    tone={
                      request.status === 'FINALIZED' ? 'success' : submitted ? 'info' : 'neutral'
                    }
                  >
                    {label}
                  </Badge>
                  <span className="p-id">{request.id}</span>
                </div>
                <h2 className="doc-t">{request.caseTitle}</h2>
                <p className="help">
                  {DOCUMENT_LABELS[request.docType] ?? request.docType} ·{' '}
                  {STATUS_LABELS[request.status]}
                </p>
                <dl className="doc-dl">
                  <div>
                    <dt>적용 설정</dt>
                    <dd>게시본 v{submitted?.publicationVersion ?? request.publicationVersion}</dd>
                  </div>
                  <div>
                    <dt>확인 상태</dt>
                    <dd>
                      {unconfirmed || missing ? (
                        <span className="need-txt">
                          {unconfirmed > 0 ? `AI 추론 미확인 ${unconfirmed}개` : ''}
                          {unconfirmed && missing ? ' · ' : ''}
                          {missing > 0 ? `필수 미입력 ${missing}개` : ''}
                        </span>
                      ) : (
                        '미입력·미확인 없음'
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>{submitted ? '제출 시각' : '마지막 저장'}</dt>
                    <dd>
                      <time dateTime={updatedAt}>
                        {new Intl.DateTimeFormat('ko-KR', {
                          timeZone: 'Asia/Seoul',
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: false,
                        }).format(new Date(updatedAt))}
                      </time>
                    </dd>
                  </div>
                </dl>
                {request.submissions.length > 0 && !submitted && (
                  <p className="meta">
                    이전 제출본 {request.submissions.length}개가 보존되어 있습니다.
                  </p>
                )}
                <div className="doc-actions">
                  <DocumentActions
                    request={request}
                    submissionId={request.currentSubmissionId ?? undefined}
                    previewLabel="미리보기"
                    disabled={
                      ((request.stage === 4 || request.status === 'FINALIZED') &&
                        !request.currentSubmissionId) ||
                      (!!request.currentSubmissionId && !submitted)
                    }
                  />
                  <Link
                    className="link-more"
                    href={`/requests/${encodeURIComponent(request.id)}#documents`}
                  >
                    신청 상세
                    <Icon name="chevronRight" size={16} />
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState
          title={
            search || kind !== 'all' ? '조건에 맞는 문서가 없습니다' : '아직 작성한 문서가 없습니다'
          }
          description={
            search || kind !== 'all'
              ? '검색어나 문서 구분을 변경해 주세요.'
              : '신청을 작성하면 저장된 내용으로 초안을 확인할 수 있습니다.'
          }
          action={
            search || kind !== 'all' ? (
              <button type="button" className="btn btn-tertiary" onClick={resetFilters}>
                검색 초기화
              </button>
            ) : (
              <Link href="/requests" className="btn">
                신청 현황 보기
              </Link>
            )
          }
        />
      )}
      {pages > 1 && (
        <nav className="pager" aria-label="문서함 페이지">
          <button
            type="button"
            aria-label="처음 페이지"
            disabled={currentPage === 1}
            onClick={() => setPage(1)}
          >
            «
          </button>
          <button
            type="button"
            disabled={currentPage === 1}
            onClick={() => setPage(currentPage - 1)}
          >
            <Icon name="chevronLeft" size={16} />
            이전
          </button>
          {pageNumbers.map((pageNumber) => (
            <button
              type="button"
              key={pageNumber}
              aria-label={`${pageNumber}페이지`}
              aria-current={pageNumber === currentPage ? 'page' : undefined}
              onClick={() => setPage(pageNumber)}
            >
              {pageNumber}
            </button>
          ))}
          <button
            type="button"
            disabled={currentPage === pages}
            onClick={() => setPage(currentPage + 1)}
          >
            다음
            <Icon name="chevronRight" size={16} />
          </button>
          <button
            type="button"
            aria-label="마지막 페이지"
            disabled={currentPage === pages}
            onClick={() => setPage(pages)}
          >
            »
          </button>
        </nav>
      )}
    </>
  );
}
