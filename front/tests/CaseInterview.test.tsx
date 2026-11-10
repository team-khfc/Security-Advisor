import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CaseInterview } from '@/features/request/CaseInterview';
import type { BusinessCase, SecurityRequest } from '@/features/request/types';
import type { InterviewTurn } from '@/features/request/useInterview';
import { clearInputDraft } from '@/lib/inputDrafts';
import type { Session } from '@/lib/types';
import { createMockState, MOCK_MEMBERS } from '@/mocks/seed';

const controls = vi.hoisted(() => ({
  session: null as Session | null,
  businessCase: undefined as BusinessCase | undefined,
  requests: [] as SecurityRequest[],
  save: vi.fn(),
  savePending: false,
  turns: [] as InterviewTurn[],
  askError: null as Error | null,
}));

vi.mock('@/features/auth', () => ({
  useSession: () => ({ data: controls.session, isPending: false }),
}));
vi.mock('@/features/request/useInterview', () => ({
  useInterviewTurns: () => ({ data: [] }),
  useInterviewStaffCheck: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/features/request/useInterviewAssistance', () => ({
  useInterviewAssistance: () => ({
    history: controls.turns,
    ask: { isPending: false, error: controls.askError },
    apply: { isPending: false },
    mode: 'ANSWER',
    help: {},
    busy: false,
    showHelp: false,
    toggleHelp: vi.fn(),
    send: vi.fn(),
    prompt: '',
    setPrompt: vi.fn(),
    isStale: () => false,
  }),
}));
vi.mock('@/features/request/useRequests', () => ({
  useCase: () => ({ data: controls.businessCase, isPending: false }),
  useRelatedRequests: () => ({ data: controls.requests, isPending: false }),
  useSaveCase: () => ({ mutateAsync: controls.save, isPending: controls.savePending }),
  useAnalysis: () => ({ reset: vi.fn(), isPending: false }),
  useApplyAnalysis: () => ({ reset: vi.fn(), isPending: false }),
}));

const applicant = MOCK_MEMBERS[0];

beforeEach(() => {
  const state = createMockState();
  controls.session = { member: applicant, mock: true, expiresAt: null };
  controls.businessCase = state.cases.find((businessCase) => businessCase.id === 'demo-case-5');
  controls.requests = state.requests;
  controls.save.mockReset().mockResolvedValue({});
  controls.savePending = false;
  controls.turns = [];
  controls.askError = null;
});

afterEach(() => {
  clearInputDraft(applicant.id, `case:${controls.businessCase?.id}:interview`);
  clearInputDraft(applicant.id, `case:${controls.businessCase?.id}:analysis`);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
});

function conversation() {
  return screen.getByRole('region', { name: '인터뷰 대화' });
}

test('새로 열면 완료된 항목을 건너뛰고 저장된 미완료 항목부터 작성한다', () => {
  const answers = controls.businessCase!.answers;
  const target = answers.filter((answer) => answer.ownerRole === 'APPLICANT')[1];
  controls.businessCase = {
    ...controls.businessCase!,
    answers: answers.map((answer) =>
      answer.key === target.key ? { ...answer, value: '', confirmed: false } : answer,
    ),
  };
  render(<CaseInterview id={controls.businessCase.id} />);
  expect(screen.getByRole('textbox', { name: target.label })).toBeTruthy();
  expect(controls.save).not.toHaveBeenCalled();
});

