'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMembers } from '@/features/auth';
import { Badge, ErrorState, LoadingState, Modal, Notice } from '@/components/ui';
import { reassignmentLabel } from '@/lib/assignmentStatus';
import {
  useHandoffCount,
  useManageReviewerPool,
  useReviewerPools,
  type ReviewerPoolEntry,
} from './useReviewerPools';

const fieldNames = { INFRA: 'ICT인프라', SECURITY: '정보보안' };

/** 계정 역할과 분야별 담당자 등록을 구분하고, 중단된 업무의 재배정으로 연결한다. */
export function ReviewerPoolManagement() {
  const members = useMembers(),
    pools = useReviewerPools(),
    count = useHandoffCount();
  const mutation = useManageReviewerPool();
  const [field, setField] = useState<'INFRA' | 'SECURITY'>('INFRA');
  const [username, setUsername] = useState('');
  const [makeDefault, setMakeDefault] = useState(false);
  const [selected, setSelected] = useState<ReviewerPoolEntry | null>(null);
  const [message, setMessage] = useState('');
  if (members.isPending || pools.isPending) return <LoadingState />;
  if (members.error || pools.error)
    return (
      <ErrorState
        error={(members.error ?? pools.error)!}
        onRetry={() => {
          void members.refetch();
          void pools.refetch();
        }}
      />
    );
  const entries = pools.data ?? [];
  const candidates = (members.data ?? []).filter(
    (m) =>
      m.active &&
      m.role === field &&
      !entries.some((p) => p.field === field && p.memberUsername === m.username && p.active),
  );
  const defaults = entries.filter((p) => p.field === field && p.defaultReviewer);
  return (
    <section className="card" aria-labelledby="reviewer-management-title">
      <h2 id="reviewer-management-title" className="h-panel">
        분야별 담당자·업무 인계
      </h2>
      <p className="help">
        담당자 역할을 부여한 뒤 해당 분야에 등록하세요. 기본 담당자는 새 협의 요청에 자동 배정되며,
        기존 신청은 사유를 남겨 재배정합니다.
      </p>
      {count.error ? (
        <ErrorState
          error={count.error}
          onRetry={() => {
            void count.refetch();
          }}
        />
      ) : (
        <Notice tone={count.data ? 'warning' : 'info'}>
          {count.isPending ? '재배정 대상 확인 중…' : `재배정 필요 ${count.data ?? 0}건`} ·{' '}
          <Link href="/requests?filter=mine">재배정 대상 신청 보기</Link>
        </Notice>
      )}
      <form
        className="reviewer-registration"
        onSubmit={async (e) => {
          e.preventDefault();
          setMessage('');
          try {
            await mutation.mutateAsync({
              kind: 'register',
              field,
              memberUsername: username,
              defaultReviewer: makeDefault,
            });
            setUsername('');
            setMakeDefault(false);
            setMessage('담당자 등록을 저장했습니다.');
          } catch {
            /* 입력 보존 */
          }
        }}
      >
        <div className="field">
          <label htmlFor="pool-field">담당 분야</label>
          <select
            className="input"
            id="pool-field"
            value={field}
            onChange={(e) => {
              setField(e.target.value as 'INFRA' | 'SECURITY');
              setUsername('');
              mutation.reset();
            }}
          >
            <option value="INFRA">ICT인프라</option>
            <option value="SECURITY">정보보안</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="pool-member">등록할 담당자</label>
          <select
            className="input"
            id="pool-member"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          >
            <option value="">담당자를 선택해 주세요</option>
            {candidates.map((m) => (
              <option key={m.username} value={m.username}>
                {m.displayName} · {m.username}
              </option>
            ))}
          </select>
          {!candidates.length && (
            <p className="help">
              등록할 활성 계정이 없습니다. 아래 계정 목록에서 해당 분야 역할을 부여해 주세요.
            </p>
          )}
        </div>
        <label className="check-row">
          <input
            type="checkbox"
            checked={makeDefault}
            onChange={(e) => setMakeDefault(e.target.checked)}
          />
          새 협의 요청의 기본 담당자로 지정
        </label>
        <button className="btn btn-primary" disabled={mutation.isPending || !username}>
          담당자 등록
        </button>
      </form>
      {!defaults.some((p) => p.eligible) && (
        <Notice tone="warning">
          {fieldNames[field]} 분야에 배정 가능한 기본 담당자가 없습니다. 아래 목록에서 기본 담당자를
          지정해 주세요.
        </Notice>
      )}
      {message && <p role="status">{message}</p>}
      {mutation.error && <Notice tone="danger">{mutation.error.message}</Notice>}
      <div
        className="tbl-wrap"
        tabIndex={0}
        role="region"
        aria-label="분야별 담당자 표, 가로 스크롤 가능"
      >
        <table className="tbl">
          <caption className="sr-only">{fieldNames[field]} 담당자 등록 및 기본 지정 현황</caption>
          <thead>
            <tr>
              <th scope="col">담당자</th>
              <th scope="col">등록 상태</th>
              <th scope="col">기본 배정</th>
              <th scope="col">관리</th>
            </tr>
          </thead>
          <tbody>
            {entries
              .filter((p) => p.field === field)
              .map((p) => {
                const member = members.data?.find((m) => m.username === p.memberUsername);
                return (
                  <tr key={p.reviewerPoolId}>
                    <td>
                      {member?.displayName ?? p.memberUsername}
                      <p className="help">{p.memberUsername}</p>
                    </td>
                    <td>
                      <Badge tone={p.eligible ? 'success' : 'warning'}>
                        {p.eligible
                          ? '배정 가능'
                          : p.unavailableReason
                            ? reassignmentLabel(p.unavailableReason)
                            : '배정 불가'}
                      </Badge>
                      <p className="help">분야 등록 {p.active ? '활성' : '비활성'}</p>
                    </td>
                    <td>
                      {p.defaultReviewer ? (
                        <Badge tone={p.eligible ? 'info' : 'warning'}>
                          {p.eligible ? '기본 담당자' : '기본 담당자 교체 필요'}
                        </Badge>
                      ) : (
                        '일반 담당자'
                      )}
                    </td>
                    <td>
                      <div className="btn-row">
                        <button
                          className="btn btn-sm"
                          type="button"
                          disabled={mutation.isPending || !p.eligible || p.defaultReviewer}
                          aria-label={`${p.memberUsername} 기본 담당자 지정`}
                          onClick={async () => {
                            setMessage('');
                            try {
                              await mutation.mutateAsync({ kind: 'default', id: p.reviewerPoolId });
                              setMessage(
                                `${fieldNames[field]} 기본 담당자를 변경했습니다. 기존 신청의 담당자는 유지됩니다.`,
                              );
                            } catch {
                              /* 오류 유지 */
                            }
                          }}
                        >
                          기본 지정
                        </button>
                        <button
                          className="btn btn-sm"
                          type="button"
                          onClick={() => setSelected(p)}
                          aria-label={`${p.memberUsername} 분야 등록 ${p.active ? '비활성화' : '활성화'}`}
                        >
                          {p.active ? '등록 비활성화' : '등록 활성화'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
      {!entries.some((p) => p.field === field) && <p>등록된 담당자가 없습니다.</p>}
      <Modal open={!!selected} title="담당자 등록 상태 변경" onClose={() => setSelected(null)}>
        {selected && (
          <PoolActivation
            key={selected.reviewerPoolId}
            pool={selected}
            onClose={() => setSelected(null)}
          />
        )}
      </Modal>
    </section>
  );
}

function PoolActivation({ pool, onClose }: { pool: ReviewerPoolEntry; onClose: () => void }) {
  const mutation = useManageReviewerPool();
  const [reason, setReason] = useState('');
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await mutation.mutateAsync({
            kind: 'activation',
            id: pool.reviewerPoolId,
            active: !pool.active,
            reason: reason.trim(),
          });
          onClose();
        } catch {
          /* 사유 보존 */
        }
      }}
    >
      <p>
        {pool.memberUsername}의 {fieldNames[pool.field]} 담당자 등록을{' '}
        {pool.active ? '비활성화' : '활성화'}합니다.
      </p>
      <Notice>
        계정의 로그인 상태와는 별개입니다. 기존 배정·답변·검토 이력은 유지되며, 비활성화하면 진행 중
        신청에 재배정 필요가 표시됩니다.
      </Notice>
      <div className="field">
        <label htmlFor="pool-reason">변경 사유 (필수)</label>
        <textarea
          id="pool-reason"
          className="input"
          rows={3}
          required
          maxLength={500}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>
      {mutation.error && <Notice tone="danger">{mutation.error.message}</Notice>}
      <div className="dlg-actions">
        <button type="button" className="btn" onClick={onClose}>
          취소
        </button>
        <button className="btn btn-primary" disabled={mutation.isPending || !reason.trim()}>
          등록 상태 저장
        </button>
      </div>
    </form>
  );
}
