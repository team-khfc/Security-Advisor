'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useExtendSession, useLogout, useSession } from '@/features/auth';
import { NotificationBell, useActivityCount } from '@/features/notification';
import { hasInputDrafts, useHasInputDrafts } from '@/lib/inputDrafts';
import { useInstallation } from '@/lib/queries';
import { ROLE_LABELS, type Role } from '@/lib/types';
import { ErrorState, Icon, LoadingState, Modal, Notice } from './ui';

interface MenuItem {
  href: string;
  label: string;
  icon: string;
}

const menus: Record<Role, MenuItem[]> = {
  APPLICANT: [
    { href: '/requests', label: '신청 현황', icon: 'inbox' },
    { href: '/requests/new', label: '새 신청', icon: 'plus' },
    { href: '/supplements', label: '보완 요청', icon: 'message' },
    { href: '/history', label: '내 신청 이력', icon: 'history' },
    { href: '/policies', label: '정책 수명주기', icon: 'timer' },
    { href: '/documents', label: '문서함', icon: 'document' },
  ],
  INFRA: [
    { href: '/requests', label: '협의 요청함', icon: 'inbox' },
    { href: '/network', label: '통신 정보', icon: 'network' },
    { href: '/history', label: '처리 이력', icon: 'history' },
    { href: '/policies', label: '정책 수명주기', icon: 'timer' },
    { href: '/documents', label: '문서함', icon: 'document' },
  ],
  SECURITY: [
    { href: '/requests', label: '협의 요청함', icon: 'inbox' },
    { href: '/history', label: '검토 이력', icon: 'history' },
    { href: '/policies', label: '정책 수명주기', icon: 'timer' },
    { href: '/documents', label: '문서함', icon: 'document' },
  ],
  ADMIN: [
    { href: '/requests', label: '신청 현황', icon: 'inbox' },
    { href: '/documents', label: '문서함', icon: 'document' },
    { href: '/settings', label: '기관 설정', icon: 'settings' },
    { href: '/knowledge', label: '지식·비공개 정보', icon: 'document' },
    { href: '/insights', label: '업무 지표', icon: 'inbox' },
    { href: '/models', label: 'AI 모델 구성', icon: 'settings' },
    { href: '/members', label: '계정·담당자 관리', icon: 'users' },
    { href: '/policies', label: '정책 수명주기', icon: 'timer' },
    { href: '/history', label: '감사 이력', icon: 'history' },
  ],
};

const guideSteps = [
  [
    '작성',
    '사업 공통 정보를 한 번 입력하고 필요한 서류를 함께 신청합니다. AI 추론은 확인 전까지 미확정입니다.',
  ],
  [
    '담당자 협의',
    'ICT인프라 담당자가 자원을 할당한 뒤 정보보안 담당자가 검토합니다. 할당과 협의 완료는 별도입니다.',
  ],
  ['사용자 최종 검토', '보완 답변과 최종 초안을 확인한 뒤 신청별로 제출합니다.'],
  [
    '확정·관리',
    'ICT인프라와 정보보안 담당자가 제출본을 최종 확인한 뒤 서류를 확정합니다. 방화벽 적용은 별도 업무입니다.',
  ],
];

