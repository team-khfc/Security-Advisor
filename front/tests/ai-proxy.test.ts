// @vitest-environment node
import { createServer } from 'node:http';
import { afterEach, expect, test, vi } from 'vitest';
import { fetchLongRunningApi, upstreamTimeoutMs } from '@/lib/aiProxy';
import { forwardApiRequest } from '@/lib/serverProxy';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

test('AI를 호출하는 POST만 모델 상한과 순차 호출을 수용한다', () => {
  for (const path of [
    '/api/business-cases/1/interview-turns',
    '/api/security-requests/1/ai-proposals',
    '/api/security-requests/1/final-draft-generations',
    '/api/security-requests/1/draft-generations',
    '/api/security-requests/1/inquiries',
    '/api/inquiries/1/messages',
    '/api/doc-type-suggestions',
  ]) {
    expect(upstreamTimeoutMs('POST', path)).toBe(660_000);
    expect(upstreamTimeoutMs('GET', path)).toBe(30_000);
  }
  expect(upstreamTimeoutMs('POST', '/api/analysis-jobs/1/applications')).toBe(1_320_000);
  expect(upstreamTimeoutMs('POST', '/api/llm-connection-tests')).toBe(45_000);
  for (const path of [
    '/api/business-cases/1/analysis-jobs',
    '/api/business-cases/1/interview-turns/1/applications',
    '/api/auth/login',
    '/api/security-requests/1/submissions',
    '/api/ai-proposals-extra',
  ])
    expect(upstreamTimeoutMs('POST', path)).toBe(30_000);
});

function timedFetcher() {
  vi.useFakeTimers();
  vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms) => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), ms);
    return controller.signal;
  });
  return vi.fn<typeof fetch>().mockImplementation(
    (_url, init) =>
      new Promise((resolve, reject) => {
        setTimeout(() => resolve(Response.json({ reply: '합성 지연 응답' })), 35_000);
        init?.signal?.addEventListener('abort', () => reject(new Error('cancelled')), {
          once: true,
        });
      }),
  );
}

test('AI 35초 응답을 한 번만 호출하고 정상 전달한다', async () => {
  const fetcher = timedFetcher();
  const pending = forwardApiRequest(
    new Request('http://front/api/inquiries/1/messages', { method: 'POST' }),
    'http://back',
    fetcher,
  );
  await vi.advanceTimersByTimeAsync(31_000);
  expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(false);
  await vi.advanceTimersByTimeAsync(4_000);
  expect(await (await pending).json()).toEqual({ reply: '합성 지연 응답' });
  expect(fetcher).toHaveBeenCalledTimes(1);
});

test('일반 조회는 30초 제한이고 요청 취소와 실제 401을 세션 연장으로 우회하지 않는다', async () => {
  const fetcher = timedFetcher();
  const pending = expect(
    forwardApiRequest(new Request('http://front/api/requests'), 'http://back', fetcher),
  ).rejects.toMatchObject({ status: 504, code: 'API_TIMEOUT' });
  await vi.advanceTimersByTimeAsync(30_000);
  await pending;
  vi.useRealTimers();
  vi.restoreAllMocks();
  const unauthorized = await forwardApiRequest(
    new Request('http://front/api/inquiries/1/messages', { method: 'POST' }),
    'http://back',
    vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 401 })),
  );
  expect(unauthorized.status).toBe(401);
});

test('긴 요청도 상한 이후 504이며 자동 재시도하지 않는다', async () => {
  timedFetcher();
  const fetcher = vi.fn<typeof fetch>().mockImplementation(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('deadline')));
      }),
  );
  const pending = expect(
    forwardApiRequest(
      new Request('http://front/api/doc-type-suggestions', { method: 'POST' }),
      'http://back',
      fetcher,
    ),
  ).rejects.toMatchObject({ status: 504 });
  await vi.advanceTimersByTimeAsync(660_000);
  await pending;
  expect(fetcher).toHaveBeenCalledTimes(1);
});

test('긴 요청 전송은 쿠키·CSRF·본문·상태·다중 쿠키와 취소를 보존한다', async () => {
  const server = createServer(async (req, res) => {
    if (req.url === '/slow') return;
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk);
    res.writeHead(201, {
      'Content-Type': 'application/json',
      'Set-Cookie': ['JSESSIONID=synthetic; HttpOnly', 'XSRF-TOKEN=synthetic'],
    });
    res.end(
      JSON.stringify({
        body: Buffer.concat(chunks).toString(),
        csrf: req.headers['x-xsrf-token'],
        cookie: req.headers.cookie,
      }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw Error('address');
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const response = await fetchLongRunningApi(new URL(base), {
      method: 'POST',
      headers: { Cookie: 'JSESSIONID=synthetic', 'X-XSRF-TOKEN': 'synthetic' },
      body: new TextEncoder().encode('{}'),
    });
    expect(response.status).toBe(201);
    expect(response.headers.getSetCookie()).toHaveLength(2);
    expect(await response.json()).toEqual({
      body: '{}',
      csrf: 'synthetic',
      cookie: 'JSESSIONID=synthetic',
    });
    const controller = new AbortController();
    const pending = expect(
      fetchLongRunningApi(new URL(base + '/slow'), { signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await pending;
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
