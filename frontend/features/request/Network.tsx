'use client';
import { useState } from 'react';
import { useMemoryDraft } from '@/features/auth';
import { networkInputSchema, type NetworkInput, type SecurityRequest } from './types';
import { Badge, ErrorNotice, Icon, Notice } from '@/components/ui';
import { useRequest, useRequestMutation } from './useRequests';
import { createVersionedDraft, reconcileVersionedDraft } from '@/lib/versionedDraft';

const EMPTY_RULE: NetworkInput = {
  sourceName: '',
  sourceIp: '',
  destinationName: '',
  destinationIp: '',
  port: '',
  protocol: 'TCP',
  direction: 'ONE_WAY',
  startsOn: '',
  endsOn: '',
  purpose: '',
};
/** 통신 사실은 담당자 입력과 확인의 출처를 함께 표시하고 AI 추론으로 대체하지 않는다. */
export function NetworkTable({ procedure }: { procedure: SecurityRequest }) {
  return (
    <div className="table-scroll">
      <table className="sf-table network-table">
        <caption className="sr-only">담당자가 입력한 통신 규칙과 출처</caption>
        <thead>
          <tr>
            <th scope="col">출발지</th>
            <th scope="col">목적지</th>
            <th scope="col">프로토콜 / 포트</th>
            <th scope="col">방향</th>
            <th scope="col">적용 기간</th>
            <th scope="col">목적 / 확인</th>
          </tr>
        </thead>
        <tbody>
          {procedure.rules.map((rule) => (
            <tr key={rule.id}>
              <td>
                {rule.sourceName}
                <small>{rule.sourceIp}</small>
              </td>
              <td>
                {rule.destinationName}
                <small>{rule.destinationIp}</small>
              </td>
              <td>
                {rule.protocol} / {rule.port || '해당 없음'}
              </td>
              <td>{rule.direction === 'BIDIRECTIONAL' ? '양방향' : '출발지 → 목적지'}</td>
              <td>
                {rule.startsOn}
                <small>~ {rule.endsOn}</small>
              </td>
              <td>
                {rule.purpose}
                <small>
                  {rule.source ? `담당자 입력 · ${rule.source.actorName}` : '담당자 확인 필요'}
                </small>
                {rule.confirmation && <small>확인: {rule.confirmation.actorName}</small>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!procedure.rules.length && (
        <p className="history-empty">
          등록된 통신 규칙이 없습니다. ICT인프라 담당자가 확인 후 입력합니다.
        </p>
      )}
    </div>
  );
}
/** 통신 규칙은 인프라 담당자가 직접 확인하고 저장하며 최소 허용 범위 검증은 서버가 최종 수행한다. */
export function NetworkEditor({ procedure }: { procedure: SecurityRequest }) {
  const [draft, setDraft, clear] = useMemoryDraft(
    `network:${procedure.id}`,
    createVersionedDraft(
      procedure.revision,
      procedure.rules.map((rule) => networkInputSchema.parse(rule)),
    ),
  );
  const mutation = useRequestMutation(procedure.id);
  const latest = useRequest(procedure.id);
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState('');
  const [compare, setCompare] = useState(false);
  const synchronized = reconcileVersionedDraft(
    draft,
    procedure.revision,
    procedure.rules.map((rule) => networkInputSchema.parse(rule)),
  );
  if (synchronized !== draft) setDraft(synchronized);
  const allowed = procedure.allowedActions.includes('EDIT');
  function change(index: number, key: keyof NetworkInput, value: string) {
    setConfirmed(false);
    setMessage('');
    setDraft((current) => ({
      ...current,
      value: current.value.map((rule, row) =>
        index === row
          ? {
              ...rule,
              [key]: value,
              ...(key === 'protocol' && value === 'ICMP' ? { port: '' } : {}),
            }
          : rule,
      ),
    }));
  }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!confirmed) return;
    try {
      const result = await mutation.mutateAsync({
        endpoint: '/network',
        method: 'PUT',
        body: { expectedRevision: draft.revision, rules: draft.value },
      });
      setDraft(
        createVersionedDraft(
          result.revision,
          result.rules.map((rule) => networkInputSchema.parse(rule)),
        ),
      );
      clear();
      setMessage('통신 규칙과 담당자 확인을 저장했습니다. 실제 방화벽 적용은 수행하지 않았습니다.');
    } catch {
      /* 충돌 비교를 위해 통신 규칙 초안 전체를 유지한다. */
    }
  }
  return (
    <form onSubmit={save}>
      <div className="panel-heading">
        <h2>통신 규칙 입력</h2>
        <Badge tone="blue">ICT인프라 담당자</Badge>
      </div>
      <Notice>
        합성 정보만 입력해 주세요. IPv4 또는 /24~ /32 대역, TCP·UDP 단일 포트 또는 최대 1,024개
        범위를 허용하며 적용 기간은 최대 366일입니다.
      </Notice>
      <ErrorNotice error={mutation.error} />
      {mutation.error && (
        <button
          className="text-button"
          type="button"
          disabled={latest.isFetching}
          onClick={() =>
            void latest.refetch().then((result) => {
              if (result.data) {
                setDraft((current) => ({ ...current, revision: result.data.revision }));
                setCompare(true);
                setConfirmed(false);
              }
            })
          }
        >
          최신 규칙과 비교하고 입력 유지
        </button>
      )}
      {compare && (
        <div className="sf-notice info">
          <div>
            <p>서버에 저장된 최신 규칙입니다. 유지한 입력과 비교해 주세요.</p>
            <NetworkTable procedure={procedure} />
          </div>
        </div>
      )}
      {draft.value.map((rule, index) => (
        <fieldset
          className="network-editor"
          key={rule.id ?? `new-${index}`}
          disabled={!allowed || mutation.isPending}
        >
          <legend>통신 규칙 {index + 1}</legend>
          <div className="network-fields">
            {(
              [
                ['sourceName', '출발지 서버·자산명'],
                ['sourceIp', '출발지 IPv4 / 대역'],
                ['destinationName', '목적지 서버·자산명'],
                ['destinationIp', '목적지 IPv4 / 대역'],
              ] as const
            ).map(([key, label]) => (
              <div className="sf-field" key={key}>
                <label htmlFor={`network-${index}-${key}`}>
                  {label}
                  <span className="required">필수</span>
                </label>
                <input
                  id={`network-${index}-${key}`}
                  value={rule[key]}
                  required
                  maxLength={key === 'sourceIp' || key === 'destinationIp' ? 64 : 100}
                  onChange={(event) => change(index, key, event.target.value)}
                />
              </div>
            ))}
            <div className="sf-field">
              <label htmlFor={`protocol-${index}`}>프로토콜</label>
              <select
                id={`protocol-${index}`}
                value={rule.protocol}
                onChange={(event) => change(index, 'protocol', event.target.value)}
              >
                <option>TCP</option>
                <option>UDP</option>
                <option>ICMP</option>
              </select>
            </div>
            <div className="sf-field">
              <label htmlFor={`port-${index}`}>목적지 포트</label>
              <input
                id={`port-${index}`}
                value={rule.port}
                required={rule.protocol !== 'ICMP'}
                disabled={rule.protocol === 'ICMP'}
                placeholder={
                  rule.protocol === 'ICMP' ? 'ICMP는 포트 없음' : '예: 443 또는 8000-8005'
                }
                maxLength={20}
                onChange={(event) => change(index, 'port', event.target.value)}
              />
            </div>
            <div className="sf-field wide">
              <label htmlFor={`direction-${index}`}>통신 방향</label>
              <select
                id={`direction-${index}`}
                value={rule.direction}
                onChange={(event) => change(index, 'direction', event.target.value)}
              >
                <option value="ONE_WAY">단방향 · 출발지 → 목적지</option>
                <option value="BIDIRECTIONAL">양방향 · 양쪽 연결 개시 필요</option>
              </select>
            </div>
            <div className="sf-field">
              <label htmlFor={`starts-${index}`}>적용 시작일</label>
              <input
                id={`starts-${index}`}
                type="date"
                required
                value={rule.startsOn}
                onChange={(event) => change(index, 'startsOn', event.target.value)}
              />
            </div>
            <div className="sf-field">
              <label htmlFor={`ends-${index}`}>적용 종료일</label>
              <input
                id={`ends-${index}`}
                type="date"
                min={rule.startsOn}
                required
                value={rule.endsOn}
                onChange={(event) => change(index, 'endsOn', event.target.value)}
              />
            </div>
            <div className="sf-field wide">
              <label htmlFor={`purpose-${index}`}>통신 필요 사유</label>
              <textarea
                id={`purpose-${index}`}
                required
                rows={2}
                maxLength={1000}
                value={rule.purpose}
                onChange={(event) => change(index, 'purpose', event.target.value)}
              />
            </div>
          </div>
          <button
            className="text-button"
            type="button"
            onClick={() => {
              setDraft((current) => ({
                ...current,
                value: current.value.filter((_, row) => index !== row),
              }));
              setConfirmed(false);
            }}
          >
            <Icon name="close" width={16} height={16} />이 규칙 삭제
          </button>
        </fieldset>
      ))}
      <button
        className="button"
        type="button"
        disabled={!allowed || mutation.isPending || draft.value.length >= 50}
        onClick={() => {
          setDraft((current) => ({ ...current, value: [...current.value, { ...EMPTY_RULE }] }));
          setConfirmed(false);
        }}
      >
        <Icon name="plus" />
        통신 규칙 추가
      </button>
      <label className="check-label">
        <input
          type="checkbox"
          checked={confirmed}
          disabled={!allowed || mutation.isPending}
          onChange={(event) => setConfirmed(event.target.checked)}
        />
        출발지·목적지·포트·기간과 최소 허용 범위를 직접 확인했습니다.
      </label>
      <button
        className="button"
        type="submit"
        disabled={!allowed || !confirmed || mutation.isPending}
      >
        {mutation.isPending ? '저장 확인 중…' : '통신 규칙 저장'}
      </button>
      {message && (
        <p className="action-feedback" role="status">
          {message}
        </p>
      )}
    </form>
  );
}
