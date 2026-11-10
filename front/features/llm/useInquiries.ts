'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { requestJson } from '@/lib/httpClient';
import type { Actor } from '@/lib/types';
import { inquirySchema, inquiryMessageSchema, inquiryTurnSchema, type Inquiry } from './types';

/** 계정·역할·신청을 모두 키에 포함해 다른 담당자의 대화가 재사용되지 않게 한다. */
export function useInquiries(
  requestId: string,
  actor: Actor,
  selection: number | null | undefined,
) {
  const client = useQueryClient();
  const key = ['staff-inquiries', actor.id, actor.username, actor.role, requestId];
  const messagesKey = (id: number | null) => [...key, 'messages', id];
  function owned(inquiry: Inquiry) {
    if (
      String(inquiry.securityRequestId) !== requestId ||
      inquiry.staffUsername !== actor.username ||
      inquiry.field !== actor.role
    )
      throw new Error('현재 계정의 대화인지 확인하지 못했습니다. 다시 조회해 주세요.');
    return inquiry;
  }
  const list = useQuery({
    queryKey: key,
    queryFn: async ({ signal }) =>
      z
        .array(inquirySchema)
        .parse(await requestJson('/api/security-requests/' + requestId + '/inquiries', { signal }))
        .map(owned),
    retry: false,
  });
  const selected = selection === undefined ? (list.data?.[0]?.inquiryId ?? null) : selection;
  const messages = useQuery({
    queryKey: messagesKey(selected),
    enabled: selected !== null && list.isSuccess && list.data.some((i) => i.inquiryId === selected),
    queryFn: async ({ signal }) => {
      const data = z
        .array(inquiryMessageSchema)
        .parse(await requestJson('/api/inquiries/' + selected + '/messages', { signal }));
      if (data.some((message) => message.inquiryId !== selected))
        throw new Error('선택한 대화의 기록인지 확인하지 못했습니다.');
      return data;
    },
    retry: false,
  });
  const open = useMutation({
    mutationFn: async (title: string) =>
      owned(
        inquirySchema.parse(
          await requestJson('/api/security-requests/' + requestId + '/inquiries', {
            method: 'POST',
            body: { title },
          }),
        ),
      ),
    onSuccess: (inquiry) => {
      client.setQueryData<Inquiry[]>(key, (old) => [
        inquiry,
        ...(old ?? []).filter((i) => i.inquiryId !== inquiry.inquiryId),
      ]);
      client.setQueryData(messagesKey(inquiry.inquiryId), []);
    },
    retry: false,
  });
  const ask = useMutation({
    mutationFn: async ({ id, text }: { id: number; text: string }) => {
      const turn = inquiryTurnSchema.parse(
        await requestJson('/api/inquiries/' + id + '/messages', { method: 'POST', body: { text } }),
      );
      if (
        turn.question.inquiryId !== id ||
        turn.answer.inquiryId !== id ||
        turn.question.role !== 'USER' ||
        turn.answer.role !== 'ASSISTANT'
      )
        throw new Error('답변을 확인하지 못했습니다. 대화 기록을 새로 조회해 주세요.');
      return turn;
    },
    onSuccess: async (_, { id }) => {
      await client.invalidateQueries({ queryKey: messagesKey(id) });
      await client.invalidateQueries({ queryKey: ['audit'] });
    },
    retry: false,
  });
  return { list, messages, open, ask, selected };
}
