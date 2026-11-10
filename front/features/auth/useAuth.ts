'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { ApiError, requestJson } from '@/lib/httpClient';
import type { Actor, PageResponse, Role, Session } from '@/lib/types';
import { sessionSchema, type LoginInput, type SignupInput } from './types';

const liveMemberSchema = z.object({
  username: z.string(),
  displayName: z.string(),
  role: z.enum(['APPLICANT', 'INFRA', 'SECURITY', 'ADMIN']),
  department: z.string().nullable(),
  email: z.string().nullable(),
  expiresAt: z.string().nullable(),
  mock: z.boolean().optional(),
});

function readSession(value: unknown): Session {
  const mock = sessionSchema.safeParse(value);
  if (mock.success) return mock.data;
  const member = liveMemberSchema.parse(value);
  return {
    member: {
      ...member,
      id: member.username,
      department: member.department ?? '',
      active: true,
    },
    expiresAt: member.expiresAt,
    mock: member.mock ?? false,
  };
}

/** 인증 없음은 빈 세션으로, 통신 실패는 오류로 구분한다. */
export function useSession() {
  return useQuery({
    queryKey: ['session'],
    queryFn: async ({ signal }) => {
      try {
        return readSession(await requestJson<unknown>('/api/auth/me', { signal }));
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: false,
  });
}

/** 계정 변경 전에 이전 사용자의 업무 캐시를 없앤다. */
export function useLogin() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: LoginInput) =>
      readSession(await requestJson<unknown>('/api/auth/login', { method: 'POST', body: input })),
    onSuccess: async (session) => {
      await client.cancelQueries();
      client.clear();
      client.setQueryData(['session'], session);
    },
  });
}

/** 이 경로는 명시적 모의 모드에서만 존재하며 운영 인증으로 사용하지 않는다. */
export function useDemoLogin() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (username: string) =>
      readSession(
        await requestJson<unknown>('/api/demo-sessions', { method: 'POST', body: { username } }),
      ),
    onSuccess: async (session) => {
      await client.cancelQueries();
      client.clear();
      client.setQueryData(['session'], session);
    },
  });
}

/** 로그아웃 성공 뒤 세션과 화면 캐시를 함께 제거한다. */
export function useLogout() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => requestJson<void>('/api/auth/logout', { method: 'POST' }),
    onSuccess: async () => {
      await client.cancelQueries();
      client.clear();
      client.setQueryData(['session'], null);
    },
  });
}

/** 가입 입력에서 기관·역할을 제외하고 서버가 신청자 역할을 부여한다. */
export function useSignup() {
  return useMutation({
    mutationFn: (input: SignupInput) =>
      requestJson<unknown>('/api/members', { method: 'POST', body: input }),
  });
}

/** 세션 연장은 서버 응답이 성공한 경우에만 화면에 반영한다. */
export function useExtendSession() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      z
        .object({ expiresAt: z.string() })
        .parse(await requestJson<unknown>('/api/sessions/current/renewals', { method: 'POST' })),
    onSuccess: (renewal) =>
      client.setQueryData<Session | null>(['session'], (session) =>
        session ? { ...session, expiresAt: renewal.expiresAt } : session,
      ),
  });
}

/** 계정 관리에 필요한 표시용 회원 정보만 읽는다. */
export function useMembers() {
  return useQuery({
    queryKey: ['members'],
    queryFn: async ({ signal }) => {
      const page = await requestJson<PageResponse<unknown>>('/api/members?size=100', { signal });
      return z
        .array(liveMemberSchema.omit({ expiresAt: true }).extend({ active: z.boolean() }))
        .parse(Array.isArray(page) ? page : page.content)
        .map((member) => ({ ...member, id: member.username, department: member.department ?? '' }));
    },
    retry: false,
  });
}

/** 역할 변경은 관리자 API에 사유와 함께 요청한다. */
export function useUpdateMember() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      role,
      active,
      reason,
      previousRole,
    }: {
      id: string;
      role: Role;
      previousRole?: Role;
      active: boolean;
      reason: string;
    }) =>
      requestJson<Actor>(
        `/api/members/${encodeURIComponent(id)}/${previousRole === role ? 'activation' : 'role-assignments'}`,
        {
          method: previousRole === role ? 'PUT' : 'POST',
          body: previousRole === role ? { active, reason } : { role, active, reason },
        },
      ),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['members'] }),
        client.invalidateQueries({ queryKey: ['audit'] }),
        client.invalidateQueries({ queryKey: ['requests'] }),
        client.invalidateQueries({ queryKey: ['request'] }),
        client.invalidateQueries({ queryKey: ['reviewer-pools'] }),
        client.invalidateQueries({ queryKey: ['handoff-count'] }),
      ]);
    },
  });
}
