import { afterEach, expect, test, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  InterviewAssistance,
  InterviewComposer,
  InterviewTurnMessage,
} from '@/features/request/InterviewAssistance';
import { useInterviewAssistance } from '@/features/request/useInterviewAssistance';
import { requestJson } from '@/lib/httpClient';
import { clearInputDraft } from '@/lib/inputDrafts';
import { createMockState } from '@/mocks/seed';

vi.mock('@/lib/httpClient', () => ({ requestJson: vi.fn() }));
const businessCase = { ...createMockState().cases[0], id: '601', publicationId: 42 };
const question = {
  ...businessCase.answers[0],
  key: 'project.summary',
  value: '',
  confirmed: false,
  revision: undefined,
};
const response = {
  interviewTurnId: 1,
  businessCaseId: 601,
  fieldKey: question.key,
  mode: 'SUGGEST',
  question: '합성 질문',
  reply: '사업 개요를 참고한 합성 설명',
  proposedValue: '합성 추천답변',
  evidence: [{ tag: 'B', label: '사용자가 작성한 사업 개요' }],
  basedRevision: businessCase.revision,
  answerRevision: null,
  modelReference: 'fake/offline',
  flagged: false,
  applied: false,
  createdAt: '2026-11-10T00:00:00Z',
};
function AssistanceHarness(props: Parameters<typeof useInterviewAssistance>[0]) {
  const state = useInterviewAssistance(props);
  return (
    <>
      <section aria-label="인터뷰 대화">
        <InterviewAssistance state={state} question={question} />
        {state.history.map((turn) => (
          <InterviewTurnMessage
            key={turn.interviewTurnId}
            turn={turn}
            question={question}
            active
            state={state}
            onSelect={() => {}}
          />
        ))}
        {state.ask.error && <p role="alert">{state.ask.error.message}</p>}
      </section>
      <form
        aria-label="인터뷰 입력"
        onSubmit={(event) => {
          event.preventDefault();
          void state.send('ASK');
        }}
      >
        <InterviewComposer state={state} />
      </form>
    </>
  );
}
function setup(answerText = '') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const onApplied = vi.fn();
  const props = {
    businessCase: { ...businessCase, answers: [question] },
    question,
    actorId: 'test',
    answerText,
    turns: [],
    disabled: false,
    onApplied,
  };
  const view = render(
    <QueryClientProvider client={client}>
      <AssistanceHarness {...props} />
    </QueryClientProvider>,
  );
  return {
    onApplied,
    rerender: (text: string) =>
      view.rerender(
        <QueryClientProvider client={client}>
          <AssistanceHarness {...props} answerText={text} />
        </QueryClientProvider>,
      ),
  };
}
afterEach(() => {
  vi.mocked(requestJson).mockReset();
  clearInputDraft('test', `case:601:question:${question.key}`);
});

test('정보 부족으로 후보가 없는 추천 응답은 추가 정보 필요로 표시하고 적용을 제공하지 않는다', async () => {
  vi.mocked(requestJson).mockResolvedValueOnce({
    ...response,
    proposedValue: null,
    reply: '대상 이용자를 알려 주세요.',
  });
  const { onApplied } = setup();
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'AI 추천답변 받기' }));
  await screen.findByText('대상 이용자를 알려 주세요.');
  expect(screen.getByText(/추가 정보 필요/)).toBeTruthy();
  expect(screen.queryByText(/추천답변 미확정/)).toBeNull();
  expect(screen.queryByRole('button', { name: '즉시 반영' })).toBeNull();
  expect(onApplied).not.toHaveBeenCalled();
});

