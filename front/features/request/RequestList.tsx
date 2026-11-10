'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useRef, useState, type FormEvent } from 'react';
import { useSession } from '@/features/auth';
import { Badge, EmptyState, ErrorState, Icon, LoadingState, PageHeading } from '@/components/ui';
import type { Actor } from '@/lib/types';
import { waitingLine, handoffFields } from './turns';
import { useRequests } from './useRequests';
import {
  DOCUMENT_LABELS,
  FIELD_LABELS,
  STAGE_LABELS,
  STATUS_LABELS,
  type RequestStatus,
  type ReviewField,
  type SecurityRequest,
} from './types';

type ListFilter = 'all' | 'mine' | 'staff' | 'done';
type Period = 'all' | '7' | '30' | '90' | 'custom';

interface ListOptions {
  filter: ListFilter;
  search: string;
  period: Period;
  from: string;
  to: string;
  page: number;
}

const PAGE_SIZE = 5;
const filters: { key: ListFilter; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'mine', label: '내가 할 일' },
  { key: 'staff', label: '담당자 확인 중' },
  { key: 'done', label: '확정' },
];
const terminalStates: RequestStatus[] = ['FINALIZED', 'CLOSED', 'WITHDRAWN'];
const statusTones = {
  DRAFT: 'neutral',
  CONSULTING: 'info',
  SUPPLEMENT_REQUESTED: 'warning',
  FINAL_REVIEW: 'info',
  SUBMITTED: 'info',
  FINALIZED: 'success',
  CLOSED: 'danger',
  WITHDRAWN: 'neutral',
} as const;