test('저장된 미확정 AI 답변부터 재개하고 다른 항목으로 이동한 뒤에도 대화에서 다시 확인할 수 있다', async () => {
  const answers = controls.businessCase!.answers;
  const applicantAnswers = answers.filter((answer) => answer.ownerRole === 'APPLICANT');
  const target = applicantAnswers.at(-1)!;
  controls.businessCase = {
    ...controls.businessCase!,
    answers: answers.map((answer) =>
      answer.key === target.key
        ? { ...answer, value: '합성 추천', confirmed: false, source: 'AI_INFERRED' as const }
        : answer.key === applicantAnswers[0].key
          ? { ...answer, value: '', confirmed: false }
          : answer,
    ),
  };
  controls.turns = [
    {
      interviewTurnId: 73,
      businessCaseId: 601,
      fieldKey: target.key,
      mode: 'SUGGEST',
      question: '합성 질문',
      reply: '합성 설명',
      proposedValue: '합성 추천',
      evidence: [],
      basedRevision: 1,
      answerRevision: null,
      modelReference: 'fake/offline',
      flagged: false,
      applied: true,
      createdAt: '2026-11-10T00:00:00Z',
    },
  ];
  const user = userEvent.setup();
  const view = render(<CaseInterview id={controls.businessCase.id} />);
  expect((screen.getByRole('textbox', { name: target.label }) as HTMLInputElement).value).toBe(
    '합성 추천',
  );
  expect(screen.getByRole('button', { name: 'AI 답변 확인하고 다음' })).toBeTruthy();
  await user.click(screen.getByRole('button', { name: '나중에 입력' }));
  await user.click(screen.getByRole('button', { name: '적용한 답변 확인하기' }));
  expect(screen.getByRole('textbox', { name: target.label })).toBeTruthy();
  expect(controls.save).not.toHaveBeenCalled();
  controls.session = { member: MOCK_MEMBERS[1], mock: true, expiresAt: null };
  view.rerender(<CaseInterview id={controls.businessCase.id} />);
  expect(screen.queryByRole('button', { name: '적용한 답변 확인하기' })).toBeNull();
});

test('저장된 답변을 모두 확인했다면 다시 작성하도록 요구하지 않고 완료 안내를 표시한다', () => {
  render(<CaseInterview id={controls.businessCase!.id} />);
  expect(screen.getByRole('heading', { name: '공통 정보를 정리했습니다' })).toBeTruthy();
  expect(screen.queryByRole('form')).toBeNull();
  expect(controls.save).not.toHaveBeenCalled();
});

test('게시본의 질문·도움말·긴 답변 형식과 미완료 상태를 표시한다', async () => {
  const original = controls.businessCase!;
  controls.businessCase = {
    ...original,
    answers: [
      {
        ...original.answers[0],
        key: 'project.summary',
        label: '게시본 사업 개요',
        hint: '사업 목적과 대상 이용자를 적어 주세요.',
        inputType: 'LONG_TEXT',
        value: '',
        confirmed: false,
        required: true,
      },
    ],
  };
  const user = userEvent.setup();
  renderForEditing(original.id);
  expect(screen.getByRole('heading', { name: '게시본 사업 개요' })).toBeTruthy();
  expect(screen.getByText('사업 목적과 대상 이용자를 적어 주세요.')).toBeTruthy();
  expect(screen.getByRole('textbox', { name: '게시본 사업 개요' }).tagName).toBe('TEXTAREA');
  await user.click(screen.getByRole('button', { name: '나중에 입력' }));
  expect(
    screen.getByRole('heading', { name: '확인이 필요한 필수 항목이 1개 남았습니다' }),
  ).toBeTruthy();
  expect(controls.save).not.toHaveBeenCalled();
});

