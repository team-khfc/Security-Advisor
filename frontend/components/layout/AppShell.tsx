'use client';
import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { AccountControl, useSession } from '@/features/auth';
import type { Role } from '@/lib/sharedTypes';
import { Icon, Modal, type IconName } from '@/components/ui';
import { useDisplayPreferences } from '@/lib/displayPreferences';
interface NavItem {
  href: string;
  label: string;
  icon: IconName;
}
/** 최신 1920px 디자인의 셸을 인증 업무와 명확히 분리한 합성 시안에서 함께 사용한다. */
export function AppShell({
  children,
  institutionName,
  role,
  preview = false,
}: {
  children: ReactNode;
  institutionName: string;
  role: Role;
  preview?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [settings, setSettings] = useState(false);
  const { scale, theme, setScale, setTheme } = useDisplayPreferences();
  const [search, setSearch] = useState('');
  const nav: NavItem[] = preview
    ? [
        { href: '/design-preview/requests', label: '신청 현황', icon: 'home' },
        { href: '/design-preview/new-request', label: '새 신청 시작', icon: 'plus' },
        { href: '/design-preview/security', label: '담당자 협의', icon: 'shield' },
        { href: '/design-preview/final-review', label: '사용자 최종 검토', icon: 'check' },
        { href: '/design-preview/submitted', label: '확정·관리', icon: 'file' },
        { href: '/design-preview/returned', label: '반환·보완 요청', icon: 'back' },
        { href: '/design-preview/documents', label: '문서함', icon: 'file' },
        { href: '/design-preview/network', label: '통신 목록', icon: 'server' },
        { href: '/design-preview/history', label: '변경 이력', icon: 'clock' },
        { href: '/design-preview/admin', label: '기관 설정', icon: 'settings' },
      ]
    : role === 'ADMIN'
      ? [
          { href: '/admin/questions', label: '기관 설정', icon: 'settings' },
          { href: '/admin/models', label: 'AI 모델 연결', icon: 'sparkle' },
          { href: '/admin/context', label: '기관 컨텍스트', icon: 'lock' },
          { href: '/knowledge', label: '보안 지식 안내', icon: 'book' },
        ]
      : [
          {
            href: '/requests',
            label: role === 'APPLICANT' ? '신청 현황' : '협의 요청함',
            icon: 'home',
          },
          ...(role === 'APPLICANT'
            ? [{ href: '/requests/new', label: '새 신청 시작', icon: 'plus' as const }]
            : []),
          { href: '/supplements', label: '보완 요청', icon: 'back' },
          { href: '/documents', label: '문서함', icon: 'file' },
          { href: '/network', label: '통신 목록', icon: 'server' },
          { href: '/history', label: '변경 이력', icon: 'clock' },
          { href: '/knowledge', label: '보안 지식 안내', icon: 'book' },
          ...(role !== 'APPLICANT'
            ? [{ href: '/institution/context', label: '기관 컨텍스트', icon: 'lock' as const }]
            : []),
        ];
  return (
    <div className={collapsed ? 'nav-collapsed' : undefined}>
      <a className="skip-link" href="#main-content">
        본문 바로가기
      </a>
      {preview && (
        <div className="demo-strip preview-strip">
          <div>
            <Icon name="lock" width={16} />
            <span>디자인 미리보기 · 합성 데이터 · 읽기 전용</span>
          </div>
          <Link href="/login">
            업무 로그인
            <Icon name="arrow" width={16} />
          </Link>
        </div>
      )}
      <header className="app-header">
        <div className="header-inner">
          <button
            className="icon-button mobile-nav"
            type="button"
            aria-label="주요 메뉴 열기"
            aria-controls="side-nav"
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            <Icon name="menu" />
          </button>
          <Link
            className="brand"
            href={
              preview
                ? '/design-preview/requests'
                : role === 'ADMIN'
                  ? '/admin/questions'
                  : '/requests'
            }
          >
            <span className="brand-mark">
              <Icon name="shield" width={26} />
            </span>
            <span>
              <strong>SecurityAdvisor</strong>
              <small>보안길잡이</small>
            </span>
          </Link>
          <span className="header-org">{institutionName}</span>
          {role !== 'ADMIN' && (
            <form
              className="header-search"
              onSubmit={(event) => {
                event.preventDefault();
                router.push(
                  `${preview ? '/design-preview/requests' : '/requests'}?query=${encodeURIComponent(search)}`,
                );
              }}
            >
              <label className="sr-only" htmlFor="global-search">
                신청 프로젝트 검색
              </label>
              <input
                id="global-search"
                type="search"
                placeholder="프로젝트 검색"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <button type="submit" aria-label="신청 검색">
                <Icon name="search" width={20} />
              </button>
            </form>
          )}
          <div className="header-tools">
            <button
              className="icon-button screen-setting"
              type="button"
              onClick={() => setSettings(true)}
              aria-label="화면 글자 크기와 밝기 설정"
            >
              <span aria-hidden="true">가</span>
            </button>
            {preview ? (
              <>
                <span className="role-picker">읽기전용 시안</span>
                <span className="user-avatar">시</span>
              </>
            ) : (
              <AccountControl />
            )}
          </div>
        </div>
      </header>
      <div className="app-shell">
        <aside className={`sidebar ${mobileOpen ? 'open' : ''}`} id="side-nav">
          <button
            className="sidebar-collapse icon-button"
            type="button"
            aria-label={collapsed ? '메뉴 펼치기' : '메뉴 접기'}
            aria-expanded={!collapsed}
            onClick={() => setCollapsed(!collapsed)}
          >
            <Icon name={collapsed ? 'arrow' : 'back'} width={18} />
          </button>
          <div className="institution">
            <Icon name="building" />
            <div>
              <strong>{institutionName}</strong>
              <small>{preview ? '합성 기관 · 디자인 검토' : '인증된 기관 업무 공간'}</small>
            </div>
          </div>
          <div className="nav-label">{role === 'ADMIN' ? '기관 운영' : '신청 업무'}</div>
          <nav aria-label="주요 메뉴">
            {nav.map((item) => {
              const active =
                pathname === item.href ||
                (item.href === '/requests' &&
                  pathname.startsWith('/requests/') &&
                  pathname !== '/requests/new') ||
                (item.href === '/admin/questions' &&
                  pathname.startsWith('/admin/') &&
                  !['/admin/context', '/admin/models'].includes(pathname));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={active ? 'active' : undefined}
                  aria-current={active ? 'page' : undefined}
                  aria-label={item.label}
                  onClick={() => setMobileOpen(false)}
                >
                  <Icon name={item.icon} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
          <div className="sidebar-help">
            <Icon name="book" />
            <strong>처음 작성하시나요?</strong>
            <p>
              알고 있는 내용부터 시작하세요.
              <br />
              전문 정보는 담당자가 확인해요.
            </p>
            <Link
              className="text-button"
              href={preview ? '/design-preview/analysis' : '/knowledge'}
            >
              작성 안내
              <Icon name="arrow" width={16} />
            </Link>
          </div>
          <div className="sidebar-bottom">
            <Icon name="lock" width={16} />
            <span>기관별로 분리된 업무 공간</span>
          </div>
        </aside>
        <div className="main-column">
          <main id="main-content" tabIndex={-1}>
            {children}
          </main>
          <footer className="app-footer">
            <div>
              <strong>SecurityAdvisor</strong>
              <span>현업과 전문가를 잇는 보안길잡이</span>
            </div>
            <small>Copyright © 2026 Team HF. All rights reserved.</small>
          </footer>
        </div>
      </div>
      <Modal open={settings} title="화면 설정" onClose={() => setSettings(false)}>
        <p>글자 크기와 화면 밝기를 조정합니다. 브라우저 기본 확대도 사용할 수 있습니다.</p>
        <fieldset className="display-options">
          <legend>글자 크기</legend>
          {[
            ['1', '보통'],
            ['1.125', '크게'],
            ['1.25', '아주 크게'],
          ].map(([value, label]) => (
            <label className="check-label" key={value}>
              <input
                type="radio"
                name="display-scale"
                value={value}
                checked={scale === value}
                onChange={() => setScale(value)}
              />
              {label}
            </label>
          ))}
        </fieldset>
        <fieldset className="display-options">
          <legend>화면 밝기</legend>
          {[
            ['system', '기기 설정에 맞춤'],
            ['light', '밝게'],
            ['dark', '어둡게'],
          ].map(([value, label]) => (
            <label className="check-label" key={value}>
              <input
                type="radio"
                name="display-theme"
                value={value}
                checked={theme === value}
                onChange={() => setTheme(value)}
              />
              {label}
            </label>
          ))}
        </fieldset>
        <div className="dialog-actions">
          <button
            className="button"
            type="button"
            onClick={() => {
              setScale('1');
              setTheme('system');
            }}
          >
            기본 설정으로
          </button>
          <button className="button primary" type="button" onClick={() => setSettings(false)}>
            확인
          </button>
        </div>
      </Modal>
    </div>
  );
}
/** 기관과 역할을 서버가 인증한 세션에서 가져온다. */
export function AuthenticatedShell({ children }: { children: ReactNode }) {
  const session = useSession();
  return (
    <AppShell institutionName={session.institutionName} role={session.user.role}>
      {children}
    </AppShell>
  );
}
