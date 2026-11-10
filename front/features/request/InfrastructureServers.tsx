'use client';
import {
  emptyServer,
  serverLabels,
  operationLabels,
  infraCheckLabels,
  type InfraServer,
  type InfrastructurePlan,
} from './infrastructurePlan';

/** 서버는 통신 구간과 분리하여 관리하고 연결 중인 서버의 삭제를 막는다. */
export function InfrastructureServers({
  servers,
  linkedIds,
  onChange,
}: {
  servers: InfraServer[];
  linkedIds: string[];
  onChange: (servers: InfraServer[]) => void;
}) {
  function edit(id: string, key: keyof typeof serverLabels, value: string) {
    onChange(servers.map((s) => (s.id === id ? { ...s, [key]: value, aiConfirmed: false } : s)));
  }
  return (
    <section aria-labelledby="infra-servers-heading">
      <h3 id="infra-servers-heading">1. 서버 구성</h3>
      <p className="help">
        서버명·용도·운영 형태·IP·망 구간은 확인 저장 시 필요합니다. CPU·메모리·저장공간·OS·DB는 아는
        범위에서 입력하세요. 미확인 사양은 추측하지 않습니다.
      </p>
      {!servers.length && (
        <p>등록된 서버가 없습니다. 서버를 추가하거나 AI 서버 사양 제안을 적용하세요.</p>
      )}
      {servers.map((s, index) => (
        <fieldset className="infra-connection" key={s.id}>
          <legend>서버 {index + 1}</legend>
          <p className="help">
            {s.aiInferred
              ? s.aiConfirmed
                ? 'AI 추론 · 담당자 확인'
                : 'AI 추론 · 확인 필요'
              : '담당자 입력'}
          </p>
          <div className="infra-grid">
            {Object.entries(serverLabels).map(([key, label]) => {
              const k = key as keyof typeof serverLabels;
              const options =
                k === 'environment'
                  ? ['물리', '가상', '클라우드', '외부', '기타']
                  : k === 'zone'
                    ? ['외부', 'DMZ', '내부망', '클라우드', '기타']
                    : null;
              return (
                <label key={key}>
                  <span className="infra-field-label">{label}</span>
                  {options ? (
                    <select
                      className="input"
                      value={s[k]}
                      onChange={(e) => edit(s.id, k, e.target.value)}
                    >
                      <option value="">확인 필요</option>
                      {options.map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className="input"
                      placeholder="확인 필요"
                      value={s[k]}
                      maxLength={k === 'address' ? 4000 : k === 'purpose' ? 1000 : 200}
                      onChange={(e) => edit(s.id, k, e.target.value)}
                    />
                  )}
                  {!s[k] && <span className="help">확인 필요</span>}
                </label>
              );
            })}
          </div>
          {!!Object.keys(s.evidence).length && (
            <details>
              <summary>AI 서버 사양 근거</summary>
              {Object.entries(s.evidence).map(([k, v]) => (
                <p key={k}>
                  {serverLabels[k as keyof typeof serverLabels] || k}: {v}
                </p>
              ))}
            </details>
          )}
          {s.aiInferred && (
            <label>
              <input
                type="checkbox"
                checked={s.aiConfirmed}
                onChange={(e) =>
                  onChange(
                    servers.map((r) =>
                      r.id === s.id ? { ...r, aiConfirmed: e.target.checked } : r,
                    ),
                  )
                }
              />{' '}
              서버 {index + 1}의 AI 제안 근거와 사양을 확인했습니다
            </label>
          )}
          <button
            type="button"
            className="btn btn-sm"
            disabled={linkedIds.includes(s.id)}
            onClick={() => onChange(servers.filter((r) => r.id !== s.id))}
          >
            서버 {index + 1} 삭제
          </button>
          {linkedIds.includes(s.id) && (
            <p className="help">통신 구간에서 연결을 해제한 뒤 삭제할 수 있습니다.</p>
          )}
        </fieldset>
      ))}
      <button
        type="button"
        className="btn"
        disabled={servers.length >= 50}
        onClick={() => onChange([...servers, emptyServer()])}
      >
        서버 추가
      </button>
    </section>
  );
}

/** 정보보안 담당자와 제출본에서는 저장 당시 서버·운영·확인 내용을 읽기 전용으로 표시한다. */
export function InfrastructureSummary({ plan }: { plan: InfrastructurePlan }) {
  return (
    <section className="card">
      <h2 className="h-panel">서버 구성·운영 및 검토 사항</h2>
      <p>{plan.draft ? '임시 저장 · 담당자 확인 전' : '담당자 확인 저장'}</p>
      {plan.servers?.map((s, i) => (
        <div className="infra-connection" key={s.id}>
          <h3>
            서버 {i + 1}: {s.name || '확인 필요'}
          </h3>
          <p>
            {s.aiInferred
              ? s.aiConfirmed
                ? 'AI 추론 · 담당자 확인'
                : 'AI 추론 · 확인 필요'
              : '담당자 입력'}
          </p>
          <dl>
            {Object.entries(serverLabels).map(([k, label]) => (
              <div key={k}>
                <dt>{label}</dt>
                <dd>{s[k as keyof typeof serverLabels] || '확인 필요'}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
      <dl>
        {Object.entries(operationLabels).map(([k, label]) => (
          <div key={k}>
            <dt>{label}</dt>
            <dd style={{ whiteSpace: 'pre-wrap' }}>{plan.operations?.[k] || '입력 안 함'}</dd>
          </div>
        ))}
      </dl>
      <ul>
        {Object.entries(infraCheckLabels).map(([k, label]) => (
          <li key={k}>
            {plan.checklist?.[k] ? '확인함' : '확인 필요'} · {label}
          </li>
        ))}
      </ul>
    </section>
  );
}
