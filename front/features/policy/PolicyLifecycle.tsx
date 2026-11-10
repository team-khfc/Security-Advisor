'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useSession } from '@/features/auth';
import {
  Badge,
  EmptyState,
  ErrorState,
  Icon,
  LoadingState,
  Notice,
  PageHeading,
} from '@/components/ui';
import { ruleStatusLabels, policyActionLabels, type FirewallRule } from './types';
import { usePolicies } from './usePolicies';
import { RuleDialog } from './RuleDialog';

const filters = ['전체', '적용 대기', '만료 예정·만료', '회수·적용 불가'] as const;

/** 확정 규칙을 조회하고 사람의 처리 기록·별도 연장 신청을 연결한다. */
export function PolicyLifecycle() {
  const session = useSession();
  const rules = usePolicies(Boolean(session.data));
  const [filter, setFilter] = useState<string>('전체');
  const [selected, setSelected] = useState<FirewallRule | null>(null);
  const [success, setSuccess] = useState<{ message: string; renewalId: number | null } | null>(
    null,
  );
  const statusRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (success) statusRef.current?.focus();
    else if (!selected) openerRef.current?.focus();
  }, [success, selected]);
  const data = rules.data ?? [];
  const visible = data.filter(
    (r) =>
      filter === '전체' ||
      (filter === '적용 대기' && r.status === 'PENDING_APPLY') ||
      (filter === '만료 예정·만료' && ['EXPIRING', 'EXPIRED'].includes(r.effectiveStatus)) ||
      (filter === '회수·적용 불가' && ['REVOKED', 'NOT_APPLICABLE'].includes(r.status)),
  );
  const summary = [
    [
      '관리 중인 규칙',
      data.filter((r) => ['PENDING_APPLY', 'APPLIED'].includes(r.status)).length,
      'file',
    ],
    ['적용 대기', data.filter((r) => r.status === 'PENDING_APPLY').length, 'clock'],
    [
      '만료 예정·만료',
      data.filter((r) => ['EXPIRING', 'EXPIRED'].includes(r.effectiveStatus)).length,
      'alert',
    ],
    [
      '회수·적용 불가',
      data.filter((r) => ['REVOKED', 'NOT_APPLICABLE'].includes(r.status)).length,
      'check',
    ],
  ] as const;
  return (
    <>
      <PageHeading
        title="정책 수명주기"
        description="확정된 방화벽 규칙의 사용 기간과 처리 기록을 확인합니다."
      />
      <Notice>
        <strong>서류 확정과 실제 장비 적용은 별개입니다.</strong>
        <p>
          이 화면은 담당자의 처리 결과를 기록하며, 방화벽 장비에 명령을 보내지 않습니다. 연장은 기존
          규칙을 보존하고 새 신청으로 진행합니다.
        </p>
      </Notice>
      {success && (
        <div role="status" tabIndex={-1} ref={statusRef} className="policy-result">
          <Notice tone="success">
            <p>{success.message}</p>
            {success.renewalId && (
              <Link className="btn" href={`/requests/${success.renewalId}`}>
                연장 신청 작성하기
              </Link>
            )}
          </Notice>
        </div>
      )}
      {rules.isPending ? (
        <LoadingState />
      ) : rules.error ? (
        <ErrorState
          error={rules.error}
          onRetry={() => {
            void rules.refetch();
          }}
        />
      ) : (
        <>
          <section aria-label="규칙 요약">
            <div className="stats">
              {summary.map(([label, count, icon]) => (
                <div className="stat" key={label}>
                  <span className="stat-l">
                    <Icon name={icon} />
                    <span>{label}</span>
                  </span>
                  <span className="stat-num">
                    {count}
                    <small>건</small>
                  </span>
                </div>
              ))}
            </div>
          </section>
          <section aria-labelledby="policy-list-heading">
            <div className="sec-head">
              <h2 className="h-sec" id="policy-list-heading">
                방화벽 규칙 목록
              </h2>
              <button
                type="button"
                className="btn btn-sm"
                disabled={rules.isFetching}
                onClick={() => {
                  void rules.refetch();
                }}
              >
                새로고침
              </button>
            </div>
            <div className="toolbar">
              <div className="pills" role="group" aria-label="정책 거르기">
                {filters.map((label) => (
                  <button
                    type="button"
                    className="pill"
                    key={label}
                    aria-pressed={label === filter}
                    onClick={() => setFilter(label)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <p className="filter-state" role="status">
              {filter} 결과 {visible.length}건
            </p>
            {visible.length ? (
              <div
                className="tbl-wrap"
                tabIndex={0}
                role="region"
                aria-label="방화벽 규칙 표, 좁은 화면에서는 좌우로 이동"
              >
                <table className="tbl policy-table">
                  <caption className="sr-only">확정된 방화벽 규칙과 처리 상태</caption>
                  <thead>
                    <tr>
                      {[
                        '규칙·신청',
                        '출발지',
                        '목적지',
                        '프로토콜·포트',
                        '사용 기간',
                        '상태',
                        '처리',
                      ].map((label) => (
                        <th scope="col" key={label}>
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((rule) => (
                      <tr key={rule.firewallRuleId}>
                        <th scope="row">
                          규칙 {rule.firewallRuleId}
                          <div className="meta">
                            <Link href={`/requests/${rule.securityRequestId}`}>
                              신청 {rule.securityRequestId}
                            </Link>
                          </div>
                        </th>
                        <td>{rule.source}</td>
                        <td>{rule.destination}</td>
                        <td>
                          {rule.protocol} / {rule.port}
                        </td>
                        <td>
                          {rule.startDate}
                          <br />~ {rule.endDate ?? '종료일 없음'}
                          {rule.reviewDate && <div className="meta">재검토 {rule.reviewDate}</div>}
                        </td>
                        <td>
                          <Badge
                            tone={
                              rule.status === 'APPLIED'
                                ? rule.effectiveStatus === 'APPLIED'
                                  ? 'success'
                                  : 'warning'
                                : 'neutral'
                            }
                          >
                            {ruleStatusLabels[rule.effectiveStatus]}
                          </Badge>
                          {rule.renewalRequestId && (
                            <div className="meta">
                              <Link href={`/requests/${rule.renewalRequestId}`}>
                                연장 신청 {rule.renewalRequestId}
                              </Link>
                            </div>
                          )}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-sm"
                            aria-label={`규칙 ${rule.firewallRuleId} 기록·처리`}
                            onClick={(event) => {
                              openerRef.current = event.currentTarget;
                              setSuccess(null);
                              setSelected(rule);
                            }}
                          >
                            기록·처리
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                title={
                  data.length ? '조건에 맞는 규칙이 없습니다' : '확정된 방화벽 규칙이 없습니다'
                }
                description="방화벽 신청의 서류가 확정되면 적용 대기 규칙이 표시됩니다."
              />
            )}
          </section>
        </>
      )}
      {selected && (
        <RuleDialog
          key={selected.firewallRuleId}
          rule={selected}
          role={session.data?.member.role}
          onClose={() => setSelected(null)}
          onRefresh={async () => {
            const fresh = await rules.refetch();
            if (fresh.error) throw fresh.error;
            const next = fresh.data?.find((r) => r.firewallRuleId === selected.firewallRuleId);
            if (!next) throw new Error('규칙을 찾을 수 없습니다. 목록에서 다시 확인해 주세요.');
            setSelected(next);
          }}
          onSaved={(action, renewalId) => {
            setSelected(null);
            setSuccess({
              message:
                action === 'RENEW'
                  ? '연장 신청을 만들었습니다. 기존 규칙과 사용 기간은 변경되지 않았습니다. 새 신청을 확인하고 담당자 협의를 요청해 주세요.'
                  : `${policyActionLabels[action]}을 저장했습니다. 실제 장비는 변경하지 않았습니다.`,
              renewalId,
            });
          }}
        />
      )}
    </>
  );
}
