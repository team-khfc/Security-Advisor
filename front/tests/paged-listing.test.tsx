import { useState } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from './queryRender';
import { useRequests, useRelatedRequests } from '@/features/request/useRequests';
import { AuditList } from '@/features/audit/AuditList';
import { MOCK_MEMBERS, createMockState } from '@/mocks/seed';
import { mockRequestListing, mockAuditListing } from '@/mocks/listing';
import { ContractMapper } from '@/mocks/contractMapper';
import type { SecurityRequest } from '@/features/request/types';
import * as http from '@/lib/httpClient';
import { auditActions, auditActionLabel } from '@/features/audit/labels';
import { auditDto } from '@/features/request/apiTypes';

vi.mock('@/features/auth', async () => {
  const { MOCK_MEMBERS } = await import('@/mocks/seed');
  return { useSession: () => ({ data: { member: MOCK_MEMBERS[0] }, isPending: false }) };
});
afterEach(() => vi.restoreAllMocks());
test('모든 서버 이력 구분을 한글로 구별하고 미인증 기록도 읽는다', () => {
  for (const action of auditActions) expect(auditActionLabel(action)).not.toBe('업무 변경 기록');
  expect(
    auditDto.parse({
      auditEventId: 1,
      actorUsername: null,
      actorRole: null,
      targetType: 'MEMBER',
      targetId: 'anonymous',
      targetRevision: null,
      action: 'LOGIN_FAILED',
      reason: null,
      summary: null,
      requestId: null,
      occurredAt: '2026-11-10T00:00:00Z',
    }).actorRole,
  ).toBeNull();
});
function fixture() {
  const state = createMockState(),
    actor = MOCK_MEMBERS[0],
    wire = new ContractMapper(() => MOCK_MEMBERS);
  state.requests = Array.from(
    { length: 225 },
    (_, i) =>
      ({
        ...state.requests[0],
        id: `listing-${i}`,
        caseId: 'listing-case',
        caseTitle: `목록 합성 ${i}`,
        ownerId: actor.id,
        stage: 1,
        status: 'DRAFT',
        createdAt: '2026-11-01T00:00:00Z',
        updatedAt: '2026-11-01T00:00:00Z',
        assignments: [],
        currentSubmissionId: null,
      }) as SecurityRequest,
  );
  state.auditEvents = Array.from({ length: 135 }, (_, i) => ({
    ...state.auditEvents[0],
    id: `history-${i}`,
    actorId: actor.id,
    actorName: actor.displayName,
    actorRole: actor.role,
    targetType: 'SecurityRequest',
    targetId: state.requests[0].id,
    action: 'ANSWER_UPDATED',
    reason: `이력 합성 ${i}`,
    summary: '합성 답변 저장',
    createdAt: '2026-11-01T00:00:00Z',
  }));
  const transport = vi.spyOn(http, 'requestJson').mockImplementation(async (path) => {
    const url = new URL(String(path), 'http://local.test');
    if (url.pathname === '/api/audit-events')
      return mockAuditListing(state, actor, url.searchParams, wire);
    if (url.pathname === '/api/security-requests')
      return mockRequestListing(state.requests, actor, url.searchParams, wire);
    throw new Error(`목록에서 불필요한 상세 호출: ${path}`);
  });
  return { state, actor, wire, transport };
}
function RequestProbe() {
  const [page, setPage] = useState(0),
    [query, setQuery] = useState('');
  const result = useRequests(false, { page, size: 20, query, sort: 'id,asc' });
  return (
    <>
      <button onClick={() => setPage(11)}>마지막 페이지</button>
      <button
        onClick={() => {
          setQuery('목록 합성 224');
          setPage(0);
        }}
      >
        뒤쪽 검색
      </button>
      <p>전체 {result.pagination?.totalElements}건</p>
      <ul>
        {result.data?.map((r) => (
          <li key={r.id}>{r.caseTitle}</li>
        ))}
      </ul>
    </>
  );
}
test('225건의 서버 전체 건수·마지막 페이지·뒤쪽 검색을 상세 추가 호출 없이 연결한다', async () => {
  const { transport } = fixture();
  render(<RequestProbe />);
  const user = userEvent.setup();
  await screen.findByText('전체 225건');
  expect(screen.getAllByRole('listitem')).toHaveLength(20);
  await user.click(screen.getByRole('button', { name: '마지막 페이지' }));
  await screen.findByText('목록 합성 224');
  expect(screen.getAllByRole('listitem')).toHaveLength(5);
  await user.click(screen.getByRole('button', { name: '뒤쪽 검색' }));
  await screen.findByText('전체 1건');
  expect(screen.getAllByRole('listitem')).toHaveLength(1);
  expect(transport.mock.calls.some(([path]) => String(path).includes('page=11'))).toBe(true);
  expect(transport.mock.calls).toHaveLength(3);
});
test('사업별 관련 신청은 전체 목록의 첫 페이지와 무관하게 모두 조회한다', async () => {
  const { wire, transport } = fixture();
  const id = String(wire.id('listing-case'));
  function Probe() {
    const result = useRelatedRequests(id);
    return <p>관련 {result.data?.length}건</p>;
  }
  render(<Probe />);
  await screen.findByText('관련 225건');
  expect(transport.mock.calls).toHaveLength(3);
  expect(
    transport.mock.calls.every(([path]) => String(path).includes(`businessCaseId=${id}`)),
  ).toBe(true);
});
test('이력 화면은 135건의 마지막 페이지와 뒤쪽 검색을 서버에 요청한다', async () => {
  const { transport } = fixture();
  render(<AuditList />);
  const user = userEvent.setup();
  await screen.findByText('전체 135건 · 1 / 7페이지');
  await user.click(screen.getByRole('button', { name: '마지막 페이지' }));
  await screen.findByText('전체 135건 · 7 / 7페이지');
  expect(transport.mock.calls.some(([path]) => String(path).includes('throughId='))).toBe(true);
  await user.type(screen.getByRole('searchbox'), '이력 합성 0');
  await user.click(screen.getByRole('button', { name: '이력 검색' }));
  await screen.findByText('전체 1건 · 1 / 1페이지');
  await waitFor(() => expect(String(transport.mock.calls.at(-1)?.[0])).not.toContain('throughId='));
});
test('모의 서버도 타인·미배정 이력을 숨기고 신청자에게 보안 메타를 노출하지 않는다', () => {
  const { state, wire, actor } = fixture();
  state.auditEvents.push({
    ...state.auditEvents[0],
    id: 'security-meta',
    action: 'DOCUMENT_DOWNLOADED',
  });
  expect(mockAuditListing(state, actor, new URLSearchParams(), wire).totalElements).toBe(135);
  const stranger = { ...actor, id: 'stranger', username: 'stranger' };
  expect(mockAuditListing(state, stranger, new URLSearchParams(), wire).totalElements).toBe(0);
  const infra = MOCK_MEMBERS.find((m) => m.role === 'INFRA')!;
  expect(mockAuditListing(state, infra, new URLSearchParams(), wire).totalElements).toBe(0);
  const admin = MOCK_MEMBERS.find((m) => m.role === 'ADMIN')!;
  expect(mockAuditListing(state, admin, new URLSearchParams(), wire).totalElements).toBe(136);
});