test('추천은 별도 미리보기이며 명시적 적용 전까지 답변을 저장하지 않는다', async () => {
  vi.mocked(requestJson)
    .mockResolvedValueOnce(response)
    .mockResolvedValueOnce({ ...response, applied: true });
  const { onApplied } = setup('작성 중인 원문');
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'AI 추천답변 받기' }));
  await screen.findByText('합성 추천답변');
  expect(
    within(screen.getByRole('form', { name: '인터뷰 입력' })).queryByText('합성 추천답변'),
  ).toBeNull();
  expect(
    within(screen.getByRole('region', { name: '인터뷰 대화' })).getAllByText(response.reply),
  ).toHaveLength(1);
  expect(requestJson).toHaveBeenCalledTimes(1);
  expect(onApplied).not.toHaveBeenCalled();
  expect(requestJson).toHaveBeenLastCalledWith(
    '/api/business-cases/601/interview-turns',
    expect.objectContaining({
      body: expect.objectContaining({ mode: 'SUGGEST', draft: '작성 중인 원문' }),
    }),
  );
  await user.click(screen.getByRole('button', { name: '즉시 반영' }));
  await screen.findByText(/미확정 답변으로 적용했습니다/);
  expect(onApplied).toHaveBeenCalledOnce();
  expect(requestJson).toHaveBeenLastCalledWith(
    '/api/business-cases/601/interview-turns/1/applications',
    expect.objectContaining({ method: 'POST' }),
  );
});
test('자유 질문은 공식 답변이나 다음 질문으로 넘어가는 행위를 만들지 않는다', async () => {
  vi.mocked(requestJson).mockResolvedValueOnce({ ...response, mode: 'ASK', proposedValue: null });
  const { onApplied } = setup();
  const user = userEvent.setup();
  await user.click(screen.getByRole('tab', { name: 'AI에게 질문' }));
  await user.type(
    screen.getByRole('textbox', { name: '이 항목을 AI에게 물어보기' }),
    '개인정보란 무엇인가요?',
  );
  await user.click(screen.getByRole('button', { name: '질문 보내기' }));
  await screen.findByText(response.reply);
  expect(requestJson).toHaveBeenCalledOnce();
  expect(requestJson).toHaveBeenLastCalledWith(
    expect.any(String),
    expect.objectContaining({
      body: expect.objectContaining({ mode: 'SUGGEST', text: '개인정보란 무엇인가요?' }),
    }),
  );
  expect(screen.queryByRole('button', { name: '즉시 반영' })).toBeNull();
  expect(onApplied).not.toHaveBeenCalled();
});
test('실패한 자유 질문은 다시 보낼 수 있도록 원문을 유지한다', async () => {
  vi.mocked(requestJson).mockRejectedValueOnce(new Error('합성 AI 연결 오류'));
  setup();
  const user = userEvent.setup();
  await user.click(screen.getByRole('tab', { name: 'AI에게 질문' }));
  const prompt = screen.getByRole('textbox', { name: '이 항목을 AI에게 물어보기' });
  await user.type(prompt, '다시 보낼 질문');
  await user.click(screen.getByRole('button', { name: '질문 보내기' }));
  await screen.findByText(/합성 AI 연결 오류/);
  expect((prompt as HTMLTextAreaElement).value).toBe('다시 보낼 질문');
});
test('AI 응답을 기다리는 동안 직접 답변이 바뀌면 늦게 도착한 제안을 적용하지 않는다', async () => {
  let finish: (value: unknown) => void = () => {};
  vi.mocked(requestJson).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const { rerender, onApplied } = setup('이전 초안');
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'AI 추천답변 받기' }));
  rerender('새로 작성한 초안');
  await act(async () => finish(response));
  await screen.findByText('합성 추천답변');
  expect((screen.getByRole('button', { name: '즉시 반영' }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  expect(onApplied).not.toHaveBeenCalled();
});

test('AI 질문 영역에는 직접 답변 전환 없이 질문 초안을 유지한다', async () => {
  setup('보존할 직접 답변');
  const user = userEvent.setup();
  const card = screen.getByRole('form', { name: '인터뷰 입력' });
  expect(within(card).getAllByRole('textbox')).toHaveLength(1);
  await user.click(screen.getByRole('tab', { name: 'AI에게 질문' }));
  await user.type(
    screen.getByRole('textbox', { name: '이 항목을 AI에게 물어보기' }),
    '보존할 질문',
  );
  expect(screen.queryByRole('button', { name: '답변 작성' })).toBeNull();
  await user.click(screen.getByRole('tab', { name: 'AI에게 질문' }));
  expect(
    (screen.getByRole('textbox', { name: '이 항목을 AI에게 물어보기' }) as HTMLTextAreaElement)
      .value,
  ).toBe('보존할 질문');
  expect(within(card).getAllByRole('textbox')).toHaveLength(1);
  expect(requestJson).not.toHaveBeenCalled();
});

test('AI 질문도 사용자 질문을 후보 생성 계약으로 전달하고 명시적 즉시 반영만 저장한다', async () => {
  vi.mocked(requestJson)
    .mockResolvedValueOnce(response)
    .mockResolvedValueOnce({ ...response, applied: true });
  const { onApplied } = setup('현재 작성 초안');
  const user = userEvent.setup();
  await user.type(
    screen.getByRole('textbox', { name: '이 항목을 AI에게 물어보기' }),
    '첨부 문서를 참고해서 이 항목을 작성해 주세요.',
  );
  await user.click(screen.getByRole('button', { name: '질문 보내기' }));
  await screen.findByText('합성 추천답변');
  expect(requestJson).toHaveBeenCalledWith(
    '/api/business-cases/601/interview-turns',
    expect.objectContaining({
      body: expect.objectContaining({
        fieldKey: question.key,
        mode: 'SUGGEST',
        text: '첨부 문서를 참고해서 이 항목을 작성해 주세요.',
        draft: '현재 작성 초안',
      }),
    }),
  );
  expect(onApplied).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: '즉시 반영' }));
  await waitFor(() => expect(onApplied).toHaveBeenCalledOnce());
  expect(requestJson).toHaveBeenLastCalledWith(
    '/api/business-cases/601/interview-turns/1/applications',
    expect.objectContaining({ method: 'POST' }),
  );
});

test('즉시 반영 API가 실패하면 다음 질문 이동 콜백을 실행하지 않는다', async () => {
  vi.mocked(requestJson)
    .mockResolvedValueOnce(response)
    .mockRejectedValueOnce(new Error('반영 실패'));
  const { onApplied } = setup();
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'AI 추천답변 받기' }));
  await screen.findByText('합성 추천답변');
  await user.click(screen.getByRole('button', { name: '즉시 반영' }));
  await waitFor(() => expect(requestJson).toHaveBeenCalledTimes(2));
  await waitFor(() =>
    expect((screen.getByRole('button', { name: '즉시 반영' }) as HTMLButtonElement).disabled).toBe(
      false,
    ),
  );
  expect(onApplied).not.toHaveBeenCalled();
});
