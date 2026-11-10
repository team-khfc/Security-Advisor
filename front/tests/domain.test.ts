import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { DomainError } from '@/lib/problem';
import type { Actor, Role } from '@/lib/types';
import {
  applyAnalysis,
  calculateDueAt,
  createCase,
  deadlineTiming,
  executeCommand,
  requestForActor,
  saveCaseAnswers,
  submissionBlockers,
} from '@/features/request/domain';
import {
  businessCaseSchema,
  securityRequestSchema,
  type Answer,
  type CommandInput,
  type MockState,
  type SecurityRequest,
} from '@/features/request/types';
import { createMockState, MOCK_MEMBERS } from '@/mocks/seed';

function actor(role: Role): Actor {
  const result = MOCK_MEMBERS.find((member) => member.role === role);
  if (!result) throw new Error('테스트 계정 누락');
  return result;
}

function request(state: MockState, id = 'demo-request-1'): SecurityRequest {
  const result = state.requests.find((item) => item.id === id);
  if (!result) throw new Error('테스트 신청 누락');
  return result;
}

function run(
  state: MockState,
  role: Role,
  id: string,
  input: Omit<CommandInput, 'expectedRevision'>,
): MockState {
  return executeCommand(state, actor(role), id, {
    ...input,
    expectedRevision: request(state, id).revision,
  });
}

function inputFor(answer: Answer, value = answer.value) {
  return { key: answer.key, value, confirmed: true, notApplicable: false };
}

function confirmReadyDraft(state = createMockState()): MockState {
  return run(state, 'APPLICANT', 'demo-request-2', {
    action: 'SAVE_ANSWERS',
    answers: [inputFor(request(state, 'demo-request-2').answers[0])],
  });
}

function allocate(state = createMockState()): MockState {
  const example = state.cases.find((item) => item.id === 'demo-case-2');
  const target = state.cases.find((item) => item.id === 'demo-case-1');
  if (!example || !target) throw new Error('테스트 사업 누락');
  const next = saveCaseAnswers(
    state,
    actor('INFRA'),
    target.id,
    target.revision,
    example.answers
      .filter((answer) => answer.ownerRole === 'INFRA')
      .map((answer) => inputFor(answer)),
  );
  return run(next, 'INFRA', 'demo-request-1', {
    action: 'COMPLETE_REVIEW',
    comment: '합성 인프라 협의 완료',
  });
}

function expectProblem(operation: () => unknown, status: number, code?: string) {
  try {
    operation();
    throw new Error('예상한 도메인 예외가 발생하지 않았습니다.');
  } catch (error) {
    expect(error).toBeInstanceOf(DomainError);
    expect(error).toMatchObject({ status, ...(code ? { code } : {}) });
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-07T10:00:00+09:00'));
});

afterEach(() => vi.useRealTimers());

