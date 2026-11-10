'use client';

import { useState } from 'react';
import { useMembers, useSession, useUpdateMember } from '@/features/auth';
import { Badge, ErrorState, LoadingState, Modal, Notice, PageHeading } from '@/components/ui';
import { ROLE_LABELS, type Actor, type Role } from '@/lib/types';
import { ReviewerPoolManagement } from './ReviewerPoolManagement';

/** 역할 변경은 관리자 API가 검증하고 사유를 감사 이력에 남긴다. */
export function MemberManagement() {
  const session = useSession();
  return session.data?.member.role === 'ADMIN' ? (
    <MemberTable />
  ) : (
    <Notice tone="warning">기관 관리자만 계정 역할과 활성 상태를 관리할 수 있습니다.</Notice>
  );
}

function MemberTable() {
  const query = useMembers();
  const [selected, setSelected] = useState<Actor | null>(null);
  if (query.isPending) return <LoadingState />;
  if (query.error)
    return (
      <ErrorState
        error={query.error}
        onRetry={() => {
          void query.refetch();
        }}
      />
    );
  return (
    <>
      <PageHeading
        title="계정·담당자 관리"
        description="가입 계정은 일반 사용자입니다. 역할 변경에는 사유를 기록해 주세요."
      />
      <Notice>
        신청 담당자는 해당 신청 상세에서 재배정합니다. 자기 신청의 담당자가 될 수 없으며, 비활성
        담당자는 새 배정에서 제외됩니다.
      </Notice>
      <ReviewerPoolManagement />
      <h2 className="h-panel">계정 역할·활성 상태</h2>
      <div className="tbl-wrap">
        <table className="tbl">
          <caption className="sr-only">계정 목록</caption>
          <thead>
            <tr>
              <th>표시 이름</th>
              <th>아이디·부서</th>
              <th>역할</th>
              <th>활성 상태</th>
              <th>관리</th>
            </tr>
          </thead>
          <tbody>
            {query.data?.map((member) => (
              <tr key={member.id}>
                <td>{member.displayName}</td>
                <td>
                  {member.username}
                  <p className="help">{member.department || '등록한 부서 없음'}</p>
                </td>
                <td>{ROLE_LABELS[member.role]}</td>
                <td>
                  <Badge tone={member.active ? 'success' : 'neutral'}>
                    {member.active ? '활성' : '비활성'}
                  </Badge>
                </td>
                <td>
                  <button
                    className="btn btn-sm"
                    onClick={() => setSelected(member)}
                    aria-label={`${member.displayName} 역할 관리`}
                  >
                    역할 관리
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title="계정 역할·활성 상태 변경"
      >
        {selected && (
          <MemberForm key={selected.id} member={selected} onClose={() => setSelected(null)} />
        )}
      </Modal>
    </>
  );
}

function MemberForm({ member, onClose }: { member: Actor; onClose: () => void }) {
  const mutation = useUpdateMember();
  const [role, setRole] = useState<Role>(member.role);
  const [active, setActive] = useState(member.active);
  const [reason, setReason] = useState('');
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        try {
          await mutation.mutateAsync({
            id: member.username,
            role,
            active,
            reason,
            previousRole: member.role,
          });
          onClose();
        } catch {
          /* 오류를 아래에 유지해 재시도할 수 있게 한다. */
        }
      }}
    >
      <p>
        <strong>{member.displayName}</strong> · {member.username}
      </p>
      <Notice>
        역할 변경·계정 비활성화 시 기존 로그인 세션은 차단됩니다. 진행 중 배정은 보존되며, 업무를
        계속할 수 없는 신청은 재배정 대상으로 표시됩니다.
      </Notice>
      <div className="field">
        <label htmlFor="member-role">역할</label>
        <select
          id="member-role"
          className="input"
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
        >
          {(Object.keys(ROLE_LABELS) as Role[]).map((value) => (
            <option key={value} value={value}>
              {ROLE_LABELS[value]}
            </option>
          ))}
        </select>
      </div>
      <label className="check-row">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        활성 계정
      </label>
      <div className="field">
        <label htmlFor="member-reason">변경 사유 (필수)</label>
        <textarea
          id="member-reason"
          className="input"
          rows={3}
          maxLength={2000}
          required
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>
      {mutation.error && <Notice tone="danger">{mutation.error.message}</Notice>}
      <div className="dlg-actions">
        <button type="button" className="btn" onClick={onClose}>
          취소
        </button>
        <button className="btn btn-primary" disabled={mutation.isPending}>
          {mutation.isPending ? '저장 중…' : '역할 변경 저장'}
        </button>
      </div>
    </form>
  );
}
