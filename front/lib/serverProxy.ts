import { DomainError } from './problem';
import { fetchLongRunningApi, upstreamTimeoutMs } from './aiProxy';

const MAX_BODY_BYTES = 12 * 1024 * 1024;
const FORWARDED_REQUEST_HEADERS = [
  'accept',
  'content-type',
  'cookie',
  'x-xsrf-token',
  'x-requested-with',
  'idempotency-key',
] as const;
const FORWARDED_RESPONSE_HEADERS = ['content-type', 'content-disposition', 'retry-after'] as const;

/** 업로드·JSON 모두 읽는 동안 상한을 적용해 무제한 버퍼링을 막는다. */
export async function readLimitedBody(request: Request): Promise<Uint8Array> {
  const upload =
    request.method === 'POST' &&
    /^\/api\/business-cases\/[^/]+\/uploaded-files$/.test(new URL(request.url).pathname);
  const maxBytes = upload ? 22 * 1024 * 1024 : MAX_BODY_BYTES;
  const sizeMessage = `전송 가능한 전체 크기는 ${upload ? 22 : 12}MB 이하입니다.`;
  const declaredSize = request.headers.get('content-length');
  if (declaredSize && Number(declaredSize) > maxBytes) {
    throw new DomainError(413, 'BODY_TOO_LARGE', sizeMessage);
  }
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const item = await reader.read();
      if (item.done) break;
      size += item.value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new DomainError(413, 'BODY_TOO_LARGE', sizeMessage);
      }
      chunks.push(item.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/** 서버 설정에 고정된 한 Back origin으로만 전달하고 클라이언트 URL은 받지 않는다. */
export async function forwardApiRequest(
  request: Request,
  apiBaseUrl: string | undefined,
  fetcher?: typeof fetch,
): Promise<Response> {
  let base: URL;
  try {
    base = new URL(apiBaseUrl ?? '');
  } catch {
    throw new DomainError(
      503,
      'API_NOT_CONFIGURED',
      '업무 서버 연결 설정이 없습니다. 운영 담당자에게 문의해 주세요.',
    );
  }
  if (
    !['http:', 'https:'].includes(base.protocol) ||
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    base.pathname !== '/'
  ) {
    throw new DomainError(503, 'API_CONFIGURATION_INVALID', '업무 서버 연결 설정을 확인해 주세요.');
  }
  const source = new URL(request.url);
  if (!source.pathname.startsWith('/api/') || source.pathname.includes('\\')) {
    throw new DomainError(400, 'INVALID_API_PATH', '허용된 API 경로가 아닙니다.');
  }
  const target = new URL(source.pathname + source.search, base.origin);
  if (target.origin !== base.origin || !target.pathname.startsWith('/api/')) {
    throw new DomainError(400, 'INVALID_API_PATH', '허용된 API 경로가 아닙니다.');
  }
  const headers = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const changesState = !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
  const body = changesState ? await readLimitedBody(request) : undefined;
  const timeoutMs = upstreamTimeoutMs(request.method, source.pathname);
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(timeoutMs)]);
  let response: Response;
  try {
    const forward = fetcher ?? (timeoutMs > 30_000 ? fetchLongRunningApi : fetch);
    response = await forward(target, {
      method: request.method,
      headers,
      body: body && body.byteLength ? (body as Uint8Array<ArrayBuffer>) : undefined,
      cache: 'no-store',
      redirect: 'manual',
      signal,
    });
  } catch (error) {
    if (request.signal.aborted) throw error;
    throw new DomainError(
      signal.aborted ? 504 : 502,
      signal.aborted ? 'API_TIMEOUT' : 'API_UNAVAILABLE',
      signal.aborted
        ? '업무 서버 응답 대기 시간이 초과되었습니다. 로그인 만료와는 다릅니다. 서버 처리가 진행됐을 수 있으니 입력을 유지하고 결과·이력을 확인한 뒤 다시 시도해 주세요.'
        : '업무 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.',
    );
  }
  if (response.status >= 300 && response.status < 400) {
    await response.body?.cancel();
    throw new DomainError(
      502,
      'API_REDIRECT_REJECTED',
      '업무 서버가 예상하지 않은 이동 응답을 보냈습니다.',
    );
  }
  const resultHeaders = new Headers({ 'Cache-Control': 'no-store' });
  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = response.headers.get(name);
    if (value) resultHeaders.set(name, value);
  }
  for (const cookie of response.headers.getSetCookie()) {
    resultHeaders.append('Set-Cookie', cookie.replace(/;\s*Domain=[^;]+/gi, ''));
  }
  const location = response.headers.get('location');
  if (location) {
    const parsed = new URL(location, base.origin);
    if (parsed.origin === base.origin && parsed.pathname.startsWith('/api/')) {
      resultHeaders.set('Location', parsed.pathname + parsed.search);
    }
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: resultHeaders,
  });
}

/** 내부 스택·주소·원문을 숨긴 ProblemDetail 응답을 만든다. */
export function problemResponse(error: unknown): Response {
  const known = error instanceof DomainError;
  const status = known ? error.status : 500;
  return Response.json(
    {
      type: 'about:blank',
      title: status === 409 ? '변경 충돌' : '요청 처리 실패',
      status,
      detail: known ? error.message : '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.',
      code: known ? error.code : 'INTERNAL_ERROR',
      requestId: crypto.randomUUID(),
    },
    {
      status,
      headers: { 'Content-Type': 'application/problem+json', 'Cache-Control': 'no-store' },
    },
  );
}
