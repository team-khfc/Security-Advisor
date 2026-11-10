import { readFile } from 'node:fs/promises';
import { parseArgs, parseEnv } from 'node:util';

const { values } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://127.0.0.1:3001' },
    'env-file': { type: 'string', default: '.env.backend-test' },
    help: { type: 'boolean', default: false },
  },
});

async function main() {
  if (values.help) {
    console.info(
      'node tools/checkBackendConnection.mjs [--url http://127.0.0.1:3001] [--env-file .env.backend-test]',
    );
    return;
  }
  const origin = new URL(values.url);
  if (
    origin.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname) ||
    origin.username ||
    origin.password ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash
  ) {
    throw new Error('이 검사는 로컬 HTTP 테스트 서버의 origin만 허용합니다.');
  }
  const environment = parseEnv(await readFile(values['env-file'], 'utf8'));
  const password = environment.DEMO_ACCOUNT_PASSWORD;
  if (!password) throw new Error('테스트 환경 파일에 DEMO_ACCOUNT_PASSWORD가 없습니다.');
  const cookies = new Map();

  async function request(path, { method = 'GET', body, csrf = true } = {}) {
    const headers = new Headers({ Accept: 'application/json' });
    if (cookies.size)
      headers.set('Cookie', [...cookies].map(([name, value]) => `${name}=${value}`).join('; '));
    if (method !== 'GET' && csrf) {
      const token = cookies.get('XSRF-TOKEN');
      if (!token) throw new Error('Back에서 CSRF 쿠키를 받지 못했습니다.');
      headers.set('X-XSRF-TOKEN', decodeURIComponent(token));
      headers.set('X-Requested-With', 'XMLHttpRequest');
    }
    if (body !== undefined) headers.set('Content-Type', 'application/json');
    const response = await fetch(new URL(path, origin), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
    });
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(';', 1)[0];
      const separator = pair.indexOf('=');
      if (separator < 1) continue;
      const name = pair.slice(0, separator);
      const value = pair.slice(separator + 1);
      if (!value || /;\s*Max-Age=0(?:;|$)/i.test(cookie)) cookies.delete(name);
      else cookies.set(name, value);
    }
    return response;
  }

  function expectStatus(response, expected, label) {
    if (response.status !== expected)
      throw new Error(`${label}: HTTP ${expected} 예상, HTTP ${response.status} 응답`);
  }

  let response = await request('/api/installation');
  expectStatus(response, 200, '기관 조회');
  const installation = await response.json();
  if (typeof installation.name !== 'string' || typeof installation.code !== 'string')
    throw new Error('실제 Back의 기관 정보 계약이 아닙니다. API_MODE=api를 확인해 주세요.');
  console.info('PASS: Next.js 프록시 → 실제 Back 기관 조회');

  response = await request('/api/auth/me');
  expectStatus(response, 401, '미로그인 세션');
  await response.arrayBuffer();
  if (!cookies.get('XSRF-TOKEN')) throw new Error('미로그인 응답에 CSRF 쿠키가 없습니다.');
  response = await request('/api/auth/login', {
    method: 'POST',
    csrf: false,
    body: { username: 'applicant', password },
  });
  expectStatus(response, 403, 'CSRF 없는 로그인 차단');
  await response.arrayBuffer();
  console.info('PASS: 미로그인 401·CSRF 쿠키·CSRF 없는 변경 요청 403');

  response = await request('/api/auth/login', {
    method: 'POST',
    body: { username: 'applicant', password },
  });
  expectStatus(response, 200, '로그인');
  const member = await response.json();
  if (member.username !== 'applicant' || member.role !== 'APPLICANT')
    throw new Error('로그인 응답이 합성 신청자 계정의 실제 Back 계약과 다릅니다.');
  response = await request('/api/auth/me');
  expectStatus(response, 200, '세션 유지');
  if ((await response.json()).username !== 'applicant')
    throw new Error('로그인 후 세션 사용자가 일치하지 않습니다.');
  console.info('PASS: 실제 Back 로그인·세션 쿠키 전달·사용자 확인');

  response = await request('/api/business-cases?size=1');
  expectStatus(response, 200, '사업 건 목록 API');
  const page = await response.json();
  if (!Array.isArray(page.content) || typeof page.totalElements !== 'number')
    throw new Error('사업 건 목록이 Back의 페이지 응답 형식과 다릅니다.');
  console.info('PASS: 인증된 사업 건 목록 API 응답');

  response = await request('/api/auth/logout', { method: 'POST' });
  expectStatus(response, 204, '로그아웃');
  await response.arrayBuffer();
  response = await request('/api/auth/me');
  expectStatus(response, 401, '로그아웃 후 세션 종료');
  await response.arrayBuffer();
  console.info('PASS: 로그아웃·세션 종료');
  console.info('기본 연결 검사 완료. 업무 화면 전체의 DTO·저장·협의·제출 연동 검사는 별도입니다.');
}

main().catch((error) => {
  console.error(`연결 검사 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
  process.exitCode = 1;
});
