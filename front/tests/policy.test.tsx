import { beforeEach, afterEach, expect, test, vi } from 'vitest';
import { render, screen, within, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PolicyLifecycle } from '@/features/policy';
import { ApiError, requestJson } from '@/lib/httpClient';
import type { FirewallRule } from '@/features/policy/types';

const context = vi.hoisted(() => ({ role: 'INFRA' }));
vi.mock('@/features/auth', () => ({
  useSession: () => ({ data: { member: { role: context.role } } }),
}));
vi.mock('@/lib/httpClient', async (original) => ({
  ...(await original<typeof import('@/lib/httpClient')>()),
  requestJson: vi.fn(),
}));
const api = vi.mocked(requestJson);
const pending: FirewallRule = {
  firewallRuleId: 1,
  securityRequestId: 24,
  submissionId: 5,
  ruleNo: 1,
  source: '192.0.2.20',
  destination: '198.51.100.30',
  protocol: 'TCP',
  port: '443',
  startDate: '2026-12-01',
  endDate: '2027-11-30',
  reviewDate: null,
  status: 'PENDING_APPLY',
  effectiveStatus: 'PENDING_APPLY',
  appliedBy: null,
  appliedAt: null,
  applicationNote: null,
  reason: null,
  renewalRequestId: null,
  revision: 0,
};
let rule: FirewallRule;
const descriptors = Object.fromEntries(
  ['showModal', 'close'].map((n) => [
    n,
    Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, n),
  ]),
);
beforeEach(() => {
  context.role = 'INFRA';
  rule = { ...pending };
  api.mockReset();
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.setAttribute('open', '');
      },
    },
    close: {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.removeAttribute('open');
      },
    },
  });
  api.mockImplementation(async (path, options) => {
    if (path === '/api/firewall-rules' && !options?.method) return [{ ...rule }];
    throw new Error('예상하지 않은 요청');
  });
});
afterEach(() => {
  for (const [name, descriptor] of Object.entries(descriptors)) {
    if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
  }
});
function mount() {
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        })
      }
    >
      <PolicyLifecycle />
    </QueryClientProvider>,
  );
  return userEvent.setup();
}
async function open(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: '규칙 1 기록·처리' }));
  return within(screen.getByRole('dialog'));
}

test('서버 규칙을 표시하고 거르기로 실제 결과를 좁힌다', async () => {
  const user = mount();
  await screen.findByRole('table');
  expect(screen.getByRole('link', { name: '신청 24' }).getAttribute('href')).toBe('/requests/24');
  await user.click(screen.getByRole('button', { name: '회수·적용 불가' }));
  expect(screen.getByText('조건에 맞는 규칙이 없습니다')).toBeTruthy();
});