describe('모의 도메인의 문서·데이터 불변식', () => {
  test('합성 초기 자료는 타입 계약을 충족하고 기관·사업 상태를 중복 저장하지 않는다', () => {
    const state = createMockState();
    state.cases.forEach((item) => {
      expect(businessCaseSchema.safeParse(item).success).toBe(true);
      expect(item).not.toHaveProperty('institutionId');
      expect(item).not.toHaveProperty('status');
    });
    state.requests.forEach((item) =>
      expect(securityRequestSchema.safeParse(item).success).toBe(true),
    );
    expect(state.requests.filter((item) => item.caseId === 'demo-case-1')).toHaveLength(2);
    expect(MOCK_MEMBERS.filter((item) => item.role === 'APPLICANT')).toHaveLength(2);
  });

  test('사업 생성은 서류별 신청을 만들며 중복 유형·빈 유형을 거부한다', () => {
    const state = createMockState();
    const original = structuredClone(state);
    const input = {
      title: '합성 신규 사업',
      department: '합성 시험팀',
      description: '공개 자료 시험',
    };
    const created = createCase(state, actor('APPLICANT'), {
      ...input,
      docTypes: ['FIREWALL', 'SECURITY_REVIEW'],
    });
    expect(created.state.requests.filter((item) => item.caseId === created.caseId)).toHaveLength(2);
    expect(
      created.state.cases
        .find((item) => item.id === created.caseId)
        ?.answers.filter((item) => item.key === 'purpose'),
    ).toHaveLength(1);
    expectProblem(() => createCase(state, actor('APPLICANT'), { ...input, docTypes: [] }), 422);
    expectProblem(
      () => createCase(state, actor('APPLICANT'), { ...input, docTypes: ['FIREWALL', 'FIREWALL'] }),
      422,
    );
    expect(state).toEqual(original);
  });

  test('신청자는 타인 신청을 조회할 수 없고 비활성 계정도 거부한다', () => {
    const state = createMockState();
    expectProblem(
      () => requestForActor(state, request(state, 'demo-request-6'), actor('APPLICANT')),
      404,
    );
    expectProblem(
      () => requestForActor(state, request(state), { ...actor('APPLICANT'), active: false }),
      401,
    );
  });

  test('같은 분야의 미배정 담당자는 조회만 가능하며 검토·관리자 검토는 거부한다', () => {
    const state = createMockState();
    const other: Actor = { ...actor('INFRA'), id: 'synthetic-infra-other' };
    expect(requestForActor(state, request(state), other).allowedActions).toEqual(['DOWNLOAD']);
    expectProblem(
      () =>
        executeCommand(state, other, 'demo-request-1', {
          action: 'COMPLETE_REVIEW',
          expectedRevision: 1,
        }),
      403,
    );
    expectProblem(
      () =>
        run(state, 'APPLICANT', 'demo-request-1', {
          action: 'COMPLETE_REVIEW',
          comment: '합성 확인',
        }),
      403,
    );
    expectProblem(
      () => run(state, 'ADMIN', 'demo-request-1', { action: 'CLOSE', reason: '합성 종결' }),
      403,
    );
  });

  test('1단계에는 배정하지 않고 2단계 진입 시 분야별 담당자를 배정한다', () => {
    const state = createMockState();
    const pending = request(state, 'demo-request-1-security');
    expect(pending.assignments).toHaveLength(0);
    const next = run(state, 'APPLICANT', pending.id, { action: 'REQUEST_REVIEW' });
    expect(request(next, pending.id).stage).toBe(2);
    expect(request(next, pending.id).assignments.filter((item) => item.active)).toHaveLength(2);
    expect(
      request(next, pending.id).deadlines.filter(
        (item) => item.active && item.kind === 'CONSULTATION',
      ),
    ).toHaveLength(2);
    expect(request(next, 'demo-request-1')).toEqual(request(state, 'demo-request-1'));
  });

  test('기본 담당자가 비활성이면 미배정이고 신청자 자신은 배정하지 않는다', () => {
    const state = createMockState();
    const pending = request(state, 'demo-request-1-security');
    const members = MOCK_MEMBERS.map((item) =>
      item.role === 'INFRA' ? { ...item, active: false } : item,
    );
    const next = executeCommand(
      state,
      actor('APPLICANT'),
      pending.id,
      { action: 'REQUEST_REVIEW', expectedRevision: 1 },
      members,
    );
    expect(
      request(next, pending.id).assignments.some((item) => item.field === 'INFRA' && item.active),
    ).toBe(false);
    const selfState = createMockState();
    request(selfState, 'demo-request-1-security').ownerId = actor('INFRA').id;
    const selfActor = { ...actor('APPLICANT'), id: actor('INFRA').id };
    const noSelf = executeCommand(selfState, selfActor, pending.id, {
      action: 'REQUEST_REVIEW',
      expectedRevision: 1,
    });
    expect(
      request(noSelf, pending.id).assignments.some((item) => item.field === 'INFRA' && item.active),
    ).toBe(false);
  });

  test('정보보안은 할당 전에 협의할 수 없고 할당 완료만으로 협의가 완료되지 않는다', () => {
    const state = createMockState();
    expectProblem(
      () =>
        run(state, 'SECURITY', 'demo-request-1', {
          action: 'COMPLETE_REVIEW',
          comment: '합성 검토',
        }),
      422,
    );
    const next = allocate(state);
    const allocated = request(next);
    expect(allocated.reviews.find((item) => item.field === 'INFRA')).toMatchObject({
      status: 'COMPLETE',
    });
    expect(allocated.stage).toBe(2);
    expect(requestForActor(next, allocated, actor('SECURITY')).allowedActions).toContain(
      'COMPLETE_REVIEW',
    );
    expect(submissionBlockers(allocated)).toContain(
      'ICT인프라와 정보보안 협의가 모두 완료되어야 합니다.',
    );
  });

  test('차수 반환은 사유·유효 항목을 요구하며 기존 값·형제 상태·기한 이력을 보존한다', () => {
    const state = createMockState();
    const before = structuredClone(state);
    const action = { action: 'RETURN' as const, targetStage: 1, fieldKeys: ['purpose'] };
    expectProblem(() => run(state, 'INFRA', 'demo-request-1', action), 422, 'REASON_REQUIRED');
    expectProblem(
      () =>
        run(state, 'INFRA', 'demo-request-1', {
          ...action,
          fieldKeys: ['notAField'],
          reason: '합성 보완',
        }),
      422,
      'UNKNOWN_FIELD',
    );
    const next = run(state, 'INFRA', 'demo-request-1', {
      ...action,
      reason: '목적을 보완해 주세요.',
    });
    expect(request(next)).toMatchObject({
      stage: 1,
      status: 'DRAFT',
      highlightedFields: ['purpose'],
    });
    expect(request(next).commonAnswers).toEqual(request(state).commonAnswers);
    expect(request(next).answers).toEqual(request(state).answers);
    expect(request(next, 'demo-request-1-security')).toEqual(
      request(state, 'demo-request-1-security'),
    );
    expect(
      request(next)
        .deadlines.filter((item) => item.kind === 'CONSULTATION')
        .every((item) => !item.active && item.closedAt),
    ).toBe(true);
    expect(
      request(next).deadlines.filter((item) => item.active && item.kind === 'SUPPLEMENT'),
    ).toHaveLength(1);
    expect(state).toEqual(before);
  });

  test('허용되지 않은 반환·단계×상태 조합과 단계를 건너뛴 제출을 거부한다', () => {
    const state = createMockState();
    expectProblem(
      () =>
        run(state, 'INFRA', 'demo-request-1', {
          action: 'RETURN',
          targetStage: 3,
          fieldKeys: ['purpose'],
          reason: '합성 사유',
        }),
      422,
      'INVALID_STAGE_RETURN',
    );
    expectProblem(
      () =>
        run(state, 'APPLICANT', 'demo-request-1-security', {
          action: 'SUBMIT',
          idempotencyKey: 'synthetic-invalid-stage',
        }),
      422,
    );
    request(state).status = 'FINALIZED';
    expectProblem(
      () => run(state, 'INFRA', 'demo-request-1', { action: 'CLOSE', reason: '합성 사유' }),
      422,
      'INVALID_STAGE_STATUS',
    );
  });

  test('공통 값 변경은 미제출 신청을 재검토시키며 완료된 협의를 그대로 인정하지 않는다', () => {
    const state = createMockState();
    const businessCase = state.cases.find((item) => item.id === 'demo-case-2');
    if (!businessCase) throw new Error('사업 누락');
    const next = saveCaseAnswers(
      state,
      actor('APPLICANT'),
      businessCase.id,
      businessCase.revision,
      [inputFor(businessCase.answers[0], '변경한 합성 사업 목적')],
    );
    expect(request(next, 'demo-request-2').changedCommonFields).toContain('purpose');
    expect(request(next, 'demo-request-2').reviews.every((item) => item.status === 'RECHECK')).toBe(
      true,
    );
    expect(request(next, 'demo-request-2').commonAnswers[0].value).toBe('변경한 합성 사업 목적');
    expect(businessCase.answers[0].value).not.toBe('변경한 합성 사업 목적');
  });

  test('동일 AI 값의 사람 확인은 출처·근거를 보존하고 완료 협의를 무효화하지 않는다', () => {
    const state = createMockState();
    const businessCase = state.cases.find((item) => item.id === 'demo-case-2');
    if (!businessCase) throw new Error('사업 누락');
    const answer = businessCase.answers[0];
    answer.source = 'AI_INFERRED';
    answer.evidence = '합성 문서 1절';
    answer.confirmed = false;
    answer.confirmation = null;
    request(state, 'demo-request-2').commonAnswers = structuredClone(businessCase.answers);
    const next = saveCaseAnswers(state, actor('APPLICANT'), businessCase.id, 1, [inputFor(answer)]);
    expect(request(next, 'demo-request-2').commonAnswers[0]).toMatchObject({
      source: 'AI_INFERRED',
      evidence: '합성 문서 1절',
      confirmed: true,
      confirmation: { actorId: actor('APPLICANT').id },
    });
    expect(
      request(next, 'demo-request-2').reviews.every((item) => item.status === 'COMPLETE'),
    ).toBe(true);
    expect(request(next, 'demo-request-2').changedCommonFields).toEqual([]);
  });

  test('담당자의 AI 확인은 담당자 확인 출처와 확인자·원래 근거를 남긴다', () => {
    const state = createMockState();
    const businessCase = state.cases[0];
    const answer = businessCase.answers[0];
    answer.source = 'AI_INFERRED';
    answer.evidence = '합성 문서 2절';
    answer.confirmed = false;
    answer.confirmation = null;
    const next = saveCaseAnswers(state, actor('INFRA'), businessCase.id, 1, [inputFor(answer)]);
    const confirmed = next.cases[0].answers[0];
    expect(confirmed).toMatchObject({
      source: 'STAFF_CONFIRMED',
      evidence: '합성 문서 2절',
      confirmation: { actorId: actor('INFRA').id, role: 'INFRA' },
    });
    const again = saveCaseAnswers(next, actor('APPLICANT'), businessCase.id, 2, [
      inputFor(confirmed),
    ]);
    expect(again.cases[0].answers[0].source).toBe('STAFF_CONFIRMED');
    expect(again.cases[0].answers[0].confirmation).toEqual(confirmed.confirmation);
  });

  test('다른 역할 필드를 묶어 저장하려 하면 앞선 정상 필드도 부분 저장하지 않는다', () => {
    const state = createMockState();
    const before = structuredClone(state);
    expectProblem(
      () =>
        saveCaseAnswers(state, actor('APPLICANT'), 'demo-case-1', 1, [
          { key: 'purpose', value: '새 합성 목적', confirmed: true, notApplicable: false },
          { key: 'sourceIp', value: '192.0.2.99', confirmed: true, notApplicable: false },
        ]),
      403,
    );
    expect(state).toEqual(before);
  });

  test('분석 결과는 근거 있는 신청자 항목만 미확정으로 적용하고 기술 사실은 거부한다', () => {
    const state = createMockState();
    state.cases[0].answers[0].confirmed = false;
    state.cases[0].answers[0].confirmation = null;
    const next = applyAnalysis(state, actor('APPLICANT'), 'demo-case-1', 1, [
      { key: 'purpose', value: '합성 문서에서 추출한 목적', evidence: '합성 개요서 1절' },
    ]);
    expect(next.cases[0].answers[0]).toMatchObject({
      source: 'AI_INFERRED',
      confirmed: false,
      confirmation: null,
      evidence: '합성 개요서 1절',
    });
    expectProblem(
      () =>
        applyAnalysis(state, actor('APPLICANT'), 'demo-case-1', 1, [
          { key: 'sourceIp', value: '192.0.2.99', evidence: '합성 추정' },
        ]),
      422,
      'AI_FACT_FORBIDDEN',
    );
    expectProblem(
      () =>
        applyAnalysis(state, actor('APPLICANT'), 'demo-case-1', 1, [
          { key: 'purpose', value: '합성 목적', evidence: '' },
        ]),
      422,
      'ANALYSIS_EVIDENCE_REQUIRED',
    );
    expect(JSON.stringify(next.auditEvents)).not.toContain('합성 문서에서 추출한 목적');
    expectProblem(
      () =>
        applyAnalysis(next, actor('APPLICANT'), 'demo-case-1', 1, [
          { key: 'purpose', value: '오래된 합성 분석', evidence: '합성 이전 판본' },
        ]),
      409,
    );
  });

  test('AI 최종 초안은 확인 전 제출되지 않고 확인 후에도 AI 출처를 보존한다', () => {
    let state = confirmReadyDraft();
    state = run(state, 'APPLICANT', 'demo-request-2', { action: 'GENERATE_DRAFT' });
    const summary = request(state, 'demo-request-2').answers.find(
      (answer) => answer.key === 'finalSummary',
    );
    if (!summary) throw new Error('AI 요약 누락');
    expect(summary).toMatchObject({ source: 'AI_INFERRED', confirmed: false, confirmation: null });
    expectProblem(
      () =>
        run(state, 'APPLICANT', 'demo-request-2', {
          action: 'SUBMIT',
          idempotencyKey: 'synthetic-submit-1',
        }),
      422,
      'SUBMISSION_BLOCKED',
    );
    state = run(state, 'APPLICANT', 'demo-request-2', {
      action: 'SAVE_ANSWERS',
      answers: [inputFor(summary)],
    });
    expect(
      request(state, 'demo-request-2').answers.find((answer) => answer.key === summary.key)?.source,
    ).toBe('AI_INFERRED');
    state = run(state, 'APPLICANT', 'demo-request-2', {
      action: 'SUBMIT',
      idempotencyKey: 'synthetic-submit-1',
    });
    expect(request(state, 'demo-request-2').submissions[0]).toMatchObject({
      publicationVersion: 1,
      idempotencyKey: 'synthetic-submit-1',
    });
    expect(request(state, 'demo-request-2').submissions[0].commonAnswers).toEqual(
      request(state, 'demo-request-2').commonAnswers,
    );
  });

  test('필수값·미확정·미해결 보완·협의 미완료 각각 제출을 막는다', () => {
    const base = confirmReadyDraft();
    const mutations = [
      (item: SecurityRequest) => {
        item.answers[0].value = '';
      },
      (item: SecurityRequest) => {
        item.answers[0].confirmed = false;
      },
      (item: SecurityRequest) => {
        item.supplements = structuredClone(
          request(createMockState(), 'demo-request-5').supplements,
        );
      },
      (item: SecurityRequest) => {
        item.reviews[0].status = 'RECHECK';
      },
    ];
    for (const mutate of mutations) {
      const state = structuredClone(base);
      mutate(request(state, 'demo-request-2'));
      expectProblem(
        () =>
          run(state, 'APPLICANT', 'demo-request-2', {
            action: 'SUBMIT',
            idempotencyKey: crypto.randomUUID(),
          }),
        422,
        'SUBMISSION_BLOCKED',
      );
      expect(request(state, 'demo-request-2').submissions).toHaveLength(0);
    }
  });

  test('같은 제출 키 재시도는 새 제출본·감사 이력·수정본을 만들지 않는다', () => {
    const ready = confirmReadyDraft();
    const command = {
      action: 'SUBMIT' as const,
      expectedRevision: request(ready, 'demo-request-2').revision,
      idempotencyKey: 'synthetic-idempotency',
    };
    const submitted = executeCommand(ready, actor('APPLICANT'), 'demo-request-2', command);
    const retry = executeCommand(submitted, actor('APPLICANT'), 'demo-request-2', command);
    expect(retry).toEqual(submitted);
    expect(request(retry, 'demo-request-2').submissions).toHaveLength(1);
    expectProblem(
      () =>
        run(submitted, 'APPLICANT', 'demo-request-1', {
          action: 'SUBMIT',
          idempotencyKey: 'synthetic-idempotency',
        }),
      409,
      'IDEMPOTENCY_CONFLICT',
    );
  });

  test('제출본·종료 신청은 공통 값 변경 뒤에도 불변이고 조회에서 변경 사실만 알린다', () => {
    let state = confirmReadyDraft();
    const sibling = structuredClone(request(state, 'demo-request-2'));
    sibling.id = 'synthetic-case2-draft';
    sibling.docType = 'SECURITY_REVIEW';
    sibling.stage = 1;
    sibling.status = 'DRAFT';
    state.requests.push(sibling);
    state = run(state, 'APPLICANT', 'demo-request-2', {
      action: 'SUBMIT',
      idempotencyKey: 'synthetic-snapshot',
    });
    const submitted = structuredClone(request(state, 'demo-request-2'));
    const businessCase = state.cases.find((item) => item.id === 'demo-case-2');
    if (!businessCase) throw new Error('사업 누락');
    const next = saveCaseAnswers(
      state,
      actor('APPLICANT'),
      businessCase.id,
      businessCase.revision,
      [inputFor(businessCase.answers[0], '제출 후 새 합성 목적')],
    );
    expect(request(next, submitted.id)).toEqual(submitted);
    expect(request(next, sibling.id).commonAnswers[0].value).toBe('제출 후 새 합성 목적');
    expect(
      requestForActor(next, request(next, submitted.id), actor('SECURITY')).changedCommonFields,
    ).toContain('purpose');
    expect(request(next, submitted.id).submissions[0].commonAnswers[0].value).not.toBe(
      '제출 후 새 합성 목적',
    );
  });

  test('같은 제출본을 INFRA 다음 SECURITY가 확인하고 SECURITY만 확정한다', () => {
    let state = createMockState();
    expectProblem(() => run(state, 'SECURITY', 'demo-request-3', { action: 'FINAL_CONFIRM' }), 422);
    expectProblem(() => run(state, 'SECURITY', 'demo-request-3', { action: 'FINALIZE' }), 422);
    state = run(state, 'INFRA', 'demo-request-3', { action: 'FINAL_CONFIRM' });
    state = run(state, 'SECURITY', 'demo-request-3', { action: 'FINAL_CONFIRM' });
    expectProblem(() => run(state, 'INFRA', 'demo-request-3', { action: 'FINALIZE' }), 422);
    state = run(state, 'SECURITY', 'demo-request-3', { action: 'FINALIZE' });
    expect(request(state, 'demo-request-3').status).toBe('FINALIZED');
    expect(
      requestForActor(state, request(state, 'demo-request-3'), actor('SECURITY')).allowedActions,
    ).toEqual(['DOWNLOAD']);
  });

  test('4→3 반환 후 새 제출본에는 이전 최종 확인을 재사용하지 않는다', () => {
    let state = createMockState();
    state = run(state, 'INFRA', 'demo-request-3', { action: 'FINAL_CONFIRM' });
    state = run(state, 'SECURITY', 'demo-request-3', {
      action: 'RETURN',
      targetStage: 3,
      fieldKeys: ['serviceScope'],
      reason: '범위 재확인',
    });
    expectProblem(
      () =>
        run(state, 'APPLICANT', 'demo-request-3', {
          action: 'SUBMIT',
          idempotencyKey: 'synthetic-revision2',
        }),
      422,
    );
    state = run(state, 'APPLICANT', 'demo-request-3', {
      action: 'SAVE_ANSWERS',
      answers: [inputFor(request(state, 'demo-request-3').answers[0])],
    });
    state = run(state, 'APPLICANT', 'demo-request-3', {
      action: 'SUBMIT',
      idempotencyKey: 'synthetic-revision2',
    });
    expect(request(state, 'demo-request-3').submissions).toHaveLength(2);
    expect(request(state, 'demo-request-3').finalConfirmations).toHaveLength(1);
    expectProblem(() => run(state, 'SECURITY', 'demo-request-3', { action: 'FINAL_CONFIRM' }), 422);
  });

  test.each(['CLOSE', 'WITHDRAW'] as const)(
    '종료 명령 %s는 사유를 요구하며 데이터와 이력을 남긴다',
    (action) => {
      const state = createMockState();
      const role = action === 'CLOSE' ? 'INFRA' : 'APPLICANT';
      expectProblem(() => run(state, role, 'demo-request-1', { action }), 422, 'REASON_REQUIRED');
      const next = run(state, role, 'demo-request-1', { action, reason: '합성 종료 사유' });
      expect(request(next).commonAnswers).toEqual(request(state).commonAnswers);
      expect(request(next).deadlines.every((item) => !item.active)).toBe(true);
      expect(next.auditEvents[0]).toMatchObject({ action, reason: '합성 종료 사유' });
      expectProblem(
        () =>
          run(next, 'APPLICANT', 'demo-request-1', {
            action: 'SAVE_ANSWERS',
            answers: [inputFor(request(next).answers[0])],
          }),
        422,
        'TERMINAL_REQUEST',
      );
    },
  );

  test('관리자 재배정은 사유와 적격 담당자를 요구하고 이전 담당자의 쓰기 권한을 끝낸다', () => {
    const state = createMockState();
    const replacement: Actor = {
      ...actor('INFRA'),
      id: 'synthetic-infra-alternate',
      username: 'infra-alternate',
      displayName: '인프라 담당 나',
    };
    const input: CommandInput = {
      action: 'REASSIGN',
      expectedRevision: 1,
      field: 'INFRA',
      assigneeId: replacement.id,
      reason: '합성 담당 업무 인계',
    };
    expectProblem(
      () =>
        executeCommand(state, actor('INFRA'), 'demo-request-1', input, [
          ...MOCK_MEMBERS,
          replacement,
        ]),
      403,
    );
    const next = executeCommand(state, actor('ADMIN'), 'demo-request-1', input, [
      ...MOCK_MEMBERS,
      replacement,
    ]);
    expect(request(next).assignments.filter((item) => item.field === 'INFRA')).toHaveLength(2);
    expect(
      request(next).assignments.filter((item) => item.field === 'INFRA' && item.active),
    ).toHaveLength(1);
    expect(requestForActor(next, request(next), actor('INFRA')).allowedActions).toEqual([
      'DOWNLOAD',
    ]);
    expect(requestForActor(next, request(next), replacement).allowedActions).toContain(
      'COMPLETE_REVIEW',
    );
    expect(request(next).commonAnswers).toEqual(request(state).commonAnswers);
  });

  test('기한은 서울 날짜의 주말·공휴일을 제외하고 경과해도 신청 상태를 바꾸지 않는다', () => {
    expect(calculateDueAt('2026-11-07T09:00:00+09:00', 5)).toBe('2026-11-13T23:59:59+09:00');
    expect(calculateDueAt('2026-11-07T09:00:00+09:00', 5, ['2026-11-09'])).toBe(
      '2026-11-16T23:59:59+09:00',
    );
    const state = createMockState();
    const before = structuredClone(state);
    const viewed = requestForActor(state, request(state, 'demo-request-5'), actor('APPLICANT'));
    expect(viewed.deadlines.some((item) => item.timing === 'OVERDUE')).toBe(true);
    expect(viewed.status).toBe('SUPPLEMENT_REQUESTED');
    expect(state).toEqual(before);
    expect(deadlineTiming({ ...viewed.deadlines[0], active: false })).toBe('CLOSED');
  });

  test('오래된 수정본 거부는 사용자 값·감사 이력을 포함한 원본 전체를 보존한다', () => {
    const state = createMockState();
    const before = structuredClone(state);
    expectProblem(
      () =>
        executeCommand(state, actor('INFRA'), 'demo-request-1', {
          action: 'COMPLETE_REVIEW',
          expectedRevision: 999,
        }),
      409,
      'REVISION_CONFLICT',
    );
    expect(state).toEqual(before);
  });

  test('두 서류 생성·분석 후보 확인부터 반환·보완·협의·사람 확인·확정까지 이어진다', () => {
    const created = createCase(createMockState(), actor('APPLICANT'), {
      title: '합성 전과정 검증 사업',
      department: '합성 시험팀',
      description: '합성 공개 자료 안내 서비스',
      docTypes: ['FIREWALL', 'SECURITY_REVIEW'],
    });
    let state = created.state;
    const primary = state.requests.find(
      (item) => item.caseId === created.caseId && item.docType === 'FIREWALL',
    );
    const sibling = state.requests.find(
      (item) => item.caseId === created.caseId && item.docType === 'SECURITY_REVIEW',
    );
    if (!primary || !sibling) throw new Error('생성된 신청 누락');
    const id = primary.id;
    state = applyAnalysis(state, actor('APPLICANT'), created.caseId, 1, [
      { key: 'purpose', value: '합성 자료 조회·안내', evidence: '합성 개요서 1절' },
    ]);
    const common = state.cases.find((item) => item.id === created.caseId);
    if (!common) throw new Error('생성된 사업 누락');
    state = saveCaseAnswers(
      state,
      actor('APPLICANT'),
      common.id,
      common.revision,
      common.answers
        .filter((item) => item.ownerRole === 'APPLICANT')
        .map((item) => inputFor(item, item.value || '공개 자료만 이용하는 합성 시험 내용')),
    );
    state = run(state, 'APPLICANT', id, {
      action: 'SAVE_ANSWERS',
      answers: [inputFor(request(state, id).answers[0], '합성 공개 API 조회')],
    });
    state = run(state, 'APPLICANT', id, { action: 'REQUEST_REVIEW' });
    const example = state.cases.find((item) => item.id === 'demo-case-2');
    const allocatedCase = state.cases.find((item) => item.id === created.caseId);
    if (!example || !allocatedCase) throw new Error('할당 자료 누락');
    state = saveCaseAnswers(
      state,
      actor('INFRA'),
      created.caseId,
      allocatedCase.revision,
      example.answers.filter((item) => item.ownerRole === 'INFRA').map((item) => inputFor(item)),
    );
    state = run(state, 'SECURITY', id, {
      action: 'REQUEST_SUPPLEMENT',
      fieldKeys: ['purpose'],
      reason: '합성 목적 설명을 확인합니다.',
    });
    const supplementId = request(state, id).supplements[0].id;
    state = run(state, 'SECURITY', id, {
      action: 'RETURN',
      targetStage: 1,
      fieldKeys: ['purpose'],
      reason: '작성 단계에서 목적을 재확인해 주세요.',
    });
    expect(request(state, id).highlightedFields).toContain('purpose');
    const businessCase = state.cases.find((item) => item.id === created.caseId);
    if (!businessCase) throw new Error('사업 누락');
    state = saveCaseAnswers(state, actor('APPLICANT'), businessCase.id, businessCase.revision, [
      inputFor(businessCase.answers[0]),
    ]);
    state = run(state, 'APPLICANT', id, { action: 'REQUEST_REVIEW' });
    state = run(state, 'APPLICANT', id, {
      action: 'ANSWER_SUPPLEMENT',
      supplementId,
      answer: '공개 자료를 안내하는 합성 시험 목적입니다.',
    });
    state = run(state, 'SECURITY', id, { action: 'RESOLVE_SUPPLEMENT', supplementId });
    state = run(state, 'SECURITY', id, {
      action: 'SAVE_ANSWERS',
      answers: [inputFor(request(state, id).answers[1], '합성 최소 권한과 접근 기록 확인')],
    });
    state = run(state, 'INFRA', id, {
      action: 'COMPLETE_REVIEW',
      comment: '합성 자원과 기간을 확인했습니다.',
    });
    state = run(state, 'SECURITY', id, {
      action: 'COMPLETE_REVIEW',
      comment: '합성 보완 답변과 보안 대책을 확인했습니다.',
    });
    expect(request(state, id)).toMatchObject({ stage: 3, status: 'FINAL_REVIEW' });
    state = run(state, 'APPLICANT', id, { action: 'GENERATE_DRAFT' });
    const summary = request(state, id).answers.find((answer) => answer.key === 'finalSummary');
    if (!summary) throw new Error('요약 누락');
    state = run(state, 'APPLICANT', id, { action: 'SAVE_ANSWERS', answers: [inputFor(summary)] });
    state = run(state, 'APPLICANT', id, {
      action: 'SUBMIT',
      idempotencyKey: 'synthetic-full-path',
    });
    state = run(state, 'INFRA', id, { action: 'FINAL_CONFIRM' });
    state = run(state, 'SECURITY', id, { action: 'FINAL_CONFIRM' });
    state = run(state, 'SECURITY', id, { action: 'FINALIZE' });
    expect(request(state, id).status).toBe('FINALIZED');
    expect(request(state, sibling.id).status).toBe('DRAFT');
    expect(state.auditEvents.some((item) => item.action === 'RETURN')).toBe(true);
    expect(state.auditEvents[0].action).toBe('FINALIZE');
    expect(request(state, id).submissions).toHaveLength(1);
  });
});
