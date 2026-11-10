import { expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import * as http from '@/lib/httpClient';
import { ConfigurationPage } from '@/features/configuration';
import { PolicyLifecycle } from '@/features/policy';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Role, Session } from '@/lib/types';
import { MOCK_MEMBERS } from '@/mocks/seed';

const controls = vi.hoisted(() => ({ session: null as Session | null }));

vi.mock('@/features/auth', () => ({
  useSession: () => ({ data: controls.session, isPending: false }),
}));
vi.mock('@/lib/queries', () => ({
  useInstallation: () => ({ data: { institutionName: '가상공공기관' }, isError: false }),
}));

function login(role: Role) {
  const member = MOCK_MEMBERS.find((item) => item.role === role)!;
  controls.session = { member, mock: true, expiresAt: null };
}

test.each(['APPLICANT', 'INFRA', 'SECURITY'] as const)(
  '%s 역할은 기관 설정 내용 대신 관리자 전용 안내만 본다',
  (role) => {
    login(role);
    render(<ConfigurationPage />);
    expect(screen.getByText('기관 관리자만 설정을 확인할 수 있습니다.')).toBeTruthy();
    expect(screen.queryByRole('tablist')).toBeNull();
  },
);

test('관리자 설정 조회가 끝나기 전에는 임의의 게시 버전이나 편집 버튼을 표시하지 않는다', () => {
  login('ADMIN');
  const read = vi.spyOn(http, 'requestJson').mockImplementation(() => new Promise(() => {}));
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ConfigurationPage />
    </QueryClientProvider>,
  );
  expect(screen.getByText('내용을 불러오고 있습니다.')).toBeTruthy();
  expect(screen.queryByText('게시본 v1')).toBeNull();
  expect(screen.queryByRole('button', { name: '변경 검토·게시' })).toBeNull();
  read.mockRestore();
});

test('정책은 목록 조회 전 임의 건수를 표시하지 않고 장비 변경과 기록을 구분한다', () => {
  controls.session = null;
  render(
    <QueryClientProvider client={new QueryClient()}>
      <PolicyLifecycle />
    </QueryClientProvider>,
  );
  expect(screen.getByText('서류 확정과 실제 장비 적용은 별개입니다.')).toBeTruthy();
  expect(screen.getByText('내용을 불러오고 있습니다.')).toBeTruthy();
  expect(screen.queryByRole('table')).toBeNull();
  expect(screen.queryByText(/결과 \d+건/)).toBeNull();
});
