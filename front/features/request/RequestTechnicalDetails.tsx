'use client';

import { useId, type ReactNode } from 'react';
import { Badge } from '@/components/ui';
import { SourceBadge } from './AnswerEditor';
import { getRequestDetailData, type DetailRule } from './requestDetailData';
import type { Answer, SecurityRequest } from './types';
import type { InfrastructurePlan } from './infrastructurePlan';

const RULE_COLUMNS = [
  ['purpose', '신청 사유'],
  ['sourceSystem', '출발지 시스템'],
  ['sourceAddress', '출발지 주소'],
  ['destinationSystem', '목적지 시스템'],
  ['destinationAddress', '목적지 주소'],
  ['port', '서비스 포트'],
  ['protocol', '프로토콜'],
  ['direction', '방향'],
] as const;

function answerText(answer: Answer | undefined, fallback = '담당자 확인 필요') {
  if (!answer) return fallback;
  return answer.notApplicable ? '미해당' : answer.value.trim() || fallback;
}

function RuleValue({ answer, highlighted }: { answer?: Answer; highlighted: string[] }) {
  if (!answer) {
    return <span className="rule-missing">담당자 확인 필요</span>;
  }
  return (
    <div
      id={`field-${answer.key}`}
      className={highlighted.includes(answer.key) ? 'needs-supplement' : undefined}
    >
      {(answer.value.trim() || answer.notApplicable || answer.source) && (
        <span className="rule-value">{answerText(answer)}</span>
      )}{' '}
      <SourceBadge answer={answer} />
      {highlighted.includes(answer.key) && <Badge tone="warning">보완 필요 · 재검토</Badge>}
      {answer.evidence && <p className="help rule-evidence">근거: {answer.evidence}</p>}
    </div>
  );
}

function flowLines(value: string) {
  if (value.length <= 22) return [value];
  return [value.slice(0, 22), value.length > 44 ? `${value.slice(22, 43)}…` : value.slice(22)];
}

function FlowNode({
  x,
  label,
  system,
  address,
}: {
  x: number;
  label: string;
  system?: Answer;
  address?: Answer;
}) {
  const name = answerText(system, '시스템명 확인 필요');
  const lines = flowLines(name);
  return (
    <g>
      <rect x={x} y="2" width="356" height="140" rx="8" fill="var(--sf-background)" />
      <text
        x={x + 178}
        y="24"
        textAnchor="middle"
        fontSize="13"
        fontWeight="700"
        fill="var(--sf-muted)"
      >
        {label}
      </text>
      <rect
        x={x + 10}
        y="38"
        width="316"
        height="82"
        rx="6"
        fill="var(--sf-surface)"
        stroke="var(--sf-border-strong)"
      />
      <title>{`${label}: ${name}, ${answerText(address, '주소 확인 필요')}`}</title>
      {lines.map((line, index) => (
        <text
          key={index}
          x={x + 168}
          y={lines.length === 1 ? 70 : 61 + index * 17}
          textAnchor="middle"
          fontSize="13"
          fill="var(--sf-text)"
        >
          {line}
        </text>
      ))}
      <text
        x={x + 168}
        y="101"
        textAnchor="middle"
        fontSize="11"
        fill={address?.value ? 'var(--sf-muted)' : 'var(--sf-warning-text)'}
      >
        {answerText(address, '주소 확인 필요')}
      </text>
    </g>
  );
}

/** 망 구간·방향은 추측하지 않고 입력된 출발지와 목적지만 연결한다. */
function RequestFlow({ rule }: { rule: DetailRule }) {
  const uid = useId().replace(/:/g, '');
  const markerId = `detail-arrow-${uid}`;
  const description = `${answerText(rule.sourceSystem, '출발지 시스템명 확인 필요')} (${answerText(rule.sourceAddress, '출발지 주소 확인 필요')})에서 ${answerText(rule.destinationSystem, '목적지 시스템명 확인 필요')} (${answerText(rule.destinationAddress, '목적지 주소 확인 필요')})로 ${answerText(rule.protocol, '프로토콜 확인 필요')} ${answerText(rule.port, '포트 확인 필요')}. 망 구간과 방향은 입력된 정보에서 확인해야 합니다.`;
  return (
    <div className="flowbox">
      <svg
        viewBox="0 0 720 144"
        width="100%"
        role="img"
        aria-labelledby={`flow-title-${uid} flow-desc-${uid}`}
      >
        <title id={`flow-title-${uid}`}>등록된 통신 정보의 데이터 흐름도</title>
        <desc id={`flow-desc-${uid}`}>{description}</desc>
        <defs>
          <marker
            id={markerId}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M0 0L10 5L0 10z" fill="var(--sf-primary)" />
          </marker>
        </defs>
        <FlowNode x={2} label="출발지" system={rule.sourceSystem} address={rule.sourceAddress} />
        <FlowNode
          x={362}
          label="목적지"
          system={rule.destinationSystem}
          address={rule.destinationAddress}
        />
        <path
          d="M328 79 H369"
          fill="none"
          stroke="var(--sf-primary)"
          strokeWidth="1.6"
          markerEnd={`url(#${markerId})`}
        />
        <circle cx="349" cy="79" r="10.5" fill="var(--sf-primary)" />
        <text
          x="349"
          y="83.5"
          textAnchor="middle"
          fontSize="12"
          fontWeight="700"
          fill="var(--sf-on-primary)"
        >
          {rule.number}
        </text>
      </svg>
      <p className="meta flow-legend">
        <span className="lg-line" aria-hidden="true" /> 연결
        <span className="lg-num" aria-hidden="true">
          {rule.number}
        </span>{' '}
        규칙 번호
        <span>
          {answerText(rule.protocol, '프로토콜 확인 필요')} /{' '}
          {answerText(rule.port, '포트 확인 필요')}
        </span>
      </p>
      <p className="help flow-help">
        입력된 통신 정보의 요약입니다. 망 구간과 실제 통신 허용 여부는 담당자 확인이 필요합니다.
      </p>
    </div>
  );
}