function activeMenu(pathname: string, item: MenuItem) {
  if (item.href === '/requests') {
    return (
      pathname === '/requests' ||
      (pathname.startsWith('/requests/') && pathname !== '/requests/new') ||
      pathname.startsWith('/cases/')
    );
  }
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function confirmDraftDeparture(actorId: string, action: string) {
  return (
    !hasInputDrafts(actorId) ||
    window.confirm(
      `저장하지 않은 입력이 있습니다. ${action}해도 이 탭에서 같은 계정으로 돌아오면 복원됩니다. 새로고침하거나 탭을 닫으면 사라집니다. 계속하시겠습니까?`,
    )
  );
}

/** 로그인 계정·설치 기관 문맥을 유지하며 모든 업무 화면에 같은 탐색을 제공한다. */
export function ServiceShell({ children }: { children: ReactNode }) {
  const session = useSession();
  const installation = useInstallation();
  const logout = useLogout();
  const extendSession = useExtendSession();
  const router = useRouter();
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [searchIndex, setSearchIndex] = useState(-1);
  const [scale, setScale] = useState(1);
  const [now, setNow] = useState(() => Date.now());
  const [dismissedExpiry, setDismissedExpiry] = useState<string | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const searchArea = useRef<HTMLDivElement>(null);
  const userArea = useRef<HTMLDivElement>(null);
  const member = session.data?.member;
  const actorId = member?.id ?? '';
  const hasDrafts = useHasInputDrafts(actorId);
  const todoCount = useActivityCount('todo');
  const items = member
    ? [
        {
          href: '/todos',
          label: `처리할 일${todoCount.data === undefined ? '' : ` ${todoCount.data}건`}`,
          icon: 'inbox',
        },
        ...menus[member.role],
      ]
    : [];
  const menuMatches = items.filter((item) => item.label.includes(search.trim()));
  const expiresAt = session.data?.expiresAt;
  const remaining = expiresAt ? Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / 1000)) : null;

  useEffect(() => {
    if (!hasDrafts) return;
    const unload = (event: BeforeUnloadEvent) => event.preventDefault();
    const followLink = (event: MouseEvent) => {
      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        event.defaultPrevented
      )
        return;
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (
        !(anchor instanceof HTMLAnchorElement) ||
        anchor.download ||
        (anchor.target && anchor.target !== '_self')
      )
        return;
      const target = new URL(anchor.href, window.location.href);
      if (
        target.origin !== window.location.origin ||
        target.pathname.startsWith('/api/') ||
        (target.pathname === window.location.pathname && target.search === window.location.search)
      )
        return;
      if (!confirmDraftDeparture(actorId, '다른 화면으로 이동')) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    window.addEventListener('beforeunload', unload);
    document.addEventListener('click', followLink, true);
    return () => {
      window.removeEventListener('beforeunload', unload);
      document.removeEventListener('click', followLink, true);
    };
  }, [actorId, hasDrafts]);

  useEffect(() => {
    if (session.isSuccess && !session.data) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [session.isSuccess, session.data, pathname, router]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchInput.current?.focus();
      }
      if (event.key === 'Escape') {
        setSearchOpen(false);
        setUserOpen(false);
      }
    };
    const outsideClick = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!searchArea.current?.contains(target)) setSearchOpen(false);
      if (!userArea.current?.contains(target)) setUserOpen(false);
    };
    document.addEventListener('keydown', handleKey);
    document.addEventListener('pointerdown', outsideClick);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('pointerdown', outsideClick);
    };
  }, []);

  useEffect(() => {
    document.documentElement.style.fontSize = `${62.5 * scale}%`;
    return () => {
      document.documentElement.style.removeProperty('font-size');
    };
  }, [scale]);

  useEffect(() => {
    if (!expiresAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);

  function visit(href: string) {
    if (!confirmDraftDeparture(actorId, '다른 화면으로 이동')) return;
    setSearchOpen(false);
    setNavOpen(false);
    setSearchIndex(-1);
    router.push(href);
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (searchIndex >= 0 && menuMatches[searchIndex]) {
      visit(menuMatches[searchIndex].href);
    } else {
      visit(search.trim() ? `/requests?q=${encodeURIComponent(search.trim())}` : '/requests');
    }
  }

  async function signOut() {
    if (!confirmDraftDeparture(actorId, '로그아웃')) return;
    try {
      await logout.mutateAsync();
      router.replace('/login');
    } catch {
      // 실패 상태는 메뉴의 오류 영역에 남겨 재시도할 수 있게 한다.
    }
  }

  if (session.isPending || (session.isSuccess && !member)) {
    return (
      <div className="session-loading">
        <LoadingState />
      </div>
    );
  }
  if (session.isError || !member) {
    return (
      <div className="session-loading">
        <ErrorState
          error={session.error}
          onRetry={() => {
            void session.refetch();
          }}
        />
        <Link href="/login" className="btn">
          로그인으로 이동
        </Link>
      </div>
    );
  }
  if (remaining === 0) {
    return (
      <div className="session-loading">
        <Notice tone="warning">
          <h1 className="h-panel">로그인 시간이 만료되었습니다</h1>
          <p>
            저장된 초안은 유지됩니다. 저장하지 않은 입력은 이 탭에서 같은 계정으로 다시 로그인하면
            복원됩니다. 새로고침하거나 탭을 닫으면 사라집니다.
          </p>
        </Notice>
        <Link className="btn btn-primary" href={`/login?next=${encodeURIComponent(pathname)}`}>
          다시 로그인
        </Link>
      </div>
    );
  }

  const institutionName = installation.data?.institutionName ?? '기관 정보 확인 중';
  return (
    <>
      <a className="skip" href="#main">
        본문 바로가기
      </a>
      {session.data?.mock && (
        <div className="demo-bar">
          <p>
            <Icon name="info" size={16} />
            모의 API 개발 환경 · 모든 사업·계정·주소는 합성 데이터입니다.
          </p>
        </div>
      )}
      <header className="hd">
        <div className="hd-in">
          <button
            type="button"
            className="btn btn-tertiary mnav"
            aria-controls="side-nav"
            aria-expanded={navOpen}
            onClick={() => setNavOpen(!navOpen)}
          >
            <Icon name="menu" />
            메뉴
          </button>
          <Link className="logo" href="/requests" aria-label="SecurityAdvisor 신청 현황으로">
            <Image
              className="logo-img logo-l"
              src="/images/logo.png"
              alt="보안길잡이 AI"
              width={208}
              height={48}
              priority
            />
            <Image
              className="logo-img logo-d"
              src="/images/logo-dark.png"
              alt="보안길잡이 AI"
              width={208}
              height={49}
              priority
            />
          </Link>
          <span className="org">{institutionName}</span>
          <div className="ctx">
            <div className="gsearch" ref={searchArea}>
              <form role="search" onSubmit={submitSearch}>
                <label htmlFor="global-search" className="sr-only">
                  신청·화면 검색
                </label>
                <span className="gs-ic">
                  <Icon name="search" size={18} />
                </span>
                <input
                  ref={searchInput}
                  id="global-search"
                  type="search"
                  className="input"
                  value={search}
                  placeholder="신청·화면 검색"
                  autoComplete="off"
                  role="combobox"
                  aria-expanded={searchOpen}
                  aria-controls="global-search-results"
                  aria-autocomplete="list"
                  aria-activedescendant={
                    searchOpen && searchIndex >= 0 ? `global-result-${searchIndex}` : undefined
                  }
                  onFocus={() => setSearchOpen(true)}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setSearchOpen(true);
                    setSearchIndex(-1);
                  }}
                  onKeyDown={(event) => {
                    if (event.nativeEvent.isComposing) return;
                    if (event.key === 'ArrowDown') {
                      event.preventDefault();
                      setSearchOpen(true);
                      setSearchIndex((index) => Math.min(index + 1, menuMatches.length - 1));
                    } else if (event.key === 'ArrowUp') {
                      event.preventDefault();
                      setSearchIndex((index) => Math.max(index - 1, -1));
                    } else if (event.key === 'Escape') {
                      event.preventDefault();
                      setSearchOpen(false);
                    }
                  }}
                />
                <kbd aria-hidden="true">Ctrl K</kbd>
                <button type="submit" className="sr-only" tabIndex={-1}>
                  검색
                </button>
              </form>
              <ul
                className="glist"
                id="global-search-results"
                role="listbox"
                aria-label="화면 검색 결과"
                hidden={!searchOpen}
              >
                {menuMatches.map((item, index) => (
                  <li
                    key={item.href}
                    id={`global-result-${index}`}
                    role="option"
                    aria-selected={searchIndex === index}
                    tabIndex={-1}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => visit(item.href)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        visit(item.href);
                      }
                    }}
                  >
                    <span>{item.label}</span>
                    <span className="meta">화면으로 이동</span>
                  </li>
                ))}
                {menuMatches.length === 0 && (
                  <li className="gempty" role="presentation">
                    일치하는 화면이 없습니다.
                  </li>
                )}
                <li className="gh" role="presentation">
                  Enter를 눌러{' '}
                  {search.trim() ? `“${search.trim()}” 신청 검색` : '신청 현황으로 이동'}
                </li>
              </ul>
            </div>
            <div className="umenu-wrap" ref={userArea}>
              <button
                type="button"
                className="ubtn"
                aria-expanded={userOpen}
                aria-controls="session-menu"
                onClick={() => setUserOpen(!userOpen)}
              >
                <span className="uav" aria-hidden="true">
                  {member.displayName.slice(0, 1)}
                </span>
                <span className="utxt">
                  <b>{member.displayName}</b>
                  <span>{member.department || ROLE_LABELS[member.role]}</span>
                </span>
                <Icon name="chevronDown" size={16} />
              </button>
              <div className="umenu session-menu" id="session-menu" hidden={!userOpen}>
                <div className="session-summary">
                  <b>{member.displayName}</b>
                  <p className="help">{ROLE_LABELS[member.role]}</p>
                  <p className="meta">{institutionName}</p>
                </div>
                {logout.isError && <ErrorState error={logout.error} />}
                <button
                  type="button"
                  onClick={() => {
                    void signOut();
                  }}
                  disabled={logout.isPending}
                >
                  <Icon name="logOut" />
                  {logout.isPending ? '로그아웃 중…' : '로그아웃'}
                </button>
              </div>
            </div>
            <NotificationBell key={`${member.id}:${member.role}`} />
            <div
              className="fontsz"
              role="group"
              aria-label={`글자 크기: ${scale === 1 ? '보통' : scale === 1.125 ? '크게' : '아주 크게'}`}
            >
              <button
                type="button"
                className="tbtn"
                aria-label="글자 작게"
                disabled={scale <= 1}
                onClick={() => setScale((value) => Math.max(1, value - 0.125))}
              >
                <span className="font-small" aria-hidden="true">
                  가
                </span>
              </button>
              <button
                type="button"
                className="tbtn"
                aria-label="글자 크게"
                disabled={scale >= 1.25}
                onClick={() => setScale((value) => Math.min(1.25, value + 0.125))}
              >
                <span className="font-large" aria-hidden="true">
                  가
                </span>
              </button>
            </div>
          </div>
        </div>
      </header>
      <div className={`shell${collapsed ? ' nav-collapsed' : ''}`}>
        <div className={`side${navOpen ? ' open' : ''}`} id="side-nav">
          <button
            type="button"
            className="side-tg"
            aria-expanded={!collapsed}
            aria-controls="main-navigation"
            aria-label={collapsed ? '메뉴 펼치기' : '메뉴 접기'}
            onClick={() => setCollapsed(!collapsed)}
          >
            <Icon name="chevronLeft" size={14} />
          </button>
          <div className="inst">
            <Icon name="building" />
            <div>
              <b>{institutionName}</b>
            </div>
          </div>
          <nav aria-labelledby="menu-heading" id="main-navigation">
            <h2 className="sr-only" id="menu-heading">
              신청 업무
            </h2>
            <ul>
              {items.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={activeMenu(pathname, item) ? 'page' : undefined}
                    onClick={() => setNavOpen(false)}
                  >
                    <Icon name={item.icon} />
                    <span className="nav-label">{item.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <button
            type="button"
            className="btn btn-tertiary btn-sm side-guide"
            onClick={() => setHelpOpen(true)}
          >
            <Icon name="help" size={18} />
            이용 안내
          </button>
        </div>
        <main id="main" tabIndex={-1}>
          {installation.isError && (
            <ErrorState
              error={installation.error}
              onRetry={() => {
                void installation.refetch();
              }}
            />
          )}
          {children}
        </main>
      </div>
      <footer className="ft">
        <div className="ft-in">
          <b className="ft-brand">보안길잡이 AI · SecurityAdvisor</b>
          <p className="ft-copy">Copyright © 2026 Team HF. All rights reserved.</p>
        </div>
      </footer>
      <Modal open={helpOpen} onClose={() => setHelpOpen(false)} title="보안길잡이 이용 안내">
        <ol className="steps-guide help-steps">
          {guideSteps.map(([title, description], index) => (
            <li key={title}>
              <span className="sn">{index + 1}</span>
              <div>
                <b>{title}</b>
                <p>{description}</p>
              </div>
            </li>
          ))}
        </ol>
        <Notice>
          <p>AI는 제안하고, 사람이 확인합니다. 서류 확정과 실제 방화벽 적용은 다릅니다.</p>
        </Notice>
        <button type="button" className="btn btn-tertiary" onClick={() => setHelpOpen(false)}>
          안내 닫기
        </button>
      </Modal>
      <Modal
        open={remaining !== null && remaining <= 60 && dismissedExpiry !== expiresAt}
        onClose={() => setDismissedExpiry(expiresAt ?? null)}
        title="로그인 시간이 곧 만료됩니다"
      >
        <p>
          약 {remaining}초 뒤 로그인 시간이 만료됩니다. 작업을 계속하려면 로그인을 연장해 주세요.
        </p>
        {extendSession.isError && <ErrorState error={extendSession.error} />}
        <div className="btn-row">
          <button
            type="button"
            className="btn btn-primary"
            disabled={extendSession.isPending}
            onClick={() => {
              extendSession.mutate();
            }}
          >
            {extendSession.isPending ? '연장 중…' : '로그인 연장'}
          </button>
          <button
            type="button"
            className="btn btn-tertiary"
            disabled={logout.isPending}
            onClick={() => {
              void signOut();
            }}
          >
            로그아웃
          </button>
        </div>
      </Modal>
    </>
  );
}