function mockConversationLayout(body: HTMLElement, { pairHeight = 240 } = {}) {
  const top = 120;
  const height = 360;
  const introHeight = 160;
  const gap = 24;
  const questionHeight = 200;
  let scrollTop = 0;
  const pairs = () => Array.from(body.querySelectorAll<HTMLElement>('.chat-pair'));
  const currentQuestion = () => body.querySelector('.interview-current');
  const feedback = () => body.querySelector('.interview-feedback');
  const feedbackHeight = () => (feedback() ? 120 : 0);
  const scrollHeight = () =>
    introHeight +
    pairs().length * (pairHeight + gap) +
    feedbackHeight() +
    (currentQuestion() ? questionHeight + gap : 0) +
    24;

  // jsdom에는 배치 엔진이 없어 저장된 대화 크기를 합성한다. 분석 패널은 대화 밖에 있다.
  body.style.paddingBottom = '24px';
  Object.defineProperties(body, {
    clientTop: { configurable: true, value: 0 },
    clientHeight: { configurable: true, value: height },
    scrollHeight: { configurable: true, get: scrollHeight },
    scrollTop: {
      configurable: true,
      get: () => scrollTop,
      set: (value: number) => {
        scrollTop = Math.max(0, Math.min(value, Math.max(0, scrollHeight() - height)));
      },
    },
  });

  const measure = HTMLElement.prototype.getBoundingClientRect;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    if (this === body) return new DOMRect(40, top, 600, height);
    if (this === feedback())
      return new DOMRect(
        64,
        top + introHeight + pairs().length * (pairHeight + gap) - scrollTop,
        552,
        feedbackHeight(),
      );
    if (this === currentQuestion())
      return new DOMRect(
        64,
        top + introHeight + pairs().length * (pairHeight + gap) + feedbackHeight() - scrollTop,
        552,
        questionHeight,
      );
    const index = pairs().indexOf(this);
    if (index >= 0)
      return new DOMRect(
        64,
        top + introHeight + index * (pairHeight + gap) - scrollTop,
        552,
        pairHeight,
      );
    return measure.call(this);
  });
}

function expectLatestAnswerVisible(body: HTMLElement) {
  const pair = Array.from(body.querySelectorAll<HTMLElement>('.chat-pair')).at(-1);
  expect(pair).not.toBeNull();
  const bounds = pair!.getBoundingClientRect();
  const viewportTop = body.getBoundingClientRect().top + body.clientTop;
  expect(bounds.bottom).toBeGreaterThan(viewportTop);
  expect(bounds.bottom).toBeLessThanOrEqual(viewportTop + body.clientHeight);
}

function expectCurrentQuestionVisible(body: HTMLElement) {
  const bounds = body.querySelector<HTMLElement>('.interview-current')!.getBoundingClientRect();
  const viewportTop = body.getBoundingClientRect().top + body.clientTop;
  expect(bounds.top).toBeGreaterThanOrEqual(viewportTop);
  expect(bounds.bottom).toBeLessThanOrEqual(viewportTop + body.clientHeight);
}

async function fillAnswer(user: ReturnType<typeof userEvent.setup>, label: string, answer: string) {
  const input = screen.getByRole('textbox', { name: label });
  await user.clear(input);
  await user.type(input, answer);
}

test('긴 AI 응답은 대화창에 한 번 표시하고 다음 요청 실패 시 이전 응답 대신 오류를 보여 준다', () => {
  const id = controls.businessCase!.id;
  const view = renderForEditing(id);
  const body = conversation();
  mockConversationLayout(body, { pairHeight: 520 });
  const card = screen.getByRole('form', { name: '어떤 사업인가요?' });
  const input = screen.getByRole('textbox', { name: '사업 목적' });
  input.focus();
  const scrollPage = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  controls.turns = [
    {
      interviewTurnId: 42,
      businessCaseId: 601,
      fieldKey: 'purpose',
      mode: 'SUGGEST',
      question: '합성 AI 질문',
      reply: '긴 합성 AI 응답',
      proposedValue: '합성 추천 내용',
      evidence: [{ tag: 'B', label: '합성 근거 자료' }],
      basedRevision: 1,
      answerRevision: null,
      modelReference: 'fake/offline',
      flagged: false,
      applied: false,
      createdAt: '2026-11-10T00:00:00Z',
    },
  ];
  view.rerender(<CaseInterview id={id} />);
  for (const text of ['합성 AI 질문', '긴 합성 AI 응답', '합성 추천 내용', '합성 근거 자료']) {
    expect(within(body).getAllByText(text)).toHaveLength(1);
    expect(within(card).queryByText(text)).toBeNull();
  }
  expect(within(card).getAllByRole('textbox')).toHaveLength(1);
  expect(body.querySelector('.chat-pair')!.getBoundingClientRect().top).toBe(
    body.getBoundingClientRect().top,
  );
  expect(document.activeElement).toBe(input);
  expect(scrollPage).not.toHaveBeenCalled();
  controls.askError = new Error('합성 AI 재시도 오류');
  view.rerender(<CaseInterview id={id} />);
  const feedbackBounds = body.querySelector('.interview-feedback')!.getBoundingClientRect();
  expect(feedbackBounds.top).toBeGreaterThanOrEqual(body.getBoundingClientRect().top);
  expect(feedbackBounds.bottom).toBeLessThanOrEqual(body.getBoundingClientRect().bottom);
  expect(within(card).queryByText(/합성 AI 재시도 오류/)).toBeNull();
  expect(document.activeElement).toBe(input);
  expect(scrollPage).not.toHaveBeenCalled();
});

