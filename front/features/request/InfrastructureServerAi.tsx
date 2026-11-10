'use client';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';
import { requestJson } from '@/lib/httpClient';
import { Notice } from '@/components/ui';
import { emptyServer, serverLabels, type InfraServer } from './infrastructurePlan';

const response = z.object({
  baseRevision: z.number(),
  servers: z
    .array(
      z.object({
        fields: z.record(
          z.string(),
          z.object({
            value: z.string(),
            sourceTag: z.string().nullable(),
            sourceLabel: z.string().nullable(),
            quote: z.string().nullable(),
          }),
        ),
      }),
    )
    .max(20),
  warnings: z.array(z.string()),
});
type Key = keyof typeof serverLabels;
/** 사양 제안은 비교 후 입력칸에만 반영한다. 근거와 미확인 상태를 임시 저장까지 보존한다. */
export function InfrastructureServerAi({
  requestId,
  revision,
  servers,
  contextVersion,
  disabled,
  onApply,
}: {
  requestId: string;
  revision: number;
  servers: InfraServer[];
  contextVersion: string;
  disabled: boolean;
  onApply: (servers: InfraServer[]) => void;
}) {
  const [explanation, setExplanation] = useState('');
  const [result, setResult] = useState<{ data: z.infer<typeof response>; base: string } | null>(
    null,
  );
  const [targets, setTargets] = useState<Record<number, string>>({});
  const [selected, setSelected] = useState<Record<number, Key[]>>({});
  const [message, setMessage] = useState('');
  const [applied, setApplied] = useState(false);
  const signature = JSON.stringify([revision, servers, contextVersion, explanation]);
  const mutation = useMutation({
    mutationFn: async (base: string) => ({
      base,
      data: response.parse(
        await requestJson(
          `/api/security-requests/${encodeURIComponent(requestId)}/infrastructure-proposals`,
          { method: 'POST', body: { expectedRevision: revision, explanation, target: 'SERVERS' } },
        ),
      ),
    }),
    onSuccess: (r) => {
      setResult(r);
      setTargets({});
      setSelected({});
      setApplied(false);
      setMessage('');
    },
  });
  const stale = !!result && (result.base !== signature || result.data.baseRevision !== revision);
  function apply() {
    if (!result || stale || applied) return;
    const next = servers.map((s) => ({ ...s, evidence: { ...s.evidence } }));
    const used = new Set<string>();
    let count = 0;
    for (const [i, p] of result.data.servers.entries()) {
      const fields = selected[i] ?? [];
      if (!fields.length) continue;
      const target = targets[i] || 'new';
      if (target !== 'new' && used.has(target)) {
        setMessage('같은 서버에 여러 제안을 적용할 수 없습니다.');
        return;
      }
      used.add(target);
      const server = target === 'new' ? emptyServer() : next.find((s) => s.id === target);
      if (!server) return;
      for (const key of fields) {
        const f = p.fields[key];
        if (!f?.value) continue;
        server[key] = f.value;
        server.evidence[key] = `${f.sourceLabel} [${f.sourceTag}]: ${f.quote}`;
      }
      server.aiInferred = true;
      server.aiConfirmed = false;
      if (target === 'new') next.push(server);
      count++;
    }
    if (!count) {
      setMessage('적용할 사양을 선택해 주세요.');
      return;
    }
    if (next.length > 50) {
      setMessage('서버는 최대 50개까지 등록할 수 있습니다.');
      return;
    }
    onApply(next);
    setApplied(true);
    setMessage(
      '서버 사양 제안을 적용했습니다. 서버별 근거와 사양 확인 후 저장하세요. 미확인 상태도 임시 저장할 수 있습니다.',
    );
  }
  return (
    <section className="infra-ai" aria-labelledby="infra-server-ai-heading">
      <h3 id="infra-server-ai-heading">AI 서버 사양 제안</h3>
      <p className="help">
        기존 첨부의 텍스트와 저장된 서버 정보·추가 설명을 참고합니다. 자료에 없는 권장 사양을 임의로
        채우지 않습니다.
      </p>
      <label htmlFor="infra-server-explanation">서버 사양 추가 설명</label>
      <textarea
        className="input"
        id="infra-server-explanation"
        rows={3}
        maxLength={6000}
        value={explanation}
        disabled={disabled || mutation.isPending}
        onChange={(e) => setExplanation(e.target.value)}
      />
      <button
        type="button"
        className="btn"
        disabled={disabled || mutation.isPending}
        onClick={() => {
          setResult(null);
          mutation.mutate(signature);
        }}
      >
        {mutation.isPending ? 'AI가 서버 자료를 확인하고 있습니다…' : 'AI 서버 사양 제안 받기'}
      </button>
      {mutation.error && (
        <Notice tone="danger">
          {mutation.error.message} 설명은 유지됩니다. 다시 요청하거나 직접 입력하세요.
        </Notice>
      )}
      {result && (
        <>
          <p>AI 추론 · 미확정</p>
          {result.data.warnings.map((w) => (
            <p className="help" key={w}>
              {w}
            </p>
          ))}
          {!result.data.servers.length && (
            <p>근거 있는 서버 사양을 찾지 못했습니다. 설명을 보완하거나 직접 입력하세요.</p>
          )}
          {stale && !applied && (
            <Notice tone="warning">
              입력 또는 저장된 정보가 변경되었습니다. 초안을 다시 요청해 주세요.
            </Notice>
          )}
          {result.data.servers.map((p, i) => (
            <fieldset className="infra-connection" key={i} disabled={disabled || stale || applied}>
              <legend>AI 서버 제안 {i + 1}</legend>
              <label>
                서버 제안 {i + 1} 적용 대상
                <select
                  className="input"
                  value={targets[i] || 'new'}
                  onChange={(e) => setTargets((t) => ({ ...t, [i]: e.target.value }))}
                >
                  <option value="new">새 서버로 추가</option>
                  {servers.map((s, n) => (
                    <option key={s.id} value={s.id}>
                      서버 {n + 1}: {s.name || '확인 필요'}
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
                    [i]: (Object.keys(serverLabels) as Key[]).filter((k) => !!p.fields[k]?.value),
                  }))
                }
              >
                서버 제안 {i + 1} 근거 있는 항목 모두 선택
              </button>
              <div className="tbl-wrap">
                <table className="tbl">
                  <caption>서버 제안 {i + 1} 비교</caption>
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
                    {Object.entries(serverLabels).map(([key, label]) => {
                      const k = key as Key,
                        f = p.fields[k];
                      return (
                        <tr key={k}>
                          <td>
                            <input
                              type="checkbox"
                              aria-label={`서버 제안 ${i + 1} ${label} 적용`}
                              disabled={!f?.value}
                              checked={(selected[i] || []).includes(k)}
                              onChange={(e) =>
                                setSelected((s) => ({
                                  ...s,
                                  [i]: e.target.checked
                                    ? [...(s[i] || []), k]
                                    : (s[i] || []).filter((v) => v !== k),
                                }))
                              }
                            />
                          </td>
                          <th scope="row">{label}</th>
                          <td>{servers.find((s) => s.id === targets[i])?.[k] || '입력 없음'}</td>
                          <td>{f?.value || '확인 필요'}</td>
                          <td>
                            {f?.value
                              ? `${f.sourceLabel} [${f.sourceTag}]: ${f.quote}`
                              : '근거 확인 불가'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </fieldset>
          ))}
          {!!result.data.servers.length && (
            <button
              type="button"
              className="btn"
              disabled={disabled || stale || applied}
              onClick={apply}
            >
              선택한 서버 사양 적용
            </button>
          )}
        </>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
