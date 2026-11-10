'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { useInstallation } from '@/lib/queries';
import { signupInputSchema } from './types';
import { useSignup } from './useAuth';

/** 가입자는 신청자 역할로만 생성하며 역할·기관 선택을 받지 않는다. */
export function SignupPage() {
  const installation = useInstallation();
  const signup = useSignup();
  const [error, setError] = useState('');
  const [visible, setVisible] = useState(false);
  const [complete, setComplete] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const form = new FormData(event.currentTarget);
    const result = signupInputSchema.safeParse({
      username: form.get('username'),
      password: form.get('password'),
      displayName: form.get('displayName'),
      department: form.get('department'),
    });
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? '입력 내용을 확인해 주세요.');
      return;
    }
    if (result.data.password !== form.get('passwordConfirm')) {
      setError('비밀번호와 비밀번호 확인 값이 다릅니다.');
      return;
    }
    try {
      await signup.mutateAsync(result.data);
      setComplete(true);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : '가입하지 못했습니다. 다시 시도해 주세요.',
      );
    }
  }

  return (
    <main className="auth-page" id="main">
      <section className="auth-card signup-card" aria-labelledby="signup-title">
        <Link href="/login" className="auth-brand">
          <Image
            src="/images/logo.png"
            alt="보안길잡이 AI 로그인으로"
            width={208}
            height={48}
            priority
          />
        </Link>
        <h1 id="signup-title">회원가입</h1>
        <p className="muted">
          {installation.data?.institutionName ?? '운영 기관'}의 일반 사용자로 가입합니다.
        </p>
        <div className="notice n-info">
          개발·시연 환경에는 실제 이름·개인정보를 입력하지 마세요. 가입 후 본인의 신청만 조회할 수
          있으며, 담당자 역할은 기관 관리자가 부여합니다.
        </div>
        {complete ? (
          <div className="notice n-success" role="status">
            <h2 className="h-panel">회원가입이 완료되었습니다.</h2>
            <p>일반 사용자 계정으로 가입했습니다. 로그인 후 새 신청을 시작할 수 있습니다.</p>
            <Link className="btn btn-primary" href="/login">
              로그인하기
            </Link>
          </div>
        ) : (
          <form className="auth-form" onSubmit={onSubmit} aria-busy={signup.isPending}>
            {error && (
              <div className="notice n-danger" role="alert">
                {error}
              </div>
            )}
            <div className="form-field">
              <label htmlFor="signup-username">아이디</label>
              <input
                className="input"
                id="signup-username"
                name="username"
                autoComplete="username"
                minLength={4}
                maxLength={50}
                required
                aria-describedby="username-hint"
              />
              <p id="username-hint" className="help">
                영문 소문자·숫자·마침표·밑줄·하이픈, 4~50자
              </p>
            </div>
            <div className="form-field">
              <label htmlFor="signup-name">표시 이름</label>
              <input
                className="input"
                id="signup-name"
                name="displayName"
                maxLength={100}
                required
                autoComplete="off"
                placeholder="예: 합성 신청자"
              />
            </div>
            <div className="form-field">
              <label htmlFor="signup-department">
                부서 <span className="muted">(선택)</span>
              </label>
              <input
                className="input"
                id="signup-department"
                name="department"
                maxLength={100}
                autoComplete="off"
                placeholder="예: 합성 사업팀"
              />
            </div>
            <div className="form-field">
              <label htmlFor="signup-password">비밀번호</label>
              <div className="password-field">
                <input
                  className="input"
                  id="signup-password"
                  name="password"
                  type={visible ? 'text' : 'password'}
                  minLength={8}
                  maxLength={72}
                  autoComplete="new-password"
                  required
                  aria-describedby="password-hint"
                />
                <button
                  type="button"
                  className="btn btn-tertiary"
                  onClick={() => setVisible(!visible)}
                  aria-pressed={visible}
                >
                  {visible ? '숨기기' : '표시'}
                </button>
              </div>
              <p id="password-hint" className="help">
                영문과 숫자를 포함해 8자 이상, UTF-8 72바이트 이하
              </p>
            </div>
            <div className="form-field">
              <label htmlFor="signup-confirm">비밀번호 확인</label>
              <input
                className="input"
                id="signup-confirm"
                name="passwordConfirm"
                type={visible ? 'text' : 'password'}
                autoComplete="new-password"
                required
                maxLength={72}
              />
            </div>
            <div className="form-actions">
              <Link href="/login" className="btn">
                로그인으로 돌아가기
              </Link>
              <button className="btn btn-primary" type="submit" disabled={signup.isPending}>
                {signup.isPending ? '가입 중…' : '회원가입'}
              </button>
            </div>
          </form>
        )}
      </section>
    </main>
  );
}