test('답변 저장과 마지막 공통 답변 저장 후 새 답변의 끝을 보여 주고 페이지와 초점을 옮기지 않는다', async () => {
  const businessCase = controls.businessCase!;
  controls.businessCase = {
    ...businessCase,
    answers: businessCase.answers.filter((answer) => answer.ownerRole === 'APPLICANT').slice(0, 2),
  };
  const user = userEvent.setup();
  renderForEditing(businessCase.id);
  const body = conversation();
  mockConversationLayout(body, { pairHeight: 520 });
  const scrollPage = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  document.documentElement.scrollTop = 240;
  document.body.scrollTop = 240;

  await fillAnswer(user, '사업 목적', '공개 자료를 안내하는 합성 사업의 목적입니다.');
  const next = screen.getByRole('button', { name: '답변 저장하고 다음' });
  await user.click(next);
  await within(body).findByText('공개 자료를 안내하는 합성 사업의 목적입니다.');
  expect(body.scrollTop).toBeGreaterThan(0);
  expectLatestAnswerVisible(body);
  expect(document.activeElement).toBe(next);
  expect(document.documentElement.scrollTop).toBe(240);
  expect(document.body.scrollTop).toBe(240);
  expect(scrollPage).not.toHaveBeenCalled();

  body.scrollTop = 0;
  await fillAnswer(user, '처리하는 정보', '공개 정책 자료와 합성 시험 자료만 처리합니다.');
  await user.click(screen.getByRole('button', { name: '공통 답변 저장' }));
  await screen.findByRole('heading', { name: '공통 정보를 정리했습니다' });
  expect(within(body).getByText('공개 정책 자료와 합성 시험 자료만 처리합니다.')).toBeTruthy();
  expect(controls.save).toHaveBeenCalledTimes(2);
  expectLatestAnswerVisible(body);
  expect(document.documentElement.scrollTop).toBe(240);
  expect(document.body.scrollTop).toBe(240);
  expect(scrollPage).not.toHaveBeenCalled();
});

test('채팅 첨부 영역이 있어도 대화 영역에서 새로 저장한 답변을 보여 준다', async () => {
  const user = userEvent.setup();
  renderForEditing(controls.businessCase!.id);
  const body = conversation();
  mockConversationLayout(body);
  const modes = screen.getByRole('tablist', { name: '입력 방식' });
  expect(
    within(modes)
      .getAllByRole('tab')
      .map((button) => button.textContent),
  ).toEqual(['AI에게 질문', '답변하기', '파일 첨부']);
  expect(screen.queryByRole('region', { name: '채팅 첨부파일' })).toBeNull();
  expect(screen.queryByRole('textbox', { name: '분석할 사업 개요' })).toBeNull();

  await fillAnswer(user, '사업 목적', '첫 번째 합성 인터뷰 답변입니다.');
  await user.click(screen.getByRole('button', { name: '답변 저장하고 다음' }));
  await within(body).findByText('첫 번째 합성 인터뷰 답변입니다.');
  expectLatestAnswerVisible(body);
  expectCurrentQuestionVisible(body);

  // 앞선 대화를 읽으려고 위로 이동해도 다음 저장은 최신 답변으로 돌아온다.
  body.scrollTop = 0;
  await fillAnswer(user, '처리하는 정보', '두 번째 합성 인터뷰 답변입니다.');
  expect(body.scrollTop).toBe(0);
  await user.click(screen.getByRole('button', { name: '답변 저장하고 다음' }));
  await within(body).findByText('두 번째 합성 인터뷰 답변입니다.');
  expectLatestAnswerVisible(body);
  expectCurrentQuestionVisible(body);
  expect(body.scrollTop).toBeGreaterThan(0);
  expect(within(modes).getByRole('tab', { name: '파일 첨부' })).toBeTruthy();
});