/** 시안의 기술 영역 순서를 유지하며 실제 답변과 미실시 점검 상태를 구분해 표시한다. */
export function RequestTechnicalDetails({
  request,
  infrastructurePlan,
  children,
}: {
  request: SecurityRequest;
  infrastructurePlan?: InfrastructurePlan;
  children?: ReactNode;
}) {
  const data = getRequestDetailData(request, infrastructurePlan);
  return (
    <>
      <section className="card" aria-labelledby="d-flow">
        <h2 className="h-panel" id="d-flow">
          데이터 흐름도
        </h2>
        {data.snapshotUnavailable ? (
          <p className="help">
            제출본 정보를 확인할 수 없어 데이터 흐름도를 표시하지 않습니다. 신청 정보를 다시 불러와
            주세요.
          </p>
        ) : data.rules[0] ? (
          data.rules.map((rule) => (
            <div key={rule.id}>
              <h3 className="h-panel">통신 구간 {rule.number}</h3>
              <RequestFlow rule={rule} />
            </div>
          ))
        ) : (
          <p className="help">
            등록된 통신 정보가 없습니다. 출발지와 목적지를 입력하면 흐름도를 확인할 수 있습니다.
          </p>
        )}
      </section>
      <section className="card" aria-labelledby="d-rules">
        <h2 className="h-panel" id="d-rules">
          방화벽 규칙
        </h2>
        {data.rules.length ? (
          <div className="tbl-wrap">
            <table className="tbl inner-tbl">
              <caption className="sr-only">방화벽 규칙: 신청 답변의 통신 정보</caption>
              <thead>
                <tr>
                  <th scope="col">번호</th>
                  {RULE_COLUMNS.map(([key, label]) => (
                    <th key={key} scope="col">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rules.map((rule) => (
                  <tr key={rule.id}>
                    <td>{rule.number}</td>
                    {RULE_COLUMNS.map(([key]) => (
                      <td key={key} className={key === 'direction' ? 'nowrap' : undefined}>
                        <RuleValue answer={rule[key]} highlighted={request.highlightedFields} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="help">
            {data.snapshotUnavailable
              ? '제출본 정보를 확인할 수 없어 방화벽 규칙을 표시하지 않습니다.'
              : '아직 입력된 방화벽 규칙이 없습니다. 통신 정보는 담당자 확인이 필요합니다.'}
          </p>
        )}
        {children}
      </section>
      <section className="card" aria-labelledby="d-lint">
        <h2 className="h-panel" id="d-lint">
          기관 기준 자동 점검
        </h2>
        <ul className="chk-list">
          <li>
            <Badge tone="neutral">미실시</Badge>
            <span>
              자동 점검 결과가 아직 없습니다. 기관 기준 충족 여부는 담당자가 확인해 주세요.
            </span>
          </li>
          {data.unconfirmedCount > 0 && (
            <li>
              <Badge tone="warning">미확정</Badge>
              <span>미입력 또는 확인이 필요한 값이 {data.unconfirmedCount}개 있습니다.</span>
            </li>
          )}
          {request.blockers.map((blocker, index) => (
            <li key={index}>
              <Badge tone="warning">확인 필요</Badge>
              <span>{blocker}</span>
            </li>
          ))}
          <li>
            <Badge tone="info">안내</Badge>
            <span>
              자동 점검은 보안 적합 판정이 아닙니다. 서류 확정과 실제 방화벽 적용은 별개입니다.
            </span>
          </li>
        </ul>
      </section>
    </>
  );
}
