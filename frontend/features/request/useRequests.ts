import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/features/auth';
import { requestSchema, analysisSchema, type SecurityRequest } from './types';
import { requestJson } from '@/lib/http';

/** 기관과 사용자별 캐시 키로 서버가 허용한 목록만 조회한다. */
export function useRequests(enabled = true) {
  const { user } = useSession();
  return useQuery({
    queryKey: ['requests', user.institutionId, user.userId],
    queryFn: ({ signal }) => requestJson('/security-requests', z.array(requestSchema), { signal }),
    enabled,
  });
}
/** 세부 신청의 권한과 데이터 범위는 서버 판단에 맡기고 사용자별 캐시를 분리한다. */
export function useRequest(id: string) {
  const { user } = useSession();
  return useQuery({
    queryKey: ['request', user.institutionId, user.userId, id],
    queryFn: ({ signal }) =>
      requestJson(`/security-requests/${encodeURIComponent(id)}`, requestSchema, { signal }),
  });
}
/** 서버가 반환한 수정본만 캐시에 반영하며 실패한 변경을 낙관적으로 확정하지 않는다. */
export function useRequestMutation(id: string) {
  const { user } = useSession();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      endpoint,
      body,
      method = 'POST',
      idempotencyKey,
    }: {
      endpoint: string;
      body: unknown;
      method?: string;
      idempotencyKey?: string;
    }) =>
      requestJson(`/security-requests/${encodeURIComponent(id)}${endpoint}`, requestSchema, {
        method,
        body: JSON.stringify(body),
        ...(idempotencyKey ? { headers: { 'Idempotency-Key': idempotencyKey } } : {}),
      }),
    onSuccess: (procedure: SecurityRequest) => {
      client.setQueryData(['request', user.institutionId, user.userId, id], procedure);
      void client.invalidateQueries({ queryKey: ['requests'] });
    },
  });
}
/** 분석 실행과 이력 조회를 분리하여 화면을 여는 것만으로 파일이나 내용을 전송하지 않는다. */
export function useAnalyses(id: string) {
  const { user } = useSession();
  return useQuery({
    queryKey: ['analyses', user.institutionId, user.userId, id],
    queryFn: ({ signal }) =>
      requestJson(
        `/security-requests/${encodeURIComponent(id)}/analysis`,
        z.array(analysisSchema),
        {
          signal,
        },
      ),
  });
}
