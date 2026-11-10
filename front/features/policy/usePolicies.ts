'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { requestJson } from '@/lib/httpClient';
import { firewallRuleSchema, type FirewallRule, type PolicyAction } from './types';

/** 확정 규칙 목록은 서버가 신청자의 소유 범위로 제한한다. */
export function usePolicies(enabled: boolean) {
  return useQuery({
    queryKey: ['firewall-rules'],
    enabled,
    queryFn: async ({ signal }) =>
      z.array(firewallRuleSchema).parse(await requestJson('/api/firewall-rules', { signal })),
  });
}

/** 연장 중인 신청을 이어서 열며, 종료된 신청인 경우에만 다시 신청할 수 있다. */
export function useRenewalRequest(id: number | null) {
  return useQuery({
    queryKey: ['policy-renewal', id],
    enabled: id !== null,
    queryFn: async ({ signal }) =>
      z
        .object({ status: z.string() })
        .parse(await requestJson(`/api/security-requests/${id}`, { signal })),
  });
}

/** 기존 규칙 수정과 새 신청 생성을 구분하며, 성공 후 최신 revision을 다시 조회한다. */
export function usePolicyMutation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({
      rule,
      action,
      text,
      start,
      end,
    }: {
      rule: FirewallRule;
      action: PolicyAction;
      text: string;
      start: string;
      end: string;
    }) => {
      const path = `/api/firewall-rules/${rule.firewallRuleId}`;
      if (action === 'RENEW') {
        const result = await requestJson(`${path}/renewal-requests`, {
          method: 'POST',
          body: { newPeriod: `${start}~${end}`, note: text.trim() || undefined },
        });
        return z
          .object({ request: z.object({ securityRequestId: z.number().int() }) })
          .parse(result).request.securityRequestId;
      }
      await requestJson(`${path}/${action === 'REVOKED' ? 'revocation' : 'application'}`, {
        method: 'PUT',
        body:
          action === 'REVOKED'
            ? { reason: text.trim(), expectedRevision: rule.revision }
            : {
                result: action,
                expectedRevision: rule.revision,
                ...(action === 'APPLIED' ? { note: text.trim() } : { reason: text.trim() }),
              },
      });
      return null;
    },
    onSuccess: async () => {
      await client.invalidateQueries();
    },
    retry: false,
  });
}
