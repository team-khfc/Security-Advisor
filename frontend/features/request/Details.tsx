'use client';
import { Fragment, type ReactNode } from 'react';
import Link from 'next/link';
import type { SecurityRequest } from './types';
import { documentLabel, formatAnswerValue, formatDate, shortId } from '@/lib/format';
import { Badge, Heading, Notice, Icon, Stepper } from '@/components/ui';
import { EvidenceList, SourceEvidence } from './AnswerEditor';
import { NetworkTable } from './Network';
import { RequestBadge } from './Overview';
import { DocumentPanel } from '@/features/document';
import { ReturnNotice, TerminalNotice } from '@/features/review';

/** 원본 시안의 수집 정보 패널에 서버 저장값과 출처·사람 확인을 각각 표시한다. */
export function CollectedInformation({
  procedure,
  children,
}: {
  procedure: SecurityRequest;
  children?: ReactNode;
}) {
  const required = procedure.answers.filter(
    (answer) => answer.ownerRole === 'APPLICANT' && answer.requiredAt !== 'OPTIONAL',
  );
  const confirmed = required.filter(
    (answer) =>
      ['CONFIRMED', 'NOT_APPLICABLE'].includes(answer.status) &&
      answer.source &&
      answer.confirmation,
  ).length;
  return (
    <aside className="infop" aria-labelledby="collected-information-title">
      <div className="infop-h">
        <div className="row">
          <h2 className="h-panel" id="collected-information-title">
            수집된 보안정보
          </h2>
          <span className="help">
            필수정보 {confirmed} / {required.length}
          </span>
        </div>
        <div
          className="prog"
          role="progressbar"
          aria-label="신청자 필수정보 확인"
          aria-valuemin={0}
          aria-valuemax={required.length || 1}
          aria-valuenow={confirmed}
        >
          <i style={{ width: `${required.length ? (confirmed / required.length) * 100 : 0}%` }} />
        </div>
      </div>
      <div className="infop-b">
        <div className="irow namerow">
          <span className="k">사업명</span>
          <strong>{procedure.title}</strong>
        </div>
        {(['APPLICANT', 'INFRA', 'SECURITY'] as const).map((role) => (
          <Fragment key={role}>
            <h3 className="grp">
              {role === 'APPLICANT'
                ? '신청자 작성 정보'
                : role === 'INFRA'
                  ? 'ICT인프라 확인 항목'
                  : '정보보안 확인 항목'}
            </h3>
            {procedure.answers
              .filter((answer) => answer.ownerRole === role)
              .map((answer) => (
                <div className="drow" key={answer.key}>
                  <div className="drow-top">
                    <span className="k">{answer.label}</span>
                    <Badge tone={answer.confirmation ? 'green' : 'amber'}>
                      {answer.confirmation
                        ? '사람 확인'
                        : answer.source?.kind === 'AI_INFERRED'
                          ? 'AI 제안 · 미확정'
                          : '확인 필요'}
                    </Badge>
                  </div>
                  <p className="drow-v readonly-value">
                    {formatAnswerValue(answer.key, answer.value)}
                  </p>
                  <SourceEvidence answer={answer} />
                </div>
              ))}
          </Fragment>
        ))}
      </div>
      {children && <div className="infop-f">{children}</div>}
    </aside>
  );
}
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
  const summaryFields = [
    ['purpose', '사업 목적'],
    ['audience', '이용 대상'],
    ['dataTypes', '처리 정보'],
    ['period', '운영 기간'],
  ] as const;
  const networkReturns = procedure.returnItems.filter(
    (item) => item.fieldKey === 'network' && item.status === 'OPEN',
  );
  return (
    <>
      <nav className="crumb" aria-label="현재 위치">
        <Link href={preview ? '/design-preview/requests' : '/requests'}>신청 현황</Link>
        <span aria-hidden="true">/</span>
        <span>신청 상세</span>
      </nav>
      <Heading
        title={procedure.title}
        description={`${shortId(procedure.id)}, ${procedure.department} ${procedure.ownerName}, 설정 v${procedure.policyVersion}`}
      >
        <RequestBadge item={procedure} />
      </Heading>
      <Stepper
        current={current}
        detail
        returned={procedure.returnItems.some((item) => item.status === 'OPEN')}
      />
      <TerminalNotice procedure={procedure} />
      <ReturnNotice procedure={procedure} />
      <div className="detail">
        <div className="detail-main">
          <section className="card" aria-labelledby="detail-information-title">
            <h2 className="h-panel" id="detail-information-title">
              사업 정보
            </h2>
            <dl className="dl">
              {summaryFields.map(([key, label]) => {
                const answer = procedure.answers.find((item) => item.key === key);
                const confirmed =
                  answer &&
                  ['CONFIRMED', 'NOT_APPLICABLE'].includes(answer.status) &&
                  answer.source &&
                  answer.confirmation;
                return (
                  <Fragment key={key}>
                    <dt>{label}</dt>
                    <dd>
                      <div className="row-between">
                        <span className="readonly-value">
                          {formatAnswerValue(key, answer?.value ?? '')}
                        </span>
                        <Badge tone={confirmed ? 'green' : 'amber'}>
                          {confirmed
                            ? answer?.status === 'NOT_APPLICABLE'
                              ? '해당 없음 · 확인'
                              : '확인 완료'
                            : answer?.source?.kind === 'AI_INFERRED'
                              ? 'AI 제안 · 미확정'
                              : '담당자 확인 필요'}
                        </Badge>
                      </div>
                      {answer ? (
                        <SourceEvidence answer={answer} />
                      ) : (
                        <p className="source-meta">출처 없음 · 담당자 확인 필요</p>
                      )}
                    </dd>
                  </Fragment>
                );
              })}
              <dt>요청 문서</dt>
              <dd>{documentLabel(procedure.documentType)}</dd>
              <dt>적용 설정</dt>
              <dd>v{procedure.policyVersion} · ICT인프라 할당 후 정보보안 검토</dd>
              <dt>저장된 수정본</dt>
              <dd>
                v{procedure.revision} · {formatDate(procedure.updatedAt, true)}
              </dd>
            </dl>
            <p className="help">아래 수집 정보에서 값의 출처와 사람 확인 여부를 확인하세요.</p>
          </section>
          <DocumentPanel procedure={procedure} preview={preview} />
          {children}
          {procedure.documentType === 'FIREWALL' && step !== 'infra' && !preview && (
            <section
              className={`card${networkReturns.length ? ' returned-field' : ''}`}
              id="field-network"
              tabIndex={-1}
            >
              <h2 className="h-panel">방화벽 규칙</h2>
              {networkReturns.map((item) => (
                <p className="returned-reason" key={item.id}>
                  <strong>↩ 보완 필요</strong> {item.reason}
                </p>
              ))}
              <NetworkTable procedure={procedure} />
            </section>
          )}
          <section className="card">
            <div className="card-h">
              <h2 className="h-panel">수집 정보와 원문 근거</h2>
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
          <section className="card">
            <div className="card-h">
              <h2 className="h-panel">처리 이력</h2>
              <Icon name="clock" />
            </div>
            <ol className="hist">
              {[...procedure.timeline].reverse().map((event) => (
                <li key={event.id}>
                  <time dateTime={event.at}>{formatDate(event.at, true)}</time>
                  <span>
                    {event.actorName}: {event.description}
                  </span>
                </li>
              ))}
            </ol>
            {!procedure.timeline.length && <p className="muted">기록된 협의 이력이 없습니다.</p>}
          </section>
        </div>
        <aside className="review review-aside" aria-label="담당자 검토와 처리">
          {aside}
          {!preview && (
            <details className="card detail-navigation">
              <summary>다른 신청 내용 보기</summary>
              <nav className="detail-links" aria-label="신청 상세 보기">
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
            </details>
          )}
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
