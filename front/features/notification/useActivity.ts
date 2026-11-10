'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { useSession } from '@/features/auth';
import { requestJson } from '@/lib/httpClient';

const link = z.string().regex(/^\/requests\/\d+$/);
export const notificationSchema = z.object({
  notificationId: z.number().int(),
  kind: z.string(),
  title: z.string(),
  link,
  readAt: z.string().nullable(),
  createdAt: z.string(),
});
const todoSchema = z.object({
  key: z.string(),
  kind: z.string(),
  securityRequestId: z.number(),
  context: z
    .object({
      caseTitle: z.string(),
      department: z.string(),
      docType: z.string(),
      statusLabel: z.string(),
      stage: z.number(),
      updatedAt: z.string().nullable(),
    })
    .nullish(),
  title: z.string(),
  link,
});
const pageSchema = <T extends z.ZodType>(item: T) =>
  z.object({
    content: z.array(item),
    page: z.number(),
    size: z.number(),
    totalElements: z.number(),
  });
export type TodoEntry = z.infer<typeof todoSchema>;
export type NotificationEntry = z.infer<typeof notificationSchema>;

/** 계정·역할별 캐시를 사용하고 창으로 돌아올 때 현재 수신 권한을 다시 확인한다. */
export function useActivity(
  kind: 'notifications' | 'todos',
  page: number,
  size = 20,
  unreadOnly = false,
  enabled = true,
) {
  const session = useSession();
  const member = session.data?.member;
  return useQuery({
    queryKey: ['activity', member?.id, member?.role, kind, page, size, unreadOnly],
    enabled: Boolean(member) && enabled,
    queryFn: async ({ signal }) => {
      const raw = await requestJson(
        `/api/${kind}?page=${page}&size=${size}&unreadOnly=${unreadOnly}`,
        { signal },
      );
      return kind === 'notifications'
        ? pageSchema(notificationSchema).parse(raw)
        : pageSchema(todoSchema).parse(raw);
    },
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
}

/** 안 읽은 알림과 실제 처리할 일을 서로 다른 서버 집계로 표시한다. */
export function useActivityCount(kind: 'unread' | 'todo') {
  const session = useSession();
  const member = session.data?.member;
  return useQuery({
    queryKey: ['activity', member?.id, member?.role, kind],
    enabled: Boolean(member),
    queryFn: async ({ signal }) => {
      const raw = await requestJson(
        kind === 'unread' ? '/api/notifications/unread-count' : '/api/todo-summary',
        { signal },
      );
      return kind === 'unread'
        ? z.object({ unread: z.number() }).parse(raw).unread
        : z.object({ total: z.number() }).parse(raw).total;
    },
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
}

/** 읽음 표시는 멱등이며 다른 계정·현재 접근 불가 알림은 서버가 거절한다. */
export function useReadNotification() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) =>
      notificationSchema.parse(
        await requestJson(`/api/notifications/${id}`, { method: 'PATCH', body: { read: true } }),
      ),
    onSettled: async () => {
      await client.invalidateQueries({ queryKey: ['activity'] });
    },
  });
}
