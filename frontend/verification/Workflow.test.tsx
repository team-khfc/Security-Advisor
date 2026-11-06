// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WorkflowActions, ReturnNotice, ReviewProgress, TerminalNotice } from '@/features/review';
import { previewRequest, previewRequests } from '@/features/preview';
import { statusLabel, stepPath } from '@/lib/format';

const { mutateAsync } = vi.hoisted(() => ({ mutateAsync: vi.fn() }));
vi.mock('@/features/request', () => ({
  useRequestMutation: () => ({ mutateAsync, isPending: false, error: undefined }),
  AnswerEditor: () => null,
}));
vi.mock('@/features/auth', async () => {
  const React = await import('react');
  return {
    useSession: () => ({ user: { role: 'APPLICANT' } }),
    useMemoryDraft: (_key: string, initial: unknown) => [
      ...React.useState(initial),
      () => undefined,
    ],
  };
});
beforeEach(() => {
  mutateAsync.mockReset();
  mutateAsync.mockResolvedValue({});
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
afterEach(cleanup);

test('3단계 반환은 대상 항목과 사유가 모두 있어야 요청하며 3→1을 명시한다', async () => {
  const user = userEvent.setup();
  const request = { ...previewRequests[2], allowedActions: ['RETURN'] };
  render(<WorkflowActions procedure={request} />);
  await user.click(screen.getByRole('button', { name: '이전 단계로 반환' }));
  const dialog = screen.getByRole('dialog');
  const submit = within(dialog).getByRole<HTMLButtonElement>('button', {
    name: '2단계로 반환',
  });
  await user.click(submit);
  expect(within(dialog).getByRole('alert').textContent).toContain('처리 사유를 입력');
  expect(mutateAsync).not.toHaveBeenCalled();
  await user.selectOptions(within(dialog).getByLabelText(/돌아갈 단계/), '1');
  await user.type(
    within(dialog).getByLabelText(/반환 사유/),
    '사업 목적을 합성 서비스 범위에 맞게 보완해 주세요.',
  );
  await user.click(submit);
  expect(within(dialog).getByRole('alert').textContent).toContain('항목을 1개 이상');
  expect(mutateAsync).not.toHaveBeenCalled();
  await user.click(within(dialog).getByLabelText('사업 목적 및 배경'));
  expect(submit.disabled).toBe(false);
  await user.click(submit);
  expect(mutateAsync).toHaveBeenCalledWith({
    endpoint: '/return',
    body: {
      expectedRevision: request.revision,
      reason: '사업 목적을 합성 서비스 범위에 맞게 보완해 주세요.',
      targetStage: 1,
      fieldKeys: ['purpose'],
    },
  });
  expect(request.answers.find((answer) => answer.key === 'purpose')?.value).toBe(
    previewRequests[2].answers.find((answer) => answer.key === 'purpose')?.value,
  );
});

test('반환 요청 실패는 모달과 입력 사유를 보존하고 성공 문구를 표시하지 않는다', async () => {
  mutateAsync.mockRejectedValue(new Error('revision conflict'));
  const user = userEvent.setup();
  render(<WorkflowActions procedure={{ ...previewRequest, allowedActions: ['RETURN'] }} />);
  await user.click(screen.getByRole('button', { name: '이전 단계로 반환' }));
  const dialog = screen.getByRole('dialog');
  await user.type(within(dialog).getByLabelText(/반환 사유/), '합성 사업 설명 보완 필요');
  await user.click(within(dialog).getByLabelText('사업 목적 및 배경'));
  await user.click(within(dialog).getByRole('button', { name: '1단계로 반환' }));
  expect(screen.getByRole('dialog')).toBeTruthy();
  expect(
    within(dialog).getByRole<HTMLTextAreaElement>('textbox', { name: /반환 사유/ }).value,
  ).toBe('합성 사업 설명 보완 필요');
  expect(screen.queryByText('이전 단계로 반환를 기록했습니다.')).toBeNull();
});

test('인프라 할당 완료와 두 분야 협의 상태를 독립적으로 표시한다', () => {
  render(<ReviewProgress procedure={previewRequest} />);
  expect(screen.getByText('할당 완료')).toBeTruthy();
  expect(screen.getByText('할당 완료').className).toContain('blue');
  expect(screen.getByText('할당 완료').className).not.toContain('green');
  expect(screen.getByText('정보보안 협의')).toBeTruthy();
  expect(screen.getByText('대기')).toBeTruthy();
  expect(screen.getByText('재확인 필요')).toBeTruthy();
});

test('반환 항목은 사유·단계·연관 표시를 포함하고 종료 상태는 읽기전용으로 안내한다', () => {
  const { unmount } = render(<ReturnNotice procedure={previewRequests[4]} />);
  expect(screen.getByText('3 → 2단계')).toBeTruthy();
  expect(screen.getByText('연관 항목')).toBeTruthy();
  expect(screen.getByRole('link', { name: '통신 규칙 확인' }).getAttribute('href')).toMatch(
    /\/infra#field-network$/,
  );
  unmount();
  render(<TerminalNotice procedure={previewRequests[7]} />);
  expect(screen.getByText('종결(반려)된 신청')).toBeTruthy();
  expect(screen.getByText(/업무 내용을 수정할 수 없습니다/)).toBeTruthy();
  expect(statusLabel(previewRequests[7])).toBe('종결(반려)');
  expect(stepPath(previewRequests[8], 'APPLICANT')).toMatch(/\/receipt$/);
});

test('종결·철회 신청에는 잘못 남은 allowedActions가 있어도 편집 행동을 표시하지 않는다', () => {
  const { rerender } = render(
    <WorkflowActions
      procedure={{
        ...previewRequests[7],
        allowedActions: ['RETURN', 'CLOSE', 'WITHDRAW', 'ALLOCATE'],
      }}
    />,
  );
  expect(screen.queryByRole('button')).toBeNull();
  rerender(
    <WorkflowActions
      procedure={{ ...previewRequests[8], allowedActions: ['WITHDRAW', 'RETURN'] }}
    />,
  );
  expect(screen.queryByRole('button')).toBeNull();
  expect(screen.getByText(/종료된 신청은 읽기 전용/)).toBeTruthy();
});
