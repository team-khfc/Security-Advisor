import { z } from 'zod';

export const reassignmentReasonSchema = z.enum([
  'UNASSIGNED',
  'ACCOUNT_INACTIVE',
  'ROLE_CHANGED',
  'NOT_REGISTERED',
  'POOL_INACTIVE',
]);
export type ReassignmentReason = z.infer<typeof reassignmentReasonSchema>;
const labels: Record<ReassignmentReason, string> = {
  UNASSIGNED: '담당자 미배정',
  ACCOUNT_INACTIVE: '계정 비활성',
  ROLE_CHANGED: '담당 분야와 현재 역할이 다름',
  NOT_REGISTERED: '분야별 담당자 미등록',
  POOL_INACTIVE: '분야별 담당자 비활성',
};
/** 서버 판정 사유를 목록·상세·담당자 관리에서 같은 업무 용어로 표시한다. */
export function reassignmentLabel(reason: ReassignmentReason) {
  return labels[reason];
}
