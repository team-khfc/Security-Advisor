'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { requestJson } from '@/lib/httpClient';
import { answerDto } from './apiTypes';

export const interviewTurnDto = z.object({
  interviewTurnId: z.number(),
  businessCaseId: z.number(),
  fieldKey: z.string(),
  mode: z.enum(['ASK', 'SUGGEST']),
  question: z.string(),
  reply: z.string(),
  proposedValue: z.string().nullable(),
  evidence: z.array(z.object({ tag: z.string(), label: z.string() })),
  basedRevision: z.number(),
  answerRevision: z.number().nullable(),
  modelReference: z.string(),
  flagged: z.boolean(),
  applied: z.boolean(),
  createdAt: z.string(),
});
export type InterviewTurn = z.infer<typeof interviewTurnDto>;
const fieldHelpDto = z.object({
  whyAsked: z.string().nullable(),
  snippets: z.array(
    z.object({
      snippetId: z.number(),
      citation: z.string(),
      body: z.string(),
    }),
  ),
});
const base = (caseId: string) =>
  `/api/business-cases/${encodeURIComponent(caseId)}/interview-turns`;

/** 신청자 대화만 조회하며 정식 답변과 분리한다. */
export function useInterviewTurns(caseId: string, actorId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['interview', caseId, actorId],
    enabled,
    queryFn: async ({ signal }) =>
      z.array(interviewTurnDto).parse(await requestJson(base(caseId), { signal })),
  });
}
export function useInterviewAsk(caseId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (body: {
      fieldKey: string;
      mode: 'ASK' | 'SUGGEST';
      text: string;
      draft: string;
      expectedRevision: number;
    }) => interviewTurnDto.parse(await requestJson(base(caseId), { method: 'POST', body })),
    onSuccess: () => client.invalidateQueries({ queryKey: ['interview', caseId] }),
  });
}
export function useInterviewApply(caseId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({
      turnId,
      expectedRevision,
    }: {
      turnId: number;
      expectedRevision: number;
    }) =>
      interviewTurnDto.parse(
        await requestJson(`${base(caseId)}/${turnId}/applications`, {
          method: 'POST',
          body: { expectedRevision },
        }),
      ),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['cases'] }),
        client.invalidateQueries({ queryKey: ['requests'] }),
        client.invalidateQueries({ queryKey: ['interview', caseId] }),
      ]);
    },
  });
}
export function useInterviewStaffCheck(caseId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({
      fieldKey,
      expectedRevision,
    }: {
      fieldKey: string;
      expectedRevision: number;
    }) =>
      answerDto.parse(
        await requestJson(
          `/api/business-cases/${encodeURIComponent(caseId)}/answers/${encodeURIComponent(fieldKey)}/staff-check`,
          { method: 'PUT', body: { expectedRevision } },
        ),
      ),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['cases'] }),
        client.invalidateQueries({ queryKey: ['requests'] }),
      ]);
    },
  });
}
export function useInterviewHelp(
  fieldKey: string,
  publicationId: number | undefined,
  enabled: boolean,
  knowledgePublicationId = 1,
) {
  return useQuery({
    queryKey: ['field-help', publicationId, knowledgePublicationId, fieldKey],
    enabled: enabled && publicationId !== undefined,
    queryFn: async ({ signal }) =>
      fieldHelpDto.parse(
        await requestJson(
          `/api/field-help/${encodeURIComponent(fieldKey)}?publicationId=${publicationId}&knowledgePublicationId=${knowledgePublicationId}`,
          { signal },
        ),
      ),
  });
}
