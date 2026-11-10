import { screen, within } from '@testing-library/react';
import { render } from './queryRender';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ServiceShell } from '@/components/ServiceShell';
import type { Role, Session } from '@/lib/types';
import { MOCK_MEMBERS } from '@/mocks/seed';

const controls = vi.hoisted(() => ({ session: null as Session | null }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/requests',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock('@/features/auth', () => ({
  useSession: () => ({ data: controls.session, isSuccess: true, isPending: false, isError: false }),
  useLogout: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useExtendSession: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
}));
vi.mock('@/lib/queries', () => ({
  useInstallation: () => ({ data: { institutionName: '가상공공기관' }, isError: false }),
}));

function renderAs(role: Role) {
  const member = MOCK_MEMBERS.find((item) => item.role === role)!;
  controls.session = {
    member,
    mock: true,
    expiresAt: new Date(Date.now() + 1_800_000).toISOString(),
  };
  render(
    <ServiceShell>
      <p>본문</p>
    </ServiceShell>,
  );
  const nav = screen.getByRole('navigation', { name: '신청 업무' });
  return within(nav)
    .getAllByRole('link')
    .map((link) => ({
      name: link.textContent,
      href: link.getAttribute('href'),
      icon: link.querySelector('svg')?.getAttribute('data-icon'),
    }));
}

beforeEach(() => {
  controls.session = null;
});

// 기대값: prototype-soo assets/js/core.js MENU·NAVI(563dd7e)
// dash=트레이, supp=말풍선, docs=문서, policy=시계. 원본에 없는 관리자 메뉴는 기존 아이콘을 유지한다.
describe('공통 메뉴 아이콘(A01)', () => {
  test.each<[Role, [string, string, string][]]>([
    [
      'APPLICANT',
      [
        ['신청 현황', '/requests', 'inbox'],
        ['새 신청', '/requests/new', 'plus'],
        ['보완 요청', '/supplements', 'message'],
        ['내 신청 이력', '/history', 'history'],
        ['정책 수명주기', '/policies', 'timer'],
        ['문서함', '/documents', 'document'],
      ],
    ],
    [
      'INFRA',
      [
        ['협의 요청함', '/requests', 'inbox'],
        ['통신 정보', '/network', 'network'],
        ['처리 이력', '/history', 'history'],
        ['정책 수명주기', '/policies', 'timer'],
        ['문서함', '/documents', 'document'],
      ],
    ],
    [
      'SECURITY',
      [
        ['협의 요청함', '/requests', 'inbox'],
        ['검토 이력', '/history', 'history'],
        ['정책 수명주기', '/policies', 'timer'],
        ['문서함', '/documents', 'document'],
      ],
    ],
    [
      'ADMIN',
      [
        ['신청 현황', '/requests', 'inbox'],
        ['문서함', '/documents', 'document'],
        ['기관 설정', '/settings', 'settings'],
        ['지식·비공개 정보', '/knowledge', 'document'],
        ['업무 지표', '/insights', 'inbox'],
        ['AI 모델 구성', '/models', 'settings'],
        ['계정·담당자 관리', '/members', 'users'],
        ['정책 수명주기', '/policies', 'timer'],
        ['감사 이력', '/history', 'history'],
      ],
    ],
  ])('%s 메뉴의 이름·링크·아이콘 순서를 유지한다', (role, expected) => {
    expect(renderAs(role)).toEqual([
      { name: '처리할 일', href: '/todos', icon: 'inbox' },
      ...expected.map(([name, href, icon]) => ({ name, href, icon })),
    ]);
  });

  test('메뉴 아이콘은 장식으로 숨기고 접근성 이름은 링크 글자에서 나온다', () => {
    renderAs('INFRA');
    const nav = screen.getByRole('navigation', { name: '신청 업무' });
    const link = within(nav).getByRole('link', { name: '정책 수명주기' });
    const svg = link.querySelector('svg')!;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('focusable')).toBe('false');
    expect(link.getAttribute('aria-current')).toBeNull();
    expect(
      within(nav).getByRole('link', { name: '협의 요청함' }).getAttribute('aria-current'),
    ).toBe('page');
  });

  test('바뀐 4종은 원본 자산의 경로를 그린다(일반 파일·방패 아이콘으로 되돌아가지 않음)', () => {
    renderAs('INFRA');
    const nav = screen.getByRole('navigation', { name: '신청 업무' });
    const pathsOf = (name: string) =>
      [...within(nav).getByRole('link', { name }).querySelectorAll('path')].map((p) =>
        p.getAttribute('d'),
      );
    expect(pathsOf('협의 요청함')[0]).toBe('M22 12h-6l-2 3h-4l-2-3H2');
    expect(pathsOf('정책 수명주기')).toEqual(['M12 9v4l2.5 2M9 2h6']);
    expect(
      within(nav).getByRole('link', { name: '정책 수명주기' }).querySelector('circle'),
    ).toBeTruthy();
    expect(pathsOf('문서함')).toEqual(['M6 3h8l4 4v14H6z', 'M14 3v4h4M9 12h6M9 16h6']);
  });
});