function dateKey(date: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function shortDate(value: string) {
  return dateKey(new Date(value)).replaceAll('-', '.');
}

function isMyTurn(request: SecurityRequest, actor: Actor) {
  if (request.listOverview) return request.listOverview.myTurn;
  if (terminalStates.includes(request.status)) return false;
  if (actor.role === 'APPLICANT') {
    return (
      request.ownerId === actor.id &&
      ['DRAFT', 'SUPPLEMENT_REQUESTED', 'FINAL_REVIEW'].includes(request.status)
    );
  }
  if (actor.role === 'ADMIN') {
    return handoffFields(request).length > 0;
  }
  return ['COMPLETE_REVIEW', 'FINAL_CONFIRM', 'FINALIZE', 'RESOLVE_SUPPLEMENT'].some((action) =>
    request.allowedActions.includes(action),
  );
}

function isStaffTurn(request: SecurityRequest) {
  return request.status === 'CONSULTING' || request.status === 'SUBMITTED';
}

function activeDeadline(request: SecurityRequest, role?: Actor['role']) {
  if (request.listOverview)
    return request.listOverview.dueDate
      ? { dueAt: request.listOverview.dueDate, timing: undefined }
      : undefined;
  const active = request.deadlines.filter((deadline) => deadline.active);
  const relevant =
    role === 'INFRA' || role === 'SECURITY'
      ? active.filter((deadline) => !deadline.field || deadline.field === role)
      : active;
  return [...(relevant.length ? relevant : active)].sort((left, right) =>
    left.dueAt.localeCompare(right.dueAt),
  )[0];
}

function nextAction(request: SecurityRequest, actor: Actor) {
  if (!isMyTurn(request, actor)) return '';
  const actions = request.allowedActions;
  if (actor.role === 'ADMIN') return '담당자 재배정 필요';
  if (actor.role === 'APPLICANT') {
    if (request.status === 'DRAFT') return '인터뷰 이어서 작성';
    if (request.status === 'SUPPLEMENT_REQUESTED') return '보완 답변 등록';
    return '최종 초안 확인·제출';
  }
  if (request.listOverview) {
    if (request.stage === 4)
      return request.listOverview.fields.every((field) => field.confirmed)
        ? '서류 확정'
        : '제출본 최종 확인';
    if (
      actor.role === 'INFRA' &&
      request.listOverview.fields.some((field) => field.field === 'INFRA' && !field.allocated)
    )
      return '통신 정보 할당';
    return '담당 분야 협의';
  }
  if (actions.includes('FINALIZE')) return '서류 확정';
  if (actions.includes('FINAL_CONFIRM')) return '제출본 최종 확인';
  if (actions.includes('RESOLVE_SUPPLEMENT')) return '보완 답변 재검토';
  return '담당 분야 협의';
}

function reviewState(request: SecurityRequest, field: ReviewField) {
  if (handoffFields(request).some((f) => f.field === field))
    return { kind: 'warn', label: '재배정 필요' };
  if (terminalStates.includes(request.status) && request.status !== 'FINALIZED')
    return { kind: 'wait', label: '종료' };
  if (request.stage === 4 && !request.listOverview) {
    const confirmed = request.finalConfirmations.some(
      (confirmation) =>
        confirmation.field === field && confirmation.submissionId === request.currentSubmissionId,
    );
    return confirmed
      ? { kind: 'done', label: '최종 확인 완료' }
      : { kind: 'wait', label: '최종 확인 대기' };
  }
  const summary = request.listOverview?.fields.find((item) => item.field === field);
  if (summary) {
    if (request.stage === 4)
      return {
        kind: summary.confirmed ? 'done' : 'wait',
        label: summary.confirmed ? '최종 확인 완료' : '최종 확인 대기',
      };
    const labels: Record<string, string> = {
      COMPLETED: '협의 완료',
      SUPPLEMENT_REQUESTED: '보완 요청',
      RECHECK: '재검토',
      ALLOCATED: '할당 완료',
      IN_PROGRESS: '검토 중',
      WAITING: '검토 대기',
    };
    return {
      kind:
        summary.reviewStatus === 'COMPLETED'
          ? 'done'
          : summary.reviewStatus === 'RECHECK' || summary.reviewStatus === 'SUPPLEMENT_REQUESTED'
            ? 'warn'
            : 'now',
      label: labels[summary.reviewStatus ?? 'WAITING'] ?? '검토 대기',
    };
  }
  const review = request.reviews.find((item) => item.field === field);
  if (!review) return { kind: 'wait', label: '대기' };
  if (review.status === 'COMPLETE') return { kind: 'done', label: '협의 완료' };
  if (review.status === 'SUPPLEMENT_REQUESTED') return { kind: 'warn', label: '보완 요청' };
  if (review.status === 'RECHECK') return { kind: 'warn', label: '재검토' };
  if (field === 'INFRA' && review.allocationCompleted) return { kind: 'now', label: '할당 완료' };
  if (
    field === 'SECURITY' &&
    !request.reviews.some((item) => item.field === 'INFRA' && item.allocationCompleted)
  )
    return { kind: 'wait', label: '할당 대기' };
  return {
    kind: review.status === 'PENDING' ? 'wait' : 'now',
    label: review.status === 'PENDING' ? '검토 대기' : '검토 중',
  };
}

function Assignees({ request }: { request: SecurityRequest }) {
  if (request.stage === 1) return <span className="asg-none">협의 요청 후 배정</span>;
  return (
    <ul className="asg">
      {(
        request.listOverview?.fields.map((item) => item.field) ?? (['INFRA', 'SECURITY'] as const)
      ).map((field) => {
        const overview = request.listOverview?.fields.find((item) => item.field === field);
        const assignment = overview
          ? overview.assigneeUsername
            ? { assigneeName: overview.assigneeUsername }
            : undefined
          : request.assignments.find((item) => item.active && item.field === field);
        const state = reviewState(request, field);
        return (
          <li key={field}>
            <span className="asg-f">{FIELD_LABELS[field]}</span>
            <span className="asg-n">{assignment?.assigneeName ?? '미배정'}</span>
            <span className={`asg-s s-${assignment ? state.kind : 'warn'}`}>
              {assignment ? state.label : '관리자 배정 필요'}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function Deadline({
  request,
  actor,
  today,
}: {
  request: SecurityRequest;
  actor: Actor;
  today: string;
}) {
  const deadline = activeDeadline(request, actor.role);
  if (!deadline || terminalStates.includes(request.status))
    return (
      <span className="help">
        {terminalStates.includes(request.status) ? '종료' : '협의 요청 후 산정'}
      </span>
    );
  const diff = Math.round(
    (Date.parse(`${dateKey(new Date(deadline.dueAt))}T00:00:00+09:00`) -
      Date.parse(`${today}T00:00:00+09:00`)) /
      86_400_000,
  );
  const label =
    diff < 0 ? `기한 ${Math.abs(diff)}일 지남` : diff === 0 ? '오늘까지' : `${diff}일 남음`;
  const tone = diff < 0 ? 'danger' : diff <= 2 ? 'warning' : 'neutral';
  return (
    <>
      <Badge tone={tone}>
        {diff < 0 ? `D+${Math.abs(diff)}` : `D-${diff}`}
        <span className="sr-only"> · {label}</span>
      </Badge>
      <span className={`req-date${diff < 0 ? ' p-meta over' : ''}`}>
        {shortDate(deadline.dueAt)}
      </span>
      {diff <= 0 && <span className={`meta${diff < 0 ? ' p-meta over' : ''}`}>{label}</span>}
    </>
  );
}

function RequestListView({ options }: { options: ListOptions }) {
  const session = useSession();

  const router = useRouter();
  const [search, setSearch] = useState(options.search);
  const [previousSearch, setPreviousSearch] = useState(options.search);
  const composing = useRef(false);
  const [period, setPeriod] = useState(options.period);
  const [from, setFrom] = useState(options.from);
  const [to, setTo] = useState(options.to);
  const [periodError, setPeriodError] = useState('');
  const [today] = useState(() => dateKey(new Date()));
  const actor = session.data?.member;
  const searchQuery = options.search.trim();

  const fromDate =
    options.period === 'custom'
      ? options.from
      : options.period === 'all'
        ? ''
        : dateKey(
            new Date(
              Date.parse(`${today}T12:00:00+09:00`) - (Number(options.period) - 1) * 86_400_000,
            ),
          );
  const toDate = options.period === 'custom' ? options.to : options.period === 'all' ? '' : today;
  const requests = useRequests(false, {
    page: options.page - 1,
    size: PAGE_SIZE,
    query: searchQuery,
    inbox: options.filter,
    from: fromDate,
    to: toDate,
    sort: actor?.role === 'INFRA' || actor?.role === 'SECURITY' ? 'dueDate,asc' : 'createdAt,desc',
  });

  if (previousSearch !== options.search) {
    setPreviousSearch(options.search);
    setSearch(options.search);
  }

  function apply(next: Partial<ListOptions>) {
    const values = { ...options, ...next };
    const params = new URLSearchParams();
    if (values.filter !== 'all') params.set('filter', values.filter);
    if (values.search) params.set('q', values.search);
    if (values.period !== 'all') params.set('period', values.period);
    if (values.period === 'custom' && values.from) params.set('from', values.from);
    if (values.period === 'custom' && values.to) params.set('to', values.to);
    if (values.page > 1) params.set('page', String(values.page));
    const url = `/requests${params.size ? `?${params.toString()}` : ''}`;
    router.replace(url, { scroll: false });
  }

  function submitFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (composing.current) return;
    if (period === 'custom' && !from && !to) {
      setPeriodError('시작일이나 종료일을 하나 이상 입력해 주세요.');
      return;
    }
    if (period === 'custom' && from && to && from > to) {
      setPeriodError('시작일이 종료일보다 늦습니다. 날짜 순서를 확인해 주세요.');
      return;
    }
    setPeriodError('');
    apply({ search: search.trim(), period, from, to, page: 1 });
  }

  if (requests.isPending || session.isPending) return <LoadingState />;
  if (requests.isError)
    return (
      <ErrorState
        error={requests.error}
        onRetry={() => {
          void requests.refetch();
        }}
      />
    );
  if (!actor) return <LoadingState />;

  const all = requests.data ?? [];
  const mine = all.filter((request) => isMyTurn(request, actor));
  const staff = all.filter(isStaffTurn);
  const done = all.filter((request) => request.status === 'FINALIZED');
  const isApplicant = actor.role === 'APPLICANT';
  const isStaff = actor.role === 'INFRA' || actor.role === 'SECURITY';
  const summaries = [
    {
      key: 'mine',
      label: actor.role === 'ADMIN' ? '배정 확인 필요' : '내가 할 일',
      icon: 'pencil',
      count: requests.summary?.mine ?? mine.length,
    },
    {
      key: 'staff',
      label: '담당자 확인 중',
      icon: 'users',
      count: requests.summary?.staff ?? staff.length,
    },
    {
      key: 'done',
      label: '서류 확정',
      icon: 'check',
      count: requests.summary?.done ?? done.length,
    },
    {
      key: 'all',
      label: isApplicant ? '내 신청 전체' : '전체 신청',
      icon: 'file',
      count: requests.summary?.all ?? all.length,
    },
  ] as const;
  const query = searchQuery.toLocaleLowerCase('ko-KR');
  const filtered = requests.pagination
    ? all
    : all
        .filter((request) => {
          if (options.filter === 'mine' && !isMyTurn(request, actor)) return false;
          if (options.filter === 'staff' && !isStaffTurn(request)) return false;
          if (options.filter === 'done' && request.status !== 'FINALIZED') return false;
          if (
            query &&
            !`${request.caseTitle} ${request.id} ${request.department} ${request.ownerName} ${DOCUMENT_LABELS[request.docType] ?? request.docType}`
              .toLocaleLowerCase('ko-KR')
              .includes(query)
          )
            return false;
          const date = dateKey(new Date(request.createdAt));
          return (!fromDate || date >= fromDate) && (!toDate || date <= toDate);
        })
        .sort((left, right) => {
          if (isStaff) {
            const leftDue = activeDeadline(left, actor.role)?.dueAt ?? '9999';
            const rightDue = activeDeadline(right, actor.role)?.dueAt ?? '9999';
            if (leftDue !== rightDue) return leftDue.localeCompare(rightDue);
          }
          return right.createdAt.localeCompare(left.createdAt);
        });
  const pages = Math.max(
    1,
    requests.pagination?.totalPages ?? Math.ceil(filtered.length / PAGE_SIZE),
  );
  const currentPage = Math.max(1, Math.min(options.page, pages));
  const visible = requests.pagination
    ? filtered
    : filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const pageStart = Math.max(1, Math.min(currentPage - 3, pages - 6));
  const pageNumbers = Array.from({ length: Math.min(7, pages) }, (_, index) => pageStart + index);
  const isFiltered = options.filter !== 'all' || searchQuery !== '' || options.period !== 'all';
  const cols = isApplicant ? [30, 22, 16, 16, 16] : [32, 16, 18, 18, 16];

  return (
    <>
      <PageHeading
        title={isStaff ? '협의 요청함' : '신청 현황'}
        actions={
          isApplicant ? (
            <Link className="btn btn-primary" href="/requests/new">
              <Icon name="plus" />새 신청 시작
            </Link>
          ) : undefined
        }
      />
      <section aria-labelledby="request-summary-heading">
        <h2 className="sr-only" id="request-summary-heading">
          신청 요약
        </h2>
        <div className="stats">
          {summaries.map((summary) => (
            <button
              key={summary.key}
              type="button"
              className="stat"
              aria-pressed={options.filter === summary.key}
              onClick={() => apply({ filter: summary.key, page: 1 })}
            >
              <span className="stat-l">
                <Icon name={summary.icon} />
                <span>{summary.label}</span>
              </span>
              <span className="stat-num">
                {summary.count}
                <small>건</small>
              </span>
            </button>
          ))}
        </div>
      </section>
      <section aria-labelledby="request-list-heading">
        <div className="sec-head">
          <h2 className="h-sec" id="request-list-heading">
            신청 내역<span className="count">{requests.summary?.all ?? all.length}</span>
          </h2>
          <ul className="st-legend" aria-label="진행 단계">
            {STAGE_LABELS.map((stage, index) => (
              <li key={stage}>
                <i style={{ background: `var(--st${index + 1})` }} aria-hidden="true" />
                {index + 1}. {stage}
              </li>
            ))}
          </ul>
        </div>
        <form onSubmit={submitFilters}>
          <div className="toolbar">
            <div className="pills" role="group" aria-label="상태로 거르기">
              {filters.map((filter) => (
                <button
                  type="button"
                  className="pill"
                  key={filter.key}
                  aria-pressed={options.filter === filter.key}
                  onClick={() => apply({ filter: filter.key, page: 1 })}
                >
                  {actor.role === 'ADMIN' && filter.key === 'mine'
                    ? '배정 확인 필요'
                    : filter.label}
                </button>
              ))}
            </div>
            <div className="dfilter">
              <div className="per">
                <label htmlFor="request-period">접수 기간</label>
                <select
                  id="request-period"
                  className="input"
                  value={period}
                  onChange={(event) => {
                    const value = event.target.value as Period;
                    setPeriod(value);
                    setPeriodError('');
                    if (value !== 'custom') apply({ period: value, from: '', to: '', page: 1 });
                  }}
                >
                  <option value="all">전체 기간</option>
                  <option value="7">최근 1주</option>
                  <option value="30">최근 1개월</option>
                  <option value="90">최근 3개월</option>
                  <option value="custom">직접 입력</option>
                </select>
              </div>
              {period === 'custom' && (
                <div className="pdates">
                  <label htmlFor="request-from">시작일</label>
                  <input
                    id="request-from"
                    className="input"
                    type="date"
                    value={from}
                    max={today}
                    onChange={(event) => {
                      setFrom(event.target.value);
                      setPeriodError('');
                    }}
                    aria-invalid={Boolean(periodError)}
                    aria-describedby={periodError ? 'request-period-error' : undefined}
                  />
                  <span aria-hidden="true">~</span>
                  <label htmlFor="request-to">종료일</label>
                  <input
                    id="request-to"
                    className="input"
                    type="date"
                    value={to}
                    max={today}
                    onChange={(event) => {
                      setTo(event.target.value);
                      setPeriodError('');
                    }}
                    aria-invalid={Boolean(periodError)}
                    aria-describedby={periodError ? 'request-period-error' : undefined}
                  />
                </div>
              )}
              <div className="search" role="search">
                <label htmlFor="request-search" className="sr-only">
                  {isApplicant ? '사업명·신청번호 검색' : '사업명·부서·신청자 검색'}
                </label>
                <input
                  id="request-search"
                  className="input"
                  type="search"
                  value={search}
                  onChange={(event) => {
                    setSearch(event.currentTarget.value);
                  }}
                  onCompositionStart={() => {
                    composing.current = true;
                  }}
                  onCompositionEnd={(event) => {
                    composing.current = false;
                    setSearch(event.currentTarget.value);
                  }}
                  onKeyDown={(event) => {
                    if (
                      event.key === 'Enter' &&
                      (composing.current || event.nativeEvent.isComposing)
                    )
                      event.preventDefault();
                  }}
                  placeholder={isApplicant ? '사업명·신청번호 검색' : '사업명·부서·신청자 검색'}
                />
                <button type="submit" className="sbtn" aria-label="신청 검색">
                  <Icon name="search" />
                </button>
              </div>
            </div>
          </div>
          {periodError && (
            <p className="ferr request-period-error" id="request-period-error" role="alert">
              {periodError}
            </p>
          )}
        </form>
        <p className="filter-state" role="status">
          {filters.find((filter) => filter.key === options.filter)?.label} 결과{' '}
          {requests.pagination?.totalElements ?? filtered.length}건
          {searchQuery && ` · 검색어 “${searchQuery}”`}
          {fromDate || toDate ? ` · ${fromDate || '처음'} ~ ${toDate || '오늘'}` : ''}
          {pages > 1 && ` · ${currentPage} / ${pages}페이지`}
          {isFiltered && (
            <button
              type="button"
              className="btn btn-tertiary btn-sm"
              onClick={() => router.replace('/requests', { scroll: false })}
            >
              조건 초기화
            </button>
          )}
        </p>
        {isStaff && (
          <p className="meta">
            처리 기한이 빠른 순으로 표시합니다. 기한 경과만으로 신청 상태가 바뀌지 않습니다.
          </p>
        )}
        {visible.length > 0 ? (
          <>
            <div
              className="tbl-wrap"
              tabIndex={0}
              role="region"
              aria-label="신청 내역 표, 가로 스크롤 가능"
            >
              <table
                className={`tbl rows-link request-table${isApplicant ? ' request-table-applicant' : ''}`}
              >
                <caption className="sr-only">
                  신청 내역. 사업명 링크를 선택하면 신청 상세로 이동합니다.
                </caption>
                <colgroup>
                  {cols.map((width, index) => (
                    <col key={index} style={{ width: `${width}%` }} />
                  ))}
                </colgroup>
                <thead>
                  <tr>
                    <th scope="col">사업명</th>
                    <th scope="col">{isApplicant ? '담당자' : '담당부서·신청자'}</th>
                    <th scope="col">진행 단계</th>
                    <th scope="col">상태</th>
                    <th scope="col">처리 기한</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((request) => {
                    const stopped = request.status === 'CLOSED' || request.status === 'WITHDRAWN';
                    const action = nextAction(request, actor);
                    const overdue =
                      activeDeadline(request, actor.role)?.timing === 'OVERDUE' &&
                      !terminalStates.includes(request.status);
                    return (
                      <tr key={request.id} className={overdue ? 'overdue' : undefined}>
                        <td>
                          <div className="p-id">
                            {request.id}
                            <span className="request-type">
                              {' '}
                              · {DOCUMENT_LABELS[request.docType] ?? request.docType}
                            </span>
                          </div>
                          <div className="p-name">
                            <Link href={`/requests/${encodeURIComponent(request.id)}`}>
                              {request.caseTitle}
                            </Link>
                          </div>
                          <div className="p-meta">접수일 {shortDate(request.createdAt)}</div>
                        </td>
                        <td>
                          {isApplicant ? (
                            <Assignees request={request} />
                          ) : (
                            <>
                              <div>{request.department}</div>
                              <div className="p-meta">{request.ownerName}</div>
                            </>
                          )}
                        </td>
                        <td>
                          <div className="prog-l">
                            {request.stage}단계 / 4단계
                            {request.status === 'FINALIZED' ? ' 완료' : ''}
                          </div>
                          <div className={`bars${stopped ? ' stopped' : ''}`} aria-hidden="true">
                            {STAGE_LABELS.map((stage, index) => (
                              <i key={stage} className={index < request.stage ? 'on' : undefined} />
                            ))}
                          </div>
                          <span className="sr-only">
                            {STAGE_LABELS[request.stage - 1]}
                            {stopped ? ', 종료' : ''}
                          </span>
                          {request.listOverview?.needsReview ||
                            (request.returns.length > 0 && request.highlightedFields.length > 0 && (
                              <span className="table-subtitle">반환됨 · 보완 항목 확인</span>
                            ))}
                        </td>
                        <td>
                          <Badge tone={statusTones[request.status]}>
                            {STATUS_LABELS[request.status]}
                          </Badge>
                          {action ? (
                            <span className="turn me">{action}</span>
                          ) : (
                            !isApplicant &&
                            waitingLine(request) && (
                              <span className="turn">{waitingLine(request)}</span>
                            )
                          )}
                        </td>
                        <td>
                          <Deadline request={request} actor={actor} today={today} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {pages > 1 && (
              <nav className="pager" aria-label="신청 내역 페이지">
                <button
                  type="button"
                  aria-label="처음 페이지"
                  disabled={currentPage === 1}
                  onClick={() => apply({ page: 1 })}
                >
                  «
                </button>
                <button
                  type="button"
                  disabled={currentPage === 1}
                  onClick={() => apply({ page: currentPage - 1 })}
                >
                  <Icon name="chevronLeft" size={16} />
                  이전
                </button>
                {pageNumbers.map((page) => (
                  <button
                    type="button"
                    key={page}
                    aria-label={`${page}페이지`}
                    aria-current={page === currentPage ? 'page' : undefined}
                    onClick={() => apply({ page })}
                  >
                    {page}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={currentPage === pages}
                  onClick={() => apply({ page: currentPage + 1 })}
                >
                  다음
                  <Icon name="chevronRight" size={16} />
                </button>
                <button
                  type="button"
                  aria-label="마지막 페이지"
                  disabled={currentPage === pages}
                  onClick={() => apply({ page: pages })}
                >
                  »
                </button>
              </nav>
            )}
          </>
        ) : (
          <EmptyState
            title={isFiltered ? '조건에 맞는 신청이 없습니다' : '아직 신청한 서류가 없습니다'}
            description={
              isFiltered
                ? '검색어와 조회 기간을 확인하거나 조건을 초기화해 주세요.'
                : isApplicant
                  ? '새 신청에서 사업 정보를 입력하고 필요한 서류를 선택해 주세요.'
                  : '접수된 신청은 이곳에 표시됩니다.'
            }
            action={
              isFiltered ? (
                <button
                  type="button"
                  className="btn btn-tertiary"
                  onClick={() => router.replace('/requests')}
                >
                  조건 초기화
                </button>
              ) : isApplicant ? (
                <Link className="btn" href="/requests/new">
                  새 신청 시작
                </Link>
              ) : undefined
            }
          />
        )}
      </section>
    </>
  );
}

function RequestListQuery() {
  const params = useSearchParams();
  const filterValue = params.get('filter');
  const periodValue = params.get('period');
  const pageValue = Number(params.get('page') ?? 1);
  const options: ListOptions = {
    filter:
      filterValue === 'mine' || filterValue === 'staff' || filterValue === 'done'
        ? filterValue
        : 'all',
    search: params.get('q') ?? '',
    period:
      periodValue === '7' ||
      periodValue === '30' ||
      periodValue === '90' ||
      periodValue === 'custom'
        ? periodValue
        : 'all',
    from: /^\d{4}-\d{2}-\d{2}$/.test(params.get('from') ?? '') ? (params.get('from') ?? '') : '',
    to: /^\d{4}-\d{2}-\d{2}$/.test(params.get('to') ?? '') ? (params.get('to') ?? '') : '',
    page: Number.isInteger(pageValue) && pageValue > 0 ? pageValue : 1,
  };
  return (
    <RequestListView
      key={`${options.filter}:${options.period}:${options.from}:${options.to}`}
      options={options}
    />
  );
}

/** 목록 조건을 URL에 보존하여 상세 조회 후 같은 문맥으로 돌아오게 한다. */
export function RequestList() {
  return (
    <Suspense fallback={<LoadingState />}>
      <RequestListQuery />
    </Suspense>
  );
}
