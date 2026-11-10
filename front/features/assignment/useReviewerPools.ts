'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { requestJson } from '@/lib/httpClient';
import { reassignmentReasonSchema } from '@/lib/assignmentStatus';

const reviewerPoolSchema = z.object({
  reviewerPoolId: z.number().int(),
  field: z.enum(['INFRA', 'SECURITY']),
  memberUsername: z.string(),
  defaultReviewer: z.boolean(),
  active: z.boolean(),
  eligible: z.boolean(),
  unavailableReason: reassignmentReasonSchema.nullable(),
});
export type ReviewerPoolEntry = z.infer<typeof reviewerPoolSchema>;

/** 관리자만 분야별 등록 상태와 현재 계정의 배정 적격 여부를 조회한다. */
export function useReviewerPools(enabled = true) {
  return useQuery({
    queryKey: ['reviewer-pools'],
    enabled,
    queryFn: async ({ signal }) =>
      z.array(reviewerPoolSchema).parse(await requestJson('/api/reviewer-pools', { signal })),
    retry: false,
  });
}

type PoolCommand =
  | {
      kind: 'register';
      field: 'INFRA' | 'SECURITY';
      memberUsername: string;
      defaultReviewer: boolean;
    }
  | { kind: 'default'; id: number }
  | { kind: 'activation'; id: number; active: boolean; reason: string };

/** 담당자 등록·기본 지정·비활성은 서버가 검증하며 배정 이력은 유지한다. */
export function useManageReviewerPool() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (command: PoolCommand) => {
      if (command.kind === 'register') {
        const { field, memberUsername, defaultReviewer } = command;
        return requestJson('/api/reviewer-pools', {
          method: 'POST',
          body: { field, memberUsername, defaultReviewer },
        });
      }
      return requestJson(`/api/reviewer-pools/${command.id}/${command.kind}`, {
        method: 'PUT',
        ...(command.kind === 'activation'
          ? { body: { active: command.active, reason: command.reason } }
          : {}),
      });
    },
    onSuccess: async () => {
      await Promise.all(
        ['reviewer-pools', 'requests', 'request', 'audit', 'handoff-count'].map((key) =>
          client.invalidateQueries({ queryKey: [key] }),
        ),
      );
    },
  });
}

/** 알림 수가 아닌 서버의 진행 중 업무 판정으로 재배정 대상 건수를 표시한다. */
export function useHandoffCount() {
  return useQuery({
    queryKey: ['handoff-count'],
    queryFn: async ({ signal }) =>
      z
        .object({ unassignedRequests: z.number() })
        .parse(await requestJson('/api/todo-summary', { signal })).unassignedRequests,
    retry: false,
  });
}
