'use client';

import {
  Fragment,
  createContext,
  useContext,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { z } from 'zod';
import { sessionSchema, type Session } from './types';
import { ROLE_LABELS } from '@/lib/sharedTypes';
import { ApiError, requestJson, invalidateIdentity, resetCsrf } from '@/lib/http';
import { activateDraftScope, clearDrafts, readDraft, writeDraft, removeDraft } from '@/lib/draft';
import { ErrorNotice, Loading, Modal, Icon, Notice } from '@/components/ui';

const AuthContext = createContext<Session | null>(null);
/** 서버 세션만 역할·기관 표시의 근거로 사용한다. 인증 경계 밖에서 호출하면 Error를 던진다.
 * @throws Error 인증된 업무 경계가 없을 때 */
export function useSession(): Session {
  const session = useContext(AuthContext);
  if (!session) throw new Error('인증된 업무 화면에서만 사용할 수 있습니다.');
  return session;
}
/** 편집 내용을 탭 메모리에만 보관하며 신청·기관·사용자 변경 시 다른 초안과 섞지 않는다. */
export function useMemoryDraft<T>(
  key: string,
  initial: T,
): [T, Dispatch<SetStateAction<T>>, () => void] {
  const { user } = useSession();
  const scope = `${user.institutionId}:${user.userId}`;
  const storageKey = `${scope}:${key}`;
  const [entry, setEntry] = useState(() => ({ storageKey, value: readDraft(scope, key, initial) }));
  const currentValue =
    entry.storageKey === storageKey ? entry.value : readDraft(scope, key, initial);
  if (entry.storageKey !== storageKey) setEntry({ storageKey, value: currentValue });
  useEffect(() => {
    if (entry.storageKey === storageKey) writeDraft(scope, key, entry.value);
  }, [entry, scope, key, storageKey]);
  const setValue = useCallback<Dispatch<SetStateAction<T>>>(
    (update) => {
      setEntry((current) => {
        if (current.storageKey !== storageKey) return current;
        const value =
          typeof update === 'function' ? (update as (previous: T) => T)(current.value) : update;
        return { storageKey, value };
      });
    },
    [storageKey],
  );
  const clear = useCallback(() => removeDraft(scope, key), [scope, key]);
  return [currentValue, setValue, clear];
}

/** 역할 선택으로 인증을 대체하지 않고 실제 로그인 응답이 성공한 뒤에만 업무 화면을 연다. */
export function LoginForm({
  onSuccess,
  expired = false,
}: {
  onSuccess?: (session: Session) => void;
  expired?: boolean;
}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>();
  const [pending, setPending] = useState(false);
  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    try {
      resetCsrf();
      const session = await requestJson('/auth/login', sessionSchema, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ username, password }),
      });
      setPassword('');
      invalidateIdentity();
      await queryClient.cancelQueries();
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'session' });
      activateDraftScope(`${session.user.institutionId}:${session.user.userId}`);
      queryClient.setQueryData(['session'], session);
      if (onSuccess) onSuccess(session);
      else router.replace('/requests');
    } catch (failure) {
      setError(failure);
      setPassword('');
    } finally {
      setPending(false);
    }
  }
  return (
    <form onSubmit={login} className="login-form">
      <div className="login-mark">
        <Icon name="shield" width={32} height={32} />
      </div>
      <h1>{expired ? '로그인을 다시 확인해 주세요' : 'SecurityAdvisor 로그인'}</h1>
      <p>기관에서 발급한 계정으로 업무 공간에 접속합니다.</p>
      <ErrorNotice error={error} />
      <div className="sf-field">
        <label htmlFor="username">
          아이디 <span className="required">필수</span>
        </label>
        <input
          id="username"
          autoComplete="username"
          required
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          maxLength={120}
          disabled={pending}
        />
      </div>
      <div className="sf-field">
        <label htmlFor="password">
          비밀번호 <span className="required">필수</span>
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          maxLength={200}
          disabled={pending}
        />
      </div>
      <button className="button primary full" type="submit" disabled={pending}>
        {pending ? '로그인 확인 중…' : '로그인'}
        <Icon name="arrow" />
      </button>
      <p className="login-hint">역할과 기관은 인증된 서버 계정에 따라 결정됩니다.</p>
      {!expired && (
        <Link className="text-button" href="/design-preview/workspace">
          로그인 없이 읽기전용 디자인 시안 보기
          <Icon name="arrow" />
        </Link>
      )}
    </form>
  );
}

