'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useSession } from '@/features/auth';
import { useRequests } from './useRequests';
import type { SecurityRequest } from './types';
import { NetworkTable } from './Network';
import { RequestBadge } from './Overview';
import { DocumentPanel } from '@/features/document';
import { Heading, Badge, Empty, ErrorNotice, Loading, Notice } from '@/components/ui';
import { formatDate, shortId, stepPath } from '@/lib/format';
import type { Role } from '@/lib/sharedTypes';
type Register = 'documents' | 'network' | 'history' | 'supplements';
const titles = {
  documents: '문서함',
  network: '통신 목록',
  history: '변경 이력',
  supplements: '보완 요청',
};
/** 별도 목록에서도 같은 기관·사용자 조회 범위의 신청만 사용한다. */
export function RegisterPage({ kind }: { kind: Register }) {
  const { user } = useSession();
  const query = useRequests(user.role !== 'ADMIN');
  if (user.role === 'ADMIN')
    return <Notice>신청 내용은 업무 담당자 계정으로 확인해 주세요.</Notice>;
  if (query.isPending) return <Loading />;
  if (query.error) return <ErrorNotice error={query.error} retry={() => void query.refetch()} />;
  return <RegisterView kind={kind} items={query.data} role={user.role} />;
}
/** 문서·통신·보완·이력을 검색 가능하게 보여 주며 미지원 장비 작업을 실행한 것처럼 표시하지 않는다. */
export function RegisterView({
  kind,
  items,
  role,
  preview = false,
}: {
  kind: Register;
  items: SecurityRequest[];
  role: Role;
  preview?: boolean;
}) {
  const [search, setSearch] = useState('');
  const [state, setState] = useState('ALL');
  const filtered = items
    .filter(
      (item) =>
        `${item.title} ${item.department} ${shortId(item.id)}`.includes(search) &&
        (state === 'ALL' || item.status === state),
    )
    .filter((item) =>
      kind === 'network'
        ? item.rules.length > 0
        : kind === 'supplements'
          ? item.supplements.length > 0 || item.returnItems.length > 0
          : true,
    );
  const href = (item: SecurityRequest) =>
    preview ? '/design-preview/returned' : stepPath(item, role);
  return (
    <>
      <Heading
        title={titles[kind]}
        description={
          kind === 'documents'
            ? '현재 검토 초안과 차수별 제출본을 확인합니다.'
            : kind === 'network'
              ? '담당자가 입력·확인한 통신 정보를 신청별로 확인합니다.'
              : kind === 'history'
                ? '신청의 작성·반환·협의·확정 기록을 시간순으로 확인합니다.'
                : '담당자의 보완 질문과 차수 반환 항목을 확인합니다.'
        }
      />
      {kind === 'network' && (
        <Notice>
          합성 통신 정보입니다. 실제 방화벽 정책 조회·적용·삭제·트래픽 수집은 이 프로토타입에
          연결되지 않았습니다.
        </Notice>
      )}
      {kind === 'documents' && (
        <Notice>
          HTML 초안·제출본과 출처를 제공합니다. 공식 양식 업로드·PDF·DOCX 발급은 아직 연결되지
          않았습니다.
        </Notice>
      )}
      <section className="sf-panel document-search">
        <div className="sf-field">
          <label htmlFor="register-search">프로젝트명·부서·신청번호</label>
          <input
            id="register-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="검색어를 입력하세요"
          />
        </div>
        <div className="sf-field">
          <label htmlFor="register-status">신청 상태</label>
          <select
            id="register-status"
            value={state}
            onChange={(event) => setState(event.target.value)}
          >
            <option value="ALL">전체 상태</option>
            <option value="DRAFT">작성 중</option>
            <option value="COLLABORATING">담당자 협의</option>
            <option value="FINAL_REVIEW">사용자 최종 검토</option>
            <option value="SUBMITTED">양측 최종 확인</option>
            <option value="CONFIRMED">서류 확정</option>
            <option value="CLOSED">종결(반려)</option>
            <option value="WITHDRAWN">철회</option>
          </select>
        </div>
        <button
          className="button"
          type="button"
          onClick={() => {
            setSearch('');
            setState('ALL');
          }}
        >
          조건 초기화
        </button>
      </section>
      <p className="document-count" role="status">
        신청 <strong>{filtered.length}</strong>건
      </p>
      <div className={kind === 'documents' ? 'document-grid' : 'admin-content-stack'}>
        {filtered.map((item) => (
          <section className="sf-panel" key={item.id}>
            <div className="panel-heading">
              <div>
                <Link href={href(item)} className="case-title">
                  {item.title}
                </Link>
                <p className="source-meta">
                  {shortId(item.id)} · {item.department}
                </p>
              </div>
              <RequestBadge item={item} />
            </div>
            {kind === 'documents' ? (
              <DocumentPanel procedure={item} preview={preview} compact />
            ) : kind === 'network' ? (
              <NetworkTable procedure={item} />
            ) : kind === 'history' ? (
              <ol className="timeline">
                {[...item.timeline]
                  .sort((a, b) => b.at.localeCompare(a.at))
                  .map((entry) => (
                    <li key={entry.id}>
                      <span className="timeline-dot" />
                      <div>
                        <p>{entry.description}</p>
                        <small>
                          {entry.actorName} · {formatDate(entry.at, true)}
                        </small>
                      </div>
                    </li>
                  ))}
              </ol>
            ) : (
              <>
                {item.returnItems.map((entry) => (
                  <article
                    className={entry.status === 'OPEN' ? 'returned-field' : 'evidence-item'}
                    key={entry.id}
                  >
                    <div className="row-between">
                      <h3>{entry.label}</h3>
                      <Badge tone={entry.status === 'OPEN' ? 'amber' : 'green'}>
                        {entry.status === 'OPEN' ? '반환 · 보완 필요' : '보완 확인'}
                      </Badge>
                    </div>
                    <p>{entry.reason}</p>
                    <p className="source-meta">
                      {entry.fromStage} → {entry.toStage}단계 · {entry.requestedBy}
                    </p>
                  </article>
                ))}
                {item.supplements.map((entry) => (
                  <article className="evidence-item" key={entry.id}>
                    <Badge tone={entry.status === 'RESOLVED' ? 'green' : 'amber'}>
                      {entry.status === 'RESOLVED'
                        ? '해소 확인'
                        : entry.status === 'ANSWERED'
                          ? '답변 완료 · 담당자 확인 대기'
                          : '답변 필요'}
                    </Badge>
                    <h3>{entry.question}</h3>
                    <p>{entry.answer || '아직 답변하지 않았습니다.'}</p>
                    <p className="source-meta">
                      {entry.requestedBy} · {formatDate(entry.createdAt, true)}
                    </p>
                  </article>
                ))}
                <Link
                  className="text-button"
                  href={preview ? '/design-preview/returned' : `/requests/${item.id}/supplement`}
                >
                  신청에서 보완 내용 확인
                </Link>
              </>
            )}
          </section>
        ))}
      </div>
      {!filtered.length && (
        <Empty
          title="조건에 해당하는 내역이 없습니다"
          description="검색 조건을 바꾸거나 신청 현황에서 진행 중인 업무를 확인하세요."
        />
      )}
    </>
  );
}
