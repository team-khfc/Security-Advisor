import { expect, test } from 'vitest';
import { ContractMapper } from '@/mocks/contractMapper';
import { createMockState, MOCK_MEMBERS } from '@/mocks/seed';

test.each([
  ['DRAFT', 'DRAFTING', '작성 중'],
  ['CONSULTING', 'IN_REVIEW', '협의 중'],
  ['SUPPLEMENT_REQUESTED', 'SUPPLEMENT_REQUESTED', '보완 요청'],
  ['FINAL_REVIEW', 'FINAL_REVIEW', '최종 검토 중'],
  ['SUBMITTED', 'SUBMITTED', '제출됨'],
  ['FINALIZED', 'CONFIRMED', '확정'],
  ['CLOSED', 'CLOSED', '종결(반려)'],
  ['WITHDRAWN', 'WITHDRAWN', '철회'],
] as const)('모의 API는 신청 %s의 코드 %s와 한글 표시명 %s를 구분한다', (status, code, label) => {
  const mapper = new ContractMapper(() => MOCK_MEMBERS);
  const request = { ...createMockState().requests[0], status, statusLabel: status };
  expect(mapper.summary(request)).toMatchObject({ status: code, statusLabel: label });
});

test.each([
  ['PENDING', 'WAITING', '검토 대기'],
  ['ALLOCATED', 'ALLOCATED', '할당 완료'],
  ['IN_REVIEW', 'IN_PROGRESS', '검토 중'],
  ['SUPPLEMENT_REQUESTED', 'SUPPLEMENT_REQUESTED', '보완 요청'],
  ['COMPLETE', 'COMPLETED', '협의 완료'],
  ['RECHECK', 'RECHECK', '재검토'],
] as const)('모의 API는 협의 %s의 코드 %s와 한글 표시명 %s를 구분한다', (status, code, label) => {
  const mapper = new ContractMapper(() => MOCK_MEMBERS);
  const request = createMockState().requests[0];
  request.reviews = request.reviews.map((review) => ({ ...review, status, statusLabel: status }));

  expect(mapper.reviews(request)).toHaveLength(2);
  for (const review of mapper.reviews(request)) {
    expect(review).toMatchObject({ status: code, statusLabel: label });
  }
});
