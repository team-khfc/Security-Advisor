'use client';
import { ListPager } from '@/components/ui';

import Link from 'next/link';
import { useState } from 'react';
import {
  Badge,
  EmptyState,
  ErrorState,
  Icon,
  LoadingState,
  Notice,
  PageHeading,
} from '@/components/ui';
import { useSession } from '@/features/auth';
import { DOCUMENT_LABELS, FIELD_LABELS, STATUS_LABELS } from './types';
import { useRequests } from './useRequests';

/** 보완 답변은 신청 상세의 한 입력 영역으로 모아 중복 수정을 피한다. */
export function SupplementList() {
  const [page, setPage] = useState(0);
  const [state, setState] = useState('pending');
  const [search, setSearch] = useState('');
  const query = useRequests(true, { page, size: 20, supplementState: state, query: search });
  if (query.isPending) return <LoadingState />;
  if (query.error)
    return (
      <ErrorState
        error={query.error}
        onRetry={() => {
          void query.refetch();
        }}
      />
    );
  const items = (query.data ?? []).flatMap((request) =>
    request.supplements.map((supplement) => ({ request, supplement })),
  );
  const open = items.filter(({ supplement }) => supplement.status !== 'RESOLVED');
  const resolved = items.filter(({ supplement }) => supplement.status === 'RESOLVED');
  const openRequests = [...new Set(open.map(({ request }) => request))];
  return (
    <>
      <PageHeading title="보완 요청" />
      <div className="toolbar">
        <label htmlFor="supplement-state">확인 상태</label>
        <select
          id="supplement-state"
          className="input"
          value={state}
          onChange={(event) => {
            setState(event.target.value);
            setPage(0);
          }}
        >
          <option value="pending">답변·확인 필요</option>
          <option value="resolved">확인 완료</option>
          <option value="any">전체</option>
        </select>
        <label htmlFor="supplement-search">사업명·신청번호 검색</label>
        <input
          id="supplement-search"
          className="input"
          type="search"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(0);
          }}
        />
      </div>
      <ListPager
        page={page}
        size={20}
        total={query.pagination?.totalElements ?? 0}
        onChange={setPage}
        label="보완 요청 페이지"
      />
      <p className="help">
        보완 요청이 있는 신청을 페이지별로 표시합니다. 아래 건수는 현재 페이지 기준입니다.
      </p>
      <section aria-labelledby="supplement-open-heading">
        <div className="sec-head sec-head-first">
          <h2 className="h-sec" id="supplement-open-heading">
            답변·확인이 필요한 요청<span className="count">{open.length}</span>
          </h2>
        </div>
        {!open.length ? (
          <EmptyState
            title="대기 중인 보완 요청이 없습니다"
            description="담당자가 추가 확인을 요청하면 이곳에서 확인할 수 있습니다."
            action={
              <Link className="btn" href="/requests">
                신청 현황 보기
              </Link>
            }
          />
        ) : (
          openRequests.map((request) => (
            <article className="card" key={request.id}>
              <div className="card-h">
                <div>
                  <span className="p-id">
                    {request.id} · {DOCUMENT_LABELS[request.docType] ?? request.docType}
                  </span>
                  <h3 className="h-panel">
                    <Link className="plain" href={`/requests/${request.id}`}>
                      {request.caseTitle}
                    </Link>
                  </h3>
                </div>
                <Badge tone="warning">{STATUS_LABELS[request.status]}</Badge>
              </div>
              {open
                .filter((item) => item.request === request)
                .map(({ supplement }) => (
                  <div className="supp" key={supplement.id}>
                    <div className="supp-h">
                      <b>{FIELD_LABELS[supplement.field]} 담당자 요청</b>
                      <Badge tone="warning">
                        {supplement.status === 'OPEN' ? '답변 필요' : '담당자 재검토'}
                      </Badge>
                    </div>
                    <p>{supplement.reason}</p>
                    {supplement.answer && <p className="help">등록한 답변: {supplement.answer}</p>}
                  </div>
                ))}
              <Link
                className={`btn ${open.length === 1 ? 'btn-primary' : ''}`}
                href={`/requests/${request.id}#supplements`}
              >
                신청에서 보완하기 <Icon name="arrowRight" />
              </Link>
            </article>
          ))
        )}
      </section>
      <section aria-labelledby="supplement-done-heading">
        <div className="sec-head">
          <h2 className="h-sec" id="supplement-done-heading">
            확인한 요청
          </h2>
        </div>
        {resolved.length ? (
          <div className="tbl-wrap">
            <table className="tbl">
              <caption className="sr-only">담당자가 확인을 마친 보완 요청</caption>
              <thead>
                <tr>
                  <th scope="col">신청</th>
                  <th scope="col">요청 분야</th>
                  <th scope="col">요청 내용</th>
                  <th scope="col">답변</th>
                  <th scope="col">상태</th>
                </tr>
              </thead>
              <tbody>
                {resolved.map(({ request, supplement }) => (
                  <tr key={supplement.id}>
                    <td>
                      <div className="p-id">{request.id}</div>
                      <Link href={`/requests/${request.id}#supplements`}>{request.caseTitle}</Link>
                    </td>
                    <td>{FIELD_LABELS[supplement.field]}</td>
                    <td>{supplement.reason}</td>
                    <td>{supplement.answer ?? '-'}</td>
                    <td>
                      <Badge tone="success">확인 완료</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-box">아직 확인을 마친 보완 요청이 없습니다.</div>
        )}
      </section>
    </>
  );
}

/**
 * 통신 정보 표의 칸별 필드. 빈 값은 같은 경고를 반복하지 않고 어떤 값이 없는지 이름으로 알린다.
 * group은 출발지·목적지처럼 같은 이름의 빈 값을 구별하는 화면 낭독기용 앞말이다.
 */
const NETWORK_FIELDS = [
  { key: 'sourceSystem', group: '출발지', missing: '시스템명 미입력' },
  { key: 'sourceIp', group: '출발지', missing: 'IP 미입력' },
  { key: 'destinationSystem', group: '목적지', missing: '시스템명 미입력' },
  { key: 'destinationIp', group: '목적지', missing: 'IP 미입력' },
  { key: 'protocol', group: '', missing: '통신 방식 미입력' },
  { key: 'port', group: '', missing: '포트 미입력' },
] as const;
type NetworkFieldKey = (typeof NETWORK_FIELDS)[number]['key'];

/**
 * 표시 전용 미입력 판정. domain.ts의 답변 완료 기준(미해당이거나 `value.trim()`이 있음)과 같다.
 * 저장값은 바꾸지 않으며, 확인(confirmed) 여부는 미입력과 별개라 여기서 보지 않는다.
 */
function isMissing(answer: { value: string; notApplicable: boolean } | undefined): boolean {
  return !answer || (!answer.notApplicable && !answer.value.trim());
}

/** 기재된 통신 사실만 보여 주며 변경은 배정된 신청 상세에서 처리한다. */
export function NetworkList() {
  const [page, setPage] = useState(0);
  const session = useSession();
  const [search, setSearch] = useState('');
  const query = useRequests(true, { page, size: 20, query: search });
  if (query.isPending || session.isPending) return <LoadingState />;
  if (query.error) return <ErrorState error={query.error} />;
  if (session.data?.member.role !== 'INFRA')
    return (
      <Notice tone="warning">
        ICT인프라 담당자 메뉴입니다. 신청 상세에서 허용된 정보만 확인할 수 있습니다.
      </Notice>
    );
  const rows = query.pagination
    ? (query.data ?? [])
    : (query.data ?? []).filter((request) => request.caseTitle.includes(search));
  return (
    <>
      <PageHeading title="통신 정보" />
      <ListPager
        page={page}
        size={20}
        total={query.pagination?.totalElements ?? 0}
        onChange={setPage}
        label="통신 정보 페이지"
      />
      <div className="toolbar">
        <label className="sr-only" htmlFor="network-search">
          사업명 검색
        </label>
        <input
          id="network-search"
          className="input"
          placeholder="사업명 검색"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
        />
      </div>
      <p className="filter-state" role="status">
        신청 {query.pagination?.totalElements ?? rows.length}건
      </p>
      {rows.length > 0 && (
        <div
          className="tbl-wrap"
          tabIndex={0}
          role="region"
          aria-label="통신 정보 표, 가로 스크롤 가능"
        >
          <table className="tbl rows-link network-table">
            <caption className="sr-only">
              신청별 통신 정보. 사업명 링크를 선택하면 신청 상세로 이동합니다.
            </caption>
            <colgroup>
              <col style={{ width: '26%' }} />
              <col style={{ width: '20%' }} />
              <col style={{ width: '20%' }} />
              <col style={{ width: '18%' }} />
              <col style={{ width: '16%' }} />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">사업명</th>
                <th scope="col">출발지</th>
                <th scope="col">목적지</th>
                <th scope="col">통신 방식·포트</th>
                <th scope="col">할당 상태</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((request) => {
                const answerOf = (key: string) =>
                  request.commonAnswers.find((item) => item.key === key);
                const missingCount = NETWORK_FIELDS.filter((field) =>
                  isMissing(answerOf(field.key)),
                ).length;
                const cell = (key: NetworkFieldKey) => {
                  const field = NETWORK_FIELDS.find((item) => item.key === key)!;
                  const answer = answerOf(key);
                  if (answer && !isMissing(answer))
                    return <div>{answer.notApplicable ? '미해당' : answer.value}</div>;
                  return (
                    <div>
                      <Badge tone="warning">
                        {field.group && <span className="sr-only">{field.group} </span>}
                        {field.missing}
                      </Badge>
                    </div>
                  );
                };
                const allocated = request.reviews.some(
                  (review) => review.field === 'INFRA' && review.allocationCompleted,
                );
                return (
                  <tr key={request.id}>
                    <td>
                      <div className="p-id">
                        {request.id} · {DOCUMENT_LABELS[request.docType] ?? request.docType}
                      </div>
                      <div className="p-name">
                        <Link href={`/requests/${request.id}`}>{request.caseTitle}</Link>
                      </div>
                    </td>
                    <td>
                      {cell('sourceSystem')}
                      {cell('sourceIp')}
                    </td>
                    <td>
                      {cell('destinationSystem')}
                      {cell('destinationIp')}
                    </td>
                    <td>
                      {cell('protocol')}
                      {cell('port')}
                    </td>
                    <td>
                      <Badge tone={allocated ? 'info' : 'neutral'}>
                        {allocated ? '할당 완료' : '할당 대기'}
                      </Badge>
                      <span className="turn">{STATUS_LABELS[request.status]}</span>
                      {missingCount > 0 && (
                        <span className="network-missing">
                          <strong>담당자 확인 필요</strong> <span>· 미입력 {missingCount}개</span>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {!rows.length && <EmptyState title="검색 결과가 없습니다" />}
    </>
  );
}
