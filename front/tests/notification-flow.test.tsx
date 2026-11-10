import { afterEach, expect, test, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from './queryRender';
import { ActivityPage } from '@/features/notification/ActivityList';
import { NotificationBell } from '@/features/notification/NotificationBell';
import * as http from '@/lib/httpClient';

const state = vi.hoisted(() => ({ member: { id: 'synthetic-old', role: 'INFRA' }, push: vi.fn() }));
vi.mock('@/features/auth', () => ({ useSession: () => ({ data: { member: state.member } }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: state.push }) }));
afterEach(() => {
  vi.restoreAllMocks();
  state.member = { id: 'synthetic-old', role: 'INFRA' };
  state.push.mockReset();
});
const entry = (id: number, readAt: string | null = null) => ({
  notificationId: id,
  kind: 'REASSIGNED',
  title: `합성 업무 인계 ${id}`,
  link: `/requests/${id}`,
  readAt,
  createdAt: '2026-11-10T09:00:00Z',
});

test('알림 페이지 이동·안 읽음 필터·읽음 표시가 연결되고 업무 열기는 읽음 성공 뒤에만 이동한다', async () => {
  let read = false;
  const request = vi.spyOn(http, 'requestJson').mockImplementation(async (path, options) => {
    const url = new URL(String(path), 'http://local.test');
    if (options?.method === 'PATCH') {
      read = true;
      return entry(21, '2026-11-10T10:00:00Z');
    }
    const page = Number(url.searchParams.get('page') ?? 0);
    return {
      content: [entry(page === 0 ? 1 : 21, read ? '2026-11-10T10:00:00Z' : null)],
      page,
      size: 20,
      totalElements: 21,
    };
  });
  const user = userEvent.setup();
  render(<ActivityPage kind="notifications" />);
  await screen.findByText('합성 업무 인계 1');
  await user.click(screen.getByRole('button', { name: '다음' }));
  await screen.findByText('합성 업무 인계 21');
  await user.click(screen.getByRole('button', { name: '합성 업무 인계 21 읽음으로 표시' }));
  await screen.findByText('읽음');
  expect(state.push).not.toHaveBeenCalled();
  await user.click(screen.getByRole('link', { name: '합성 업무 인계 21' }));
  await waitFor(() => expect(state.push).toHaveBeenCalledWith('/requests/21'));
  await user.click(screen.getByLabelText('안 읽은 알림만'));
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith(
      expect.stringContaining('page=0&size=20&unreadOnly=true'),
      expect.anything(),
    ),
  );
});

test('읽음 권한 오류가 나면 업무로 이동하지 않고 오류를 안내한다', async () => {
  vi.spyOn(http, 'requestJson').mockImplementation(async (_path, options) => {
    if (options?.method === 'PATCH') throw new Error('접근할 수 없습니다');
    return { content: [entry(1)], page: 0, size: 20, totalElements: 1 };
  });
  const user = userEvent.setup();
  render(<ActivityPage kind="notifications" />);
  await user.click(await screen.findByRole('link', { name: '합성 업무 인계 1' }));
  await screen.findByText(/알림을 열거나 읽음으로 표시하지 못했습니다/);
  expect(state.push).not.toHaveBeenCalled();
});

test('알림 패널은 제목으로 초점을 옮기고 Escape로 닫은 뒤 열기 버튼으로 돌아온다', async () => {
  vi.spyOn(http, 'requestJson').mockImplementation(async (path) =>
    String(path).includes('unread-count')
      ? { unread: 2 }
      : { content: [entry(1)], page: 0, size: 5, totalElements: 2 },
  );
  const user = userEvent.setup();
  render(<NotificationBell />);
  const button = await screen.findByRole('button', { name: '알림, 안 읽은 알림 2건' });
  await user.click(button);
  expect(document.activeElement).toBe(screen.getByRole('heading', { name: '알림·협의 소식' }));
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('heading', { name: '알림·협의 소식' })).toBeNull();
  expect(document.activeElement).toBe(button);
});

test('계정·역할이 바뀌면 이전 알림 캐시가 보이지 않고 처리할 일에는 읽음 버튼이 없다', async () => {
  vi.spyOn(http, 'requestJson').mockImplementation(async (path) =>
    String(path).includes('/todos')
      ? {
          content: [
            {
              key: 'REVIEW:9',
              kind: 'REVIEW',
              securityRequestId: 9,
              title: '신청 #9 · 담당자 협의',
              link: '/requests/9',
            },
          ],
          page: 0,
          size: 20,
          totalElements: 1,
        }
      : {
          content: state.member.id === 'synthetic-old' ? [entry(1)] : [],
          page: 0,
          size: 20,
          totalElements: state.member.id === 'synthetic-old' ? 1 : 0,
        },
  );
  const view = render(<ActivityPage kind="notifications" />);
  await screen.findByText('합성 업무 인계 1');
  state.member = { id: 'synthetic-new', role: 'SECURITY' };
  view.rerender(<ActivityPage kind="notifications" />);
  expect(screen.queryByText('합성 업무 인계 1')).toBeNull();
  await screen.findByText('알림이 없습니다.');
  view.rerender(<ActivityPage kind="todos" />);
  await screen.findByText('신청 #9 · 담당자 협의');
  expect(screen.queryByRole('button', { name: /읽음/ })).toBeNull();
});
