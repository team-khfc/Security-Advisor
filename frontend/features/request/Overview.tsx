'use client';
import { useState, type Dispatch, type SetStateAction } from 'react';
import Link from 'next/link';
import type { SecurityRequest } from './types';
import type { Role } from '@/lib/sharedTypes';
import {
  documentLabel,
  formatDate,
  localDateKey,
  shortId,
  statusLabel,
  stepPath,
} from '@/lib/format';
import { Heading, Badge, Icon, Empty } from '@/components/ui';

export const STAGES = ['작성', '담당자 협의', '사용자 최종 검토', '확정·관리'];
/** 반환과 종결을 정상 완료와 구분하여 상태를 문구로 표시한다. */
export function RequestBadge({ item }: { item: SecurityRequest }) {
  const label = statusLabel(item);
  return (
    <Badge
      tone={
        item.status === 'CLOSED'
          ? 'red'
          : item.status === 'WITHDRAWN' || item.status === 'DRAFT'
            ? 'gray'
            : item.status === 'CONFIRMED'
              ? 'green'
              : label.includes('보완')
                ? 'amber'
                : 'blue'
      }
    >
      {label}
    </Badge>
  );
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
/** 4단계 막대와 숫자를 함께 표시해 색상만으로 진행 상태를 전달하지 않는다. */
export function StageBars({ item }: { item: SecurityRequest }) {
  return (
    <div
      className={`stage-bars ${['CLOSED', 'WITHDRAWN'].includes(item.status) ? 'terminal' : ''}`}
    >
      <span>
        {item.stage}단계 / 4단계{item.status === 'CONFIRMED' ? ' 완료' : ''}
      </span>
      <div aria-hidden="true">
        {STAGES.map((label, index) => (
          <i key={label} className={index < item.stage ? `on stage-${index + 1}` : ''} />
        ))}
      </div>
      <small>{STAGES[item.stage - 1]}</small>
    </div>
  );
}
/** 계정별 다음 작업을 안내하며 서버가 허용하지 않은 변경을 실행하지 않는다. */
export function nextTask(item: SecurityRequest, role: Role): string {
  if (item.status === 'CLOSED' || item.status === 'WITHDRAWN') return '사유와 이력 확인 · 읽기전용';
  if (item.status === 'CONFIRMED') return '확정 문서 확인 · 장비 적용 별도';
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
    return (
      item.stage === 1 ||
      item.stage === 3 ||
      item.supplements.some((entry) => entry.status === 'OPEN')
    );
  return item.allowedActions.some((action) =>
    ['ALLOCATE', 'START_REVIEW', 'REVIEW', 'FINAL_REVIEW', 'CONFIRM'].includes(action),
  );
}
export interface RequestFilters {
  query: string;
  status: string;
  review: string;
  start: string;
  end: string;
  size: number;
  page: number;
  ascending: boolean;
}
export const DEFAULT_REQUEST_FILTERS: RequestFilters = {
  query: '',
  status: 'ALL',
  review: 'ALL',
  start: '',
  end: '',
  size: 6,
  page: 1,
  ascending: false,
};
/** 검색·기간·상태 필터를 유지하고 모든 행에서 진행 단계와 다음 작업을 안내한다. */
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
  const change = (patch: Partial<RequestFilters>) =>
    update((current) => ({ ...current, ...patch, page: 1 }));
  const category = (item: SecurityRequest, status: string) =>
    status === 'ALL' ||
    (status === 'MINE' && isMyTurn(item, role)) ||
    (status === 'STAFF' &&
      [2, 4].includes(item.stage) &&
      !['CLOSED', 'WITHDRAWN', 'CONFIRMED'].includes(item.status)) ||
    (status === 'DONE' && item.status === 'CONFIRMED') ||
    (status === 'RETURNED' && item.returnItems.some((entry) => entry.status === 'OPEN')) ||
    item.status === status;
  const list = items
    .filter(
      (item) =>
        category(item, state.status) &&
        `${item.title} ${item.department} ${item.ownerName} ${shortId(item.id)}`
          .toLowerCase()
          .includes(state.query.toLowerCase()) &&
        (!state.start || localDateKey(item.createdAt) >= state.start) &&
        (!state.end || localDateKey(item.createdAt) <= state.end) &&
        (state.review === 'ALL' || String(item.stage) === state.review),
    )
    .sort((a, b) =>
      state.ascending
        ? a.updatedAt.localeCompare(b.updatedAt)
        : b.updatedAt.localeCompare(a.updatedAt),
    );
  const pages = Math.max(1, Math.ceil(list.length / state.size));
  const page = Math.min(state.page, pages);
  const stats = [
    ['MINE', '내가 할 일', 'file'],
    ['STAFF', '담당자 확인 중', 'clock'],
    ['DONE', '서류 확정', 'check'],
    ['ALL', '전체 신청', 'list'],
  ] as const;
  const href = (item: SecurityRequest) =>
    preview
      ? `/design-preview/${item.status === 'CLOSED' ? 'closed' : item.status === 'WITHDRAWN' ? 'withdrawn' : item.returnItems.some((entry) => entry.status === 'OPEN') ? 'returned' : item.stage === 1 ? 'analysis' : item.stage === 3 ? 'final-review' : item.stage === 4 ? 'submitted' : role === 'INFRA' ? 'infra' : 'security'}`
      : stepPath(item, role);
  return (
    <>
      <Heading
        title={role === 'APPLICANT' ? '신청 현황' : '협의 요청함'}
        description={
          role === 'APPLICANT'
            ? '신청한 사업의 진행 단계와 다음에 할 일을 확인하세요.'
            : '담당 분야의 협의 요청과 최종 확인이 필요한 신청을 확인하세요.'
        }
      >
        {role === 'APPLICANT' && (
          <Link
            className="button primary"
            href={preview ? '/design-preview/new-request' : '/requests/new'}
          >
            <Icon name="plus" />새 신청 시작
          </Link>
        )}
      </Heading>
      <section className="stat-grid dashboard-stats" aria-label="신청 요약">
        {stats.map(([value, label, icon]) => (
          <button
            key={value}
            type="button"
            className={`stat-card ${state.status === value ? 'selected' : ''}`}
            aria-pressed={state.status === value}
            onClick={() => change({ status: value })}
          >
            <div className="row-between">
              <span>{label}</span>
              <Icon name={icon} />
            </div>
            <strong>
              {items.filter((item) => category(item, value)).length}
              <small>건</small>
            </strong>
          </button>
        ))}
      </section>
      <section aria-labelledby="requests-heading">
        <div className="request-section-head">
          <h2 id="requests-heading">
            신청 내역 <span>{items.length}</span>
          </h2>
          <ol className="stage-legend" aria-label="4단계 절차">
            {STAGES.map((label, index) => (
              <li key={label}>
                <i className={`stage-${index + 1}`} aria-hidden="true" />
                {index + 1}. {label}
              </li>
            ))}
          </ol>
        </div>
        <div className="request-toolbar">
          <div className="filter-pills" aria-label="신청 상태 필터">
            {[
              ['ALL', '전체'],
              ['MINE', '내가 할 일'],
              ['STAFF', '담당자 확인 중'],
              ['RETURNED', '반환·보완'],
              ['DONE', '확정'],
            ].map(([value, label]) => (
              <button
                type="button"
                key={value}
                aria-pressed={state.status === value}
                onClick={() => change({ status: value })}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="request-search">
            <Icon name="search" />
            <label className="sr-only" htmlFor="request-search">
              프로젝트명·부서·신청번호 검색
            </label>
            <input
              id="request-search"
              type="search"
              placeholder="프로젝트명·부서 검색"
              value={state.query}
              onChange={(event) => change({ query: event.target.value })}
            />
          </div>
        </div>
        <details className="advanced-filters">
          <summary>단계·상태·기간으로 상세 검색</summary>
          <div className="filter-grid">
            <label>
              진행 단계
              <select
                value={state.review}
                onChange={(event) => change({ review: event.target.value })}
              >
                <option value="ALL">전체 단계</option>
                {STAGES.map((label, index) => (
                  <option value={index + 1} key={label}>
                    {index + 1}. {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              종결·철회 포함 상태
              <select
                value={state.status}
                onChange={(event) => change({ status: event.target.value })}
              >
                {[
                  ['ALL', '전체 상태'],
                  ['MINE', '내가 할 일'],
                  ['STAFF', '담당자 확인 중'],
                  ['RETURNED', '반환·보완'],
                  ['DONE', '서류 확정'],
                  ['DRAFT', '작성 중'],
                  ['COLLABORATING', '담당자 협의'],
                  ['FINAL_REVIEW', '사용자 최종 검토'],
                  ['SUBMITTED', '양측 최종 확인'],
                  ['CLOSED', '종결(반려)'],
                  ['WITHDRAWN', '철회'],
                ].map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              신청 시작일
              <input
                type="date"
                value={state.start}
                onChange={(event) => change({ start: event.target.value })}
              />
            </label>
            <label>
              신청 종료일
              <input
                type="date"
                min={state.start}
                value={state.end}
                onChange={(event) => change({ end: event.target.value })}
              />
            </label>
          </div>
        </details>
        <div className="table-toolbar">
          <p role="status">
            검색 결과 <strong>{list.length}</strong>건{state.query && ` · “${state.query}”`}
          </p>
          <div className="inline-actions">
            <button
              className="text-button"
              type="button"
              onClick={() => update({ ...DEFAULT_REQUEST_FILTERS })}
            >
              조건 초기화
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => change({ ascending: !state.ascending })}
            >
              {state.ascending ? '오래된 수정순' : '최근 수정순'}
              <Icon name="down" width={16} />
            </button>
          </div>
        </div>
        {list.length ? (
          <div className="table-scroll request-table">
            <table className="sf-table">
              <caption className="sr-only">신청 내역, 진행 단계와 다음 작업, 상태</caption>
              <thead>
                <tr>
                  <th scope="col">신청번호·프로젝트명</th>
                  <th scope="col">진행 단계</th>
                  <th scope="col">다음 할 일</th>
                  <th scope="col">최근 변경</th>
                  <th scope="col">상태</th>
                  <th scope="col">처리</th>
                </tr>
              </thead>
              <tbody>
                {list.slice((page - 1) * state.size, page * state.size).map((item) => (
                  <tr key={item.id}>
                    <td>
                      <small>{shortId(item.id)}</small>
                      <Link href={href(item)} className="case-title">
                        {item.title}
                      </Link>
                      <small>
                        {item.department} · {documentLabel(item.documentType)} · 설정 v
                        {item.policyVersion}
                      </small>
                    </td>
                    <td>
                      <StageBars item={item} />
                    </td>
                    <td className="next-task">{nextTask(item, role)}</td>
                    <td>
                      {formatDate(item.updatedAt)}
                      <small>수정본 v{item.revision}</small>
                    </td>
                    <td>
                      <RequestBadge item={item} />
                    </td>
                    <td>
                      <Link
                        className="row-link"
                        href={href(item)}
                        aria-label={`${item.title} 상세 보기`}
                      >
                        상세 보기
                        <Icon name="arrow" width={16} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="검색 결과가 없습니다"
            description="검색어나 단계·상태·기간을 바꾸어 다시 확인해 주세요."
          />
        )}
        <div className="pagination">
          <label>
            페이지당{' '}
            <select
              value={state.size}
              onChange={(event) => change({ size: Number(event.target.value) })}
            >
              <option value={6}>6건</option>
              <option value={12}>12건</option>
            </select>
          </label>
          <nav aria-label="신청 목록 페이지">
            <button
              type="button"
              disabled={page === 1}
              aria-label="이전 페이지"
              onClick={() => update((current) => ({ ...current, page: page - 1 }))}
            >
              <Icon name="back" />
            </button>
            {Array.from({ length: pages }, (_, index) => (
              <button
                type="button"
                key={index}
                aria-current={page === index + 1 ? 'page' : undefined}
                className={page === index + 1 ? 'selected' : ''}
                onClick={() => update((current) => ({ ...current, page: index + 1 }))}
              >
                {index + 1}
              </button>
            ))}
            <button
              type="button"
              disabled={page === pages}
              aria-label="다음 페이지"
              onClick={() => update((current) => ({ ...current, page: page + 1 }))}
            >
              <Icon name="arrow" />
            </button>
          </nav>
        </div>
      </section>
      <p className="list-bottom-note">
        <Icon name="info" width={18} /> 할당 완료 ≠ 협의 완료 · 서류 확정 ≠ 방화벽 적용
      </p>
    </>
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
