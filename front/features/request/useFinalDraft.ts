'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { requestJson } from '@/lib/httpClient';

export const finalDraftSchema = z.object({
  finalDraftId: z.number(),
  securityRequestId: z.number(),
  text: z.string(),
  valueSource: z.enum(['AI_INFERRED', 'USER_ANSWER']),
  modelReference: z.string().nullable(),
  confirmedBy: z.string().nullable(),
  confirmedAt: z.string().nullable(),
  confirmed: z.boolean(),
  stale: z.boolean(),
  revision: z.number(),
});
export type FinalDraft = z.infer<typeof finalDraftSchema>;

/** 원본 변경 여부는 서버가 판단하며 아직 작성하지 않은 초안은 빈 상태로 표시한다. */
export function useFinalDraft(requestId: string, enabled = true) {
  return useQuery({
    queryKey: ['final-draft', requestId],
    enabled,
    queryFn: async ({ signal }) => {
      const data = await requestJson<unknown>(
        `/api/security-requests/${encodeURIComponent(requestId)}/final-draft`,
        { signal },
      );
      return data == null ? null : finalDraftSchema.parse(data);
    },
  });
}

/** 생성·수정 확인 후 업무 화면과 초안의 최신 상태를 함께 읽는다. */
export function useFinalDraftCommand(requestId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      action: 'generate' | 'manual' | 'confirm';
      expectedRevision: number;
      text?: string;
      draftId?: number;
    }) => {
      const base = `/api/security-requests/${encodeURIComponent(requestId)}`;
      const path =
        input.action === 'confirm'
          ? `/api/final-drafts/${input.draftId}/confirmation`
          : `${base}/${input.action === 'generate' ? 'final-draft-generations' : 'final-drafts'}`;
      return finalDraftSchema.parse(
        await requestJson<unknown>(path, {
          method: input.action === 'confirm' ? 'PUT' : 'POST',
          body: {
            expectedRevision: input.expectedRevision,
            ...(input.text !== undefined ? { text: input.text } : {}),
          },
        }),
      );
    },
    onSettled: () => client.invalidateQueries(),
  });
}
