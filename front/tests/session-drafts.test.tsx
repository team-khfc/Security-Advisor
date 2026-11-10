import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from './queryRender';
import userEvent from '@testing-library/user-event';
import { ServiceShell } from '@/components/ServiceShell';
import { AnswerEditor } from '@/features/request/AnswerEditor';
import { clearInputDraft, getInputDraft } from '@/lib/inputDrafts';
import type { Session } from '@/lib/types';
import { createMockState, MOCK_MEMBERS } from '@/mocks/seed';

const controls = vi.hoisted(() => ({
  session: null as Session | null,
  logout: vi.fn(),
  replace: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/requests/draft-test',
  useRouter: () => ({ push: vi.fn(), replace: controls.replace }),
}));
vi.mock('@/features/auth', () => ({
  useSession: () => ({ data: controls.session, isSuccess: true, isPending: false, isError: false }),
  useLogout: () => ({ mutateAsync: controls.logout, isPending: false }),
  useExtendSession: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
}));
vi.mock('@/lib/queries', () => ({
  useInstallation: () => ({ data: { institutionName: '가상공공기관' }, isError: false }),
}));

const actor = MOCK_MEMBERS[0];
const draftKey = 'request:session-test:answers';
function editor() {
  return (
    <ServiceShell>
      <AnswerEditor
        draftKey={draftKey}
        actor={actor}
        answers={[createMockState().cases[0].answers[0]]}
        revision={1}
        onSave={vi.fn()}
      />
    </ServiceShell>
  );
}

beforeEach(() => {
  controls.session = {
    member: actor,
    mock: true,
    expiresAt: new Date(Date.now() + 1_800_000).toISOString(),
  };
  controls.logout.mockReset().mockResolvedValue(undefined);
  controls.replace.mockReset();
});
afterEach(() => {
  clearInputDraft(actor.id, draftKey);
  vi.restoreAllMocks();
});

test('실제 세션 만료 분기가 편집 화면을 숨겨도 동일 계정 재로그인 뒤 미저장 답변을 복원한다', async () => {
  const user = userEvent.setup();
  const { rerender } = render(editor());
  await user.clear(screen.getByLabelText(/^사업 목적(?: \(필수\))?$/));
  await user.type(
    screen.getByLabelText(/^사업 목적(?: \(필수\))?$/),
    '만료 전 작성 중인 합성 답변',
  );
  controls.session = {
    ...controls.session!,
    expiresAt: new Date(Date.now() - 60_000).toISOString(),
  };
  rerender(editor());
  expect(screen.getByText('로그인 시간이 만료되었습니다')).toBeTruthy();
  expect(screen.queryByLabelText(/^사업 목적(?: \(필수\))?$/)).toBeNull();
  expect(getInputDraft(actor.id, draftKey)).toBeDefined();
  controls.session = {
    ...controls.session,
    expiresAt: new Date(Date.now() + 1_800_000).toISOString(),
  };
  rerender(editor());
  expect((screen.getByLabelText(/^사업 목적(?: \(필수\))?$/) as HTMLTextAreaElement).value).toBe(
    '만료 전 작성 중인 합성 답변',
  );
});

test('미저장 입력이 있으면 명시적 로그아웃을 확인하고 취소 시 세션과 입력을 유지한다', async () => {
  const user = userEvent.setup();
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  render(editor());
  await user.type(screen.getByLabelText(/^사업 목적(?: \(필수\))?$/), ' 작성 중');
  await user.click(screen.getByRole('button', { name: /신청자 가/ }));
  await user.click(screen.getByRole('button', { name: '로그아웃' }));
  expect(confirm).toHaveBeenCalledWith(expect.stringContaining('저장하지 않은 입력'));
  expect(controls.logout).not.toHaveBeenCalled();
  expect(getInputDraft(actor.id, draftKey)).toBeDefined();
  confirm.mockReturnValue(true);
  await user.click(screen.getByRole('button', { name: '로그아웃' }));
  await waitFor(() => expect(controls.logout).toHaveBeenCalledTimes(1));
  expect(getInputDraft(actor.id, draftKey)).toBeDefined();
});
