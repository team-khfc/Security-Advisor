'use client';
import type { ReactNode } from 'react';
import Link from 'next/link';
import type { SecurityRequest } from './types';
import { documentLabel, formatDate, shortId } from '@/lib/format';
import { Badge, Heading, Notice, Icon, Stepper } from '@/components/ui';
import { EvidenceList } from './AnswerEditor';
import { RequestBadge } from './Overview';
import { DocumentPanel } from '@/features/document';
import { ReturnNotice, TerminalNotice } from '@/features/review';
/** 출처·협의 이력과 담당자 검토를 지정 시안의 두 열로 나누되 모바일에서는 순서대로 읽게 한다. */
export function DetailView({
  procedure,
  step,
  aside,
  children,
  preview = false,
}: {
  procedure: SecurityRequest;
  step: string;
  aside: ReactNode;
  children?: ReactNode;
  preview?: boolean;
}) {
  const current = procedure.stage - 1;
  return (
    <>
      <div className="breadcrumb">
        <Link href={preview ? '/design-preview/requests' : '/requests'}>목록으로</Link>
        <span>/</span>
        <span>협의 상세</span>
      </div>
      <Heading
        title={procedure.title}
        description={`${shortId(procedure.id)} · ${procedure.department} · ${procedure.ownerName}`}
      >
        <Link className="button" href={preview ? '/design-preview/requests' : '/requests'}>
          <Icon name="back" />
          목록으로
        </Link>
      </Heading>
      <div className="detail-meta">
        <RequestBadge item={procedure} />
        <span>기관 설정 v{procedure.policyVersion}</span>
        <span>ICT인프라 할당 → 정보보안 검토 · 양측 협의 필수</span>
        <span className="right">신청 수정본 v{procedure.revision}</span>
      </div>
      <Stepper
        current={current}
        detail
        returned={procedure.returnItems.some((item) => item.status === 'OPEN')}
      />
      <TerminalNotice procedure={procedure} />
      <ReturnNotice procedure={procedure} />
      {!preview && (
        <nav className="subnavigation" aria-label="협의 상세 보기">
          {[
            ['summary', '신청 요약'],
            ['questions', 'AI 인터뷰·답변'],
            ['infra', 'ICT인프라'],
            ['security', '정보보안'],
            ['supplement', '반환·보완'],
            ['submit', '최종 검토'],
            ['receipt', '확정·관리'],
          ].map(([key, label]) => (
            <Link
              key={key}
              href={`/requests/${procedure.id}/${key}`}
              aria-current={step === key ? 'page' : undefined}
            >
              {label}
            </Link>
          ))}
        </nav>
      )}
      <div className="detail-grid">
        <div className="detail-main">
          <section className="sf-panel">
            <div className="panel-heading">
              <h2>사업 개요</h2>
              <Badge>신청자 작성</Badge>
            </div>
            <p className="summary-text readonly-value">{procedure.description}</p>
            <dl className="inline-facts">
              <div>
                <dt>이용 대상</dt>
                <dd>
                  {procedure.answers.find((answer) => answer.key === 'audience')?.value ||
                    '담당자 확인 필요'}
                </dd>
              </div>
              <div>
                <dt>요청 문서</dt>
                <dd>{documentLabel(procedure.documentType)}</dd>
              </div>
              <div>
                <dt>실제 처리</dt>
                <dd>이 서비스에서 적용하지 않음</dd>
              </div>
            </dl>
          </section>
          {children}
          <section className="sf-panel">
            <div className="panel-heading">
              <h2>수집 정보와 원문 근거</h2>
              <span className="muted">
                {
                  procedure.answers.filter(
                    (answer) => !['CONFIRMED', 'NOT_APPLICABLE'].includes(answer.status),
                  ).length
                }
                개 확인 필요
              </span>
            </div>
            <Notice>AI 제안은 검토할 정보 후보입니다. 담당자가 실제 근거를 확인해야 합니다.</Notice>
            <EvidenceList answers={procedure.answers} returnItems={procedure.returnItems} />
          </section>
          <DocumentPanel procedure={procedure} preview={preview} />
          <section className="sf-panel">
            <div className="panel-heading">
              <h2>협의 이력</h2>
              <Icon name="clock" />
            </div>
            <ol className="timeline">
              {procedure.timeline.map((event) => (
                <li key={event.id}>
                  <span className="timeline-dot" />
                  <div>
                    <p>{event.description}</p>
                    <small>
                      {event.actorName} · {formatDate(event.at, true)}
                    </small>
                  </div>
                </li>
              ))}
            </ol>
            {!procedure.timeline.length && <p className="muted">기록된 협의 이력이 없습니다.</p>}
          </section>
        </div>
        <aside className="review-aside">
          {aside}
          <div className="aside-guidance">
            <Icon name="shield" />
            <p>
              검토 기록과 제출본은 기관 설정 버전과 함께 관리합니다. 검토 완료와 실제 처리 완료를
              구분합니다.
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
