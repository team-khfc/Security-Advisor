import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CaseInterview } from '@/features/request/CaseInterview';
import { clearInputDraft } from '@/lib/inputDrafts';
import type { Session } from '@/lib/types';
import type { BusinessCase, SecurityRequest } from '@/features/request/types';
import { createMockState, MOCK_MEMBERS } from '@/mocks/seed';

const controls = vi.hoisted(() => ({
  session: null as Session | null,
  businessCase: undefined as BusinessCase | undefined,
  requests: [] as SecurityRequest[],
  save: vi.fn(),
  saving: false,
  analyze: vi.fn(),
  staffCheck: vi.fn(),
  onApplied: undefined as (() => void) | undefined,
}));

vi.mock('@/features/auth', () => ({
  useSession: () => ({ data: controls.session, isPending: false }),
}));
vi.mock('@/features/request/useRequests', () => ({
  useCase: () => ({ data: controls.businessCase, isPending: false }),
  useRelatedRequests: () => ({ data: controls.requests, isPending: false }),
  useSaveCase: () => ({ mutateAsync: controls.save, isPending: controls.saving }),
  useAnalysis: () => ({
    data: undefined,
    mutateAsync: controls.analyze,
    reset: vi.fn(),
    isPending: false,
  }),
  useApplyAnalysis: () => ({ mutateAsync: vi.fn(), reset: vi.fn(), isPending: false }),
}));

const applicant = MOCK_MEMBERS[0];

beforeEach(() => {
  const state = createMockState();
  const businessCase = structuredClone(state.cases[0]);
  controls.businessCase = businessCase;
  controls.requests = state.requests.filter((request) => request.caseId === businessCase.id);
  controls.session = { member: applicant, mock: true, expiresAt: null };
  controls.save.mockReset().mockResolvedValue({});
  controls.saving = false;
  controls.staffCheck.mockReset().mockResolvedValue({ revision: 2 });
  controls.analyze
    .mockReset()
    .mockResolvedValue({ suggestions: [{ value: '합성 첨부문서 요약' }] });
});

afterEach(() => {
  const id = controls.businessCase?.id;
  for (const key of [`case:${id}:interview`, `case:${id}:analysis`, `case:${id}:answers`])
    clearInputDraft(applicant.id, key);
});

test('작업 영역은 대화 영역·질문 카드·수집 정보 영역과 서류별 신청 링크를 표시한다', () => {
  renderForEditing(controls.businessCase!.id);
  expect(screen.getByRole('heading', { name: '보안정보 도우미' })).toBeTruthy();
  expect(screen.getByRole('log', { name: '대화 내용' })).toBeTruthy();
  expect(screen.getByText(/공통 질문 1 \/ \d+/)).toBeTruthy();
  const info = screen.getByRole('complementary', { name: '수집된 보안정보' });
  expect(within(info).getByRole('heading', { name: '사업 정보' })).toBeTruthy();
  expect(within(info).getByRole('heading', { name: '담당자 확인 항목' })).toBeTruthy();
  expect(within(info).getByRole('progressbar', { name: '확인한 공통 답변' })).toBeTruthy();
  for (const request of controls.requests)
    expect(
      screen
        .getAllByRole('link')
        .some((link) => link.getAttribute('href') === `/requests/${request.id}`),
    ).toBe(true);
  expect(screen.queryByText('기획서로 시작하거나 AI 제안 받기')).toBeNull();
  const chat = screen.getByRole('region', { name: '보안정보 도우미' });
  expect(within(chat).getByRole('tab', { name: '파일 첨부' })).toBeTruthy();
  expect(within(chat).queryByLabelText('분석할 사업 개요')).toBeNull();
});

test('답변을 저장하면 같은 저장 요청을 보내고 대화 영역에 내 답변을 남긴 뒤 다음 질문으로 넘어간다', async () => {
  const user = userEvent.setup();
  renderForEditing(controls.businessCase!.id);
  const firstLabel = screen.getByLabelText('사업 목적');
  await user.clear(firstLabel);
  await user.type(firstLabel, '작업 영역 검증용 합성 답변');
  await user.click(screen.getByRole('button', { name: '답변 저장하고 다음' }));
  await waitFor(() =>
    expect(controls.save).toHaveBeenCalledWith({
      expectedRevision: controls.businessCase!.revision,
      answers: [
        expect.objectContaining({
          key: 'purpose',
          value: '작업 영역 검증용 합성 답변',
          confirmed: true,
        }),
      ],
    }),
  );
  const log = screen.getByRole('log', { name: '대화 내용' });
  expect(within(log).getByText('작업 영역 검증용 합성 답변')).toBeTruthy();
  expect(screen.getByText(/공통 질문 2 \/ \d+/)).toBeTruthy();
});