test('닫기와 Escape 취소 뒤 키보드 초점을 규칙 버튼으로 돌려준다', async () => {
  const user = mount();
  await open(user);
  screen.getByRole('button', { name: '규칙 1 기록·처리 닫기' }).focus();
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(document.activeElement).toBe(screen.getByRole('button', { name: '규칙 1 기록·처리' }));
});
test.each(['SECURITY', 'ADMIN', 'APPLICANT'])(
  '%s는 적용·불가 기록을 저장할 수 없다',
  async (role) => {
    context.role = role;
    const user = mount();
    const dialog = await open(user);
    expect(dialog.queryByRole('button', { name: '적용 완료 기록' })).toBeNull();
    expect(dialog.queryByRole('button', { name: '적용 불가 기록' })).toBeNull();
  },
);
test.each(['APPLIED', 'NOT_APPLICABLE', 'REVOKED'] as const)(
  '%s 기록에 메모·필수 사유·revision을 보내고 성공 뒤 최신 상태를 읽는다',
  async (action) => {
    if (action === 'REVOKED')
      rule = { ...rule, status: 'APPLIED', effectiveStatus: 'EXPIRED', revision: 3 };
    const revision = rule.revision;
    api.mockImplementation(async (path, options) => {
      if (!options?.method) return [{ ...rule }];
      rule = { ...rule, status: action, effectiveStatus: action, revision: revision + 1 };
      return rule;
    });
    const user = mount();
    const dialog = await open(user);
    const name =
      action === 'APPLIED'
        ? '적용 완료 기록'
        : action === 'REVOKED'
          ? '회수 기록'
          : '적용 불가 기록';
    await user.click(dialog.getByRole('button', { name }));
    expect((dialog.getByRole('button', { name: '기록 저장' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    await user.click(dialog.getByRole('checkbox'));
    if (action !== 'APPLIED') {
      await user.type(dialog.getByRole('textbox'), '   ');
      await user.click(dialog.getByRole('button', { name: '기록 저장' }));
      expect(dialog.getByText('사유를 입력해 주세요.')).toBeTruthy();
      expect(api.mock.calls.filter(([, o]) => o?.method)).toHaveLength(0);
    }
    await user.clear(dialog.getByRole('textbox'));
    await user.type(dialog.getByRole('textbox'), '합성 기록, 장비 변경 없음');
    await user.click(dialog.getByRole('button', { name: '기록 저장' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(api).toHaveBeenCalledWith(
      `/api/firewall-rules/1/${action === 'REVOKED' ? 'revocation' : 'application'}`,
      {
        method: 'PUT',
        body:
          action === 'REVOKED'
            ? { reason: '합성 기록, 장비 변경 없음', expectedRevision: revision }
            : {
                result: action,
                expectedRevision: revision,
                [action === 'APPLIED' ? 'note' : 'reason']: '합성 기록, 장비 변경 없음',
              },
      },
    );
    expect(document.activeElement?.textContent).toContain('저장했습니다');
  },
);
test('충돌 시 입력을 보존하고 최신 상태를 명시적으로 확인하기 전 재저장을 막는다', async () => {
  api.mockImplementation(async (path, options) => {
    if (!options?.method) return [{ ...rule }];
    rule = { ...rule, status: 'NOT_APPLICABLE', effectiveStatus: 'NOT_APPLICABLE', revision: 1 };
    throw new ApiError({
      type: 'about:blank',
      title: '충돌',
      status: 409,
      code: 'CONFLICT',
      detail: '다른 담당자가 처리했습니다.',
    });
  });
  const user = mount();
  const dialog = await open(user);
  await user.click(dialog.getByRole('button', { name: '적용 완료 기록' }));
  await user.type(dialog.getByRole('textbox'), '보존할 메모');
  await user.click(dialog.getByRole('checkbox'));
  await user.click(dialog.getByRole('button', { name: '기록 저장' }));
  await dialog.findByText('다른 담당자가 처리했습니다.');
  expect((dialog.getByRole('textbox') as HTMLTextAreaElement).value).toBe('보존할 메모');
  expect((dialog.getByRole('button', { name: '기록 저장' }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  await user.click(dialog.getByRole('button', { name: '입력 유지하고 최신 상태 확인' }));
  await dialog.findByText(
    '현재 상태에서는 이 처리를 저장할 수 없습니다. 입력 내용은 보존했습니다.',
  );
  expect((dialog.getByRole('textbox') as HTMLTextAreaElement).value).toBe('보존할 메모');
  expect(api.mock.calls.filter(([, o]) => o?.method)).toHaveLength(1);
});
test('신청자는 연장을 새 신청으로 생성하고 원 규칙을 바꾸지 않는다', async () => {
  context.role = 'APPLICANT';
  rule = { ...rule, status: 'APPLIED', effectiveStatus: 'APPLIED' };
  api.mockImplementation(async (path, options) => {
    if (!options?.method) return [{ ...rule }];
    return { request: { securityRequestId: 26 } };
  });
  const user = mount();
  const dialog = await open(user);
  await user.click(dialog.getByRole('button', { name: '연장 신청' }));
  fireEvent.change(dialog.getByLabelText('새 사용 시작일'), { target: { value: '2027-12-01' } });
  fireEvent.change(dialog.getByLabelText('새 사용 종료일'), { target: { value: '2028-11-30' } });
  await user.type(dialog.getByRole('textbox'), '합성 연장 검증');
  await user.click(dialog.getByRole('checkbox'));
  await user.click(dialog.getByRole('button', { name: '새 연장 신청 만들기' }));
  expect(
    (await screen.findByRole('link', { name: '연장 신청 작성하기' })).getAttribute('href'),
  ).toBe('/requests/26');
  expect(api).toHaveBeenCalledWith('/api/firewall-rules/1/renewal-requests', {
    method: 'POST',
    body: { newPeriod: '2027-12-01~2028-11-30', note: '합성 연장 검증' },
  });
  expect(rule.endDate).toBe('2027-11-30');
});
test('진행 중 연장이 있으면 새 신청 대신 기존 신청 링크를 제공한다', async () => {
  context.role = 'APPLICANT';
  rule = { ...rule, status: 'APPLIED', effectiveStatus: 'APPLIED', renewalRequestId: 26 };
  api.mockImplementation(async (path) =>
    path === '/api/security-requests/26' ? { status: 'DRAFTING' } : [{ ...rule }],
  );
  const user = mount();
  const dialog = await open(user);
  expect(dialog.getByRole('link', { name: '연장 신청 26 보기' }).getAttribute('href')).toBe(
    '/requests/26',
  );
  expect(dialog.queryByRole('button', { name: '연장 신청' })).toBeNull();
});
