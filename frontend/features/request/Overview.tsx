'use client';
import { useRef, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react';
import Link from 'next/link';
import type { SecurityRequest } from './types';
import type { Role } from '@/lib/sharedTypes';
import { localDateKey, shortId, statusLabel, stepPath } from '@/lib/format';
import { Heading, Badge, Icon } from '@/components/ui';

export const STAGES = ['작성', '담당자 협의', '사용자 최종 검토', '확정·관리'];

function badgeTone(item: SecurityRequest) {
  if (item.status === 'CLOSED') return 'red';
  if (item.status === 'WITHDRAWN' || item.status === 'DRAFT') return 'gray';
  if (item.status === 'CONFIRMED') return 'green';
  return statusLabel(item).includes('보완') ? 'amber' : 'blue';
}

const LIST_BADGE_CLASSES = {
  red: 'b-danger',
  gray: 'b-neutral',
  green: 'b-success',
  amber: 'b-warning',
  blue: 'b-info',
} as const;

/** 반환과 종결을 정상 완료와 구분하여 상태를 문구로 표시한다. */
export function RequestBadge({ item }: { item: SecurityRequest }) {
  return <Badge tone={badgeTone(item)}>{statusLabel(item)}</Badge>;
}

/** 서버가 현재 수정본에 대해 완료한 검토만 완료로 표시한다. */
export function ReviewStatus({ item }: { item: SecurityRequest }) {
  return (
    <div className="role-status">
      {item.reviews.map((review) => (
        <span
          key={review.role}
          className={
            review.status === 'COMPLETE' && review.revision === item.revision
              ? 'finished'
              : undefined
          }
        >
          {review.role === 'SECURITY' ? '정보보안' : 'ICT인프라'} ·{' '}
          {review.status === 'COMPLETE' && review.revision === item.revision
            ? '협의 완료'
            : review.status === 'IN_PROGRESS'
              ? '검토 중'
              : review.status === 'INVALIDATED'
                ? '재확인 필요'
                : '검토 대기'}
        </span>
      ))}
    </div>
  );
}

/** 원본의 얇은 4구간 막대를 사용하되 제출과 서류 확정을 같은 완료로 표시하지 않는다. */
export function StageBars({ item }: { item: SecurityRequest }) {
  return (
    <>
      <div className="prog-l">
        {item.stage}단계 / 4단계{item.status === 'CONFIRMED' ? ' 완료' : ''}
      </div>
      <div className={`bars${item.status === 'CONFIRMED' ? ' done' : ''}`} aria-hidden="true">
        {STAGES.map((label, index) => (
          <i key={label} className={index < item.stage ? 'on' : undefined} />
        ))}
      </div>
      <span className="sr-only">현재 {STAGES[item.stage - 1]} 단계</span>
    </>
  );
}

function canAnswerSupplement(item: SecurityRequest, role: Role): boolean {
  return (
    role === 'APPLICANT' &&
    item.stage <= 3 &&
    !['CLOSED', 'WITHDRAWN', 'CONFIRMED'].includes(item.status) &&
    item.allowedActions.includes('ANSWER') &&
    item.supplements.some((entry) => entry.status === 'OPEN')
  );
}

/** 계정별 다음 작업을 안내하며 서버가 허용하지 않은 변경을 실행하지 않는다. */
export function nextTask(item: SecurityRequest, role: Role): string {
  if (item.status === 'CLOSED' || item.status === 'WITHDRAWN') return '사유와 이력 확인 · 읽기전용';
  if (item.status === 'CONFIRMED') return '확정 문서 확인 · 장비 적용 별도';
  if (canAnswerSupplement(item, role)) return '보완 답변 등록';
  if (item.returnItems.some((entry) => entry.status === 'OPEN')) return '강조된 반환 항목 보완';
  if (item.stage === 1)
    return role === 'APPLICANT' ? '사업 정보 작성·AI 인터뷰' : '사용자 작성 대기';
  if (item.stage === 3)
    return role === 'APPLICANT' ? 'AI 최종 초안 확인 후 제출' : '사용자 최종 검토 대기';
  if (item.stage === 4)
    return role === 'APPLICANT' ? '담당자 양측 최종 확인 대기' : '제출본 최종 검토·확정';
  if (item.allocation.status !== 'COMPLETE')
    return role === 'INFRA' ? '서버·IP·포트 할당' : 'ICT인프라 할당 대기';
  return role === 'APPLICANT' ? '담당자 협의 진행 확인' : '담당 분야 검토·협의 완료';
}

function isMyTurn(item: SecurityRequest, role: Role) {
  if (['CLOSED', 'WITHDRAWN', 'CONFIRMED'].includes(item.status)) return false;
  if (role === 'APPLICANT')
    return item.stage === 1 || item.stage === 3 || canAnswerSupplement(item, role);
  return item.allowedActions.some((action) =>
    ['ALLOCATE', 'START_REVIEW', 'REVIEW', 'FINAL_REVIEW', 'CONFIRM'].includes(action),
  );
}

type RequestPeriod = 'ALL' | '7' | '30' | '90' | 'CUSTOM';

export interface RequestFilters {
  query: string;
  status: string;
  period: RequestPeriod;
  start: string;
  end: string;
  page: number;
}

export const DEFAULT_REQUEST_FILTERS: RequestFilters = {
  query: '',
  status: 'ALL',
  period: 'ALL',
  start: '',
  end: '',
  page: 1,
};

const PAGE_SIZE = 5;
const FILTERS = [
  ['ALL', '전체'],
  ['MINE', '내가 할 일'],
  ['STAFF', '담당자 확인 중'],
  ['DONE', '서류 확정'],
] as const;

function displayDate(value: string): string {
  const date = localDateKey(value);
  return date ? date.replaceAll('-', '.') : '확인 필요';
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function periodRange(filters: RequestFilters, today: string): [string, string] | null {
  if (filters.period === 'CUSTOM') {
    return filters.start || filters.end
      ? [filters.start || '0000-00-00', filters.end || '9999-12-31']
      : null;
  }
  if (!['7', '30', '90'].includes(filters.period)) return null;
  const start = new Date(`${today}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - Number(filters.period) + 1);
  return [start.toISOString().slice(0, 10), today];
}

/** 원본 목록 구조에 서버의 신청·권한·단계를 연결하고 없는 처리기한은 만들어 내지 않는다. */
export function RequestsView({
  items,
  role,
  preview = false,
  filters,
  onFiltersChange,
  initialQuery = '',
}: {
  items: SecurityRequest[];
  role: Role;
  preview?: boolean;
  initialQuery?: string;
  filters?: RequestFilters;
  onFiltersChange?: Dispatch<SetStateAction<RequestFilters>>;
}) {
  const [local, setLocal] = useState({ ...DEFAULT_REQUEST_FILTERS, query: initialQuery });
  const state = filters ?? local;
  const update = onFiltersChange ?? setLocal;
  const [draft, setDraft] = useState({
    query: state.query,
    period: state.period,
    start: state.start,
    end: state.end,
  });
  const [dateError, setDateError] = useState<{ field: 'start' | 'end'; message: string } | null>(
    null,
  );
  const [today] = useState(() => (preview ? '2026-11-06' : localDateKey(new Date().toISOString())));
  const searchInput = useRef<HTMLInputElement>(null);
  const startInput = useRef<HTMLInputElement>(null);
  const endInput = useRef<HTMLInputElement>(null);
  const change = (patch: Partial<RequestFilters>) =>
    update((current) => ({ ...current, ...patch, page: 1 }));
  const category = (item: SecurityRequest, status: string) =>
    status === 'ALL' ||
    (status === 'MINE' && isMyTurn(item, role)) ||
    (status === 'STAFF' &&
      [2, 4].includes(item.stage) &&
      !['CLOSED', 'WITHDRAWN', 'CONFIRMED'].includes(item.status)) ||
    (status === 'DONE' && item.status === 'CONFIRMED');
  const range = periodRange(state, today);
  const query = state.query.trim().toLowerCase();
  const list = items.filter(
    (item) =>
      category(item, state.status) &&
      `${item.title} ${item.department} ${shortId(item.id)}`.toLowerCase().includes(query) &&
      (!range ||
        (localDateKey(item.createdAt) >= range[0] && localDateKey(item.createdAt) <= range[1])),
  );
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const page = Math.max(1, Math.min(state.page, pages));
  const firstPage = Math.max(1, Math.min(page - 4, pages - 9));
  const lastPage = Math.min(pages, firstPage + 9);
  const pageNumbers = Array.from({ length: lastPage - firstPage + 1 }, (_, i) => firstPage + i);
  const stats = [
    ['MINE', '내가 할 일', 'pencil'],
    ['STAFF', '담당자 확인 중', 'users'],
    ['DONE', '서류 확정', 'check'],
    ['ALL', '전체 신청', 'file'],
  ] as const;
  const filterLabel = FILTERS.find(([value]) => value === state.status)?.[1] ?? '전체';
  const href = (item: SecurityRequest) => {
    if (canAnswerSupplement(item, role)) {
      return preview ? '/design-preview/supplements' : `/requests/${item.id}/supplement`;
    }
    return preview
      ? `/design-preview/${item.status === 'CLOSED' ? 'closed' : item.status === 'WITHDRAWN' ? 'withdrawn' : item.status === 'CONFIRMED' ? 'confirmed' : item.returnItems.some((entry) => entry.status === 'OPEN') ? 'returned' : item.stage === 1 ? 'analysis' : item.stage === 3 ? 'final-review' : item.stage === 4 ? 'submitted' : role === 'INFRA' ? 'infra' : 'security'}`
      : stepPath(item, role);
  };

  const applySearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (draft.period === 'CUSTOM') {
      const invalid =
        !draft.start && !draft.end
          ? { field: 'start' as const, message: '시작일이나 종료일 중 하나 이상을 입력해 주세요.' }
          : draft.start && !validDate(draft.start)
            ? { field: 'start' as const, message: '시작일을 YYYY-MM-DD 형식으로 입력해 주세요.' }
            : draft.end && !validDate(draft.end)
              ? { field: 'end' as const, message: '종료일을 YYYY-MM-DD 형식으로 입력해 주세요.' }
              : draft.start && draft.end && draft.start > draft.end
                ? {
                    field: 'end' as const,
                    message: '시작일이 종료일보다 늦습니다. 날짜 순서를 확인해 주세요.',
                  }
                : null;
      if (invalid) {
        setDateError(invalid);
        (invalid.field === 'start' ? startInput : endInput).current?.focus();
        return;
      }
    }
    setDateError(null);
    change(draft);
  };

  const selectPeriod = (period: RequestPeriod) => {
    const next = { ...draft, period, start: '', end: '' };
    setDraft(next);
    setDateError(null);
    if (period !== 'CUSTOM') change(next);
  };

  const resetFilters = () => {
    update({ ...DEFAULT_REQUEST_FILTERS });
    setDraft({ query: '', period: 'ALL', start: '', end: '' });
    setDateError(null);
    searchInput.current?.focus();
  };

  const goToPage = (next: number) => update((current) => ({ ...current, page: next }));

  return (
    <div className="requests-view">
      <Heading title={role === 'APPLICANT' || role === 'ADMIN' ? '신청 현황' : '협의 요청함'}>
        {role === 'APPLICANT' && (
          <Link
            className="btn btn-primary"
            href={preview ? '/design-preview/new-request' : '/requests/new'}
          >
            새 신청 시작
          </Link>
        )}
      </Heading>
      <section aria-labelledby="sum-h">
        <h2 id="sum-h" className="sr-only">
          요약
        </h2>
        <div className="stats">
          {stats.map(([value, label, icon]) => (
            <button
              key={value}
              type="button"
              className="stat"
              aria-pressed={state.status === value}
              onClick={() => change({ status: value })}
            >
              <span className="stat-top">
                <span>{label}</span>
                <Icon name={icon} />
              </span>
              <span className="stat-num">
                {items.filter((item) => category(item, value)).length}
                <small>건</small>
              </span>
            </button>
          ))}
        </div>
      </section>
      <section aria-labelledby="list-h">
        <div className="sec-head">
          <h2 className="h-sec" id="list-h">
            신청 내역<span className="count">{items.length}</span>
          </h2>
          <ul className="st-legend" aria-label="4단계 진행 절차">
            {STAGES.map((label, index) => (
              <li key={label}>
                <i style={{ background: `var(--st${index + 1})` }} aria-hidden="true" />
                {index + 1}. {label}
              </li>
            ))}
          </ul>
        </div>
        <div className="toolbar">
          <div className="pills" role="group" aria-label="상태로 거르기">
            {FILTERS.map(([value, label]) => (
              <button
                type="button"
                key={value}
                className="pill"
                aria-pressed={state.status === value}
                onClick={() => change({ status: value })}
              >
                {label}
              </button>
            ))}
          </div>
          <form
            className="dfilter"
            role="search"
            aria-label="신청 내역 검색"
            onSubmit={applySearch}
          >
            <div className="per">
              <label htmlFor="request-period">접수 기간</label>
              <select
                id="request-period"
                className="input"
                value={draft.period}
                onChange={(event) => selectPeriod(event.target.value as RequestPeriod)}
              >
                <option value="ALL">전체 기간</option>
                <option value="7">최근 1주</option>
                <option value="30">최근 1개월</option>
                <option value="90">최근 3개월</option>
                <option value="CUSTOM">직접 입력</option>
              </select>
            </div>
            <div className="pdates" hidden={draft.period !== 'CUSTOM'}>
              <label htmlFor="request-period-start">시작일</label>
              <input
                ref={startInput}
                id="request-period-start"
                className="input"
                type="date"
                value={draft.start}
                max={today}
                aria-describedby={dateError ? 'pf-e' : undefined}
                aria-invalid={dateError?.field === 'start' || undefined}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, start: event.target.value }))
                }
              />
              <span aria-hidden="true">~</span>
              <label htmlFor="request-period-end">종료일</label>
              <input
                ref={endInput}
                id="request-period-end"
                className="input"
                type="date"
                value={draft.end}
                max={today}
                aria-describedby={dateError ? 'pf-e' : undefined}
                aria-invalid={dateError?.field === 'end' || undefined}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, end: event.target.value }))
                }
              />
            </div>
            <div className="search">
              <label className="sr-only" htmlFor="request-search">
                프로젝트명·부서 검색
              </label>
              <input
                ref={searchInput}
                id="request-search"
                className="input"
                type="search"
                placeholder="프로젝트명·부서 검색"
                value={draft.query}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, query: event.target.value }))
                }
              />
              <button type="submit" className="sbtn" aria-label="검색">
                <Icon name="search" />
              </button>
            </div>
          </form>
        </div>
        {dateError && (
          <p className="ferr" id="pf-e" role="alert">
            {dateError.message}
          </p>
        )}
        <p className="filter-state" role="status">
          {filterLabel}
          {query && `, 검색어 “${state.query.trim()}”`}
          {range &&
            `, 접수 기간 ${range[0] === '0000-00-00' ? '처음' : range[0].replaceAll('-', '.')} ~ ${range[1] === '9999-12-31' ? '오늘' : range[1].replaceAll('-', '.')}`}{' '}
          결과 {list.length}건{pages > 1 && `, ${page} / ${pages}페이지`}
          {(state.status !== 'ALL' || query || range) && (
            <button type="button" className="btn btn-tertiary btn-sm" onClick={resetFilters}>
              조건 초기화
            </button>
          )}
        </p>
        {list.length ? (
          <>
            <div className="tbl-wrap">
              <table className="tbl">
                <caption className="sr-only">신청 내역 목록</caption>
                <thead>
                  <tr>
                    <th scope="col">신청번호·프로젝트명</th>
                    <th scope="col">진행 단계</th>
                    <th scope="col">다음 할 일</th>
                    <th scope="col">처리 기한</th>
                    <th scope="col">상태</th>
                    <th scope="col">처리</th>
                  </tr>
                </thead>
                <tbody>
                  {list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div className="p-id">{shortId(item.id)}</div>
                        <div className="p-name">
                          <Link href={href(item)}>{item.title}</Link>
                        </div>
                        <div className="p-meta">
                          {item.department}, 접수 {displayDate(item.createdAt)}, 설정 v
                          {item.policyVersion}
                        </div>
                      </td>
                      <td>
                        <StageBars item={item} />
                      </td>
                      <td>{nextTask(item, role)}</td>
                      <td>
                        {['DRAFT', 'CLOSED', 'WITHDRAWN', 'CONFIRMED'].includes(item.status) ? (
                          <span className="help">미설정</span>
                        ) : (
                          <>
                            <span className="badge b-neutral">확인 필요</span>
                            <div className="p-meta">기한 미설정</div>
                          </>
                        )}
                      </td>
                      <td>
                        <span className={`badge ${LIST_BADGE_CLASSES[badgeTone(item)]}`}>
                          {statusLabel(item)}
                        </span>
                      </td>
                      <td>
                        <Link
                          className="link-more"
                          href={href(item)}
                          aria-label={`${item.title} 상세 보기`}
                        >
                          <Icon name="chevron-right" />
                          <span>상세 보기</span>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pages > 1 && (
              <nav className="pager" aria-label="신청 내역 페이지">
                <button
                  type="button"
                  aria-label="처음 페이지"
                  disabled={page === 1}
                  onClick={() => goToPage(1)}
                >
                  «
                </button>
                <button
                  type="button"
                  aria-label="이전 페이지"
                  disabled={page === 1}
                  onClick={() => goToPage(page - 1)}
                >
                  ‹ 이전
                </button>
                {pageNumbers.map((number) => (
                  <button
                    type="button"
                    key={number}
                    aria-label={`${number}페이지`}
                    aria-current={page === number ? 'page' : undefined}
                    onClick={() => goToPage(number)}
                  >
                    {number}
                  </button>
                ))}
                <button
                  type="button"
                  aria-label="다음 페이지"
                  disabled={page === pages}
                  onClick={() => goToPage(page + 1)}
                >
                  다음 ›
                </button>
                <button
                  type="button"
                  aria-label="마지막 페이지"
                  disabled={page === pages}
                  onClick={() => goToPage(pages)}
                >
                  »
                </button>
              </nav>
            )}
          </>
        ) : (
          <div className="empty-box">
            {query
              ? '검색 결과가 없습니다. 검색어를 바꾸거나 조건을 초기화해 주세요.'
              : '이 조건에 해당하는 신청이 없습니다.'}
          </div>
        )}
      </section>
    </div>
  );
}

/** 홈과 신청 현황은 최신 디자인의 같은 업무 대시보드를 사용한다. */
export function WorkspaceView({
  items,
  role,
  preview = false,
}: {
  items: SecurityRequest[];
  role: Role;
  institutionName: string;
  preview?: boolean;
}) {
  return <RequestsView items={items} role={role} preview={preview} />;
}
