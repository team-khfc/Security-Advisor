import { z } from 'zod';

export const ruleStatusLabels = {
  PENDING_APPLY: '적용 대기',
  APPLIED: '적용 완료',
  NOT_APPLICABLE: '적용 불가',
  REVOKED: '회수',
  EXPIRING: '만료 예정',
  EXPIRED: '만료',
} as const;

export const firewallRuleSchema = z.object({
  firewallRuleId: z.number().int(),
  securityRequestId: z.number().int(),
  submissionId: z.number().int(),
  ruleNo: z.number().int(),
  source: z.string(),
  destination: z.string(),
  protocol: z.string(),
  port: z.string(),
  startDate: z.string(),
  endDate: z.string().nullable(),
  reviewDate: z.string().nullable(),
  status: z.enum(['PENDING_APPLY', 'APPLIED', 'NOT_APPLICABLE', 'REVOKED']),
  effectiveStatus: z.enum([
    'PENDING_APPLY',
    'APPLIED',
    'NOT_APPLICABLE',
    'REVOKED',
    'EXPIRING',
    'EXPIRED',
  ]),
  appliedBy: z.string().nullable(),
  appliedAt: z.string().nullable(),
  applicationNote: z.string().nullable(),
  reason: z.string().nullable(),
  renewalRequestId: z.number().int().nullable(),
  revision: z.number().int().nonnegative(),
});

export type FirewallRule = z.infer<typeof firewallRuleSchema>;
export type PolicyAction = 'APPLIED' | 'NOT_APPLICABLE' | 'REVOKED' | 'RENEW';
export const policyActionLabels: Record<PolicyAction, string> = {
  APPLIED: '적용 완료 기록',
  NOT_APPLICABLE: '적용 불가 기록',
  REVOKED: '회수 기록',
  RENEW: '연장 신청',
};

/** 장비 동작이 아닌 업무 기록의 상태·역할별 후보를 표시한다. 서버가 최종 판단한다. */
export function canRecord(rule: FirewallRule, action: PolicyAction, role?: string) {
  if (action === 'RENEW') return role === 'APPLICANT' && rule.status === 'APPLIED';
  return role === 'INFRA' && rule.status === (action === 'REVOKED' ? 'APPLIED' : 'PENDING_APPLY');
}
