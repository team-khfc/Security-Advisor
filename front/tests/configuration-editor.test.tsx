import { afterEach, beforeEach, expect, test, vi, type MockInstance } from 'vitest';
import { screen, within, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from './queryRender';
import { ConfigurationPage } from '@/features/configuration';
import { MockConfigurations } from '@/mocks/configurations';
import { createMockState, MOCK_MEMBERS } from '@/mocks/seed';
import * as http from '@/lib/httpClient';
import { DomainError } from '@/lib/problem';
import { validateSettings, type Settings } from '@/features/configuration/types';

const state = vi.hoisted(() => ({ role: 'ADMIN' }));
vi.mock('@/features/auth', () => ({
  useSession: () => ({ data: { member: { id: 'admin', role: state.role } }, isPending: false }),
}));
const admin = MOCK_MEMBERS.find((m) => m.role === 'ADMIN')!;
let api: MockConfigurations;
let read: MockInstance<typeof http.requestJson>;

beforeEach(() => {
  state.role = 'ADMIN';
  api = new MockConfigurations(createMockState());
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.open = true;
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.open = false;
    },
  });
  read = vi.spyOn(http, 'requestJson').mockImplementation(async (path, options) => {
    const url = new URL(path, 'http://test');
    const body = options?.body as { draft: Settings; note: string; expectedRevision: number };
    try {
      if (path === '/api/configurations/current') return api.current(admin);
      if (path === '/api/configurations/1' && options?.method === 'PUT')
        return api.save(
          admin,
          body.draft,
          body.note,
          body.expectedRevision,
          '2026-11-10T01:00:00Z',
        );
      if (path === '/api/configurations/1/comparison') return api.comparison(admin);
      if (path === '/api/configurations/1/publications')
        return api.publish(admin, body.expectedRevision, '2026-11-10T02:00:00Z');
      if (url.pathname === '/api/publications')
        return api.history(admin, Number(url.searchParams.get('page')), 10);
      if (path.endsWith('/comparison'))
        return api.publishedComparison(admin, Number(path.split('/')[3]));
      return api.publication(path.endsWith('/current') ? 'current' : Number(path.split('/')[3]));
    } catch (error) {
      if (error instanceof DomainError)
        throw new http.ApiError({
          type: 'about:blank',
          title: '검증 오류',
          detail: error.message,
          status: error.status,
          code: error.code,
        });
      throw error;
    }
  });
});
afterEach(() => vi.restoreAllMocks());

test('질문·기한 초안을 저장하고 전후 비교 후 게시하면 이력과 고정된 과거 게시본을 확인한다', async () => {
  const old = api.publication(1);
  const user = userEvent.setup();
  render(<ConfigurationPage />);
  const label = await screen.findByLabelText('질문 문구');
  await user.clear(label);
  await user.type(label, '합성 v2 질문');
  expect(
    (screen.getByRole('button', { name: '변경 검토·게시' }) as HTMLButtonElement).disabled,
  ).toBe(true);
  await user.click(screen.getByRole('tab', { name: '처리 기한·공휴일' }));
  const days = screen.getByLabelText('분야별 협의 기한 (영업일)');
  await user.clear(days);
  await user.type(days, '7');
  await user.type(screen.getByLabelText('변경 메모'), '합성 게시 검증');
  await user.click(screen.getByRole('button', { name: '설정 초안 저장' }));
  await screen.findByText(/설정 초안을 저장했습니다/);
  expect(api.publication('current').version).toBe(1);
  await user.click(screen.getByRole('button', { name: '변경 검토·게시' }));
  const dialog = await screen.findByRole('dialog', { name: '변경 검토·게시' });
  expect(within(dialog).getByText('합성 v2 질문')).toBeTruthy();
  expect(within(dialog).getByText('7')).toBeTruthy();
  await user.click(within(dialog).getByRole('button', { name: 'v2 게시' }));
  await screen.findByText(/게시본 v2을 게시했습니다/);
  expect(api.publication(1)).toEqual(old);
  expect(api.publication(2).fieldSchema.deadlinePolicy.reviewBusinessDays).toBe(7);
  await user.click(screen.getByRole('tab', { name: '설정 버전' }));
  await user.click(await screen.findByRole('button', { name: 'v2 내용 보기' }));
  const history = await screen.findByRole('dialog', { name: '게시본 내용과 변경 이력' });
  await within(history).findByText('v1 대비 변경');
});

