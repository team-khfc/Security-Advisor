'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { Badge, Field, Modal, Notice } from '@/components/ui';
import { ApiError } from '@/lib/httpClient';
import {
  canRecord,
  policyActionLabels,
  ruleStatusLabels,
  type FirewallRule,
  type PolicyAction,
} from './types';
import { usePolicyMutation, useRenewalRequest } from './usePolicies';

/** 확정값·기존 기록을 확인하고 명시적으로 선택한 처리만 저장한다. */
export function RuleDialog({
  rule,
  role,
  onClose,
  onRefresh,
  onSaved,
}: {
  rule: FirewallRule;
  role?: string;
  onClose: () => void;
  onRefresh: () => Promise<void>;
  onSaved: (action: PolicyAction, renewalId: number | null) => void;
}) {
  const mutation = usePolicyMutation();
  const renewal = useRenewalRequest(rule.renewalRequestId);
  const [action, setAction] = useState<PolicyAction | null>(null);
  const [text, setText] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [checked, setChecked] = useState(false);
  const [localError, setLocalError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const hasOpenRenewal =
    rule.renewalRequestId !== null &&
    (!renewal.data || !['CONFIRMED', 'CLOSED', 'WITHDRAWN'].includes(renewal.data.status));
  const can = (a: PolicyAction) => canRecord(rule, a, role) && (a !== 'RENEW' || !hasOpenRenewal);
  const conflict = mutation.error instanceof ApiError && mutation.error.status === 409;
  const allowed = action !== null && can(action);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!action || !allowed || mutation.isPending || !checked || conflict) return;
    if ((action === 'REVOKED' || action === 'NOT_APPLICABLE') && !text.trim()) {
      setLocalError('사유를 입력해 주세요.');
      return;
    }
    if (action === 'RENEW' && (!start || !end || end < start)) {
      setLocalError('종료일을 시작일과 같거나 이후로 입력해 주세요.');
      return;
    }
    setLocalError('');
    try {
      const id = await mutation.mutateAsync({ rule, action, text, start, end });
      onSaved(action, id);
    } catch {
      /* 서버 오류가 나도 입력과 실패 사유를 함께 보존한다. */
    }
  }
  return (
    <Modal
      open
      title={`규칙 ${rule.firewallRuleId} 기록·처리`}
      onClose={() => {
        if (!mutation.isPending) onClose();
      }}
    >
      <div className="policy-detail">
        <Badge>{ruleStatusLabels[rule.effectiveStatus]}</Badge>
        <p>
          확정 제출본 {rule.submissionId} · 규칙 {rule.ruleNo}. 확정된 통신 정보는 수정하지
          않습니다.
        </p>
        <dl className="policy-values">
          <dt>출발지</dt>
          <dd>{rule.source}</dd>
          <dt>목적지</dt>
          <dd>{rule.destination}</dd>
          <dt>프로토콜·포트</dt>
          <dd>
            {rule.protocol} / {rule.port}
          </dd>
          <dt>사용 기간</dt>
          <dd>
            {rule.startDate} ~ {rule.endDate ?? '종료일 없음'}
          </dd>
          {rule.reviewDate && (
            <>
              <dt>정기 재검토일</dt>
              <dd>{rule.reviewDate}</dd>
            </>
          )}
        </dl>
        <section aria-label="저장된 처리 기록">
          <h3 className="h-sub">저장된 처리 기록</h3>
          {rule.appliedAt ? (
            <p>
              최근 상태 기록: {rule.appliedBy} ·{' '}
              <time dateTime={rule.appliedAt}>
                {new Date(rule.appliedAt).toLocaleString('ko-KR')}
              </time>{' '}
              <Badge>담당자 입력</Badge>
            </p>
          ) : (
            <p>아직 적용 결과가 기록되지 않았습니다.</p>
          )}
          {rule.applicationNote && <p className="policy-note">적용 메모: {rule.applicationNote}</p>}
          {rule.reason && (
            <p className="policy-note">
              {rule.status === 'REVOKED' ? '회수' : '적용 불가'} 사유: {rule.reason}
            </p>
          )}
          <Link href={`/requests/${rule.securityRequestId}#request-history`}>
            원 신청과 처리 이력 보기
          </Link>
          {rule.renewalRequestId && (
            <p>
              <Link href={`/requests/${rule.renewalRequestId}`}>
                연장 신청 {rule.renewalRequestId} 보기
              </Link>
            </p>
          )}
          {renewal.error && (
            <p role="alert">
              연장 신청 상태를 확인하지 못했습니다. 중복 생성을 막기 위해 기존 연장 신청을 먼저
              확인해 주세요.
            </p>
          )}
        </section>
        <p className="help">
          적용·회수는 ICT인프라 담당자가 결과만 기록합니다. 연장은 신청자가 새 신청을 작성하고
          담당자 협의·제출·확정을 다시 거칩니다.
        </p>
        <div className="btn-row" role="group" aria-label="규칙 처리 선택">
          {(Object.keys(policyActionLabels) as PolicyAction[]).filter(can).map((a) => (
            <button
              type="button"
              className="btn"
              key={a}
              disabled={mutation.isPending}
              aria-pressed={action === a}
              onClick={() => {
                setAction(a);
                setText('');
                setChecked(false);
                setLocalError('');
                mutation.reset();
              }}
            >
              {policyActionLabels[a]}
            </button>
          ))}
        </div>
        {action && (
          <form
            onSubmit={(event) => {
              void submit(event);
            }}
            aria-label={policyActionLabels[action]}
          >
            <h3 className="h-sub">{policyActionLabels[action]}</h3>
            {action === 'RENEW' && (
              <>
                <p>
                  기존 규칙의 사용 기간은 그대로 유지됩니다. 새 신청에 복사된 답변도 다시 확인해야
                  합니다.
                </p>
                <div className="policy-dates">
                  <Field label="새 사용 시작일" htmlFor="policy-start">
                    <input
                      id="policy-start"
                      className="input"
                      type="date"
                      required
                      value={start}
                      onChange={(e) => setStart(e.target.value)}
                    />
                  </Field>
                  <Field label="새 사용 종료일" htmlFor="policy-end">
                    <input
                      id="policy-end"
                      className="input"
                      type="date"
                      required
                      min={start || undefined}
                      value={end}
                      onChange={(e) => setEnd(e.target.value)}
                    />
                  </Field>
                </div>
              </>
            )}
            <Field
              label={
                action === 'RENEW'
                  ? '연장 사유 (선택)'
                  : action === 'APPLIED'
                    ? '적용 근거 메모 (선택)'
                    : '사유 (필수)'
              }
              htmlFor="policy-note"
            >
              <textarea
                id="policy-note"
                className="input"
                rows={3}
                maxLength={action === 'RENEW' ? 1000 : 2000}
                required={action === 'REVOKED' || action === 'NOT_APPLICABLE'}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </Field>
            <label className="policy-confirm">
              <input
                type="checkbox"
                checked={checked}
                required
                onChange={(e) => setChecked(e.target.checked)}
              />
              <span>
                {action === 'RENEW'
                  ? '기존 규칙을 변경하지 않고 새 연장 신청을 만드는 것을 확인했습니다.'
                  : '입력한 처리 결과를 확인했습니다. 저장은 장비 변경 없이 기록만 남깁니다.'}
              </span>
            </label>
            {!allowed && (
              <Notice tone="warning">
                현재 상태에서는 이 처리를 저장할 수 없습니다. 입력 내용은 보존했습니다.
              </Notice>
            )}
            {(localError || mutation.error) && (
              <Notice tone="danger">
                <p>
                  {localError ||
                    (mutation.error instanceof Error
                      ? mutation.error.message
                      : '저장하지 못했습니다.')}
                </p>
                {conflict && (
                  <button
                    type="button"
                    className="btn"
                    disabled={refreshing}
                    onClick={async () => {
                      setRefreshing(true);
                      try {
                        await onRefresh();
                        mutation.reset();
                        setLocalError('');
                      } catch (error) {
                        setLocalError(
                          error instanceof Error ? error.message : '최신 상태 조회 실패',
                        );
                      } finally {
                        setRefreshing(false);
                      }
                    }}
                  >
                    입력 유지하고 최신 상태 확인
                  </button>
                )}
              </Notice>
            )}
            <div className="btn-row">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={mutation.isPending || !allowed || !checked || conflict || refreshing}
              >
                {mutation.isPending
                  ? '저장 중…'
                  : action === 'RENEW'
                    ? '새 연장 신청 만들기'
                    : '기록 저장'}
              </button>
              <button type="button" className="btn" disabled={mutation.isPending} onClick={onClose}>
                취소
              </button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}
