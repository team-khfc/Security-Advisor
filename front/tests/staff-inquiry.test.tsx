import { afterEach, expect, test, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StaffInquiryPanel } from '@/features/llm';
import { requestJson } from '@/lib/httpClient';
import { clearInputDraft, hasInputDrafts } from '@/lib/inputDrafts';
import { render } from './queryRender';

vi.mock('@/lib/httpClient', () => ({ requestJson: vi.fn() }));
const actor = {
  id: 'infra-test',
  username: 'infra-test',
  displayName: '인프라',
  department: '부서',
  active: true,
  role: 'INFRA' as const,
};
const inquiry = {
  inquiryId: 9,
  securityRequestId: 2,
  staffUsername: actor.username,
  field: 'INFRA',
  title: '보관된 대화',
  createdAt: '2026-11-10T03:00:00Z',
};
const question = {
  inquiryMessageId: 20,
  inquiryId: 9,
  role: 'USER',
  text: '합성 질문',
  evidence: [],
  modelReference: null,
  flagged: false,
  createdAt: inquiry.createdAt,
};
const answer = {
  ...question,
  inquiryMessageId: 21,
  role: 'ASSISTANT',
  text: '담당자가 원문을 확인해야 합니다.',
  evidence: [{ tag: 'U8', label: '합성자료.txt · 추출 문자 1–100' }],
  modelReference: 'test',
  flagged: true,
};

afterEach(() => {
  vi.resetAllMocks();
  for (const id of ['new', '9']) clearInputDraft(actor.id, 'inquiry:INFRA:2:' + id);
});

test('기존 대화와 근거를 재조회하며 질문 예시는 입력만 채운다', async () => {
  vi.mocked(requestJson).mockImplementation(async (path) =>
    path.endsWith('/inquiries') ? [inquiry] : [question, answer],
  );
  render(<StaffInquiryPanel requestId="2" actor={actor} />);
  expect(await screen.findByText(answer.text)).toBeTruthy();
  expect(screen.getByText(answer.evidence[0].label)).toBeTruthy();
  expect(screen.getByText(/일부 답변의 근거/)).toBeTruthy();
  const user = userEvent.setup();
  const example = screen.getByRole('button', { name: /현재 자료에서 네트워크/ });
  await user.click(example);
  expect((screen.getByLabelText('AI에게 질문하기') as HTMLTextAreaElement).value).toBe(
    example.textContent,
  );
  expect(vi.mocked(requestJson).mock.calls.every(([, options]) => options?.method !== 'POST')).toBe(
    true,
  );
  expect(screen.queryByRole('button', { name: /적용|확정|검토 완료/ })).toBeNull();
});

test('새 대화의 답변 실패 시 질문을 유지하고 같은 대화에서 재시도한다', async () => {
  let sent = false;
  let attempts = 0;
  vi.mocked(requestJson).mockImplementation(async (path, options) => {
    if (path.endsWith('/inquiries')) return options?.method === 'POST' ? inquiry : [];
    if (options?.method === 'POST') {
      if (++attempts === 1) throw new Error('AI 연결 실패');
      sent = true;
      return { question, answer };
    }
    return sent ? [question, answer] : [];
  });
  render(<StaffInquiryPanel requestId="2" actor={actor} />);
  const input = await screen.findByLabelText('AI에게 질문하기');
  const user = userEvent.setup();
  await user.type(input, '합성 질문');
  await user.click(screen.getByRole('button', { name: '질문 보내기' }));
  expect(await screen.findByRole('alert')).toHaveProperty(
    'textContent',
    expect.stringContaining('AI 연결 실패'),
  );
  expect((input as HTMLTextAreaElement).value).toBe('합성 질문');
  expect(document.activeElement).toBe(input);
  await user.keyboard('{Control>}{Enter}{/Control}');
  expect(await screen.findByText(answer.text)).toBeTruthy();
  await waitFor(() => expect((input as HTMLTextAreaElement).value).toBe(''));
  expect(
    vi
      .mocked(requestJson)
      .mock.calls.filter(
        ([path, options]) => path.endsWith('/inquiries') && options?.method === 'POST',
      ),
  ).toHaveLength(1);
});

test('빠른 중복 전송은 한 번만 처리하고 새 대화와 이전 입력을 분리한다', async () => {
  let resolve!: (value: unknown) => void;
  vi.mocked(requestJson).mockImplementation(async (path, options) => {
    if (path.endsWith('/inquiries')) return [inquiry];
    if (options?.method === 'POST')
      return new Promise((r) => {
        resolve = r;
      });
    return [];
  });
  render(<StaffInquiryPanel requestId="2" actor={actor} />);
  const input = await screen.findByLabelText('AI에게 질문하기');
  const user = userEvent.setup();
  await user.type(input, '중복 방지');
  await user.dblClick(screen.getByRole('button', { name: '질문 보내기' }));
  expect(
    vi.mocked(requestJson).mock.calls.filter(([, options]) => options?.method === 'POST'),
  ).toHaveLength(1);
  resolve({ question, answer });
  await waitFor(() => expect(screen.getByRole('button', { name: '질문 보내기' })).toBeTruthy());
  await user.type(input, '이전 대화 미전송 질문');
  await user.click(screen.getByRole('button', { name: '새 대화' }));
  expect((input as HTMLTextAreaElement).value).toBe('');
  await user.selectOptions(screen.getByLabelText('내 AI 대화'), '9');
  expect((input as HTMLTextAreaElement).value).toBe('이전 대화 미전송 질문');
  await user.clear(input);
  expect(hasInputDrafts(actor.id)).toBe(false);
});

test('다른 계정 응답은 표시하지 않고 목록 접근 실패를 알린다', async () => {
  vi.mocked(requestJson).mockResolvedValue([{ ...inquiry, staffUsername: 'another' }]);
  render(<StaffInquiryPanel requestId="2" actor={actor} />);
  expect(await screen.findByText(/현재 계정의 대화인지/)).toBeTruthy();
  expect(screen.queryByLabelText('AI에게 질문하기')).toBeNull();
});
