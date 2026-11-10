'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { useSession } from '@/features/auth';
import {
  ListPager,
  EmptyState,
  ErrorState,
  Icon,
  LoadingState,
  Notice,
  PageHeading,
} from '@/components/ui';
import { useAudit } from '@/lib/queries';
import { ROLE_LABELS } from '@/lib/types';

import { auditActionLabel, auditActions } from './labels';

/** 감사 기록은 조회만 제공하고 원문 답변·비밀값을 화면에 재구성하지 않는다. */
export function AuditList() {
  const session = useSession();

  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [action, setAction] = useState('all');
  const [page, setPage] = useState(0);
  const [throughId, setThroughId] = useState<number>();
  const audit = useAudit(undefined, {
    page,
    size: 20,
    query: search,
    action: action === 'all' ? undefined : action,
    throughId,
  });
  function changePage(next: number) {
    setThroughId(audit.throughId);
    setPage(next);
  }
  function resetPage() {
    setPage(0);
    setThroughId(undefined);
  }
  const role = session.data?.member.role;
  const title =
    role === 'ADMIN'
      ? '감사 이력'
      : role === 'SECURITY'
        ? '검토 이력'
        : role === 'INFRA'
          ? '처리 이력'
          : '내 신청 이력';

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearch(searchDraft.trim());
    resetPage();
  }

  if (audit.isPending || session.isPending) return <LoadingState />;
  if (audit.isError)
    return (
      <ErrorState
        error={audit.error}
        onRetry={() => {
          void audit.refetch();
        }}
      />
    );
  const events = audit.data ?? [];
  const actionOptions = auditActions;
  const rows = audit.pagination
    ? events
    : events
        .filter((event) => {
          if (action !== 'all' && event.action !== action) return false;
          return (
            !search ||
            `${event.actorName} ${event.targetId} ${auditActionLabel(event.action)} ${event.reason ?? ''}`
              .toLocaleLowerCase('ko-KR')
              .includes(search.toLocaleLowerCase('ko-KR'))
          );
        })
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

  return (
    <>
      <PageHeading title={title} />
      <Notice>
        <p>업무 변경 기록은 수정하거나 삭제할 수 없습니다. 현재 계정에 허용된 이력만 조회합니다.</p>
      </Notice>
      <form className="toolbar" onSubmit={submitSearch}>
        <div className="dfilter">
          <label htmlFor="audit-action" className="help">
            업무 구분
          </label>
          <select
            id="audit-action"
            className="input"
            value={action}
            onChange={(event) => {
              setAction(event.target.value);
              resetPage();
            }}
          >
            <option value="all">전체 업무</option>
            {actionOptions.map((value) => (
              <option key={value} value={value}>
                {auditActionLabel(value)}
              </option>
            ))}
          </select>
        </div>
        <div className="search" role="search">
          <label className="sr-only" htmlFor="audit-search">
            대상 번호·처리자·사유 검색
          </label>
          <input
            type="search"
            className="input"
            id="audit-search"
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
            placeholder="대상 번호·처리자·사유 검색"
          />
          <button type="submit" className="sbtn" aria-label="이력 검색">
            <Icon name="search" />
          </button>
        </div>
      </form>
      <p className="filter-state" role="status">
        조회된 기록 {audit.pagination?.totalElements ?? rows.length}건 · 최근 기록순
        {(search || action !== 'all') && (
          <button
            type="button"
            className="btn btn-tertiary btn-sm"
            onClick={() => {
              setSearch('');
              setSearchDraft('');
              setAction('all');
              resetPage();
            }}
          >
            검색 초기화
          </button>
        )}
      </p>
      <ListPager
        page={page}
        size={20}
        total={audit.pagination?.totalElements ?? rows.length}
        onChange={changePage}
        label="이력 페이지"
      />
      <button
        type="button"
        className="btn btn-tertiary btn-sm"
        onClick={() => {
          resetPage();
          void audit.refetch();
        }}
      >
        최신 이력 조회
      </button>
      {rows.length ? (
        <div
          className="tbl-wrap"
          tabIndex={0}
          role="region"
          aria-label="감사 이력 표, 가로 스크롤 가능"
        >
          <table className="tbl audit-table">
            <caption className="sr-only">{title}. 시각은 한국표준시입니다.</caption>
            <thead>
              <tr>
                <th scope="col">일시</th>
                <th scope="col">대상</th>
                <th scope="col">처리 내용</th>
                <th scope="col">처리자</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((event) => {
                const isRequest =
                  event.targetType === 'SecurityRequest' || event.targetType === 'SECURITY_REQUEST';
                const isCase =
                  event.targetType === 'BusinessCase' || event.targetType === 'BUSINESS_CASE';
                return (
                  <tr key={event.id}>
                    <td>
                      <time dateTime={event.createdAt}>{auditTime(event.createdAt)}</time>
                    </td>
                    <td>
                      <div className="p-id">
                        {isRequest ? '신청' : isCase ? '사업 건' : '계정·시스템'} · 기록 버전{' '}
                        {event.targetRevision}
                      </div>
                      {isRequest ? (
                        <Link href={`/requests/${encodeURIComponent(event.targetId)}`}>
                          {event.targetId}
                        </Link>
                      ) : isCase ? (
                        <Link href={`/cases/${encodeURIComponent(event.targetId)}`}>
                          {event.targetId}
                        </Link>
                      ) : (
                        <span>{event.targetId}</span>
                      )}
                    </td>
                    <td>
                      <strong>{auditActionLabel(event.action)}</strong>
                      {event.reason && <p className="audit-reason">사유: {event.reason}</p>}
                      {event.fieldKeys.length > 0 && (
                        <p className="meta">관련 항목 {event.fieldKeys.length}개</p>
                      )}
                    </td>
                    <td className="audit-actor">
                      {event.actorName} (
                      {event.actorRole ? ROLE_LABELS[event.actorRole] : '미인증·시스템'})
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title={
            search || action !== 'all'
              ? '조건에 맞는 이력이 없습니다'
              : '아직 조회할 이력이 없습니다'
          }
          description={
            search || action !== 'all'
              ? '검색어나 업무 구분을 바꾸거나 초기화해 주세요.'
              : '신청·협의·제출 등 업무 변경이 발생하면 기록됩니다.'
          }
          action={
            search || action !== 'all' ? (
              <button
                type="button"
                className="btn btn-tertiary"
                onClick={() => {
                  setSearch('');
                  setSearchDraft('');
                  setAction('all');
                  resetPage();
                }}
              >
                검색 초기화
              </button>
            ) : undefined
          }
        />
      )}
    </>
  );
}

/** 시안과 같은 `YYYY-MM-DD HH:mm`(한국표준시) 표기. */
function auditTime(value: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(value))
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}