test('입력·저장 실패 중에는 읽던 위치를 유지하고 나중에 입력을 선택하면 다음 질문을 보여 준다', async () => {
  const user = userEvent.setup();
  renderForEditing(controls.businessCase!.id);
  const body = conversation();
  mockConversationLayout(body, { pairHeight: 520 });
  await fillAnswer(user, '사업 목적', '저장을 마친 합성 답변입니다.');
  await user.click(screen.getByRole('button', { name: '답변 저장하고 다음' }));
  await within(body).findByText('저장을 마친 합성 답변입니다.');

  body.scrollTop = 40;
  await fillAnswer(user, '처리하는 정보', '저장하지 못한 합성 답변입니다.');
  expect(body.scrollTop).toBe(40);
  controls.save.mockRejectedValueOnce(new Error('합성 저장 오류입니다. 다시 시도해 주세요.'));
  await user.click(screen.getByRole('button', { name: '답변 저장하고 다음' }));
  await screen.findByText('합성 저장 오류입니다. 다시 시도해 주세요.');
  expect(within(body).queryByText('저장하지 못한 합성 답변입니다.')).toBeNull();
  expect(body.scrollTop).toBe(40);

  await user.click(screen.getByRole('button', { name: '나중에 입력' }));
  expect(screen.getByRole('textbox', { name: '외부 전송 여부' })).toBeTruthy();
  expectCurrentQuestionVisible(body);
});

test('저장 응답을 기다리는 동안 위치를 유지하고 성공 응답 뒤에만 새 대화로 이동한다', async () => {
  const user = userEvent.setup();
  const id = controls.businessCase!.id;
  const view = renderForEditing(id);
  const body = conversation();
  mockConversationLayout(body, { pairHeight: 520 });
  await fillAnswer(user, '사업 목적', '이미 저장한 합성 답변입니다.');
  await user.click(screen.getByRole('button', { name: '답변 저장하고 다음' }));
  await within(body).findByText('이미 저장한 합성 답변입니다.');

  body.scrollTop = 40;
  await fillAnswer(user, '처리하는 정보', '응답을 기다리는 합성 답변입니다.');
  let resolveSave: (value: unknown) => void = () => {};
  controls.save.mockImplementationOnce(
    () =>
      new Promise<unknown>((resolve) => {
        resolveSave = resolve;
      }),
  );
  await user.click(screen.getByRole('button', { name: '답변 저장하고 다음' }));
  controls.savePending = true;
  view.rerender(<CaseInterview id={id} />);
  expect((screen.getByRole('button', { name: '저장 중…' }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  expect(body.scrollTop).toBe(40);
  expect(within(body).queryByText('응답을 기다리는 합성 답변입니다.')).toBeNull();

  await act(async () => {
    controls.savePending = false;
    resolveSave({});
  });
  await within(body).findByText('응답을 기다리는 합성 답변입니다.');
  await waitFor(() => expectLatestAnswerVisible(body));
  expect(body.scrollTop).toBeGreaterThan(40);
});

// 기존 합성 자료는 완료된 답변이다. 재작성 검사는 사용자가 다시 보기로 여는 흐름을 따른다.
function renderForEditing(id: string) {
  const view = render(<CaseInterview id={id} />);
  const restart = screen.queryByRole('button', { name: '공통 질문 다시 보기' });
  if (restart) fireEvent.click(restart);
  return view;
}
