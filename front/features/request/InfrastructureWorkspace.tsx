'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { requestJson } from '@/lib/httpClient';
import { Notice } from '@/components/ui';
import type { Actor } from '@/lib/types';
import type { SecurityRequest } from './types';
import { RequestTechnicalDetails } from './RequestTechnicalDetails';
import {
  infrastructurePlanSchema,
  type InfrastructurePlan,
  type InfraConnection,
} from './infrastructurePlan';
import { networkValueValid } from './networkAnswerFormat';
import { InfrastructureServers, InfrastructureSummary } from './InfrastructureServers';
import { InfrastructureServerAi } from './InfrastructureServerAi';
import {
  resolveConnections,
  operationLabels,
  infraCheckLabels,
  type InfraServer,
} from './infrastructurePlan';
import { InfrastructureAiProposal } from './InfrastructureAiProposal';
const formatTime = (value: string) =>
  new Date(value).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });

function startingRow(request: SecurityRequest): InfraConnection {
  const answers = [...request.commonAnswers, ...request.answers];
  const get = (key: string) => answers.find((a) => a.key === key)?.value || '';
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const period = (get('firewall.period') || get('project.period')).split('~').map((v) => v.trim());
  return {
    id: crypto.randomUUID(),
    sourceSystem: get('network.source_system'),
    sourceAddress: get('network.source'),
    sourceZone: '',
    destinationSystem: get('network.destination_system') || get('system.target_server'),
    destinationAddress: get('network.destination'),
    destinationZone: '',
    protocol: get('firewall.protocol') || 'TCP',
    port: get('firewall.port'),
    purpose: get('firewall.purpose'),
    direction: get('firewall.direction'),
    startDate: /^\d{4}-\d{2}-\d{2}$/.test(period[0]) ? period[0] : today,
    endDate: /^\d{4}-\d{2}-\d{2}$/.test(period[1] || '')
      ? period[1]
      : ['상시', '종료일 없음', ''].includes(period[1] ?? 'missing')
        ? '9999-12-31'
        : today,
  };
}
export function InfrastructureWorkspace({
  request,
  actor,
  commonEditor,
  children,
  onDirtyChange,
}: {
  request: SecurityRequest;
  actor: Actor;
  commonEditor?: ReactNode;
  children?: ReactNode;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const frozen = request.stage >= 4 || request.status === 'FINALIZED';
  const query = useQuery({
    queryKey: ['infrastructure-plan', request.id],
    enabled: !frozen,
    queryFn: async () =>
      infrastructurePlanSchema.parse(
        await requestJson(
          '/api/security-requests/' + encodeURIComponent(request.id) + '/infrastructure-plan',
        ),
      ),
    retry: false,
  });
  const snapshot = request.submissions.find((s) => s.id === request.currentSubmissionId)
    ?.snapshot as { infrastructurePlan?: InfrastructurePlan } | undefined;
  const plan = frozen ? snapshot?.infrastructurePlan : query.data;
  const canEdit =
    request.stage === 2 &&
    (actor.role === 'INFRA' || actor.role === 'SECURITY') &&
    request.assignments.some(
      (a) =>
        a.active && a.field === actor.role && a.assigneeId === actor.id && !a.reassignmentReason,
    );
  return (
    <>
      {canEdit && actor.role === 'SECURITY' && (
        <Notice tone="warning">
          서버·네트워크·운영 정보를 저장하면 완료된 ICT인프라 협의가 재검토로 전환됩니다. ICT인프라
          담당자가 다시 협의를 완료한 뒤 정보보안 협의를 완료할 수 있습니다.
        </Notice>
      )}
      {canEdit && query.data && (
        <InfrastructureEditor
          reviewerLabel={actor.role === 'SECURITY' ? '정보보안' : 'ICT인프라'}
          request={request}
          plan={query.data}
          onDirtyChange={onDirtyChange}
        >
          {commonEditor}
        </InfrastructureEditor>
      )}
      {query.isPending && !frozen && <p role="status">ICT인프라 검토 정보를 불러오는 중…</p>}
      {query.error && !frozen && (
        <Notice tone="danger">
          검토 정보를 불러오지 못했습니다.{' '}
          <button type="button" className="btn" onClick={() => void query.refetch()}>
            다시 불러오기
          </button>
        </Notice>
      )}
      <RequestTechnicalDetails request={request} infrastructurePlan={plan}>
        {children}
      </RequestTechnicalDetails>
      {!canEdit && plan && plan.schemaVersion >= 2 && <InfrastructureSummary plan={plan} />}
      {!canEdit && plan?.notes && (
        <section className="card">
          <h2 className="h-panel">ICT인프라 검토 사항</h2>
          <p style={{ whiteSpace: 'pre-wrap' }}>{plan.notes}</p>
          <p className="help">
            작성: {plan.updatedBy} · {plan.updatedAt && formatTime(plan.updatedAt)}
          </p>
        </section>
      )}
    </>
  );
}
function InfrastructureEditor({
  reviewerLabel,
  request,
  plan,
  onDirtyChange,
  children,
}: {
  reviewerLabel: string;
  request: SecurityRequest;
  plan: InfrastructurePlan;
  onDirtyChange: (dirty: boolean) => void;
  children?: ReactNode;
}) {
  const client = useQueryClient();
  const [draft, setDraft] = useState<{
    revision: number;
    connections: InfraConnection[];
    notes: string;
    answerRevisions: Record<string, number>;
    servers: InfraServer[];
    operations: Record<string, string>;
    checklist: Record<string, boolean>;
  } | null>(null);
  const [seed] = useState(() => startingRow(request));
  const servers = draft?.servers ?? plan.servers;
  const operations = draft?.operations ?? plan.operations;
  const checklist = draft?.checklist ?? plan.checklist;
  const rows = resolveConnections(
    draft?.connections ?? (plan.connections.length ? plan.connections : [seed]),
    servers,
  );
  const notes = draft?.notes ?? plan.notes;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [aiApplied, setAiApplied] = useState(plan.aiPending);
  const [aiConfirmed, setAiConfirmed] = useState(false);
  const dirty = !!draft;
  const conflict = dirty && draft.revision !== plan.revision;
  useEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  function edit(
    connections: InfraConnection[],
    nextNotes = notes,
    extras: Partial<{
      servers: InfraServer[];
      operations: Record<string, string>;
      checklist: Record<string, boolean>;
    }> = {},
  ) {
    setAiConfirmed(false);
    setDraft((d) => ({
      revision: d?.revision ?? plan.revision,
      connections,
      notes: nextNotes,
      servers: extras.servers ?? servers,
      operations: extras.operations ?? operations,
      checklist: extras.checklist ?? {},
      answerRevisions:
        d?.answerRevisions ??
        Object.fromEntries(
          [...request.commonAnswers, ...request.answers]
            .filter((a) => a.revision !== undefined)
            .map((a) => [a.key, a.revision!]),
        ),
    }));
    setSaved('');
  }
  function change(id: string, key: keyof InfraConnection, value: string) {
    edit(rows.map((r) => (r.id === id ? { ...r, [key]: value } : r)));
  }
  const input = (
    row: InfraConnection,
    key: keyof InfraConnection,
    label: string,
    type = 'text',
  ) => (
    <label>
      <span className="infra-field-label">{label}</span>
      <input
        className="input"
        type={type}
        required
        readOnly={
          !!(key.startsWith('source')
            ? row.sourceServerId
            : key.startsWith('destination')
              ? row.destinationServerId
              : false)
        }
        placeholder="확인 필요"
        value={row[key] ?? ''}
        maxLength={
          key === 'purpose'
            ? 1000
            : key === 'sourceSystem' || key === 'destinationSystem'
              ? 200
              : 4000
        }
        onChange={(e) => change(row.id, key, e.target.value)}
      />
      {!row[key] && <span className="help">확인 필요</span>}
    </label>
  );
  const select = (
    row: InfraConnection,
    key: keyof InfraConnection,
    label: string,
    options: string[],
  ) => (
    <label>
      <span className="infra-field-label">{label}</span>
      <select
        className="input"
        required
        disabled={
          !!(key.startsWith('source')
            ? row.sourceServerId
            : key.startsWith('destination')
              ? row.destinationServerId
              : false)
        }
        value={row[key] ?? ''}
        onChange={(e) => change(row.id, key, e.target.value)}
      >
        <option value="">확인 필요 · 선택해 주세요</option>
        {options.map((v) => (
          <option key={v}>{v}</option>
        ))}
      </select>
    </label>
  );
  return (
    <section className="card infra-workspace" aria-labelledby="infra-edit-heading">
      <h2 className="h-panel" id="infra-edit-heading">
        {reviewerLabel} 검토 정보 입력
      </h2>
      <p className="help">
        서버와 통신 구간을 추가하고, 네트워크 정보·검토 사항을 함께 저장하세요. 첫 구간은 기존
        공통·서류 항목에도 반영됩니다. 저장 후 아래 흐름도와 방화벽 규칙에서 확인할 수 있습니다.
      </p>
      {plan.draft && (
        <Notice tone="warning">
          임시 저장 상태입니다. 확인 저장 전에는 협의를 완료할 수 없습니다.
        </Notice>
      )}
      <InfrastructureServerAi
        requestId={request.id}
        revision={plan.revision}
        servers={servers}
        contextVersion={JSON.stringify([rows, operations, request.revision])}
        disabled={busy || conflict}
        onApply={(next) => edit(rows, notes, { servers: next })}
      />
      <InfrastructureAiProposal
        requestId={request.id}
        revision={plan.revision}
        rows={rows}
        contextVersion={JSON.stringify([
          notes,
          servers,
          operations,
          checklist,
          request.revision,
          request.commonAnswers,
          request.answers,
        ])}
        disabled={busy || conflict}
        onApply={(nextRows) => {
          edit(nextRows);
          setAiApplied(true);
          setAiConfirmed(false);
        }}
      />
      <form
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          const temporary =
            (e.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'draft';
          if (!temporary && !e.currentTarget.reportValidity()) return;
          setError('');
          setSaved('');
          if (!temporary && aiApplied && !aiConfirmed) {
            setError('AI 제안의 근거와 통신 관계를 확인한 뒤 확인란을 선택해 주세요.');
            return;
          }
          if (conflict) {
            setError(
              '다른 곳에서 수정되었습니다. 입력을 복사한 뒤 최신 정보로 다시 시작해 주세요.',
            );
            return;
          }
          setBusy(true);
          try {
            if (!temporary)
              for (const row of rows) {
                for (const [type, value] of [
                  ['IP_ADDRESS', row.sourceAddress],
                  ['IP_ADDRESS', row.destinationAddress],
                  ['PORT', row.port],
                  ['PROTOCOL', row.protocol],
                ] as const)
                  if (!networkValueValid(type, value))
                    throw new Error('통신 구간의 IP/CIDR·프로토콜·포트 형식을 확인해 주세요.');
                if (row.endDate < row.startDate)
                  throw new Error('종료일은 시작일보다 빠를 수 없습니다.');
              }
            const next = infrastructurePlanSchema.parse(
              await requestJson(
                '/api/security-requests/' + encodeURIComponent(request.id) + '/infrastructure-plan',
                {
                  method: 'PUT',
                  body: {
                    expectedRevision: draft?.revision ?? plan.revision,
                    connections: rows,
                    schemaVersion: 2,
                    draft: temporary,
                    aiPending: aiApplied && !aiConfirmed,
                    servers,
                    operations,
                    checklist,
                    notes,
                    answerRevisions:
                      draft?.answerRevisions ??
                      Object.fromEntries(
                        [...request.commonAnswers, ...request.answers]
                          .filter((a) => a.revision !== undefined)
                          .map((a) => [a.key, a.revision]),
                      ),
                  },
                },
              ),
            );
            client.setQueryData(['infrastructure-plan', request.id], next);
            setDraft(null);
            setSaved(
              temporary
                ? '임시 저장했습니다. 입력은 보존되며 확인 저장 전에는 협의를 완료할 수 없습니다.'
                : reviewerLabel === '정보보안'
                  ? '검토 정보를 저장했습니다. ICT인프라 재협의가 완료된 뒤 정보보안 협의를 완료해 주세요.'
                  : `${reviewerLabel} 검토 정보를 저장했습니다.`,
            );
            setAiApplied(next.aiPending);
            setAiConfirmed(false);
            await client.invalidateQueries();
          } catch (cause) {
            setError(
              cause instanceof Error ? cause.message : '저장하지 못했습니다. 입력은 유지됩니다.',
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy} className="infra-connection-list">
          <legend className="sr-only">서버·통신 구간</legend>
          <InfrastructureServers
            servers={servers}
            linkedIds={rows
              .flatMap((r) => [r.sourceServerId, r.destinationServerId])
              .filter((id): id is string => !!id)}
            onChange={(next) => edit(rows, notes, { servers: next })}
          />
          <h3>2. 네트워크 구성</h3>
          {rows.map((row, index) => (
            <fieldset key={row.id} className="infra-connection">
              <legend>통신 구간 {index + 1}</legend>
              <div className="infra-link-selects">
                {(['source', 'destination'] as const).map((side) => (
                  <label key={side}>
                    {side === 'source' ? '출발지' : '목적지'} 서버 연결
                    <select
                      className="input"
                      value={
                        row[side === 'source' ? 'sourceServerId' : 'destinationServerId'] || ''
                      }
                      onChange={(e) =>
                        change(
                          row.id,
                          side === 'source' ? 'sourceServerId' : 'destinationServerId',
                          e.target.value,
                        )
                      }
                    >
                      <option value="">직접 입력 · 외부 대상</option>
                      {servers.map((server, n) => (
                        <option value={server.id} key={server.id}>
                          서버 {n + 1}: {server.name || '이름 확인 필요'}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              <div className="infra-grid">
                {input(row, 'sourceSystem', '출발지 서버·시스템명')}
                {input(row, 'sourceAddress', '출발지 IP·CIDR')}
                {select(row, 'sourceZone', '출발지 망 구간', [
                  '외부',
                  'DMZ',
                  '내부망',
                  '클라우드',
                  '기타',
                ])}
                {input(row, 'destinationSystem', '목적지 서버·시스템명')}
                {input(row, 'destinationAddress', '목적지 IP·CIDR')}
                {select(row, 'destinationZone', '목적지 망 구간', [
                  '외부',
                  'DMZ',
                  '내부망',
                  '클라우드',
                  '기타',
                ])}
                {select(row, 'protocol', '프로토콜', [
                  'TCP',
                  'UDP',
                  'ICMP',
                  'ICMPV6',
                  'ESP',
                  'AH',
                  'GRE',
                ])}
                {input(row, 'port', '포트·포트 범위')}
                {select(row, 'direction', '통신 방향', ['인바운드', '아웃바운드', '양방향'])}
                {input(row, 'startDate', '허용 시작일', 'date')}
                {input(row, 'endDate', '허용 종료일', 'date')}
                {input(row, 'purpose', '허용 목적')}
              </div>
              <p className="help">
                주소와 포트 목록은 쉼표로 구분합니다. 상시 운영의 종료일은 9999-12-31입니다.
              </p>
              <button
                type="button"
                className="btn btn-sm"
                disabled={rows.length === 1}
                onClick={() => edit(rows.filter((r) => r.id !== row.id))}
              >
                통신 구간 {index + 1} 삭제
              </button>
            </fieldset>
          ))}
          <button
            type="button"
            className="btn"
            disabled={rows.length >= 50}
            onClick={() =>
              edit([
                ...rows,
                {
                  ...seed,
                  id: crypto.randomUUID(),
                  sourceSystem: '',
                  sourceAddress: '',
                  destinationSystem: '',
                  destinationAddress: '',
                  port: '',
                  purpose: '',
                },
              ])
            }
          >
            서버·통신 구간 추가
          </button>
          <h3>3. 운영 및 검토 사항</h3>
          {Object.entries(operationLabels).map(([key, label]) => (
            <div className="field" key={key}>
              <label htmlFor={'infra-op-' + key}>
                {label}
                {['network', 'management', 'owner'].includes(key)
                  ? ' (확인 저장 시 필수)'
                  : ' (선택)'}
              </label>
              <textarea
                className="input"
                id={'infra-op-' + key}
                rows={2}
                maxLength={4000}
                value={operations[key] || ''}
                onChange={(e) =>
                  edit(rows, notes, { operations: { ...operations, [key]: e.target.value } })
                }
              />
            </div>
          ))}
          <fieldset className="review-checklist">
            <legend>{reviewerLabel} 구성 검토 체크리스트</legend>
            {Object.entries(infraCheckLabels).map(([key, label]) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={checklist[key] === true}
                  onChange={(e) =>
                    edit(rows, notes, { checklist: { ...checklist, [key]: e.target.checked } })
                  }
                />{' '}
                {label}
              </label>
            ))}
          </fieldset>
          <div className="field">
            <label htmlFor="infra-review-notes">{reviewerLabel} 검토 사항</label>
            <textarea
              id="infra-review-notes"
              className="input"
              rows={4}
              maxLength={4000}
              value={notes}
              onChange={(e) => edit(rows, e.target.value)}
              placeholder="서버·DB 구성, 운영 환경, 망 분리, 접속 경로와 운영 책임 등 정보보안 담당자에게 전달할 내용을 기록하세요."
            />
          </div>
          {conflict && (
            <Notice tone="warning">
              다른 곳에서 변경되었습니다. 입력은 유지됩니다. 내용을 복사한 뒤 새로고침해 주세요.
            </Notice>
          )}
          {error && <Notice tone="danger">{error}</Notice>}
          {saved && <p role="status">{saved}</p>}
          {aiApplied && (
            <label>
              <input
                type="checkbox"
                checked={aiConfirmed}
                onChange={(e) => setAiConfirmed(e.target.checked)}
              />{' '}
              AI 제안의 근거·통신 관계와 보완한 값을 확인했습니다. 담당자 검토 정보로 저장합니다.
            </label>
          )}
          <button
            type="submit"
            name="saveMode"
            value="draft"
            formNoValidate
            className="btn"
            disabled={busy || conflict}
          >
            임시 저장
          </button>
          <button
            className="btn btn-primary"
            disabled={busy || conflict || (aiApplied && !aiConfirmed)}
          >
            {busy ? '저장 중…' : `${reviewerLabel} 검토 정보 저장`}
          </button>
          {dirty && <span className="help"> 저장하지 않은 변경 있음</span>}
        </fieldset>
      </form>
      {children}
    </section>
  );
}
