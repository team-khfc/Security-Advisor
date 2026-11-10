import { beforeEach, expect, test, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginPage } from '@/features/auth';

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  login: vi.fn().mockResolvedValue({}),
  demoLogin: vi.fn().mockResolvedValue({}),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: mocks.replace }) }));
vi.mock('@/lib/queries', () => ({
  useInstallation: () => ({
    data: { institutionName: '가상공공기관', institutionCode: 'DEMO', mode: 'mock' },
    isError: false,
  }),
}));
vi.mock('@/features/auth/useAuth', () => ({
  useLogin: () => ({ mutateAsync: mocks.login, isPending: false }),
  useDemoLogin: () => ({ mutateAsync: mocks.demoLogin, isPending: false }),
}));

beforeEach(() => {
  mocks.replace.mockClear();
  mocks.login.mockClear();
  mocks.demoLogin.mockClear();
});

test('일반 로그인 후 ServiceShell이 전달한 next의 신청 상세로 복귀한다', async () => {
  window.history.replaceState(null, '', '/login?next=%2Frequests%2Fdemo-request-1');
  const user = userEvent.setup();
  render(<LoginPage />);
  await user.type(screen.getByLabelText('아이디'), 'applicant');
  await user.type(screen.getByLabelText('비밀번호'), crypto.randomUUID() + 'a9');
  await user.click(screen.getByRole('button', { name: /^로그인$/ }));
  await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/requests/demo-request-1'));
  expect(mocks.login).toHaveBeenCalledTimes(1);
});

test.each([
  ['/cases/demo-case-1?view=answers#purpose', '/cases/demo-case-1?view=answers#purpose'],
  ['/documents', '/documents'],
  ['https://unrelated.example/requests', '/requests'],
  ['//unrelated.example/requests', '/requests'],
  ['javascript:alert(1)', '/requests'],
  ['/requests/../../login', '/requests'],
  ['/requests\\@unrelated.example', '/requests'],
  ['/requests/%2f%2funrelated.example', '/requests'],
  ['/requests/%0aunsafe', '/requests'],
  ['/unknown-page', '/requests'],
])('모의 로그인 복귀 경로 %s를 같은 출처 허용 경로 %s로 제한한다', async (next, expected) => {
  window.history.replaceState(null, '', `/login?next=${encodeURIComponent(next)}`);
  const user = userEvent.setup();
  render(<LoginPage />);
  await user.click(screen.getByRole('button', { name: /신청자 가/ }));
  await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith(expected));
});
