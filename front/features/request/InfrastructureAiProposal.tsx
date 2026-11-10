'use client';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';
import { requestJson } from '@/lib/httpClient';
import { Notice } from '@/components/ui';
import type { InfraConnection } from './infrastructurePlan';

export const infraFieldLabels = {
  sourceSystem: '출발지 서버·시스템명',
  sourceAddress: '출발지 IP·CIDR',
  sourceZone: '출발지 망 구간',
  destinationSystem: '목적지 서버·시스템명',
  destinationAddress: '목적지 IP·CIDR',
  destinationZone: '목적지 망 구간',
  protocol: '프로토콜',
  port: '포트·포트 범위',
  purpose: '허용 목적',
  direction: '통신 방향',
  startDate: '허용 시작일',
  endDate: '허용 종료일',
} as const;
type Key = keyof typeof infraFieldLabels;
const keys = Object.keys(infraFieldLabels) as Key[];
const fieldSchema = z.object({
  value: z.string(),
  sourceTag: z.string().nullable(),
  sourceLabel: z.string().nullable(),
  quote: z.string().nullable(),
});
const responseSchema = z.object({
  baseRevision: z.number(),
  connections: z.array(z.object({ fields: z.record(z.string(), fieldSchema) })).max(20),
  warnings: z.array(z.string()),
  modelReference: z.string(),
});
type Proposal = z.infer<typeof responseSchema>;