test('잘못된 기한과 빈 질문은 저장하지 않고 수정할 수 있으며 탭은 키보드로 이동한다', async () => {
  const user = userEvent.setup();
  render(<ConfigurationPage />);
  await user.clear(await screen.findByLabelText('질문 문구'));
  screen.getByRole('tab', { name: '인터뷰 질문' }).focus();
  await user.keyboard('{ArrowRight}');
  expect(document.activeElement).toBe(screen.getByRole('tab', { name: '검토 절차' }));
  await user.click(screen.getByRole('tab', { name: '처리 기한·공휴일' }));
  await user.clear(screen.getByLabelText('분야별 협의 기한 (영업일)'));
  await user.click(screen.getByRole('button', { name: '설정 초안 저장' }));
  expect(await screen.findByText(/질문 문구를 1~200자/)).toBeTruthy();
  expect(screen.getByText(/처리 기한은 1~365/)).toBeTruthy();
  expect(read.mock.calls.some((call) => call[1]?.method === 'PUT')).toBe(false);
});

test('다른 관리자가 저장하면 충돌 입력을 보존하고 최신본 대체는 명시적으로 선택한다', async () => {
  const user = userEvent.setup();
  render(<ConfigurationPage />);
  const label = await screen.findByLabelText('질문 문구');
  await user.clear(label);
  await user.type(label, '내 입력 보존');
  const current = api.current(admin);
  current.draft.fields[0].label = '다른 관리자 질문';
  api.save(admin, current.draft, '먼저 저장', current.revision, '2026-11-10T03:00:00Z');
  await user.click(screen.getByRole('button', { name: '설정 초안 저장' }));
  await screen.findByText(/입력한 내용은 이 화면에 보존했습니다/);
  expect((screen.getByLabelText('질문 문구') as HTMLInputElement).value).toBe('내 입력 보존');
  await user.click(screen.getByRole('button', { name: '최신 초안 확인' }));
  const dialog = await screen.findByRole('dialog', { name: '최신 초안과 내 입력 확인' });
  expect(within(dialog).getByText('내 입력 보존')).toBeTruthy();
  expect(within(dialog).getByText('다른 관리자 질문')).toBeTruthy();
  fireEvent(dialog, new Event('cancel', { cancelable: true }));
  expect((screen.getByLabelText('질문 문구') as HTMLInputElement).value).toBe('내 입력 보존');
  await user.click(screen.getByRole('button', { name: '최신 초안 확인' }));
  await user.click(
    await screen.findByRole('button', { name: '내 입력을 대체하고 최신본으로 편집' }),
  );
  await waitFor(() =>
    expect((screen.getByLabelText('질문 문구') as HTMLInputElement).value).toBe('다른 관리자 질문'),
  );
});

test('휴일 검증은 존재하지 않는 날짜·윤년 오류와 범위를 거부한다', () => {
  for (const day of ['2026-02-29', '2026-02-31', '2026-13-01', '1999-12-31', '2101-01-01']) {
    const draft = api.current(admin).draft;
    draft.deadlinePolicy.holidays = [day];
    expect(validateSettings(draft, '').some((error) => error.includes('공휴일'))).toBe(true);
  }
});

test('새 질문에 중복 키를 입력해도 키 입력이 잠기지 않고 수정 후 저장할 수 있다', async () => {
  const user = userEvent.setup();
  render(<ConfigurationPage />);
  await user.click(await screen.findByRole('button', { name: '질문 추가' }));
  const key = screen.getByLabelText('저장 키');
  await user.clear(key);
  await user.type(key, api.current(admin).draft.fields[0].key);
  expect((key as HTMLInputElement).readOnly).toBe(false);
  await user.click(screen.getByRole('button', { name: '설정 초안 저장' }));
  await screen.findByText(/저장 키가 중복/);
  await user.clear(key);
  await user.type(key, 'custom.qa_note');
  await user.click(screen.getByRole('button', { name: '설정 초안 저장' }));
  await screen.findByText(/설정 초안을 저장했습니다/);
  expect(api.current(admin).draft.fields.at(-1)?.key).toBe('custom.qa_note');
});
