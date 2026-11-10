import { expect, test, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CollectedAnswerEditor } from '@/features/request/CollectedAnswerEditor';
import { createMockState } from '@/mocks/seed';

const answer = createMockState().cases[0].answers.find((item) => item.ownerRole === 'APPLICANT')!;

test('저장 중 캐시 갱신은 충돌로 알리지 않으며 실패 뒤 실제 충돌은 보여 준다', async () => {
  const user = userEvent.setup();
  let fail!: (error: Error) => void;
  const props = {
    answers: [answer],
    revision: 7,
    disabled: false,
    onSave: vi.fn(
      () =>
        new Promise<void>((_, reject) => {
          fail = reject;
        }),
    ),
    onEditingChange: vi.fn(),
  };
  const view = render(<CollectedAnswerEditor {...props} />);
  await user.click(screen.getByRole('button', { name: `${answer.label} 수정` }));
  await user.clear(screen.getByLabelText(answer.label));
  await user.type(screen.getByLabelText(answer.label), '합성 변경 답변');
  await user.click(screen.getByRole('button', { name: '확인하고 저장' }));
  view.rerender(
    <CollectedAnswerEditor
      {...props}
      revision={8}
      answers={[{ ...answer, revision: 9, value: '서버 변경 답변' }]}
    />,
  );
  expect(screen.queryByText(/서버 내용이 변경되었습니다/)).toBeNull();
  expect(screen.getByRole('button', { name: '저장 중…' })).toBeTruthy();
  await act(async () => fail(new Error('충돌 오류')));
  expect(screen.getByText(/서버 내용이 변경되었습니다/)).toBeTruthy();
  expect((screen.getByLabelText(answer.label) as HTMLTextAreaElement).value).toBe('합성 변경 답변');
});

test('한 항목을 명시적으로 확인 저장하며 답변 수정본과 확인 의사를 전달한다', async () => {
  const user = userEvent.setup();
  const save = vi.fn().mockResolvedValue(undefined);
  const editing = vi.fn();
  render(
    <CollectedAnswerEditor
      answers={[answer]}
      revision={7}
      disabled={false}
      onSave={save}
      onEditingChange={editing}
    />,
  );
  await user.click(screen.getByRole('button', { name: `${answer.label} 수정` }));
  await user.clear(screen.getByLabelText(answer.label));
  await user.type(screen.getByLabelText(answer.label), '변경한 합성 정보');
  expect(save).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: '확인하고 저장' }));
  expect(save).toHaveBeenCalledWith(
    7,
    expect.objectContaining({
      key: answer.key,
      value: '변경한 합성 정보',
      confirmed: true,
      expectedRevision: answer.revision,
    }),
  );
  expect(editing).toHaveBeenLastCalledWith(false);
  expect(screen.getByRole('status').textContent).toContain('다음 질문·추천');
});

test('저장 오류와 서버 갱신에도 입력을 보존하고 최신 수정본 확인 전에는 다시 저장하지 않는다', async () => {
  const user = userEvent.setup();
  const save = vi.fn().mockRejectedValue(new Error('충돌 오류'));
  const props = {
    answers: [answer],
    revision: 7,
    disabled: false,
    onSave: save,
    onEditingChange: vi.fn(),
  };
  const view = render(<CollectedAnswerEditor {...props} />);
  await user.click(screen.getByRole('button', { name: `${answer.label} 수정` }));
  await user.clear(screen.getByLabelText(answer.label));
  await user.type(screen.getByLabelText(answer.label), '보존할 합성 정보');
  await user.click(screen.getByRole('button', { name: '확인하고 저장' }));
  expect((screen.getByLabelText(answer.label) as HTMLTextAreaElement).value).toBe(
    '보존할 합성 정보',
  );
  view.rerender(
    <CollectedAnswerEditor
      {...props}
      revision={8}
      answers={[{ ...answer, value: '서버 최신 값', revision: 9 }]}
    />,
  );
  expect(
    (screen.getByRole('button', { name: '확인하고 저장' }) as HTMLButtonElement).disabled,
  ).toBe(true);
  await user.click(
    screen.getByRole('button', { name: '내 입력을 유지하고 최신 값 기준으로 저장 준비' }),
  );
  await user.click(screen.getByRole('button', { name: '확인하고 저장' }));
  expect(save).toHaveBeenLastCalledWith(
    8,
    expect.objectContaining({ value: '보존할 합성 정보', expectedRevision: 9 }),
  );
});