test('다른 사용자가 열면 읽기 전용 안내만 보이고 질문 카드와 문서 분석 막대는 표시하지 않는다', () => {
  controls.session = { member: MOCK_MEMBERS[1], mock: true, expiresAt: null };
  renderForEditing(controls.businessCase!.id);
  expect(screen.getByText(/이 사업 건은 현재 읽기 전용입니다/)).toBeTruthy();
  expect(screen.queryByText(/공통 질문 1 \//)).toBeNull();
  expect(screen.queryByText('기획서로 시작하거나 AI 제안 받기')).toBeNull();
});

test('질문 안내는 대화창에 표시하고 입력 카드의 선택형 답변은 같은 항목에 저장한다', async () => {
  const user = userEvent.setup();
  renderForEditing(controls.businessCase!.id);
  const card = screen.getByRole('form', { name: '어떤 사업인가요?' });
  const conversation = screen.getByRole('region', { name: '인터뷰 대화' });
  expect(within(conversation).getByText(/필수 항목|선택 항목/)).toBeTruthy();
  expect(within(card).queryByText(/필수 항목|선택 항목/)).toBeNull();
  expect(
    within(conversation).getByText(
      '사업 목적을 한두 문장으로 적어 주세요. 신청서의 신청 사유로 들어갑니다.',
    ),
  ).toBeTruthy();
  expect(within(card).getByRole('textbox', { name: '사업 목적' }).tagName).toBe('INPUT');
  await user.click(screen.getByRole('button', { name: '나중에 입력' }));
  await user.click(screen.getByRole('button', { name: '개인정보가 포함돼요' }));
  await waitFor(() =>
    expect(controls.save).toHaveBeenCalledWith({
      expectedRevision: controls.businessCase!.revision,
      answers: [
        expect.objectContaining({
          key: 'dataTypes',
          value: '개인정보가 포함돼요',
          confirmed: true,
        }),
      ],
    }),
  );
  expect(screen.getByRole('heading', { name: '외부 기관이나 서비스와 연결되나요?' })).toBeTruthy();
  expect(
    within(screen.getByRole('log', { name: '대화 내용' })).getByText('개인정보가 포함돼요'),
  ).toBeTruthy();
});

test('선택형 저장 실패 시 선택한 답변을 입력란에 보존하고 직접 수정해 재시도한다', async () => {
  const user = userEvent.setup();
  controls.save.mockRejectedValueOnce(new Error('저장 실패. 다시 시도해 주세요.'));
  renderForEditing(controls.businessCase!.id);
  await user.click(screen.getByRole('button', { name: '나중에 입력' }));
  await user.click(screen.getByRole('button', { name: '공개 자료만 다뤄요' }));
  await screen.findByText('저장 실패. 다시 시도해 주세요.');
  const input = screen.getByRole('textbox', { name: '처리하는 정보' }) as HTMLInputElement;
  expect(input.value).toBe('공개 자료만 다뤄요');
  expect(
    within(screen.getByRole('log', { name: '대화 내용' })).queryByText('공개 자료만 다뤄요', {
      selector: '.m-me p',
    }),
  ).toBeNull();
  await user.clear(input);
  await user.type(input, '공개 통계 자료를 처리합니다.');
  await user.click(screen.getByRole('button', { name: '답변 저장하고 다음' }));
  await waitFor(() =>
    expect(controls.save).toHaveBeenLastCalledWith({
      expectedRevision: controls.businessCase!.revision,
      answers: [
        expect.objectContaining({ key: 'dataTypes', value: '공개 통계 자료를 처리합니다.' }),
      ],
    }),
  );
});
vi.mock('@/features/request/useInterview', () => ({
  useInterviewTurns: () => ({ data: [] }),
  useInterviewStaffCheck: () => ({ mutateAsync: controls.staffCheck, isPending: false }),
}));
vi.mock('@/features/request/useInterviewAssistance', () => ({
  useInterviewAssistance: ({ onApplied }: { onApplied: () => void }) => {
    controls.onApplied = onApplied;
    return {
      history: [],
      ask: { isPending: false },
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
    };
  },
}));

// 기존 합성 자료는 완료된 답변이다. 재작성 검사는 사용자가 다시 보기로 여는 흐름을 따른다.
test('새 선택형 인터뷰의 선택 항목도 미해당 상태를 명시적으로 저장한다', async () => {
  const first = controls.businessCase!.answers.find((answer) => answer.ownerRole === 'APPLICANT')!;
  first.inputType = 'BOOLEAN';
  first.required = false;
  renderForEditing(controls.businessCase!.id);
  await userEvent.setup().click(screen.getByRole('button', { name: '미해당으로 저장' }));
  expect(controls.save).toHaveBeenCalledWith(
    expect.objectContaining({
      answers: [
        expect.objectContaining({
          key: first.key,
          value: '',
          notApplicable: true,
          confirmed: true,
        }),
      ],
    }),
  );
});

function renderForEditing(id: string) {
  const view = render(<CaseInterview id={id} />);
  const restart = screen.queryByRole('button', { name: '공통 질문 다시 보기' });
  if (restart) fireEvent.click(restart);
  return view;
}

test('인터뷰 저장 중 캐시 갱신의 충돌 안내는 숨기고 저장 종료 뒤 충돌은 유지한다', async () => {
  const user = userEvent.setup();
  const id = controls.businessCase!.id;
  const view = renderForEditing(id);
  const composer = screen.getByRole('form', { name: '어떤 사업인가요?' });
  await user.clear(within(composer).getByLabelText('사업 목적'));
  await user.type(within(composer).getByLabelText('사업 목적'), '보존할 합성 답변');
  controls.saving = true;
  controls.businessCase = {
    ...controls.businessCase!,
    revision: controls.businessCase!.revision + 1,
  };
  view.rerender(<CaseInterview id={id} />);
  expect(screen.queryByText(/서버에 새 내용이 있습니다/)).toBeNull();
  controls.saving = false;
  view.rerender(<CaseInterview id={id} />);
  expect(screen.getByText(/서버에 새 내용이 있습니다/)).toBeTruthy();
  expect((within(composer).getByLabelText('사업 목적') as HTMLTextAreaElement).value).toBe(
    '보존할 합성 답변',
  );
});

test('우측에서 저장한 항목은 대화 입력과 수집 정보에 갱신되고 기존 미저장 채팅 초안이 남지 않는다', async () => {
  const user = userEvent.setup();
  const id = controls.businessCase!.id;
  const view = renderForEditing(id);
  const composer = screen.getByRole('form', { name: '어떤 사업인가요?' });
  await user.clear(within(composer).getByLabelText('사업 목적'));
  await user.type(within(composer).getByLabelText('사업 목적'), '아직 저장하지 않은 초안');
  const info = screen.getByRole('complementary', { name: '수집된 보안정보' });
  await user.click(within(info).getByRole('button', { name: '사업 목적 수정' }));
  await user.clear(within(info).getByLabelText('사업 목적'));
  await user.type(within(info).getByLabelText('사업 목적'), '우측에서 저장한 합성 목적');
  controls.save.mockImplementationOnce(async ({ answers }) => {
    const old = controls.businessCase!;
    controls.businessCase = {
      ...old,
      revision: old.revision + 1,
      answers: old.answers.map((answer) =>
        answer.key === answers[0].key
          ? {
              ...answer,
              value: answers[0].value,
              confirmed: true,
              revision: (answer.revision ?? 0) + 1,
            }
          : answer,
      ),
    };
  });
  await user.click(within(info).getByRole('button', { name: '확인하고 저장' }));
  await waitFor(() => expect(controls.save).toHaveBeenCalledTimes(1));
  view.rerender(<CaseInterview id={id} />);
  await waitFor(() =>
    expect((within(composer).getByLabelText('사업 목적') as HTMLTextAreaElement).value).toBe(
      '우측에서 저장한 합성 목적',
    ),
  );
  expect(within(info).getByText('우측에서 저장한 합성 목적')).toBeTruthy();
  expect(
    within(screen.getByRole('log', { name: '대화 내용' })).getByText('우측에서 저장한 합성 목적'),
  ).toBeTruthy();
  expect(screen.queryByText('공통 답변 전체 수정·AI 제안 확인')).toBeNull();
});

test('채팅 파일은 선택만으로 전송하지 않고 명시적 분석 후 대화에 요약을 표시한다', async () => {
  const user = userEvent.setup();
  renderForEditing(controls.businessCase!.id);
  const file = new File(['synthetic'], '자동분석.txt');
  await user.upload(screen.getByLabelText('문서 첨부 (선택)'), file);
  expect(controls.analyze).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: '첨부 문서 분석' }));
  await waitFor(() =>
    expect(controls.analyze).toHaveBeenCalledWith(expect.objectContaining({ file })),
  );
  const log = screen.getByRole('log', { name: '대화 내용' });
  expect(await within(log).findByText('합성 첨부문서 요약')).toBeTruthy();
  expect(screen.queryByRole('button', { name: '문서 분석 요청' })).toBeNull();
  expect(screen.queryByRole('button', { name: '제안을 미확정 답변으로 적용' })).toBeNull();
  expect(controls.save).not.toHaveBeenCalled();
});

