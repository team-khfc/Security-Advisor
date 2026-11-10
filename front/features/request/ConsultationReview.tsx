'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { requestJson } from '@/lib/httpClient';
import { Badge, Notice } from '@/components/ui';
const field = z.object({
  label: z.string(),
  group: z.string(),
  value: z.string(),
  confirmed: z.boolean(),
  evidence: z.string(),
});
const fields = z.record(z.string(), field);
const summary = z.object({
  fingerprint: z.string(),
  model: z.string(),
  at: z.string(),
  items: z.array(z.object({ text: z.string(), evidenceIds: z.array(z.string()) })),
});
const overview = z.object({
  fingerprint: z.string(),
  baselineAvailable: z.boolean(),
  baselineAt: z.string().nullable(),
  caseTitle: z.string(),
  department: z.string(),
  baseline: fields,
  current: fields,
  changes: z.array(
    z.object({
      id: z.number(),
      kind: z.string(),
      actorName: z.string(),
      actorRole: z.string(),
      at: z.string(),
      before: fields,
      after: fields,
    }),
  ),
  summary: summary.nullable(),
});
type Field = z.infer<typeof field>;
const roles: Record<string, string> = {
  INFRA: 'ICT인프라',
  SECURITY: '정보보안',
  APPLICANT: '신청자',
  ADMIN: '기관 관리자',
};
const time = (value: string) => new Date(value).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
const anchor = (key: string) => 'consultation-field-' + encodeURIComponent(key);
function Value({ value, missing = '미입력' }: { value?: Field; missing?: string }) {
  return (
    <>
      {value?.value
        ? value.value === 'true'
          ? '예'
          : value.value === 'false'
            ? '아니요'
            : value.value
        : missing}
      {value && !value.confirmed && <span className="help"> · 확인 필요</span>}
    </>
  );
}
export function ConsultationReview({
  requestId,
  actorId,
  canSummarize,
}: {
  requestId: string;
  actorId: string;
  canSummarize: boolean;
}) {
  const [showAll, setShowAll] = useState(false);
  const client = useQueryClient();
  const key = ['consultation-comparison', actorId, requestId];
  const query = useQuery({
    queryKey: key,
    queryFn: async () =>
      overview.parse(
        await requestJson(`/api/security-requests/${requestId}/consultation-comparison`),
      ),
    refetchOnWindowFocus: true,
  });
  const generate = useMutation({
    mutationFn: async () =>
      summary.parse(
        await requestJson(`/api/security-requests/${requestId}/consultation-summaries`, {
          method: 'POST',
          body: { expectedFingerprint: query.data!.fingerprint },
        }),
      ),
    onSuccess: () => client.invalidateQueries({ queryKey: key }),
    onError: () => client.invalidateQueries({ queryKey: key }),
  });
  if (query.isPending) return <p role="status">협의 결과와 변경 기록을 불러오는 중…</p>;
  if (query.error || !query.data)
    return (
      <Notice tone="warning">
        협의 결과를 불러오지 못했습니다.{' '}
        <button className="btn" onClick={() => void query.refetch()}>
          다시 불러오기
        </button>
      </Notice>
    );
  const data = query.data;
  const keys = Array.from(
    new Set([...Object.keys(data.baseline), ...Object.keys(data.current)]),
  ).sort();
  const changed = (k: string) =>
    JSON.stringify(data.baseline[k]) !== JSON.stringify(data.current[k]);
  const visible = keys.filter(
    (k) =>
      showAll ||
      !data.baselineAvailable ||
      changed(k) ||
      k.startsWith('business:') ||
      data.current[k]?.group === '사업 정보',
  );
  const stale = data.summary?.fingerprint !== data.fingerprint;
  function follow(e: React.MouseEvent<HTMLAnchorElement>, id: string) {
    e.preventDefault();
    setShowAll(true);
    setTimeout(() => {
      document.getElementById(anchor(id))?.scrollIntoView({ block: 'center' });
      document.getElementById(anchor(id))?.focus();
    }, 0);
  }
  return (
    <section className="card consultation-review" aria-labelledby="consultation-heading">
      <h2 className="h-panel" id="consultation-heading">
        내 사업과 담당자 협의 결과
      </h2>
      <p>
        <strong>{data.caseTitle}</strong> · {data.department}
      </p>
      <p className="help">
        사업 목적·이용 범위·기간과 아래 협의 결과가 맞는지 확인해 주세요. 기술적인 적합성을 대신
        판단할 필요는 없습니다.
      </p>
      {data.baselineAvailable ? (
        <p className="meta">비교 기준: {time(data.baselineAt!)} 협의 요청 당시</p>
      ) : (
        <Notice tone="warning">
          이 신청은 협의 요청 당시 기준본이 없습니다. 과거 변경을 추정하지 않고 현재 정보와 기록을
          시작한 이후의 변경만 표시합니다.
        </Notice>
      )}
      {canSummarize && (
        <div className="btn-row">
          <button
            type="button"
            className="btn"
            disabled={generate.isPending}
            onClick={() => generate.mutate()}
          >
            {generate.isPending
              ? 'AI 협의 결과 요약 중…'
              : data.summary
                ? 'AI 협의 결과 다시 요약'
                : 'AI 협의 결과 요약'}
          </button>
        </div>
      )}
      {generate.error && (
        <Notice tone="warning">
          {generate.error.message} 아래 비교 내용을 직접 검토할 수 있습니다.
        </Notice>
      )}
      {data.summary && (
        <div className="consultation-ai">
          <h3 className="h-panel">AI 협의 결과 요약</h3>
          <Badge tone="warning">
            {stale ? '원본 변경 · 다시 요약 필요' : 'AI 참고 요약 · 사용자 확인 필요'}
          </Badge>
          <p className="help">
            요약은 담당자 승인이나 최종 제출 확인을 대신하지 않습니다. 각 근거에서 실제 값을 확인해
            주세요.
          </p>
          {!stale && (
            <ul>
              {data.summary.items.map((item, index) => (
                <li key={index}>
                  <p>{item.text}</p>
                  <div className="btn-row">
                    {item.evidenceIds.map((id) => (
                      <a key={id} href={'#' + anchor(id)} onClick={(e) => follow(e, id)}>
                        근거: {(data.current[id] ?? data.baseline[id])?.label ?? '항목 확인'}
                      </a>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="meta">작성: {time(data.summary.at)}</p>
        </div>
      )}
      <h3 className="h-panel">협의 전·후 비교</h3>
      {data.baselineAvailable && (
        <label className="activity-filter">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
          변경 없는 항목도 보기
        </label>
      )}
      <div className="tbl-wrap">
        <table className="tbl">
          <caption className="sr-only">내 사업의 협의 요청 당시와 현재 정보 비교</caption>
          <thead>
            <tr>
              <th>사업 관련 항목</th>
              <th>협의 요청 당시</th>
              <th>현재 협의 결과</th>
              <th>변경 구분</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((k) => {
              const before = data.baseline[k],
                after = data.current[k],
                f = after ?? before;
              const status = !data.baselineAvailable
                ? '과거 비교 불가'
                : !before
                  ? '추가'
                  : !after
                    ? '삭제'
                    : before.value !== after.value
                      ? '수정'
                      : changed(k)
                        ? '확인·근거 변경'
                        : '변경 없음';
              return (
                <tr key={k} id={anchor(k)} tabIndex={-1}>
                  <th scope="row">
                    <span className="help">{f.group}</span>
                    <br />
                    {f.label}
                  </th>
                  <td>
                    <Value
                      value={before}
                      missing={data.baselineAvailable ? '미입력' : '기록 없음'}
                    />
                  </td>
                  <td>
                    <Value value={after} missing="현재 항목 없음" />
                    {after?.evidence && (
                      <details>
                        <summary>입력 근거</summary>
                        <p>{after.evidence}</p>
                      </details>
                    )}
                  </td>
                  <td>{status}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <h3 className="h-panel">담당자·신청자별 추가·수정·확인 기록</h3>
      {!data.changes.length && (
        <p className="help">
          보존된 변경 기록이 없습니다. 기록되지 않은 과거 작업은 추정하지 않습니다.
        </p>
      )}
      {data.changes.map((change) => (
        <details className="sub-block" key={change.id}>
          <summary>
            {roles[change.actorRole] ?? '담당자'} · {change.actorName} ·{' '}
            {change.kind === 'CONFIRM' ? '확인' : '정보 보완'} · {time(change.at)}
          </summary>
          <div className="tbl-wrap">
            <table className="tbl">
              <caption className="sr-only">{change.actorName} 변경 기록</caption>
              <thead>
                <tr>
                  <th>항목</th>
                  <th>변경 전</th>
                  <th>변경 후</th>
                </tr>
              </thead>
              <tbody>
                {Array.from(
                  new Set([...Object.keys(change.before), ...Object.keys(change.after)]),
                ).map((k) => (
                  <tr key={k}>
                    <th scope="row">
                      {(change.after[k] ?? change.before[k]).group}
                      <br />
                      {(change.after[k] ?? change.before[k]).label}
                    </th>
                    <td>
                      <Value value={change.before[k]} />
                    </td>
                    <td>
                      <Value value={change.after[k]} missing="항목 삭제" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ))}
    </section>
  );
}
