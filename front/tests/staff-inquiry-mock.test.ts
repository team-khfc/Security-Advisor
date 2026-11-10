// @vitest-environment node
import { expect, test } from 'vitest';
import { MockInquiries } from '@/mocks/inquiries';
import { ContractMapper } from '@/mocks/contractMapper';
import { createMockState, MOCK_MEMBERS } from '@/mocks/seed';
import { inquirySchema, inquiryTurnSchema } from '@/features/llm/types';

test('모의 API도 본인 배정·대화 소유권을 검사하고 업무 상태를 유지한다', async () => {
  const state = createMockState();
  const infra = MOCK_MEMBERS.find((m) => m.role === 'INFRA')!;
  const security = MOCK_MEMBERS.find((m) => m.role === 'SECURITY')!;
  const applicant = MOCK_MEMBERS.find((m) => m.role === 'APPLICANT')!;
  const wire = new ContractMapper(() => MOCK_MEMBERS);
  const request = state.requests.find((r) =>
    r.assignments.some((a) => a.active && a.field === 'INFRA' && a.assigneeId === infra.id),
  )!;
  expect(request).toBeTruthy();
  const id = wire.id(request.id);
  const before = structuredClone(state);
  const api = new MockInquiries();
  const base = new URL('https://example.test/api/security-requests/' + id + '/inquiries');
  expect(() => api.handle(state, wire, applicant, base, 'POST', {}, 0)).toThrow(/배정된 담당자/);
  const conversation = inquirySchema.parse(
    await api.handle(state, wire, infra, base, 'POST', { title: '합성 질문' }, 0).json(),
  );
  const messages = new URL(
    'https://example.test/api/inquiries/' + conversation.inquiryId + '/messages',
  );
  const turn = inquiryTurnSchema.parse(
    await api.handle(state, wire, infra, messages, 'POST', { text: '합성 자료 검토' }, 0).json(),
  );
  expect(turn.answer.text).toContain('실제 모델을 호출하지 않았습니다');
  expect(await api.handle(state, wire, infra, messages, 'GET', undefined, 0).json()).toEqual([
    turn.question,
    turn.answer,
  ]);
  expect(() => api.handle(state, wire, security, messages, 'GET', undefined, 0)).toThrow(
    /찾을 수 없습니다/,
  );
  expect(state).toEqual(before);
  request.assignments.forEach((a) => {
    a.active = false;
  });
  expect(() => api.handle(state, wire, infra, messages, 'GET', undefined, 0)).toThrow(
    /배정된 담당자/,
  );
  expect(() => api.handle(state, wire, infra, base, 'GET', undefined, 0)).toThrow(/배정된 담당자/);
});
