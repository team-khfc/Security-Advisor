import { beforeEach, expect, test, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { SupplementList, NetworkList } from '@/features/request/SupportingPages';
import { AuditList } from '@/features/audit/AuditList';
import type { MockState, SecurityRequest } from '@/features/request/types';
import type { Role, Session } from '@/lib/types';
import { createMockState, MOCK_MEMBERS } from '@/mocks/seed';

const controls = vi.hoisted(() => ({
  session: null as Session | null,
  requests: [] as SecurityRequest[],
  audit: [] as MockState['auditEvents'],
}));

vi.mock('@/features/auth', () => ({
  useSession: () => ({ data: controls.session, isPending: false }),
}));
vi.mock('@/features/request/useRequests', () => ({
  useRequests: () => ({ data: controls.requests, isPending: false, error: null, refetch: vi.fn() }),
}));
vi.mock('@/lib/queries', () => ({
  useAudit: () => ({ data: controls.audit, isPending: false, error: null, refetch: vi.fn() }),
}));

function login(role: Role) {
  const member = MOCK_MEMBERS.find((item) => item.role === role)!;
  controls.session = { member, mock: true, expiresAt: null };
}

let state: MockState;
beforeEach(() => {
  state = createMockState();
  controls.requests = structuredClone(state.requests);
  controls.audit = structuredClone(state.auditEvents);
});

test('보완 요청은 신청별 카드로 묶고 확인을 마친 요청은 아래 표로 보여 준다', () => {
  login('APPLICANT');
  const target = controls.requests.find((request) => request.supplements.length)!;
  const [first] = target.supplements;
  target.supplements = [
    { ...first, id: 'open-a', status: 'OPEN', reason: '합성 보완 사유 A' },
    { ...first, id: 'open-b', status: 'ANSWERED', reason: '합성 보완 사유 B', answer: '합성 답변' },
    {
      ...first,
      id: 'done-c',
      status: 'RESOLVED',
      reason: '합성 보완 사유 C',
      answer: '확인된 답변',
    },
  ];
  render(<SupplementList />);
  const open = screen.getByRole('region', { name: /답변·확인이 필요한 요청/ });
  expect(within(open).getByText('2')).toBeTruthy();
  expect(within(open).getAllByRole('article')).toHaveLength(1);
  expect(within(open).getByText('합성 보완 사유 A')).toBeTruthy();
  expect(within(open).getByText('등록한 답변: 합성 답변')).toBeTruthy();
  expect(
    within(open)
      .getByRole('link', { name: /신청에서 보완하기/ })
      .getAttribute('href'),
  ).toBe(`/requests/${target.id}#supplements`);
  const done = screen.getByRole('region', { name: '확인한 요청' });
  const row = within(done).getByText('합성 보완 사유 C').closest('tr')!;
  expect(within(row).getByText('확인 완료')).toBeTruthy();
  expect(within(row).getByText('확인된 답변')).toBeTruthy();
});

test('보완 요청이 없으면 빈 상태와 확인한 요청 없음 안내를 보여 준다', () => {
  login('APPLICANT');
  controls.requests = controls.requests.map((request) => ({ ...request, supplements: [] }));
  render(<SupplementList />);
  expect(screen.getByText('대기 중인 보완 요청이 없습니다')).toBeTruthy();
  expect(screen.getByText('아직 확인을 마친 보완 요청이 없습니다.')).toBeTruthy();
});

test('통신 정보는 ICT인프라에게 비어 있는 값을 담당자 확인 필요 배지로 표시하고 신청 상세로 연결한다', () => {
  login('INFRA');
  render(<NetworkList />);
  const table = screen.getByRole('table');
  const rows = within(table).getAllByRole('row').slice(1);
  expect(rows).toHaveLength(controls.requests.length);
  const empty = controls.requests.find(
    (request) => !request.commonAnswers.find((answer) => answer.key === 'sourceIp')?.value,
  )!;
  const row = within(table).getAllByRole('link', { name: empty.caseTitle })[0].closest('tr')!;
  expect(within(row).getAllByText('담당자 확인 필요').length).toBeGreaterThan(0);
  expect(within(row).getByRole('link', { name: empty.caseTitle }).getAttribute('href')).toBe(
    `/requests/${empty.id}`,
  );
});

test('통신 정보는 ICT인프라가 아니면 안내만 보여 준다', () => {
  login('APPLICANT');
  render(<NetworkList />);
  expect(screen.getByText(/ICT인프라 담당자 메뉴입니다/)).toBeTruthy();
  expect(screen.queryByRole('table')).toBeNull();
});

test('처리 이력은 시각을 YYYY-MM-DD HH:mm(한국표준시)로, 처리자를 이름(역할)로 표시한다', () => {
  login('INFRA');
  const [event] = controls.audit;
  controls.audit = [{ ...event, createdAt: '2026-11-04T01:02:00Z' }];
  render(<AuditList />);
  const row = within(screen.getByRole('table')).getAllByRole('row')[1];
  expect(within(row).getByText('2026-11-04 10:02')).toBeTruthy();
  expect(within(row).getByText(new RegExp(`${event.actorName} \\(`))).toBeTruthy();
});
