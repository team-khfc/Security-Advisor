import { afterEach, expect, test, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useInstallation } from '@/lib/queries';

const clients: QueryClient[] = [];

function renderInstallation(payload: unknown, status = 200) {
  const fetcher = vi.fn().mockResolvedValue(Response.json(payload, { status }));
  vi.stubGlobal('fetch', fetcher);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  const hook = renderHook(() => useInstallation(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  return { ...hook, fetcher };
}

afterEach(() => {
  for (const client of clients.splice(0)) client.clear();
  vi.unstubAllGlobals();
});

test('Back의 name/code 응답을 실제 모드 기관 표시 정보로 변환한다', async () => {
  const { result, fetcher } = renderInstallation({ name: '합성 시험 기관', code: 'SYNTHETIC' });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data).toEqual({
    institutionName: '합성 시험 기관',
    institutionCode: 'SYNTHETIC',
    mode: 'api',
  });
  expect(fetcher).toHaveBeenCalledWith(
    '/api/installation',
    expect.objectContaining({ method: 'GET', credentials: 'same-origin' }),
  );
});

test('기존 모의 응답은 명시된 mock 모드를 유지한다', async () => {
  const payload = { institutionName: '가상 공공기관', institutionCode: 'DEMO', mode: 'mock' };
  const { result } = renderInstallation(payload);
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data).toEqual(payload);
});

test('실제 계약에 없는 mode 값으로 실제 응답을 모의 로그인 환경으로 바꾸지 않는다', async () => {
  const { result } = renderInstallation({ name: '합성 시험 기관', code: '', mode: 'mock' });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data).toEqual({
    institutionName: '합성 시험 기관',
    institutionCode: '',
    mode: 'api',
  });
});

test.each([
  null,
  {},
  { name: '합성 시험 기관' },
  { name: 123, code: 'DEMO' },
  { name: '합성 시험 기관', code: 123 },
  { name: '   ', code: 'DEMO' },
  { institutionName: '가상 공공기관', institutionCode: 'DEMO' },
])('계약에 맞지 않는 기관 응답 %j는 기본 기관 정보로 대체하지 않는다', async (payload) => {
  const { result } = renderInstallation(payload);
  await waitFor(() => expect(result.current.isError).toBe(true));
  expect(result.current.data).toBeUndefined();
});

test('업무 서버 오류는 모의 기관으로 대체하지 않고 그대로 실패로 전달한다', async () => {
  const { result } = renderInstallation(
    { status: 503, title: '연결 실패', detail: '업무 서버를 확인해 주세요.' },
    503,
  );
  await waitFor(() => expect(result.current.isError).toBe(true));
  expect(result.current.error?.message).toBe('업무 서버를 확인해 주세요.');
  expect(result.current.data).toBeUndefined();
});
