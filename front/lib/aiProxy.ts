import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { Readable } from 'node:stream';

/** 모델 설정 상한 600초와 처리 여유를 보장한다. 분석 반영은 서류 2종을 순차 호출한다. */
export function upstreamTimeoutMs(method: string, pathname: string): number {
  if (method !== 'POST') return 30_000;
  if (/^\/api\/analysis-jobs\/\d+\/applications\/?$/.test(pathname)) return 1_320_000;
  if (pathname === '/api/llm-connection-tests') return 45_000;
  if (
    /^\/api\/business-cases\/\d+\/interview-turns\/?$/.test(pathname) ||
    /^\/api\/security-requests\/\d+\/(ai-proposals|consultation-summaries|infrastructure-proposals|final-draft-generations|draft-generations|inquiries)\/?$/.test(
      pathname,
    ) ||
    /^\/api\/inquiries\/\d+\/messages\/?$/.test(pathname) ||
    pathname === '/api/doc-type-suggestions'
  )
    return 660_000;
  return 30_000;
}

/** 긴 AI 요청은 fetch 내부의 별도 헤더 대기 제한 없이 명시한 AbortSignal로 제한한다. 재시도·이동은 하지 않는다. */
export function fetchLongRunningApi(target: URL, init: RequestInit): Promise<Response> {
  return new Promise((resolve, reject) => {
    const send = target.protocol === 'https:' ? httpsRequest : httpRequest;
    const upstream = send(
      target,
      {
        method: init.method,
        headers: Object.fromEntries(new Headers(init.headers)),
        signal: init.signal ?? undefined,
      },
      (incoming) => {
        const headers = new Headers();
        for (let i = 0; i < incoming.rawHeaders.length; i += 2) {
          headers.append(incoming.rawHeaders[i], incoming.rawHeaders[i + 1]);
        }
        const status = incoming.statusCode ?? 502;
        const noBody = [204, 205, 304].includes(status);
        if (noBody) incoming.resume();
        resolve(
          new Response(noBody ? null : (Readable.toWeb(incoming) as ReadableStream<Uint8Array>), {
            status,
            headers,
            statusText: incoming.statusMessage,
          }),
        );
      },
    );
    upstream.on('error', reject);
    upstream.end(init.body ?? undefined);
  });
}