test('분석 실패는 채팅에 남기고 재시도하면 같은 메시지에 요약을 표시한다', async () => {
  controls.analyze.mockRejectedValueOnce(new Error('합성 분석 실패'));
  const user = userEvent.setup();
  renderForEditing(controls.businessCase!.id);
  await user.upload(
    screen.getByLabelText('문서 첨부 (선택)'),
    new File(['synthetic'], '재시도.txt'),
  );
  await user.click(screen.getByRole('button', { name: '첨부 문서 분석' }));
  const retry = await screen.findByRole('button', { name: '다시 분석' });
  await user.click(retry);
  expect(await screen.findByText('합성 첨부문서 요약')).toBeTruthy();
  expect(screen.getAllByText('첨부: 재시도.txt')).toHaveLength(1);
  expect(controls.analyze).toHaveBeenCalledTimes(2);
});

test('하단 답변하기에서 직접 답변을 기존 API로 저장한다', async () => {
  const user = userEvent.setup();
  renderForEditing(controls.businessCase!.id);
  const card = screen.getByRole('form', { name: '어떤 사업인가요?' });
  const input = within(card).getByLabelText('사업 목적');
  await user.clear(input);
  await user.type(input, '카드에서 입력한 합성 목적');
  expect(screen.getAllByLabelText('사업 목적')).toHaveLength(1);
  expect(screen.queryByRole('button', { name: '답변 작성' })).toBeNull();
  await user.click(within(card).getByRole('button', { name: '답변 저장하고 다음' }));
  await waitFor(() =>
    expect(controls.save).toHaveBeenCalledWith(
      expect.objectContaining({
        answers: [
          expect.objectContaining({
            key: 'purpose',
            value: '카드에서 입력한 합성 목적',
            confirmed: true,
          }),
        ],
      }),
    ),
  );
  expect(screen.getByText(/공통 질문 2 \/ \d+/)).toBeTruthy();
  expect(screen.getByRole('tab', { name: 'AI에게 질문' })).toBeTruthy();
  expect(screen.getByRole('tab', { name: '파일 첨부' })).toBeTruthy();
});

