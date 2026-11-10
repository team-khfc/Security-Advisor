import { describe, expect, test, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { waitingLine } from '@/features/request/turns';
import type { MockState, SecurityRequest } from '@/features/request/types';
import type { Actor, Role, Session } from '@/lib/types';
import { createMockState, MOCK_MEMBERS } from '@/mocks/seed';

const controls = vi.hoisted(() => ({
  session: null as Session | null,
  requests: [] as SecurityRequest[],
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/features/auth', () => ({
  useSession: () => ({ data: controls.session, isSuccess: true, isPending: false, isError: false }),
}));
vi.mock('@/features/request/useRequests', () => ({
  useRequests: () => ({
    data: controls.requests,
    isPending: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

const { RequestList } = await import('@/features/request/RequestList');

function actor(role: Role): Actor {
  const result = MOCK_MEMBERS.find((member) => member.role === role);
  if (!result) throw new Error('테스트 계정 누락');
  return result;
}

function seeded(id: string, state: MockState = createMockState()): SecurityRequest {
  const result = state.requests.find((item) => item.id === id);
  if (!result) throw new Error('테스트 신청 누락');
  return structuredClone(result);
}

function withReviews(
  base: SecurityRequest,
  infra: Partial<SecurityRequest['reviews'][number]>,
  security: Partial<SecurityRequest['reviews'][number]>,
): SecurityRequest {
  return {
    ...base,
    reviews: base.reviews.map((review) =>
      review.field === 'INFRA' ? { ...review, ...infra } : { ...review, ...security },
    ),
  };
}

describe('waitingLine: 상태별 진행 안내 문구', () => {
  test('신청자 차례의 상태는 신청자가 할 일을 안내한다', () => {
    expect(waitingLine(seeded('demo-request-6'))).toBe('신청자 작성 중');
    expect(waitingLine(seeded('demo-request-5'))).toBe('신청자 보완 답변 대기');
    expect(waitingLine(seeded('demo-request-2'))).toBe('신청자 최종 제출 대기');
  });

  test('협의 중에는 INFRA 할당 전이면 할당 중만 안내하고 정보보안은 안내하지 않는다', () => {
    const request = withReviews(
      seeded('demo-request-1'),
      { allocationCompleted: false, status: 'PENDING' },
      { status: 'PENDING' },
    );
    expect(request.status).toBe('CONSULTING');
    expect(waitingLine(request)).toBe('ICT인프라 협의 중');
  });

  test('INFRA 할당 뒤에는 남은 협의와 정보보안 검토를 함께 안내한다', () => {
    const request = withReviews(
      seeded('demo-request-1'),
      { allocationCompleted: true, status: 'ALLOCATED' },
      { status: 'PENDING' },
    );
    expect(waitingLine(request)).toBe('ICT인프라 협의 중');
  });

  test('INFRA 협의가 끝나면 정보보안 검토만 안내한다', () => {
    const request = withReviews(
      seeded('demo-request-1'),
      { allocationCompleted: true, status: 'COMPLETE' },
      { status: 'PENDING' },
    );
    expect(waitingLine(request)).toBe('정보보안 검토 중');
  });

  test('제출됨은 현재 제출본의 최종 확인이 없는 분야를 안내한다', () => {
    const submitted = seeded('demo-request-3');
    expect(submitted.status).toBe('SUBMITTED');
    expect(waitingLine({ ...submitted, finalConfirmations: [] })).toBe('ICT인프라 최종 확인 대기');
    const confirm = (field: 'INFRA' | 'SECURITY') => ({
      id: `confirm-${field}`,
      field,
      submissionId: submitted.currentSubmissionId ?? '',
      actorName: '테스트',
      confirmedAt: '2026-11-08T09:00:00+09:00',
    });
    expect(waitingLine({ ...submitted, finalConfirmations: [confirm('INFRA')] })).toBe(
      '정보보안 최종 확인 대기',
    );
    expect(
      waitingLine({ ...submitted, finalConfirmations: [confirm('INFRA'), confirm('SECURITY')] }),
    ).toBe('정보보안 서류 확정 대기');
  });

  test('이전 제출본의 최종 확인은 현재 제출본 확인으로 세지 않는다', () => {
    const submitted = seeded('demo-request-3');
    const stale = {
      id: 'confirm-old',
      field: 'INFRA' as const,
      submissionId: 'previous-submission',
      actorName: '테스트',
      confirmedAt: '2026-11-01T09:00:00+09:00',
    };
    expect(waitingLine({ ...submitted, finalConfirmations: [stale] })).toBe(
      'ICT인프라 최종 확인 대기',
    );
  });

  test('확정·종결·철회는 안내하지 않는다', () => {
    const finalized = seeded('demo-request-4');
    expect(waitingLine(finalized)).toBe('');
    expect(waitingLine({ ...finalized, status: 'CLOSED' })).toBe('');
    expect(waitingLine({ ...finalized, status: 'WITHDRAWN' })).toBe('');
  });
});

describe('신청 현황 목록의 진행 안내 표시 역할', () => {
  function statusCell(caseTitle: string) {
    const row = screen.getByRole('link', { name: caseTitle }).closest('tr');
    if (!row) throw new Error('행 누락');
    return within(row).getAllByRole('cell')[3];
  }

  test('담당자에게는 내 차례가 아닌 신청에 회색 안내를, 내 차례인 신청에는 할 일을 표시한다', () => {
    const state = createMockState();
    controls.session = { member: actor('INFRA'), mock: true, expiresAt: null };
    const draft = seeded('demo-request-6', state);
    const consulting = withReviews(
      seeded('demo-request-1', state),
      { allocationCompleted: false, status: 'PENDING' },
      { status: 'PENDING' },
    );
    consulting.allowedActions = ['COMPLETE_REVIEW'];
    controls.requests = [draft, consulting];
    render(<RequestList />);
    const waiting = statusCell(draft.caseTitle).querySelector('.turn');
    expect(waiting?.textContent).toBe('신청자 작성 중');
    expect(waiting?.classList.contains('me')).toBe(false);
    const mine = statusCell(consulting.caseTitle).querySelector('.turn');
    expect(mine?.textContent).toBe('담당 분야 협의');
    expect(mine?.classList.contains('me')).toBe(true);
  });

  test('신청자에게는 회색 진행 안내를 표시하지 않는다', () => {
    const state = createMockState();
    const applicant = actor('APPLICANT');
    controls.session = { member: applicant, mock: true, expiresAt: null };
    const consulting = { ...seeded('demo-request-1', state), ownerId: applicant.id };
    controls.requests = [consulting];
    render(<RequestList />);
    expect(statusCell(consulting.caseTitle).querySelector('.turn')).toBeNull();
  });
});
