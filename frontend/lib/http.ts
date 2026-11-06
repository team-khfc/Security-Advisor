import { z } from 'zod';

const problemSchema = z.object({
  detail: z.string().optional(),
  title: z.string().optional(),
  code: z.string().optional(),
  requestId: z.string().optional(),
  latestRevision: z.number().optional(),
});
const csrfSchema = z.object({ token: z.string(), headerName: z.string() });
let csrf: z.infer<typeof csrfSchema> | undefined;
let identityGeneration = 0;

/** 서버 오류의 수정본·문의 번호를 잃지 않아 충돌 복구와 사용자 문의를 지원한다. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
    public readonly requestId?: string,
    public readonly latestRevision?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** 계정 전환 전에 시작한 요청을 응답 시 폐기하고 이전 CSRF 토큰을 재사용하지 않는다. */
export function invalidateIdentity(): void {
  identityGeneration += 1;
  csrf = undefined;
}
/** 새 세션 인증 시 서버가 발급한 CSRF 토큰을 다시 받도록 한다. */
export function resetCsrf(): void {
  csrf = undefined;
}

async function checkedResponse(path: string, init: RequestInit = {}): Promise<Response> {
  const generation = identityGeneration;
  const headers = new Headers(init.headers);
  const method = init.method?.toUpperCase() ?? 'GET';
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    if (!csrf) csrf = await requestJson('/auth/csrf', csrfSchema);
    headers.set(csrf.headerName, csrf.token);
  }
  if (typeof init.body === 'string' && !headers.has('Content-Type'))
    headers.set('Content-Type', 'application/json');
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...init,
      headers,
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError(
      0,
      '서버에 연결하지 못했습니다. 입력 내용을 유지했으니 연결을 확인하고 다시 시도해 주세요.',
    );
  }
  if (generation !== identityGeneration)
    throw new DOMException('변경된 계정의 이전 응답을 폐기했습니다.', 'AbortError');
  if (!response.ok) {
    const unknownBody: unknown = await response.json().catch(() => null);
    const parsed = problemSchema.safeParse(unknownBody);
    const details = parsed.success ? parsed.data : undefined;
    if (response.status === 401 && !path.startsWith('/auth/'))
      window.dispatchEvent(new Event('securityadvisor:session-expired'));
    if (response.status === 403) csrf = undefined;
    throw new ApiError(
      response.status,
      details?.detail ?? details?.title ?? '요청을 처리하지 못했습니다. 다시 확인해 주세요.',
      details?.code,
      details?.requestId,
      details?.latestRevision,
    );
  }
  return response;
}

/** 단일 HTTP 경계에서 CSRF·세션·응답 계약을 검증한다.
 * @throws ApiError 서버 거절·연결 실패·계약 불일치 시
 * @throws DOMException 취소되거나 이전 계정의 응답일 때 */
export async function requestJson<T>(
  path: string,
  schema: z.ZodType<T>,
  init?: RequestInit,
): Promise<T> {
  const response = await checkedResponse(path, init);
  const value: unknown = response.status === 204 ? undefined : await response.json();
  const result = schema.safeParse(value);
  if (!result.success)
    throw new ApiError(
      502,
      '서버 응답 형식이 일치하지 않습니다. 저장 여부를 담당자에게 확인해 주세요.',
      'INVALID_RESPONSE',
    );
  return result.data;
}

/** 권한이 확인된 서버 문서를 파일로 내려받고 화면 HTML에 직접 삽입하지 않는다.
 * @throws ApiError 서버 권한 검사 또는 다운로드가 실패했을 때 */
export async function downloadDocument(id: string, version?: number): Promise<void> {
  const response = await checkedResponse(
    `/security-requests/${encodeURIComponent(id)}/document${version ? `?version=${version}` : ''}`,
  );
  const file = await response.blob();
  const url = URL.createObjectURL(file);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `SecurityAdvisor-${id}${version ? `-submission-${version}` : ''}.html`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
