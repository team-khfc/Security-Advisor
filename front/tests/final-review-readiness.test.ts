import { expect, test } from 'vitest';
import { createMockState, MOCK_MEMBERS } from '@/mocks/seed';
import { finalReviewReadiness, submissionBlockers } from '@/features/request/readiness';
import { waitingLine } from '@/features/request/turns';

function fixture() {
  const request = structuredClone(
    createMockState().requests.find((item) => item.id === 'demo-request-3')!,
  );
  request.requiredReviewFields = ['INFRA', 'SECURITY'];
  request.finalConfirmations = [];
  request.currentSubmissionId = 'latest';
  const security = MOCK_MEMBERS.find((member) => member.role === 'SECURITY')!;
  const infra = MOCK_MEMBERS.find((member) => member.role === 'INFRA')!;
  request.assignments = [infra, security].map((actor) => ({
    id: actor.id,
    field: actor.role as 'INFRA' | 'SECURITY',
    assigneeId: actor.id,
    assigneeName: actor.displayName,
    active: true,
    reason: null,
    assignedAt: request.updatedAt,
  }));
  return { request, security, infra };
}

test('정보보안은 현재 제출본의 인프라 선행 확인을 기다리고 두 분야 확인 전 확정하지 않는다', () => {
  const { request, security, infra } = fixture();
  expect(finalReviewReadiness(request, infra).confirmReason).toBe('');
  expect(finalReviewReadiness(request, security).confirmReason).toContain('ICT인프라');
  expect(finalReviewReadiness(request, security).finalizeReason).toContain('ICT인프라·정보보안');
  expect(waitingLine(request)).toBe('ICT인프라 최종 확인 대기');
  request.finalConfirmations.push({
    id: '1',
    submissionId: 'latest',
    field: 'INFRA',
    actorName: infra.displayName,
    confirmedAt: request.updatedAt,
  });
  expect(finalReviewReadiness(request, infra).ownConfirmed).toBe(true);
  expect(finalReviewReadiness(request, security).confirmReason).toBe('');
  expect(finalReviewReadiness(request, security).finalizeReason).toContain('정보보안 최종 확인');
  request.finalConfirmations.push({
    id: '2',
    submissionId: 'latest',
    field: 'SECURITY',
    actorName: security.displayName,
    confirmedAt: request.updatedAt,
  });
  expect(finalReviewReadiness(request, security).finalizeReason).toBe('');
});

test('반환 뒤 재제출은 이전 제출본의 확인을 재사용하지 않는다', () => {
  const { request, security } = fixture();
  request.finalConfirmations = ['INFRA', 'SECURITY'].map((field) => ({
    id: field,
    submissionId: 'previous',
    field: field as 'INFRA' | 'SECURITY',
    actorName: '합성 담당자',
    confirmedAt: request.updatedAt,
  }));
  expect(finalReviewReadiness(request, security).pending).toEqual(['INFRA', 'SECURITY']);
  request.status = 'FINALIZED';
  expect(finalReviewReadiness(request, security).finalizeReason).not.toBe('');
});

test.each(['INFRA', 'SECURITY'] as const)(
  '단일 %s 분야 서류는 필요 없는 분야를 기다리지 않는다',
  (field) => {
    const { request, infra, security } = fixture();
    request.requiredReviewFields = [field];
    const actor = field === 'INFRA' ? infra : security;
    expect(finalReviewReadiness(request, actor).confirmReason).toBe('');
    expect(finalReviewReadiness(request, actor).confirmer).toBe(field);
    request.finalConfirmations = [
      {
        id: '1',
        submissionId: 'latest',
        field,
        actorName: actor.displayName,
        confirmedAt: request.updatedAt,
      },
    ];
    expect(finalReviewReadiness(request, actor).finalizeReason).toBe('');
  },
);

test('미배정·비활성 담당자와 제출본 누락은 최종 확인을 시작할 수 없다', () => {
  const { request, infra } = fixture();
  request.assignments.forEach((assignment) => {
    assignment.active = false;
  });
  expect(finalReviewReadiness(request, infra).confirmReason).toContain('배정된 담당자');
  request.currentSubmissionId = null;
  expect(finalReviewReadiness(request, infra).confirmReason).toContain('최신 제출본');
});

test('반환 뒤 미완료 협의를 제출 전에 알리고 완료하면 제출 단계로 안내한다', () => {
  const { request } = fixture();
  request.stage = 3;
  request.status = 'FINAL_REVIEW';
  request.blockers = [];
  request.commonAnswers = [];
  request.answers = [];
  request.supplements = [];
  request.reviews.forEach((review) => {
    review.status = 'RECHECK';
  });
  expect(submissionBlockers(request)).toHaveLength(2);
  expect(waitingLine(request)).toBe('담당자 재검토 대기');
  request.reviews.forEach((review) => {
    review.status = 'COMPLETE';
  });
  expect(submissionBlockers(request)).toEqual([]);
  expect(waitingLine(request)).toBe('신청자 최종 제출 대기');
});

test('목록의 협의 정보 누락을 재검토 상태로 단정하지 않는다', () => {
  const { request } = fixture();
  request.status = 'FINAL_REVIEW';
  request.requiredReviewFields = undefined;
  request.reviews = [];
  expect(waitingLine(request)).toBe('신청자 최종 제출 대기');
});

test('확인된 답변도 반환 표시가 남으면 재확인하고 미해결 보완은 제출을 막는다', () => {
  const { request } = fixture();
  request.blockers = [];
  request.commonAnswers = [];
  request.reviews.forEach((review) => {
    review.status = 'COMPLETE';
  });
  const answer = request.answers[0];
  request.answers = [
    {
      ...answer,
      value: '합성 보완 답변',
      source: 'USER_ANSWER',
      confirmed: true,
      needsReview: true,
    },
  ];
  request.supplements = [
    {
      id: '1',
      field: 'SECURITY',
      fieldKeys: [answer.key],
      reason: '합성 보완 요청',
      answer: '응답함',
      status: 'ANSWERED',
      requestedBy: 'security',
      createdAt: request.updatedAt,
      resolvedAt: null,
    },
  ];
  expect(submissionBlockers(request)).toEqual([
    `${answer.label}: 답변을 확인해 주세요.`,
    '담당자의 보완 요청이 아직 해결되지 않았습니다.',
  ]);
  request.answers[0].needsReview = false;
  request.supplements[0].status = 'RESOLVED';
  expect(submissionBlockers(request)).toEqual([]);
});
