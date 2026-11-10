'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { useInstallation } from '@/lib/queries';
import { ROLE_LABELS, type Role } from '@/lib/types';
import { useDemoLogin, useLogin } from './useAuth';
import { loginInputSchema } from './types';

const demoAccounts: { username: string; name: string; role: Role }[] = [
  { username: 'applicant', name: '신청자 가', role: 'APPLICANT' },
  { username: 'applicant2', name: '신청자 나', role: 'APPLICANT' },
  { username: 'infra', name: '인프라 담당 가', role: 'INFRA' },
  { username: 'security', name: '보안 담당 가', role: 'SECURITY' },
  { username: 'admin', name: '관리자 가', role: 'ADMIN' },
];

function returnPath() {
  const path = new URLSearchParams(window.location.search).get('next');
  if (
    !path ||
    !path.startsWith('/') ||
    path.startsWith('//') ||
    /[\\\u0000-\u0020\u007f]/.test(path)
  ) {
    return '/requests';
  }
  try {
    const target = new URL(path, window.location.origin);
    const decodedPath = decodeURIComponent(target.pathname);
    const allowed =
      /^\/(requests|cases|supplements|documents|history|network|settings|members|policies)(\/|$)/;
    if (
      target.origin !== window.location.origin ||
      !allowed.test(target.pathname) ||
      /[\\\u0000-\u0020\u007f]/.test(decodedPath) ||
      /%2f|%5c/i.test(target.pathname) ||
      decodedPath.split('/').some((segment) => segment === '.' || segment === '..')
    ) {
      return '/requests';
    }
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return '/requests';
  }
}

/** 모의 로그인은 명시적으로 구분하고 운영에서는 계정 로그인만 표시한다. */
export function LoginPage() {
  const router = useRouter();
  const installation = useInstallation();
  const login = useLogin();
  const demoLogin = useDemoLogin();
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState('');
  const pending = login.isPending || demoLogin.isPending;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const form = new FormData(event.currentTarget);
    const result = loginInputSchema.safeParse({
      username: form.get('username'),
      password: form.get('password'),
    });
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? '입력값을 확인해 주세요.');
      return;
    }
    try {
      await login.mutateAsync(result.data);
      router.replace(returnPath());
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : '로그인하지 못했습니다. 다시 시도해 주세요.',
      );
    }
  }

  async function openDemo(username: string) {
    setError('');
    try {
      await demoLogin.mutateAsync(username);
      router.replace(returnPath());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '모의 세션을 시작하지 못했습니다.');
    }
  }

  return (
    <main className="auth-page" id="main">
      <div className="auth-layout">
        <section className="auth-aside" aria-labelledby="auth-intro">
          <Image src="/images/logo.png" alt="보안길잡이 AI" width={208} height={48} priority />
          <p className="eyebrow">SecurityAdvisor</p>
          <h2 id="auth-intro">
            반복되는 보안 업무는 자동으로,
            <br />
            담당자 협의까지 편리하게.
          </h2>
          <p>사업을 설명해 주세요. 필요한 정보를 차근차근 모으고, 전문가와 함께 확인합니다.</p>
          <ol className="auth-steps">
            <li>
              <span>1</span>사업기획서 업로드 및 AI인터뷰
            </li>
            <li>
              <span>2</span>인프라 · 보안 담당자의 협의
            </li>
            <li>
              <span>3</span>사용자 최종 검토
            </li>
            <li>
              <span>4</span>확정 · 관리
            </li>
          </ol>
          <p className="help">AI는 초안을 제안하며, 최종 확인과 확정은 사람이 합니다.</p>
        </section>
        <section className="auth-card" aria-labelledby="login-title">
          <div className="auth-brand">
            <span className="badge b-info">
              {installation.data?.institutionName ?? 'SecurityAdvisor'}
            </span>
            <h1 id="login-title">로그인</h1>
            <p className="muted">계정으로 로그인하고 신청 업무를 이어서 진행하세요.</p>
          </div>
          {error && (
            <div className="notice n-danger" role="alert">
              {error}
            </div>
          )}
          <form className="auth-form" onSubmit={onSubmit} aria-busy={pending}>
            <div className="form-field">
              <label htmlFor="login-username">아이디</label>
              <input
                className="input"
                id="login-username"
                name="username"
                autoComplete="username"
                required
                maxLength={50}
              />
            </div>
            <div className="form-field">
              <label htmlFor="login-password">비밀번호</label>
              <div className="password-field">
                <input
                  className="input"
                  id="login-password"
                  name="password"
                  type={visible ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  maxLength={200}
                />
                <button
                  className="btn btn-tertiary"
                  type="button"
                  onClick={() => setVisible(!visible)}
                  aria-pressed={visible}
                >
                  {visible ? '숨기기' : '표시'}
                </button>
              </div>
            </div>
            <button className="btn btn-primary auth-submit" type="submit" disabled={pending}>
              {login.isPending ? '로그인 중…' : '로그인'}
            </button>
            <p className="help">
              처음 이용하시나요? <Link href="/signup">회원가입</Link>
            </p>
          </form>
          {installation.data?.mode === 'mock' && (
            <section className="auth-demo" aria-labelledby="demo-title">
              <h2 id="demo-title" className="h-panel">
                모의 계정으로 살펴보기
              </h2>
              <p className="help">
                합성 데이터로 화면과 업무 흐름을 확인합니다. 실제 로그인·LLM·업무 서버와는 연결되지
                않습니다. 모의 데이터는 서버 재시작 시 초기화됩니다.
              </p>
              <div className="demo-accounts">
                {demoAccounts.map((account) => (
                  <button
                    type="button"
                    className="btn demo-account"
                    key={account.username}
                    disabled={pending}
                    onClick={() => openDemo(account.username)}
                  >
                    <span>{account.name}</span>
                    <small>{ROLE_LABELS[account.role]}</small>
                  </button>
                ))}
              </div>
              <p className="meta">
                아이디·비밀번호 방식의 모의 계정 로그인은 실행 환경에 시연 비밀번호를 설정한 경우
                사용할 수 있습니다.
              </p>
            </section>
          )}
          {installation.isError && (
            <p className="notice n-warning">
              기관 정보를 불러오지 못했습니다. 연결 설정을 확인해 주세요.{' '}
              <button
                className="btn btn-tertiary btn-sm"
                type="button"
                onClick={() => installation.refetch()}
              >
                다시 불러오기
              </button>
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
