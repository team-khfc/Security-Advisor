import type { ProblemDetail } from './problem';

export interface RequestJsonOptions {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
  headers?: HeadersInit;
}

/** 오류 원문을 화면에 노출하지 않고 복구에 필요한 HTTP 의미만 전달한다. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(public readonly problem: ProblemDetail) {
    super(problem.detail);
    this.name = 'ApiError';
    this.status = problem.status;
    this.code = problem.code;
  }
}

let csrfBootstrap: Promise<void> | undefined;

function csrfToken(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const cookie = document.cookie.split('; ').find((part) => part.startsWith('XSRF-TOKEN='));
  if (!cookie) return undefined;
  try {
    return decodeURIComponent(cookie.slice('XSRF-TOKEN='.length));
  } catch {
    return undefined;
  }
}

async function initializeCsrf(signal?: AbortSignal) {
  if (typeof document === 'undefined' || csrfToken()) return;
  if (!csrfBootstrap) {
    csrfBootstrap = fetch('/api/auth/me', {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json', 'X-Requested-With': 'SecurityAdvisor' },
      signal,
    })
      .then(async (response) => {
        await response.body?.cancel();
      })
      .finally(() => {
        csrfBootstrap = undefined;
      });
  }
  await csrfBootstrap;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function problemFromResponse(response: Response): Promise<ProblemDetail> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }
  const known = isRecord(body) ? body : {};
  const fallback =
    response.status === 401
      ? '로그인이 만료되었습니다. 다시 로그인한 뒤 이어서 진행해 주세요.'
      : response.status === 409
        ? '다른 변경이 있습니다. 입력한 내용을 보존한 채 최신 내용을 확인해 주세요.'
        : '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.';
  return {
    type: typeof known.type === 'string' ? known.type : 'about:blank',
    title: typeof known.title === 'string' ? known.title : '요청 처리 실패',
    status: response.status,
    detail: typeof known.detail === 'string' ? known.detail : fallback,
    code: typeof known.code === 'string' ? known.code : `HTTP_${response.status}`,
    ...(typeof known.requestId === 'string' ? { requestId: known.requestId } : {}),
    ...(typeof known.currentRevision === 'number'
      ? { currentRevision: known.currentRevision }
      : {}),
  };
}

/** 모든 화면은 같은 출처 API만 사용하며 세션·CSRF 전달을 이 경계에 모은다. */
async function requestResponse(path: string, options: RequestJsonOptions = {}): Promise<Response> {
  if (!path.startsWith('/api/') || path.includes('\\')) {
    throw new ApiError({
      type: 'about:blank',
      title: '요청 경로 오류',
      status: 400,
      code: 'INVALID_API_PATH',
      detail: '허용된 API 경로가 아닙니다.',
    });
  }
  const method = (options.method ?? 'GET').toUpperCase();
  const changesState = !['GET', 'HEAD', 'OPTIONS'].includes(method);
  if (changesState) await initializeCsrf(options.signal);
  const headers = new Headers(options.headers);
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');
  headers.set('X-Requested-With', 'SecurityAdvisor');
  const token = csrfToken();
  if (changesState && token) headers.set('X-XSRF-TOKEN', token);
  const multipart = typeof FormData !== 'undefined' && options.body instanceof FormData;
  if (options.body !== undefined && !multipart) headers.set('Content-Type', 'application/json');
  const response = await fetch(path, {
    method,
    headers,
    credentials: 'same-origin',
    cache: 'no-store',
    signal: options.signal,
    body:
      options.body === undefined
        ? undefined
        : multipart
          ? (options.body as FormData)
          : JSON.stringify(options.body),
  });
  if (!response.ok) throw new ApiError(await problemFromResponse(response));
  return response;
}

/** JSON과 파일에 동일한 인증·CSRF·오류 처리를 적용한다. */
export async function requestJson<T>(path: string, options: RequestJsonOptions = {}): Promise<T> {
  const response = await requestResponse(path, options);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/** 서버가 생성한 PDF만 받고 로그인 페이지나 JSON을 파일로 저장하지 않는다. */
export async function requestBlob(path: string): Promise<Blob> {
  return (await requestPdf(path)).blob;
}

/** 서버 한글 파일명을 보존하되 경로·제어 문자와 다른 확장자는 쓰지 않는다. */
export async function requestPdf(path: string): Promise<{ blob: Blob; fileName?: string }> {
  const response = await requestResponse(path, { headers: { Accept: 'application/pdf' } });
  if (!response.headers.get('content-type')?.startsWith('application/pdf'))
    throw new Error('PDF 응답을 받지 못했습니다. 다시 시도해 주세요.');
  const disposition = response.headers.get('content-disposition') ?? '';
  let fileName: string | undefined;
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
  try {
    const candidate = encoded
      ? decodeURIComponent(encoded.trim())
      : /filename="([^"]+)"/i.exec(disposition)?.[1];
    if (candidate && /^[^\\/\x00-\x1f\x7f]+\.pdf$/i.test(candidate)) fileName = candidate;
  } catch {
    /* 잘못된 파일명은 문서 번호를 이용한 기본 이름으로 대체한다. */
  }
  return { blob: await response.blob(), fileName };
}