test('선택형 질문은 질문 카드에서 보기를 눌러 저장할 수 있다', async () => {
  const user = userEvent.setup();
  renderForEditing(controls.businessCase!.id);
  await user.click(screen.getByRole('button', { name: '나중에 입력' }));
  await user.click(screen.getByRole('button', { name: '공개 자료만 다뤄요' }));
  await waitFor(() =>
    expect(controls.save).toHaveBeenCalledWith(
      expect.objectContaining({
        answers: [expect.objectContaining({ value: '공개 자료만 다뤄요', confirmed: true })],
      }),
    ),
  );
});

test.each(['예', '아니요'])(
  '예·아니요 질문은 하단 답변하기의 %s 선택을 저장한다',
  async (option) => {
    const item = controls.businessCase!.answers.find((answer) => answer.key === 'purpose')!;
    item.inputType = 'BOOLEAN';
    const user = userEvent.setup();
    renderForEditing(controls.businessCase!.id);
    expect(screen.queryByRole('form', { name: '사업 목적 바로 답변' })).toBeNull();
    expect(screen.getByRole('tab', { name: '답변하기' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    const choices = screen.getByRole('group', { name: '사업 목적 답변 선택' });
    expect(
      within(choices)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['예', '아니요', '몰라요']);
    await user.click(screen.getByRole('tab', { name: 'AI에게 질문' }));
    expect(screen.getByRole('textbox', { name: '이 항목을 AI에게 물어보기' })).toBeTruthy();
    await user.click(screen.getByRole('tab', { name: '답변하기' }));
    await user.click(screen.getByRole('button', { name: option }));
    await waitFor(() =>
      expect(controls.save).toHaveBeenCalledWith(
        expect.objectContaining({
          answers: [expect.objectContaining({ value: option, confirmed: true })],
        }),
      ),
    );
  },
);

test('몰라요는 확정 답변 저장 대신 담당자 확인 API를 호출한다', async () => {
  const item = controls.businessCase!.answers.find((answer) => answer.key === 'purpose')!;
  item.inputType = 'BOOLEAN';
  const user = userEvent.setup();
  renderForEditing(controls.businessCase!.id);
  await user.click(screen.getByRole('button', { name: '몰라요' }));
  await waitFor(() =>
    expect(controls.staffCheck).toHaveBeenCalledWith({
      fieldKey: item.key,
      expectedRevision: item.revision ?? 0,
    }),
  );
  expect(controls.save).not.toHaveBeenCalled();
  expect(screen.getByRole('status').textContent).toContain('담당자 확인 필요');
});

test('즉시 반영 성공 콜백은 다음 공통 질문으로 이동하고 마지막이면 완료 안내로 이동한다', async () => {
  const user = userEvent.setup();
  renderForEditing(controls.businessCase!.id);
  expect(screen.getByText(/공통 질문 1 \/ \d+/)).toBeTruthy();
  const input = screen.getByRole('textbox', { name: '사업 목적' });
  await user.clear(input);
  await user.type(input, '반영 전 초안');
  act(() => controls.onApplied!());
  expect(screen.getByText(/공통 질문 2 \/ \d+/)).toBeTruthy();
  const count = controls.businessCase!.answers.filter(
    (answer) => answer.ownerRole === 'APPLICANT',
  ).length;
  for (let i = 1; i < count; i++) act(() => controls.onApplied!());
  expect(screen.getByRole('button', { name: '공통 질문 다시 보기' })).toBeTruthy();
  await user.click(screen.getByRole('button', { name: '공통 질문 다시 보기' }));
  expect((screen.getByLabelText('사업 목적') as HTMLInputElement).value).not.toBe('반영 전 초안');
});

test('엔터는 답변 저장, Shift+Enter와 한글 조합 중 엔터는 저장하지 않는다', async () => {
  controls.businessCase!.answers[0].inputType = 'LONG_TEXT';
  renderForEditing(controls.businessCase!.id);
  const input = screen.getByRole('textbox', { name: '사업 목적' });
  fireEvent.change(input, { target: { value: '합성 엔터 저장 검증' } });
  fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
  fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
  fireEvent.keyDown(input, { key: 'Enter', keyCode: 229 });
  expect(controls.save).not.toHaveBeenCalled();
  fireEvent.keyDown(input, { key: 'Enter' });
  await waitFor(() => expect(controls.save).toHaveBeenCalledTimes(1));
  expect(controls.save).toHaveBeenCalledWith(
    expect.objectContaining({
      answers: [expect.objectContaining({ value: '합성 엔터 저장 검증', confirmed: true })],
    }),
  );
});

test('빈 기간은 오늘로 시작하고 탭 이동 후에도 입력을 유지한다', async () => {
  Object.assign(controls.businessCase!.answers[0], {
    inputType: 'DATE_RANGE',
    value: '',
    confirmed: false,
  });
  renderForEditing(controls.businessCase!.id);
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  expect((screen.getByLabelText('시작일') as HTMLInputElement).value).toBe(today);
  expect((screen.getByLabelText('종료일') as HTMLInputElement).value).toBe(today);
  fireEvent.change(screen.getByLabelText('시작일'), { target: { value: '2025-01-01' } });
  fireEvent.click(screen.getByLabelText('상시 운영 (종료일 없음)'));
  fireEvent.keyDown(screen.getByRole('tab', { name: '답변하기' }), { key: 'ArrowRight' });
  expect(screen.getByRole('tab', { name: '파일 첨부' }).getAttribute('aria-selected')).toBe('true');
  expect(screen.getByRole('button', { name: '파일 선택' })).toBeTruthy();
  fireEvent.keyDown(screen.getByRole('tab', { name: '파일 첨부' }), { key: 'ArrowLeft' });
  expect((screen.getByLabelText('시작일') as HTMLInputElement).value).toBe('2025-01-01');
  fireEvent.click(screen.getByRole('button', { name: '답변 저장하고 다음' }));
  await waitFor(() =>
    expect(controls.save).toHaveBeenCalledWith(
      expect.objectContaining({
        answers: [expect.objectContaining({ value: '2025-01-01 ~ 9999-12-31' })],
      }),
    ),
  );
});
