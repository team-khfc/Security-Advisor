'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { AccountControl, useSession } from '@/features/auth';
import { ROLE_LABELS, type Role } from '@/lib/sharedTypes';
import { Icon, Modal, type IconName } from '@/components/ui';
import { useDisplayPreferences } from '@/lib/displayPreferences';

interface NavItem {
  href: string;
  label: string;
  icon: IconName;
}

/** 지정 시안의 공통 셸을 사용하며 실제 역할과 기관은 서버 세션에서 받는다. */
export function AppShell({
  children,
  institutionName,
  role,
  preview = false,
  displayName,
}: {
  children: ReactNode;
  institutionName: string;
  role: Role;
  preview?: boolean;
  displayName?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [settings, setSettings] = useState(false);
  const [guide, setGuide] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const { scale, theme, setScale, setTheme } = useDisplayPreferences();
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);
  const notificationRef = useRef<HTMLDivElement>(null);
  const name = displayName ?? '신청 담당자 (예시)';
  const base = preview ? '/design-preview' : '';
  const home = role === 'ADMIN' && !preview ? '/admin/questions' : `${base}/requests`;
  const nav: NavItem[] =
    role === 'ADMIN'
      ? [
          {
            href: preview ? '/design-preview/admin' : '/admin/questions',
            label: '기관 설정',
            icon: 'settings',
          },
          {
            href: preview ? '/design-preview/admin?tab=models' : '/admin/models',
            label: 'AI 모델 연결',
            icon: 'sparkle',
          },
          {
            href: preview ? '/design-preview/admin?tab=context' : '/admin/context',
            label: '기관 컨텍스트',
            icon: 'building',
          },
        ]
      : role === 'APPLICANT'
        ? [
            { href: `${base}/requests`, label: '신청 현황', icon: 'inbox' },
            {
              href: preview ? '/design-preview/new-request' : '/requests/new',
              label: '새 신청',
              icon: 'plus',
            },
            { href: `${base}/supplements`, label: '보완 요청', icon: 'message' },
            { href: `${base}/documents`, label: '문서함', icon: 'file' },
          ]
        : [
            { href: `${base}/requests`, label: '협의 요청함', icon: 'inbox' },
            ...(role === 'INFRA'
              ? [{ href: `${base}/network`, label: '통신 정보', icon: 'server' as const }]
              : []),
            {
              href: `${base}/history`,
              label: role === 'SECURITY' ? '검토 이력' : '처리 이력',
              icon: 'clock',
            },
            { href: `${base}/documents`, label: '문서함', icon: 'file' },
          ];
  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === 'Escape') {
        if (accountOpen) accountRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
        if (notifications)
          notificationRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
        setAccountOpen(false);
        setNotifications(false);
        setMobileOpen(false);
      }
    }
    function outside(event: MouseEvent) {
      if (!(event.target instanceof Node)) return;
      if (!accountRef.current?.contains(event.target)) setAccountOpen(false);
      if (!notificationRef.current?.contains(event.target)) setNotifications(false);
    }
    document.addEventListener('keydown', shortcut);
    document.addEventListener('click', outside);
    return () => {
      document.removeEventListener('keydown', shortcut);
      document.removeEventListener('click', outside);
    };
  }, [accountOpen, notifications]);
  const sizes = ['1', '1.125', '1.25'];
  const sizeIndex = Math.max(0, sizes.indexOf(scale));
  function closeSettings() {
    setSettings(false);
    // 팝오버 안의 호출 버튼은 모달을 열 때 사라지므로 유지되는 계정 버튼으로 돌아간다.
    requestAnimationFrame(() =>
      accountRef.current?.querySelector<HTMLButtonElement>('.ubtn')?.focus(),
    );
  }
  return (
    <div className={`prototype-app${collapsed ? ' side-collapsed' : ''}`}>
      <a className="skip" href="#main-content">
        본문 바로가기
      </a>
      <header className="hd">
        <div className="hd-in">
          <button
            className="btn btn-tertiary mnav"
            type="button"
            aria-controls="side-nav"
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            메뉴
          </button>
          <Link className="logo" href={home} aria-label="SecurityAdvisor 보안길잡이 신청 현황으로">
            <Image
              className="logo-img logo-l"
              src="/assets/design/images/logo.png"
              alt="보안길잡이 AI"
              width={208}
              height={48}
              priority
              unoptimized
            />
            <Image
              className="logo-img logo-d"
              src="/assets/design/images/logo-dark.png"
              alt="보안길잡이 AI"
              width={208}
              height={49}
              priority
              unoptimized
            />
          </Link>
          <span className="org">{institutionName}</span>
          <div className="ctx">
            {role !== 'ADMIN' && (
              <form
                className="gsearch"
                role="search"
                onSubmit={(event) => {
                  event.preventDefault();
                  router.push(`${base}/requests?query=${encodeURIComponent(search)}`);
                }}
              >
                <label className="sr-only" htmlFor="global-search">
                  신청 검색
                </label>
                <button className="gs-ic" type="submit" aria-label="신청 검색">
                  <Icon name="search" width={18} height={18} />
                </button>
                <input
                  className="input"
                  id="global-search"
                  type="search"
                  placeholder="신청 검색"
                  autoComplete="off"
                  value={search}
                  ref={searchRef}
                  onChange={(event) => setSearch(event.target.value)}
                  aria-describedby="search-shortcut"
                />
                <kbd id="search-shortcut" aria-label="단축키 Ctrl K">
                  Ctrl K
                </kbd>
              </form>
            )}
            <div className="umenu-wrap" ref={accountRef}>
              <button
                className="ubtn"
                type="button"
                aria-expanded={accountOpen}
                aria-controls="account-menu"
                onClick={() => {
                  setAccountOpen(!accountOpen);
                  setNotifications(false);
                }}
              >
                <span className="uav" aria-hidden="true">
                  {name.slice(0, 1)}
                </span>
                <span className="utxt">
                  <b>{name}</b>
                  <span>
                    {ROLE_LABELS[role]}
                    {preview ? ' · 읽기 전용' : ''}
                  </span>
                </span>
                <Icon name="down" width={16} height={16} />
              </button>
              {accountOpen && (
                <div className="umenu" id="account-menu">
                  <p className="meta">{preview ? '합성 데이터 미리보기' : institutionName}</p>
                  {preview ? (
                    <p className="help">
                      화면을 확인하는 예시 계정입니다. 업무 변경을 저장하지 않습니다.
                    </p>
                  ) : (
                    <div className="shell-account-actions">
                      <AccountControl />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setSettings(true);
                      setAccountOpen(false);
                    }}
                  >
                    <Icon name="settings" width={18} /> 화면 설정
                  </button>
                  {preview ? (
                    <Link href="/login">업무 로그인</Link>
                  ) : (
                    <Link href="/knowledge">보안 지식 안내</Link>
                  )}
                </div>
              )}
            </div>
            <div className="noti-wrap" ref={notificationRef}>
              <button
                className="tbtn"
                type="button"
                aria-expanded={notifications}
                aria-controls="notifications"
                aria-label="알림·협의 소식"
                onClick={() => {
                  setNotifications(!notifications);
                  setAccountOpen(false);
                }}
              >
                <Icon name="bell" width={20} height={20} />
              </button>
              {notifications && (
                <section className="noti" id="notifications" aria-labelledby="notifications-title">
                  <div className="noti-h">
                    <h2 className="h-panel" id="notifications-title">
                      <Icon name="bell" width={18} />
                      알림·협의 소식
                    </h2>
                    <button
                      className="dlg-x notification-close"
                      type="button"
                      aria-label="알림 닫기"
                      onClick={() => setNotifications(false)}
                    >
                      <Icon name="close" width={20} />
                    </button>
                  </div>
                  <p className="help notification-copy">
                    신청별 협의와 보완 내용은 요청함에서 확인할 수 있습니다. 별도 알림 발송은 아직
                    제공하지 않습니다.
                  </p>
                  <Link className="link-more" href={home} onClick={() => setNotifications(false)}>
                    요청함 확인 <Icon name="arrow" width={18} />
                  </Link>
                </section>
              )}
            </div>
            <div className="fontsz" role="group" aria-label="글자 크기">
              <button
                className="tbtn"
                type="button"
                aria-label="글자 작게"
                disabled={sizeIndex === 0}
                onClick={() => setScale(sizes[Math.max(0, sizeIndex - 1)])}
              >
                <span className="font-small" aria-hidden="true">
                  가
                </span>
              </button>
              <button
                className="tbtn"
                type="button"
                aria-label="글자 크게"
                disabled={sizeIndex === sizes.length - 1}
                onClick={() => setScale(sizes[Math.min(sizes.length - 1, sizeIndex + 1)])}
              >
                <span className="font-large" aria-hidden="true">
                  가
                </span>
              </button>
            </div>
          </div>
        </div>
      </header>
      <div className="shell">
        <aside className={`side${mobileOpen ? ' open' : ''}`} id="side-nav">
          <button
            className="side-tg"
            type="button"
            aria-controls="side-nav"
            aria-expanded={!collapsed}
            aria-label={collapsed ? '메뉴 펼치기' : '메뉴 접기'}
            onClick={() => setCollapsed(!collapsed)}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M15 5l-7 7 7 7" />
            </svg>
            <span className="tg-l">{collapsed ? '메뉴 펼치기' : '메뉴 접기'}</span>
          </button>
          <div className="inst">
            <Icon name="building" width={20} height={20} />
            <div>
              <b>{institutionName}</b>
            </div>
          </div>
          <nav aria-labelledby="menu-h">
            <h2 id="menu-h">{role === 'ADMIN' ? '기관 운영' : '신청 업무'}</h2>
            <ul>
              {nav.map((item) => {
                const active =
                  pathname === item.href ||
                  (item.href === '/requests' &&
                    pathname.startsWith('/requests/') &&
                    pathname !== '/requests/new');
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      onClick={() => setMobileOpen(false)}
                    >
                      <Icon name={item.icon} width={20} height={20} />
                      <span className="nl">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          <button
            type="button"
            className="btn btn-tertiary btn-sm side-guide"
            onClick={() => setGuide(true)}
          >
            이용 안내
          </button>
        </aside>
        <main id="main-content" tabIndex={-1}>
          {children}
        </main>
      </div>
      <footer className="ft">
        <div className="ft-in">
          <b className="ft-brand">보안길잡이 AI</b>
          <p className="ft-copy">Copyright © 2026 Team HF. All rights reserved.</p>
        </div>
      </footer>
      <Modal open={guide} title="SecurityAdvisor 이용 안내" onClose={() => setGuide(false)}>
        <p>사업 내용을 작성하면 ICT인프라와 정보보안 담당자가 필요한 정보를 함께 확인합니다.</p>
        <ol className="guide-steps">
          <li>
            <strong>작성</strong> — 사업 설명과 자료를 바탕으로 답변합니다.
          </li>
          <li>
            <strong>담당자 협의</strong> — 인프라 할당 후 양측이 검토합니다.
          </li>
          <li>
            <strong>사용자 최종 검토</strong> — AI 초안을 직접 확인하고 제출합니다.
          </li>
          <li>
            <strong>확정·관리</strong> — 담당자가 제출본을 확인하고 서류를 확정합니다.
          </li>
        </ol>
        <p className="help">
          시연에는 합성 자료만 사용합니다. AI의 제안은 사람이 확정하며, 서류 확정과 장비 적용은
          별도입니다.
        </p>
        <div className="dialog-actions">
          <button className="button primary" type="button" onClick={() => setGuide(false)}>
            확인
          </button>
        </div>
      </Modal>
      <Modal open={settings} title="화면 설정" onClose={closeSettings}>
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
          <button className="button primary" type="button" onClick={closeSettings}>
            확인
          </button>
        </div>
      </Modal>
    </div>
  );
}

/** 인증된 기관·역할·사용자 표시를 공통 셸에 전달한다. */
export function AuthenticatedShell({ children }: { children: ReactNode }) {
  const session = useSession();
  return (
    <AppShell
      institutionName={session.institutionName}
      role={session.user.role}
      displayName={session.user.displayName}
    >
      {children}
    </AppShell>
  );
}
