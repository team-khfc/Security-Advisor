import { render } from './queryRender';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import * as http from '@/lib/httpClient';
import { FinalDraftPanel } from '@/features/request/FinalDraftPanel';
import type { FinalDraft } from '@/features/request/useFinalDraft';
import { createMockState } from '@/mocks/seed';

afterEach(() => vi.restoreAllMocks());
const draft: FinalDraft = {
  finalDraftId: 21,
  securityRequestId: 42,
  text: '합성 AI 보고서',
  valueSource: 'AI_INFERRED',
  modelReference: 'fake/offline',
  confirmed: false,
  confirmedBy: null,
  confirmedAt: null,
  stale: false,
  revision: 0,
};
function props(actorId: string, current: FinalDraft | null = draft) {
  return {
    request: { ...createMockState().requests[0], id: '42', revision: 3 },
    actorId,
    draft: current,
    onDirtyChange: vi.fn(),
  };
}

test('AI 초안을 수정하면 미저장 표시와 제출 잠금이 생기고 명시적 확인 요청에 수정 내용을 보낸다', async () => {
  const json = vi
    .spyOn(http, 'requestJson')
    .mockResolvedValue({ ...draft, text: '직접 수정한 합성 내용', confirmed: true });
  const input = props('draft-editor');
  render(<FinalDraftPanel {...input} />);
  expect(screen.getByText('미확정')).toBeTruthy();
  const user = userEvent.setup();
  await user.clear(screen.getByLabelText('최종 보고서 내용'));
  await user.type(screen.getByLabelText('최종 보고서 내용'), '직접 수정한 합성 내용');
  expect(input.onDirtyChange).toHaveBeenLastCalledWith(true);
  expect(json).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: '내용 확인·저장' }));
  await waitFor(() =>
    expect(json).toHaveBeenCalledWith('/api/final-drafts/21/confirmation', {
      method: 'PUT',
      body: { expectedRevision: 0, text: '직접 수정한 합성 내용' },
    }),
  );
});

test('확인 실패 시 편집 내용을 유지하며 재시도 안내를 표시한다', async () => {
  vi.spyOn(http, 'requestJson').mockRejectedValue(new Error('원본 답변이 변경되었습니다.'));
  render(<FinalDraftPanel {...props('draft-failure')} />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('최종 보고서 내용'), ' 보충');
  await user.click(screen.getByRole('button', { name: '내용 확인·저장' }));
  await screen.findByText(/원본 답변이 변경되었습니다/);
  expect((screen.getByLabelText('최종 보고서 내용') as HTMLTextAreaElement).value).toBe(
    '합성 AI 보고서 보충',
  );
});

test('AI 없이 직접 작성해도 초안 생성과 명시적 확인을 차례로 요청한다', async () => {
  const json = vi
    .spyOn(http, 'requestJson')
    .mockResolvedValue({ ...draft, valueSource: 'USER_ANSWER' });
  render(<FinalDraftPanel {...props('draft-manual', null)} />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('최종 보고서 내용'), '직접 작성한 합성 보고서');
  await user.click(screen.getByRole('button', { name: '내용 확인·저장' }));
  await waitFor(() => expect(json).toHaveBeenCalledTimes(2));
  expect(json.mock.calls.map(([path]) => path)).toEqual([
    '/api/security-requests/42/final-drafts',
    '/api/final-drafts/21/confirmation',
  ]);
});

test('키보드로 AI 생성을 마치면 편집 칸으로 이동하고 확인 후에는 제출 안내에서 이어간다', async () => {
  const json = vi.spyOn(http, 'requestJson').mockResolvedValue(draft);
  const input = props('draft-keyboard');
  const view = render(<FinalDraftPanel {...input} />);
  const user = userEvent.setup();
  screen.getByRole('button', { name: 'AI 초안 다시 작성' }).focus();
  await user.keyboard('{Enter}');
  await waitFor(() =>
    expect(document.activeElement).toBe(screen.getByLabelText('최종 보고서 내용')),
  );
  await user.tab();
  expect(document.activeElement).toBe(screen.getByRole('button', { name: '내용 확인·저장' }));
  json.mockResolvedValue({ ...draft, confirmed: true });
  await user.keyboard('{Enter}');
  view.rerender(<FinalDraftPanel {...input} draft={{ ...draft, confirmed: true }} />);
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('status')));
  await user.tab();
  expect(document.activeElement).toBe(
    screen.getByRole('link', { name: '최종 제출 확인으로 이동' }),
  );
});

test('AI를 기다리는 동안 다른 작업으로 이동했다면 완료 시 초점을 빼앗지 않는다', async () => {
  let complete!: (value: FinalDraft) => void;
  vi.spyOn(http, 'requestJson').mockImplementation(
    () =>
      new Promise<FinalDraft>((resolve) => {
        complete = resolve;
      }),
  );
  render(
    <>
      <FinalDraftPanel {...props('draft-background')} />
      <button>다른 작업</button>
    </>,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'AI 초안 다시 작성' }));
  await user.click(screen.getByRole('button', { name: '다른 작업' }));
  complete(draft);
  await screen.findByText('초안을 작성했습니다. 내용을 읽고 수정한 뒤 확인해 주세요.');
  expect(document.activeElement).toBe(screen.getByRole('button', { name: '다른 작업' }));
});

test('수정을 되돌려 사라지는 버튼 대신 편집 칸에 초점을 유지한다', async () => {
  render(<FinalDraftPanel {...props('draft-revert')} />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('최종 보고서 내용'), ' 수정');
  await user.click(screen.getByRole('button', { name: '저장된 내용으로 되돌리기' }));
  expect(document.activeElement).toBe(screen.getByLabelText('최종 보고서 내용'));
  expect((document.activeElement as HTMLTextAreaElement).value).toBe(draft.text);
});