/** AI 결과는 입력칸에만 선택 반영하고 최종 저장은 담당자가 별도로 한다. */
export function InfrastructureAiProposal({
  requestId,
  revision,
  rows,
  contextVersion,
  disabled,
  onApply,
}: {
  requestId: string;
  revision: number;
  rows: InfraConnection[];
  contextVersion: string;
  disabled: boolean;
  onApply: (rows: InfraConnection[]) => void;
}) {
  const [explanation, setExplanation] = useState('');
  const [result, setResult] = useState<{ data: Proposal; base: string } | null>(null);
  const [targets, setTargets] = useState<Record<number, string>>({});
  const [selected, setSelected] = useState<Record<number, Key[]>>({});
  const [message, setMessage] = useState('');
  const [applied, setApplied] = useState(false);
  const signature = JSON.stringify([revision, rows, contextVersion, explanation]);
  const generate = useMutation({
    mutationFn: async (input: { explanation: string; base: string }) => ({
      data: responseSchema.parse(
        await requestJson(
          `/api/security-requests/${encodeURIComponent(requestId)}/infrastructure-proposals`,
          {
            method: 'POST',
            body: { expectedRevision: revision, explanation: input.explanation },
          },
        ),
      ),
      base: input.base,
    }),
    onSuccess: (value) => {
      setResult(value);
      setTargets({});
      setSelected({});
      setApplied(false);
      setMessage('');
    },
  });
  const stale = !!result && (result.base !== signature || result.data.baseRevision !== revision);
  function apply() {
    if (!result || stale || applied) return;
    const next = rows.map((r) => ({ ...r }));
    const used = new Set<string>();
    let count = 0;
    for (const [index, proposal] of result.data.connections.entries()) {
      const picked = selected[index] ?? [];
      if (!picked.length) continue;
      const target = targets[index] ?? 'new';
      if (target !== 'new' && used.has(target)) {
        setMessage('같은 기존 구간에 여러 제안을 적용할 수 없습니다. 대상을 나누어 선택해 주세요.');
        return;
      }
      used.add(target);
      const row: InfraConnection | undefined =
        target === 'new'
          ? {
              id: crypto.randomUUID(),
              sourceSystem: '',
              sourceAddress: '',
              sourceZone: '',
              destinationSystem: '',
              destinationAddress: '',
              destinationZone: '',
              protocol: '',
              port: '',
              purpose: '',
              direction: '',
              startDate: '',
              endDate: '',
            }
          : next.find((r) => r.id === target);
      if (!row) {
        setMessage('적용 대상이 변경되었습니다. 초안을 다시 작성해 주세요.');
        return;
      }
      for (const key of picked)
        if (proposal.fields[key]?.value) {
          row[key] = proposal.fields[key].value;
          if (key.startsWith('source')) row.sourceServerId = null;
          if (key.startsWith('destination')) row.destinationServerId = null;
        }
      if (target === 'new') next.push(row);
      count++;
    }
    if (next.length > 50) {
      setMessage('통신 구간은 최대 50개까지 저장할 수 있습니다.');
      return;
    }
    if (!count) {
      setMessage('적용할 항목을 선택해 주세요.');
      return;
    }
    onApply(next);
    setApplied(true);
    setMessage(
      '선택한 AI 제안을 입력칸에 적용했습니다. 확인 필요 항목을 보완하고 근거를 확인한 뒤 저장해 주세요.',
    );
  }
  return (
    <section className="infra-ai" aria-labelledby="infra-ai-heading">
      <h3 id="infra-ai-heading">AI로 망 구성 초안 작성</h3>
      <p className="help">
        기존 신청 답변·저장된 망 구성·최근 첨부 3개의 텍스트를 참고합니다. 아직 저장하지 않은 입력은
        참고하지 않습니다. 이미지와 전체 문서는 직접 확인해 주세요.
      </p>
      <label htmlFor="infra-ai-explanation">망 구성 추가 설명 (선택)</label>
      <textarea
        id="infra-ai-explanation"
        className="input"
        rows={3}
        maxLength={6000}
        value={explanation}
        disabled={generate.isPending || disabled}
        onChange={(e) => setExplanation(e.target.value)}
        placeholder="서버 간 연결 관계, 알고 있는 프로토콜·포트 등을 설명하세요. 없는 정보는 비워 둡니다."
      />
      <button
        type="button"
        className="btn"
        disabled={generate.isPending || disabled}
        onClick={() => {
          setResult(null);
          setMessage('');
          generate.mutate({ explanation, base: signature });
        }}
      >
        {generate.isPending ? 'AI가 자료를 확인하고 있습니다…' : 'AI 망 구성 초안 작성'}
      </button>
      {generate.isPending && (
        <p role="status">모델 응답을 기다리고 있습니다. 직접 입력한 값은 유지됩니다.</p>
      )}
      {generate.error && (
        <Notice tone="danger">
          {generate.error instanceof Error ? generate.error.message : 'AI 요청에 실패했습니다.'}{' '}
          설명을 유지한 채 다시 요청하거나 직접 입력할 수 있습니다.
        </Notice>
      )}
      {result && (
        <>
          <p className="help">AI 추론 · 미확정 · {result.data.modelReference}</p>
          {result.data.warnings.map((w) => (
            <p className="help" key={w}>
              {w}
            </p>
          ))}
          {!result.data.connections.length && (
            <Notice tone="warning">
              자료에서 근거가 있는 통신 구간을 찾지 못했습니다. 서버 간 연결 설명을 추가하거나 직접
              입력해 주세요.
            </Notice>
          )}
          {stale && !applied && (
            <Notice tone="warning">
              초안 요청 후 입력 또는 저장된 자료가 변경되었습니다. 현재 입력을 보호하기 위해 적용을
              막았습니다. 초안을 다시 작성해 주세요.
            </Notice>
          )}
          {result.data.connections.map((proposal, index) => {
            const target = targets[index] ?? 'new';
            const existing = rows.find((r) => r.id === target);
            return (
              <fieldset
                className="infra-connection"
                key={index}
                disabled={disabled || stale || applied || generate.isPending}
              >
                <legend>AI 제안 구간 {index + 1}</legend>
                <label>
                  제안 {index + 1} 적용 대상
                  <select
                    className="input"
                    value={target}
                    onChange={(e) => setTargets((t) => ({ ...t, [index]: e.target.value }))}
                  >
                    <option value="new">새 통신 구간으로 추가</option>
                    {rows.map((r, n) => (
                      <option key={r.id} value={r.id}>
                        기존 구간 {n + 1}: {r.sourceSystem || '확인 필요'} →{' '}
                        {r.destinationSystem || '확인 필요'}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() =>
                    setSelected((s) => ({
                      ...s,
                      [index]: keys.filter((k) => !!proposal.fields[k]?.value),
                    }))
                  }
                >
                  제안 {index + 1} 근거 있는 항목 모두 선택
                </button>
                <div className="tbl-wrap">
                  <table className="tbl">
                    <caption>제안 {index + 1} 현재 값과 AI 제안 비교</caption>
                    <thead>
                      <tr>
                        <th>적용</th>
                        <th>항목</th>
                        <th>현재 값</th>
                        <th>AI 제안</th>
                        <th>근거</th>
                      </tr>
                    </thead>
                    <tbody>
                      {keys.map((key) => {
                        const field = proposal.fields[key];
                        return (
                          <tr key={key}>
                            <td>
                              <input
                                type="checkbox"
                                aria-label={`제안 ${index + 1} ${infraFieldLabels[key]} 적용`}
                                disabled={!field?.value}
                                checked={(selected[index] ?? []).includes(key)}
                                onChange={(e) =>
                                  setSelected((s) => ({
                                    ...s,
                                    [index]: e.target.checked
                                      ? [...(s[index] ?? []), key]
                                      : (s[index] ?? []).filter((k) => k !== key),
                                  }))
                                }
                              />
                            </td>
                            <th scope="row">{infraFieldLabels[key]}</th>
                            <td>{existing?.[key] || '입력 없음'}</td>
                            <td>{field?.value || '확인 필요'}</td>
                            <td>
                              {field?.value ? (
                                <>
                                  <span>
                                    {field.sourceLabel} [{field.sourceTag}]
                                  </span>
                                  <p>{field.quote}</p>
                                </>
                              ) : (
                                '자료에 없거나 근거 확인 불가'
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </fieldset>
            );
          })}
          {!!result.data.connections.length && (
            <button
              type="button"
              className="btn"
              disabled={disabled || stale || applied || generate.isPending}
              onClick={apply}
            >
              선택한 항목을 입력칸에 적용
            </button>
          )}
        </>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
