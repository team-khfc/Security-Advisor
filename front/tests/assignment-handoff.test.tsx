import { afterEach, expect, test, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from './queryRender';
import { ReviewerPoolManagement } from '@/features/assignment/ReviewerPoolManagement';
import { MockReviewerPools } from '@/mocks/reviewerPools';
import { MOCK_MEMBERS, createMockState } from '@/mocks/seed';
import { handoffFields } from '@/features/request/turns';
import * as http from '@/lib/httpClient';

const dialogDescriptors = ['showModal', 'close'].map(
  (name) => [name, Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, name)] as const,
);
afterEach(() => {
  vi.restoreAllMocks();
  for (const [name, descriptor] of dialogDescriptors) {
    if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
  }
});

test('등록·기본 지정·사유 있는 비활성화를 실제 관리 화면에서 연결하고 잘못된 역할은 제외한다', async () => {
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.open = true;
      },
    },
    close: {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.open = false;
      },
    },
  });
  const members = structuredClone(MOCK_MEMBERS);
  const admin = members.find((m) => m.role === 'ADMIN')!;
  const infra = members.find((m) => m.role === 'INFRA')!;
  members.push({
    ...infra,
    id: 'handoff-new',
    username: 'handoff-new',
    displayName: '인계 담당자',
  });
  const pools = new MockReviewerPools(MOCK_MEMBERS);
  const state = createMockState();
  const transport = vi.spyOn(http, 'requestJson').mockImplementation(async (path, options) => {
    const url = new URL(String(path), 'http://local.test');
    if (url.pathname === '/api/members') return members.map((m) => ({ ...m, email: null }));
    if (url.pathname === '/api/todo-summary') return { unassignedRequests: 2 };
    const [, , , id, sub] = url.pathname.split('/');
    return pools.handle(admin, state, members, options?.method ?? 'GET', id, sub, options?.body);
  });
  const user = userEvent.setup();
  render(<ReviewerPoolManagement />);
  expect(await screen.findByText(/재배정 필요 2건/)).toBeTruthy();
  expect(screen.getByRole('link', { name: '재배정 대상 신청 보기' }).getAttribute('href')).toBe(
    '/requests?filter=mine',
  );
  await user.selectOptions(screen.getByLabelText('등록할 담당자'), 'handoff-new');
  await user.click(screen.getByLabelText('새 협의 요청의 기본 담당자로 지정'));
  await user.click(screen.getByRole('button', { name: '담당자 등록' }));
  await screen.findByText('담당자 등록을 저장했습니다.');
  const row = screen.getByText('handoff-new', { selector: 'p' }).closest('tr')!;
  expect(within(row).getByText('기본 담당자')).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'handoff-new 분야 등록 비활성화' }));
  const save = screen.getByRole('button', { name: '등록 상태 저장' }) as HTMLButtonElement;
  expect(save.disabled).toBe(true);
  await user.type(screen.getByLabelText('변경 사유 (필수)'), '합성 업무 인계');
  await user.click(save);
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(await screen.findByText('분야별 담당자 비활성')).toBeTruthy();
  expect(transport).toHaveBeenCalledWith(
    expect.stringMatching(/activation$/),
    expect.objectContaining({ body: { active: false, reason: '합성 업무 인계' }, method: 'PUT' }),
  );
});

test('계정 역할 변경과 비활성은 기본 담당자 지정을 차단하고 원래 배정 기록은 보존한다', () => {
  const members = structuredClone(MOCK_MEMBERS),
    state = createMockState();
  const before = structuredClone(state.requests);
  const admin = members.find((m) => m.role === 'ADMIN')!;
  const infra = members.find((m) => m.role === 'INFRA')!;
  const pools = new MockReviewerPools(members);
  const list = pools.handle(admin, state, members, 'GET', undefined, undefined, undefined) as {
    reviewerPoolId: number;
    memberUsername: string;
  }[];
  const id = String(list.find((p) => p.memberUsername === infra.username)!.reviewerPoolId);
  infra.role = 'SECURITY';
  expect(pools.reason(infra.username, 'INFRA', members)).toBe('ROLE_CHANGED');
  expect(() => pools.handle(admin, state, members, 'PUT', id, 'default', undefined)).toThrow(
    /활성 계정/,
  );
  infra.active = false;
  expect(pools.reason(infra.username, 'INFRA', members)).toBe('ACCOUNT_INACTIVE');
  expect(state.requests).toEqual(before);
});

test('인계 표시는 필요한 분야와 진행 단계만 포함하고 종료된 신청은 제외한다', () => {
  const request = createMockState().requests[0];
  request.stage = 4;
  request.status = 'SUBMITTED';
  request.requiredReviewFields = ['SECURITY'];
  request.assignments = [];
  expect(handoffFields(request)).toEqual([{ field: 'SECURITY', reassignmentReason: 'UNASSIGNED' }]);
  request.status = 'FINALIZED';
  expect(handoffFields(request)).toEqual([]);
});