/** 세션 만료는 재인증으로 처리하되 같은 계정의 미저장 입력을 복구할 수 있게 경계를 유지한다. */
export function AuthBoundary({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const sessionQuery = useQuery({
    queryKey: ['session'],
    queryFn: ({ signal }) => requestJson('/auth/session', sessionSchema, { signal }),
    retry: false,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
  const [expired, setExpired] = useState(false);
  const [authenticationVersion, setAuthenticationVersion] = useState(0);
  const [seconds, setSeconds] = useState(Infinity);
  const [extending, setExtending] = useState(false);
  const [extendError, setExtendError] = useState<unknown>();
  const session = sessionQuery.data;
  useEffect(() => {
    if (!session) return;
    activateDraftScope(`${session.user.institutionId}:${session.user.userId}`);
    const tick = () => {
      const remaining = Math.max(
        0,
        Math.floor((new Date(session.expiresAt).getTime() - Date.now()) / 1000),
      );
      setSeconds(remaining);
      if (remaining === 0) setExpired(true);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [session]);
  useEffect(() => {
    const handle = () => {
      setExpired(true);
      queryClient.cancelQueries({ predicate: (query) => query.queryKey[0] !== 'session' });
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'session' });
    };
    window.addEventListener('securityadvisor:session-expired', handle);
    return () => window.removeEventListener('securityadvisor:session-expired', handle);
  }, [queryClient]);
  async function extend() {
    setExtending(true);
    setExtendError(undefined);
    try {
      const next = await requestJson('/auth/extend', sessionSchema, { method: 'POST' });
      queryClient.setQueryData(['session'], next);
      setExpired(false);
    } catch (failure) {
      setExtendError(failure);
      if (failure instanceof ApiError && failure.status === 401) setExpired(true);
    } finally {
      setExtending(false);
    }
  }
  if (sessionQuery.isPending)
    return (
      <div className="login-page">
        <Loading label="로그인 정보를 확인하고 있습니다." />
      </div>
    );
  if (!session)
    return (
      <div className="login-page">
        {sessionQuery.error instanceof ApiError && sessionQuery.error.status !== 401 && (
          <ErrorNotice error={sessionQuery.error} retry={() => void sessionQuery.refetch()} />
        )}
        <LoginForm
          onSuccess={() => {
            setExpired(false);
            void sessionQuery.refetch();
          }}
        />
      </div>
    );
  return (
    <AuthContext value={session}>
      <Fragment
        key={`${session.user.institutionId}:${session.user.userId}:${authenticationVersion}`}
      >
        {children}
      </Fragment>
      <Modal
        open={expired || seconds <= 60}
        title={expired ? '로그인 시간이 만료되었습니다' : '로그인 시간 연장'}
        onClose={() => undefined}
        locked
      >
        {expired ? (
          <>
            <Notice>
              편집하던 입력은 이 탭의 메모리에 보관됩니다. 같은 계정으로 다시 로그인하면 이어서
              작성할 수 있습니다.
            </Notice>
            <LoginForm
              expired
              onSuccess={(next) => {
                setAuthenticationVersion((value) => value + 1);
                setExpired(false);
                setSeconds(Math.floor((new Date(next.expiresAt).getTime() - Date.now()) / 1000));
              }}
            />
          </>
        ) : (
          <>
            <p>
              자동 로그아웃까지 <strong>{seconds}초</strong> 남았습니다. 계속 작업하려면 로그인
              시간을 연장해 주세요.
            </p>
            <ErrorNotice error={extendError} />
            <div className="dialog-actions">
              <button
                className="button primary"
                type="button"
                onClick={() => void extend()}
                disabled={extending}
              >
                {extending ? '연장 확인 중…' : '로그인 시간 연장'}
              </button>
            </div>
          </>
        )}
      </Modal>
    </AuthContext>
  );
}

/** 서버 로그아웃이 확인된 이후에만 계정별 캐시와 휘발성 초안을 폐기한다. */
export function AccountControl() {
  const session = useSession();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [error, setError] = useState<unknown>();
  const [pending, setPending] = useState(false);
  async function logout() {
    setPending(true);
    setError(undefined);
    try {
      await requestJson('/auth/logout', z.undefined(), { method: 'POST' });
      invalidateIdentity();
      clearDrafts();
      queryClient.clear();
      router.replace('/login');
    } catch (failure) {
      setError(failure);
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <span className="role-picker">{ROLE_LABELS[session.user.role]}</span>
      <span className="user-avatar" aria-hidden="true">
        {session.user.displayName.slice(0, 1)}
      </span>
      <span className="account-name">{session.user.displayName}</span>
      <button
        className="text-button"
        type="button"
        onClick={() => void logout()}
        disabled={pending}
      >
        로그아웃
      </button>
      {error && (
        <Modal open title="로그아웃 확인" onClose={() => setError(undefined)}>
          <ErrorNotice error={error} />
        </Modal>
      )}
    </>
  );
}
