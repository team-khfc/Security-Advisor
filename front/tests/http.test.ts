// @vitest-environment node

import { afterEach, expect, test, vi } from 'vitest';
import { GET, POST } from '@/app/api/[...path]/route';
import { generatedDocumentSchema } from '@/features/document/types';
import { ApiError, requestJson, requestPdf } from '@/lib/httpClient';
import { forwardApiRequest, readLimitedBody } from '@/lib/serverProxy';
import type { Actor, PageResponse } from '@/lib/types';
import type { BusinessCase, SecurityRequest } from '@/features/request';
import { z } from 'zod';
import {
  answerDto,
  analysisDto,
  applicationDto,
  caseDto,
  pageDto,
  requestListDto,
  reviewDto,
  submissionDto,
} from '@/features/request/apiTypes';
import { createMockApi, type MockApiOptions } from '@/mocks/server';

const ORIGIN = 'https://security-advisor.example';

test('AI 모델 관리 HTTP 계약은 권한·비교·충돌·이력 페이지·모의 연결을 구분한다', async () => {
  const { client, handler } = await setup('admin');
  const values = (await (await client.send('/api/llm-configurations')).json())[0];
  const body = {
    ...values,
    model: 'synthetic/v2',
    expectedRevision: values.revision,
    reason: '합성 변경',
  };
  expect((await client.send('/api/llm-configurations/1/comparisons', 'POST', body)).status).toBe(
    200,
  );
  expect((await client.send('/api/llm-configurations/1', 'PUT', body)).status).toBe(200);
  expect((await client.send('/api/llm-configurations/1', 'PUT', body)).status).toBe(409);
  const history = await (
    await client.send('/api/llm-configurations/1/history?page=1&size=1')
  ).json();
  expect(history).toMatchObject({ page: 1, size: 1, totalElements: 2 });
  expect(history.content[0].values.model).toBe('synthetic/model');
  const result = await (
    await client.send('/api/llm-connection-tests', 'POST', { configuration: body })
  ).json();
  expect(result).toMatchObject({ status: 'FAILED', outcome: 'SIMULATED' });
  for (const username of ['applicant', 'infra', 'security']) {
    const other = makeClient(handler);
    await other.send('/api/installation');
    await other.send('/api/demo-sessions', 'POST', { username });
    for (const path of [
      '/api/llm-configurations',
      '/api/llm-configurations/management',
      '/api/llm-configurations/1/history',
      '/api/llm-connection-tests/1',
    ])
      expect((await other.send(path)).status).toBe(403);
    expect(
      (await other.send('/api/llm-connection-tests', 'POST', { configuration: body })).status,
    ).toBe(403);
  }
});

test('방화벽 모의 계약은 역할·사유·충돌·연장 중복을 검사하고 기존 규칙과 제출본을 보존한다', async () => {
  const { client, handler } = await setup('infra');
  const before = await (await client.send('/api/firewall-rules')).json();
  const rule = before[0];
  expect(rule.status).toBe('PENDING_APPLY');
  const original = await (await client.send(`/api/submissions/${rule.submissionId}`)).json();
  const base = `/api/firewall-rules/${rule.firewallRuleId}`;
  const applicant = makeClient(handler);
  await applicant.send('/api/installation');
  await applicant.send('/api/demo-sessions', 'POST', { username: 'applicant' });
  expect(
    (await applicant.send(`${base}/application`, 'PUT', { result: 'APPLIED', expectedRevision: 0 }))
      .status,
  ).toBe(403);
  expect(
    (
      await client.send(`${base}/application`, 'PUT', {
        result: 'NOT_APPLICABLE',
        reason: ' ',
        expectedRevision: 0,
      })
    ).status,
  ).toBe(422);
  expect(
    (
      await client.send(`${base}/application`, 'PUT', {
        result: 'APPLIED',
        note: '합성 적용 기록',
        expectedRevision: 0,
      })
    ).status,
  ).toBe(200);
  expect(
    (await client.send(`${base}/revocation`, 'PUT', { reason: '합성 회수', expectedRevision: 0 }))
      .status,
  ).toBe(409);
  const renewal = await applicant.send(`${base}/renewal-requests`, 'POST', {
    newPeriod: '2027-01-01~2027-12-31',
    note: '합성 연장',
  });
  expect(renewal.status).toBe(201);
  const created = await renewal.json();
  expect(created.rule).toMatchObject({
    source: rule.source,
    destination: rule.destination,
    port: rule.port,
    startDate: rule.startDate,
    endDate: rule.endDate,
    status: 'APPLIED',
  });
  const request = await (
    await applicant.send(`/api/security-requests/${created.request.securityRequestId}`)
  ).json();
  expect(request).toMatchObject({ stage: 1, status: 'DRAFTING' });
  const originalRequest = await (
    await applicant.send(`/api/security-requests/${rule.securityRequestId}`)
  ).json();
  expect(request.businessCaseId).toBe(originalRequest.businessCaseId);
  expect(
    (
      await applicant.send(`${base}/renewal-requests`, 'POST', {
        newPeriod: '2027-01-01~2027-12-31',
      })
    ).status,
  ).toBe(422);
  const current = (await (await client.send('/api/firewall-rules')).json())[0];
  expect(
    (
      await client.send(`${base}/revocation`, 'PUT', {
        reason: '합성 회수',
        expectedRevision: current.revision,
      })
    ).status,
  ).toBe(200);
  const after = (await (await client.send('/api/firewall-rules')).json())[0];
  expect(after).toMatchObject({
    status: 'REVOKED',
    applicationNote: '합성 적용 기록',
    renewalRequestId: created.request.securityRequestId,
  });
  expect(await (await client.send(`/api/submissions/${rule.submissionId}`)).json()).toEqual(
    original,
  );
  const other = makeClient(handler);
  await other.send('/api/installation');
  await other.send('/api/demo-sessions', 'POST', { username: 'applicant2' });
  expect(await (await other.send('/api/firewall-rules')).json()).toEqual([]);
  expect(
    (await other.send(`${base}/renewal-requests`, 'POST', { newPeriod: '2027-01-01~2027-12-31' }))
      .status,
  ).toBe(404);
});

test('모의 인터뷰도 대화·추천·적용·사람의 확인을 구분한다', async () => {
  const { client } = await setup();
  const created = await client.send('/api/business-cases', 'POST', {
    title: '합성 인터뷰 사업',
    department: '합성 부서',
    summary: '',
    docTypes: ['FIREWALL'],
  });
  expect(created.status).toBe(201);
  const businessCase = await created.json();
  const id = businessCase.businessCaseId;
  const base = `/api/business-cases/${id}/interview-turns`;
  const before = await (await client.send(`/api/business-cases/${id}`)).json();
  const result = await client.send(base, 'POST', {
    fieldKey: 'purpose',
    mode: 'SUGGEST',
    text: '추천해 주세요',
    expectedRevision: before.revision,
  });
  expect(result.status).toBe(201);
  const turn = await result.json();
  expect(await (await client.send(`/api/business-cases/${id}`)).json()).toEqual(before);
  expect(
    (
      await client.send(`${base}/${turn.interviewTurnId}/applications`, 'POST', {
        expectedRevision: before.revision,
      })
    ).status,
  ).toBe(200);
  const after = await (await client.send(`/api/business-cases/${id}`)).json();
  expect(
    after.caseAnswers.find((a: { fieldKey: string }) => a.fieldKey === 'purpose'),
  ).toMatchObject({ confirmed: false, valueSource: 'AI_INFERRED' });
  expect((await client.send(base)).status).toBe(200);
  const ask = await (
    await client.send(base, 'POST', {
      fieldKey: 'purpose',
      mode: 'ASK',
      text: '설명해 주세요',
      expectedRevision: after.revision,
    })
  ).json();
  expect(ask.proposedValue).toBeNull();
  expect(
    (
      await client.send(`${base}/${ask.interviewTurnId}/applications`, 'POST', {
        expectedRevision: after.revision,
      })
    ).status,
  ).toBe(422);
});

function makeClient(handler: ReturnType<typeof createMockApi>) {
  const jar = new Map<string, string>();
  return {
    jar,
    async send(path: string, method = 'GET', body?: unknown, extra: HeadersInit = {}) {
      const headers = new Headers(extra);
      headers.set('Cookie', [...jar].map(([name, value]) => `${name}=${value}`).join('; '));
      headers.set('Origin', ORIGIN);
      headers.set('X-Requested-With', 'SecurityAdvisor');
      if (method !== 'GET') headers.set('X-XSRF-TOKEN', jar.get('XSRF-TOKEN') ?? '');
      const form = body instanceof FormData;
      if (body !== undefined && !form) headers.set('Content-Type', 'application/json');
      const response = await handler(
        new Request(ORIGIN + path, {
          method,
          headers,
          body: body === undefined ? undefined : form ? body : JSON.stringify(body),
        }),
      );
      for (const cookie of response.headers.getSetCookie()) {
        const pair = cookie.split(';')[0];
        const delimiter = pair.indexOf('=');
        const name = pair.slice(0, delimiter);
        const value = pair.slice(delimiter + 1);
        if (cookie.includes('Max-Age=0')) jar.delete(name);
        else jar.set(name, value);
      }
      return response;
    },
  };
}

async function setup(username = 'applicant', options: MockApiOptions = {}) {
  const handler = createMockApi(options);
  const client = makeClient(handler);
  await client.send('/api/installation');
  const login = await client.send('/api/demo-sessions', 'POST', { username });
  expect(login.status).toBe(200);
  return { handler, client, login };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

test('업무 API는 미인증을 거부하고 모의 세션 쿠키는 HttpOnly·Secure·SameSite를 갖는다', async () => {
  const handler = createMockApi();
  const anonymous = await handler(new Request(`${ORIGIN}/api/security-requests`));
  expect(anonymous.status).toBe(401);
  const { login } = await setup();
  const cookie = login.headers.getSetCookie().find((value) => value.startsWith('SA_MOCK_SESSION='));
  expect(cookie).toContain('HttpOnly');
  expect(cookie).toContain('Secure');
  expect(cookie).toContain('SameSite=Lax');
  const session = await login.json();
  expect(session.role).toBe('APPLICANT');
  expect(session.department).toBe('합성 디지털사업팀');
  expect(session.expiresAt).toEqual(expect.any(String));
  expect(session).not.toHaveProperty('password');
});

test('CSRF 토큰 또는 같은 출처 조건이 없는 상태 변경은 거부한다', async () => {
  const handler = createMockApi();
  const noToken = await handler(
    new Request(`${ORIGIN}/api/demo-sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'SecurityAdvisor' },
      body: JSON.stringify({ username: 'admin' }),
    }),
  );
  expect(noToken.status).toBe(403);
  const token = crypto.randomUUID();
  const wrongOrigin = await handler(
    new Request(`${ORIGIN}/api/demo-sessions`, {
      method: 'POST',
      headers: {
        Origin: 'https://unrelated.example',
        Cookie: `XSRF-TOKEN=${token}`,
        'X-XSRF-TOKEN': token,
        'X-Requested-With': 'SecurityAdvisor',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username: 'admin' }),
    }),
  );
  expect(wrongOrigin.status).toBe(403);
});

test('Next 바인딩 주소와 다른 실제 Host의 요청은 허용하고 전달 헤더로 출처 검증을 우회할 수 없다', async () => {
  const handler = createMockApi();
  const token = crypto.randomUUID();
  async function login(origin: string, host: string, forwardedHost: string) {
    return handler(
      new Request('http://0.0.0.0:4173/api/demo-sessions', {
        method: 'POST',
        headers: {
          Origin: origin,
          Host: host,
          'X-Forwarded-Host': forwardedHost,
          Cookie: `XSRF-TOKEN=${token}`,
          'X-XSRF-TOKEN': token,
          'X-Requested-With': 'SecurityAdvisor',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username: 'applicant' }),
      }),
    );
  }
  expect((await login('http://127.0.0.1:4173', '127.0.0.1:4173', 'unrelated.example')).status).toBe(
    200,
  );
  expect(
    (await login('http://unrelated.example', '127.0.0.1:4173', 'unrelated.example')).status,
  ).toBe(403);
  expect((await login('https://127.0.0.1:4173', '127.0.0.1:4173', '127.0.0.1:4173')).status).toBe(
    403,
  );
  expect(
    (await login('http://127.0.0.1:4173', '127.0.0.1:4173@unrelated.example', '127.0.0.1:4173'))
      .status,
  ).toBe(403);
});

test('회원가입은 요청의 역할·기관을 무시하고 APPLICANT로만 생성하며 비밀번호를 반환하지 않는다', async () => {
  const handler = createMockApi();
  const client = makeClient(handler);
  await client.send('/api/installation');
  const password = crypto.randomUUID() + 'a9';
  const signup = await client.send('/api/members', 'POST', {
    username: 'synthetic-user',
    password,
    displayName: '합성 가입자',
    department: '합성 부서',
    role: 'ADMIN',
    institutionId: 'untrusted',
  });
  expect(signup.status).toBe(201);
  expect(signup.headers.get('Location')).toMatch(/^\/api\/members\//);
  const actor = (await signup.json()) as Actor;
  expect(actor.role).toBe('APPLICANT');
  expect(actor).not.toHaveProperty('institutionId');
  expect(actor).not.toHaveProperty('password');
  expect(actor).not.toHaveProperty('passwordHash');
  const login = await client.send('/api/auth/login', 'POST', {
    username: actor.username,
    password,
  });
  expect(login.status).toBe(200);
  expect((await client.send('/api/members')).status).toBe(403);
  const duplicate = await client.send('/api/members', 'POST', {
    username: actor.username,
    password,
    displayName: '합성 가입자',
  });
  expect(duplicate.status).toBe(409);
});

test('로그인 실패 제한은 올바른 비밀번호에도 잠금 시간 동안 유지하고 이후 해제한다', async () => {
  let time = Date.UTC(2026, 10, 7);
  const password = crypto.randomUUID() + 'a9';
  const handler = createMockApi({ password, now: () => new Date(time) });
  const client = makeClient(handler);
  await client.send('/api/installation');
  for (let attempt = 1; attempt <= 5; attempt++) {
    const response = await client.send('/api/auth/login', 'POST', {
      username: 'applicant',
      password: crypto.randomUUID(),
    });
    expect(response.status).toBe(attempt === 5 ? 429 : 401);
  }
  expect(
    (await client.send('/api/auth/login', 'POST', { username: 'applicant', password })).status,
  ).toBe(429);
  time += 15 * 60 * 1000 + 1;
  expect(
    (await client.send('/api/auth/login', 'POST', { username: 'applicant', password })).status,
  ).toBe(200);
});

test('다른 신청자의 상세·다운로드는 404이며 클라이언트 역할 헤더로 검토 권한을 얻을 수 없다', async () => {
  const { handler, client } = await setup();
  const list = (await (
    await client.send('/api/security-requests?size=100')
  ).json()) as PageResponse<SecurityRequest>;
  const wireList = pageDto(requestListDto).parse(list);
  expect(wireList.content.every((request) => request.applicantUsername === 'applicant')).toBe(true);
  const other = makeClient(handler);
  await other.send('/api/installation');
  await other.send('/api/demo-sessions', 'POST', { username: 'applicant2' });
  expect((await other.send('/api/security-requests/demo-request-1')).status).toBe(404);
  expect((await other.send('/api/security-requests/demo-request-1/documents')).status).toBe(404);
  const reviews = z
    .array(reviewDto)
    .parse(
      await (
        await client.send(`/api/security-requests/${wireList.content[0].securityRequestId}/reviews`)
      ).json(),
    );
  const review = reviews[0];
  expect(review).toBeDefined();
  const forged = await client.send(
    `/api/reviews/${review?.reviewId}/completion`,
    'PUT',
    { expectedRevision: 1 },
    { 'X-Role': 'INFRA' },
  );
  expect(forged.status).toBe(403);
});

test('오래된 공통 정보 저장은 409와 최신 revision을 반환하고 먼저 저장한 값을 보존한다', async () => {
  const { client } = await setup();
  const original = (await (
    await client.send('/api/business-cases/demo-case-1')
  ).json()) as BusinessCase;
  const first = await client.send('/api/business-cases/demo-case-1', 'PATCH', {
    expectedRevision: original.revision,
    answers: [
      { key: 'purpose', value: '새로 저장한 합성 목적', confirmed: true, notApplicable: false },
    ],
  });
  expect(first.status).toBe(200);
  const stale = await client.send('/api/business-cases/demo-case-1', 'PATCH', {
    expectedRevision: original.revision,
    answers: [{ key: 'purpose', value: '낡은 화면의 목적', confirmed: true, notApplicable: false }],
  });
  expect(stale.status).toBe(409);
  expect(await stale.json()).toHaveProperty('currentRevision', original.revision + 1);
  const latest = (await (
    await client.send('/api/business-cases/demo-case-1')
  ).json()) as BusinessCase;
  expect(
    caseDto.parse(latest).caseAnswers.find((answer) => answer.fieldKey === 'purpose')?.value,
  ).toBe('새로 저장한 합성 목적');
});

test('모의 분석은 미확정 출처·근거를 남기며 오래된 분석 적용과 위장 파일을 거부한다', async () => {
  const { client } = await setup();
  const created = caseDto.parse(
    await (
      await client.send('/api/business-cases', 'POST', {
        title: '합성 분석 시험',
        department: '합성 부서',
        summary: '',
        docTypes: ['FIREWALL'],
      })
    ).json(),
  );
  const base = `/api/business-cases/${created.businessCaseId}`;
  const form = new FormData();
  form.set(
    'file',
    new File(['합성 공공자료 검색 서비스'], 'synthetic.txt', { type: 'text/plain' }),
  );
  const upload = await client.send(`${base}/uploaded-files`, 'POST', form);
  expect(upload.status).toBe(201);
  const { uploadedFileId } = await upload.json();
  const analysis = await client.send(`${base}/analysis-jobs`, 'POST', {
    uploadedFileId,
  });
  expect(analysis.status).toBe(202);
  const job = analysisDto.parse(await analysis.json());
  expect(job.status).toBe('NEEDS_REVIEW');
  expect(job.modelReference).toBe('synthetic-fixture-v1');
  const applied = await client.send(
    `/api/analysis-jobs/${job.analysisJobId}/applications`,
    'POST',
    { expectedRevision: 1 },
  );
  expect(applied.status).toBe(201);
  applicationDto.parse(await applied.json());
  const businessCase = caseDto.parse(await (await client.send(base)).json());
  expect(businessCase.caseAnswers.find((a) => a.fieldKey === 'purpose')).toMatchObject({
    valueSource: 'AI_INFERRED',
    confirmed: false,
  });
  const stale = await client.send(`/api/analysis-jobs/${job.analysisJobId}/applications`, 'POST', {
    expectedRevision: 1,
  });
  expect(stale.status).toBe(409);
  const invalid = new FormData();
  invalid.set('file', new File(['executable data'], 'synthetic.pdf', { type: 'application/pdf' }));
  const disguised = await client.send(`${base}/uploaded-files`, 'POST', invalid);
  expect(disguised.status).toBe(400);
  expect(await disguised.json()).toHaveProperty('code', 'INVALID_FILE_SIGNATURE');
});

test('로그아웃과 만료 뒤 기존 세션으로 업무 데이터를 조회할 수 없다', async () => {
  let time = Date.UTC(2026, 10, 7);
  const { client } = await setup('applicant', { now: () => new Date(time) });
  expect((await client.send('/api/auth/me')).status).toBe(200);
  time += 31 * 60 * 1000;
  expect((await client.send('/api/auth/me')).status).toBe(401);
  await client.send('/api/demo-sessions', 'POST', { username: 'applicant' });
  expect((await client.send('/api/auth/logout', 'POST')).status).toBe(204);
  expect((await client.send('/api/security-requests')).status).toBe(401);
});

test('다운로드는 실제 JSON과 불변 제출본 데이터를 제공하고 타인 세션에는 노출하지 않는다', async () => {
  const { client } = await setup();
  const list = (await (
    await client.send('/api/security-requests?size=100')
  ).json()) as PageResponse<SecurityRequest>;
  const submitted = pageDto(requestListDto)
    .parse(list)
    .content.find((request) => request.status === 'SUBMITTED');
  expect(submitted).toBeDefined();
  const response = await client.send(
    `/api/security-requests/${submitted?.securityRequestId}/documents`,
  );
  expect(response.status).toBe(200);
  expect(response.headers.get('Content-Type')).toContain('application/json');
  expect(response.headers.get('Content-Disposition')).toMatch(/\.json"$/);
  const document = await response.json();
  expect(document.documentKind).toBe('SUBMISSION');
  const submissions = z
    .array(submissionDto)
    .parse(
      await (
        await client.send(`/api/security-requests/${submitted?.securityRequestId}/submissions`)
      ).json(),
    );
  const snapshot = z.object({ answers: z.array(answerDto) }).parse(submissions[0].snapshot);
  expect(
    document.commonAnswers.map((a: { key: string; value: string }) => ({
      fieldKey: a.key,
      value: a.value,
    })),
  ).toEqual(
    snapshot.answers
      .filter((a) => a.scope === 'CASE')
      .map((a) => ({ fieldKey: a.fieldKey, value: a.value })),
  );
});

test('프록시는 고정 Back origin만 사용하고 세션·CSRF·Location을 같은 출처에 맞게 전달한다', async () => {
  const headers = new Headers({
    'Content-Type': 'application/json',
    Location: 'https://back.example/api/business-cases/42',
  });
  headers.append(
    'Set-Cookie',
    'JSESSIONID=synthetic; Path=/; Domain=back.example; HttpOnly; Secure; SameSite=Lax',
  );
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response('{}', { status: 201, headers }));
  const response = await forwardApiRequest(
    new Request(`${ORIGIN}/api/business-cases?size=20`, {
      method: 'POST',
      headers: {
        Cookie: 'JSESSIONID=existing; XSRF-TOKEN=token',
        'X-XSRF-TOKEN': 'token',
        'X-Role': 'ADMIN',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title: '합성 사업' }),
    }),
    'https://back.example',
    fetcher,
  );
  expect(fetcher).toHaveBeenCalledTimes(1);
  const [target, init] = fetcher.mock.calls[0];
  expect(String(target)).toBe('https://back.example/api/business-cases?size=20');
  expect(new Headers(init?.headers).get('X-XSRF-TOKEN')).toBe('token');
  expect(new Headers(init?.headers).get('X-Role')).toBeNull();
  expect(init?.redirect).toBe('manual');
  expect(response.headers.get('Location')).toBe('/api/business-cases/42');
  expect(response.headers.get('Set-Cookie')).toContain('HttpOnly');
  expect(response.headers.get('Set-Cookie')).not.toContain('Domain=');
});

test('프록시는 이동 응답·잘못된 서버 설정·과대 본문을 거부하고 모의 성공으로 대체하지 않는다', async () => {
  const request = new Request(`${ORIGIN}/api/auth/me`);
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      new Response(null, { status: 302, headers: { Location: 'https://unrelated.example' } }),
    );
  await expect(forwardApiRequest(request, 'https://back.example', fetcher)).rejects.toMatchObject({
    code: 'API_REDIRECT_REJECTED',
    status: 502,
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
  await expect(forwardApiRequest(request, 'file:///etc/passwd', fetcher)).rejects.toMatchObject({
    code: 'API_CONFIGURATION_INVALID',
  });
  await expect(
    readLimitedBody(
      new Request(`${ORIGIN}/api/business-cases`, {
        method: 'POST',
        headers: { 'Content-Length': String(13 * 1024 * 1024) },
        body: 'small',
      }),
    ),
  ).rejects.toMatchObject({ status: 413 });
});

test('문서 업로드만 20MB 파일의 전송 여유를 허용하며 스트림 상한도 강제한다', async () => {
  const url = `${ORIGIN}/api/business-cases/1/uploaded-files`;
  const body = new Uint8Array(20 * 1024 * 1024);
  expect((await readLimitedBody(new Request(url, { method: 'POST', body }))).byteLength).toBe(
    body.byteLength,
  );
  await expect(
    readLimitedBody(new Request(url, { method: 'POST', body: new Uint8Array(23 * 1024 * 1024) })),
  ).rejects.toMatchObject({ status: 413 });
  await expect(readLimitedBody(new Request(url, { method: 'PUT', body }))).rejects.toMatchObject({
    status: 413,
  });
});

test('실제 API 모드에는 모의 로그인 경로가 없고 연결 실패를 모의 데이터로 숨기지 않는다', async () => {
  vi.stubEnv('API_MODE', 'api');
  vi.stubEnv('API_BASE_URL', undefined);
  const demo = await POST(new Request(`${ORIGIN}/api/demo-sessions`, { method: 'POST' }));
  expect(demo.status).toBe(404);
  const live = await GET(new Request(`${ORIGIN}/api/auth/me`));
  expect(live.status).toBe(503);
  expect(await live.json()).toHaveProperty('code', 'API_NOT_CONFIGURED');
});

test('HTTP 클라이언트는 실패를 ApiError로 보존하고 외부 경로를 거부한다', async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
    Response.json(
      {
        type: 'about:blank',
        title: '변경 충돌',
        status: 409,
        detail: '최신 내용을 확인해 주세요.',
        code: 'REVISION_CONFLICT',
        currentRevision: 3,
      },
      { status: 409 },
    ),
  );
  vi.stubGlobal('fetch', fetcher);
  await expect(requestJson('/api/security-requests/demo-request-1')).rejects.toMatchObject({
    status: 409,
    code: 'REVISION_CONFLICT',
    problem: { currentRevision: 3 },
  });
  await expect(requestJson('https://unrelated.example/api/data')).rejects.toBeInstanceOf(ApiError);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

test('실제 계약의 사업 생성·답변별 저장·확인·충돌·세션 연장을 모의 서버에서도 검증한다', async () => {
  const { client } = await setup();
  const created = await client.send('/api/business-cases', 'POST', {
    title: '계약 검증용 합성 사업',
    department: '합성 부서',
    summary: '합성 개요',
    docTypes: ['FIREWALL'],
  });
  expect(created.status).toBe(201);
  const businessCase = caseDto.parse(await created.json());
  expect(businessCase.businessCaseId).toEqual(expect.any(Number));
  const base = `/api/business-cases/${businessCase.businessCaseId}`;
  const answer = businessCase.caseAnswers.find((a) => a.fieldKey === 'purpose')!;
  const saved = await client.send(`${base}/answers`, 'PATCH', {
    answers: [
      { fieldKey: answer.fieldKey, value: '수정한 합성 목적', expectedRevision: answer.revision },
    ],
  });
  expect(saved.status).toBe(200);
  const changed = z.array(answerDto).parse(await saved.json())[0];
  expect(changed.confirmed).toBe(true);
  const confirmed = await client.send(`${base}/answers/${answer.fieldKey}/confirmation`, 'PUT', {
    expectedRevision: changed.revision,
  });
  expect(confirmed.status).toBe(422);
  expect(await confirmed.json()).toHaveProperty('code', 'AI_CONFIRMATION_REQUIRED');
  const stale = await client.send(`${base}/answers`, 'PATCH', {
    answers: [{ fieldKey: answer.fieldKey, value: '오래된 값', expectedRevision: answer.revision }],
  });
  expect(stale.status).toBe(409);
  const renewal = await client.send('/api/sessions/current/renewals', 'POST');
  expect(renewal.status).toBe(201);
  expect(await renewal.json()).toEqual({ expiresAt: expect.any(String) });
});

test('확인된 사업 개요는 분석 제안으로 덮어쓰지 않고 경고를 반환한다', async () => {
  const { client } = await setup();
  const before = caseDto.parse(await (await client.send('/api/business-cases/demo-case-1')).json());
  const form = new FormData();
  form.set('file', new File(['합성 개요'], 'sample.txt', { type: 'text/plain' }));
  const uploaded = await (
    await client.send(`/api/business-cases/${before.businessCaseId}/uploaded-files`, 'POST', form)
  ).json();
  const job = analysisDto.parse(
    await (
      await client.send(`/api/business-cases/${before.businessCaseId}/analysis-jobs`, 'POST', {
        uploadedFileId: uploaded.uploadedFileId,
      })
    ).json(),
  );
  const result = applicationDto.parse(
    await (
      await client.send(`/api/analysis-jobs/${job.analysisJobId}/applications`, 'POST', {
        expectedRevision: before.revision,
      })
    ).json(),
  );
  expect(result.warnings).toHaveLength(1);
  expect(result.summaryProposal).toBeNull();
  const after = caseDto.parse(
    await (await client.send(`/api/business-cases/${before.businessCaseId}`)).json(),
  );
  expect(after.caseAnswers.find((a) => a.fieldKey === 'purpose')).toEqual(
    before.caseAnswers.find((a) => a.fieldKey === 'purpose'),
  );
});

test('정식 문서 모의 계약은 생성·조회·불변 스냅샷을 제공하고 PDF 미지원은 명시한다', async () => {
  const { client } = await setup();
  const businessCase = await (await client.send('/api/business-cases/demo-case-1')).json();
  const id = businessCase.requests[0].securityRequestId;
  const base = `/api/security-requests/${id}/generated-documents`;
  const response = await client.send(base, 'POST', { aiSupplement: false });
  expect(response.status).toBe(201);
  const doc = generatedDocumentSchema.parse(await response.json());
  expect(doc.securityRequestId).toBe(id);
  expect(doc.kind).toBe('DRAFT');
  expect(await (await client.send(base)).json()).toEqual([doc]);
  expect(
    await (await client.send(`/api/generated-documents/${doc.generatedDocumentId}`)).json(),
  ).toEqual(doc);
  const file = await client.send(
    `/api/generated-documents/${doc.generatedDocumentId}/download?format=PDF`,
  );
  expect(file.status).toBe(503);
  expect(await file.json()).toHaveProperty('code', 'PDF_REQUIRES_BACKEND');
  expect(
    (await client.send(base, 'POST', { submissionId: 999999, aiSupplement: false })).status,
  ).toBe(404);
});

test.each([
  ["attachment; filename*=UTF-8''%ED%99%95%EC%A0%95%EB%B3%B8_42_v9.pdf", '확정본_42_v9.pdf'],
  ['attachment; filename="safe.pdf"', 'safe.pdf'],
  ["attachment; filename*=UTF-8''%2E%2E%2Fsecret.pdf", undefined],
  ["attachment; filename*=UTF-8''%5Csecret.pdf", undefined],
  ["attachment; filename*=UTF-8''%00evil.pdf", undefined],
  ["attachment; filename*=UTF-8''bad%ZZ.pdf", undefined],
  ['attachment; filename="evil.html"', undefined],
])('PDF 파일명의 유효성을 검사한다: %s', async (disposition, expected) => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response('%PDF 합성 바이트', {
        headers: { 'content-type': 'application/pdf', 'content-disposition': disposition },
      }),
    ),
  );
  const file = await requestPdf('/api/generated-documents/88/download?format=PDF');
  expect(file.fileName).toBe(expected);
  expect(file.blob.size).toBeGreaterThan(0);
});

test('PDF 대신 로그인 HTML이나 JSON이 오면 파일로 저장하지 않는다', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(new Response('{}', { headers: { 'content-type': 'application/json' } })),
  );
  await expect(requestPdf('/api/generated-documents/88/download?format=PDF')).rejects.toThrow(
    'PDF 응답을 받지 못했습니다',
  );
});

test('지식 모의 API는 초안·게시를 분리하고 기존 사업 버전·현재 비공개 권한을 유지한다', async () => {
  const { handler, client: admin } = await setup('admin');
  const owner = makeClient(handler),
    infra = makeClient(handler);
  for (const [client, username] of [
    [owner, 'applicant'],
    [infra, 'infra'],
  ] as const) {
    await client.send('/api/installation');
    expect((await client.send('/api/demo-sessions', 'POST', { username })).status).toBe(200);
  }
  const create = async (title: string) => {
    const result = await owner.send('/api/business-cases', 'POST', {
      title,
      summary: '합성 지식 검증',
      department: '합성부',
      docTypes: ['FIREWALL'],
    });
    expect(result.status).toBe(201);
    return result.json();
  };
  const old = await create('합성 게시 전');
  const initial = await (await admin.send('/api/knowledge-drafts/current/snippets/1')).json();
  const edit = await admin.send('/api/knowledge-snippets/1', 'PUT', {
    ...initial,
    body: '합성신규검색어',
    expectedRevision: initial.revision,
  });
  expect(edit.status).toBe(200);
  expect(
    await (await owner.send('/api/knowledge-snippets/search?q=합성신규검색어')).json(),
  ).toEqual([]);
  const context = await (
    await admin.send('/api/knowledge-drafts/current/private-contexts/1')
  ).json();
  expect(
    (
      await admin.send('/api/private-contexts/1', 'PUT', {
        ...context,
        visibleRoles: ['SECURITY'],
        expectedRevision: context.revision,
      })
    ).status,
  ).toBe(200);
  expect((await (await infra.send('/api/private-contexts/suggestions')).json()).length).toBe(1);
  const comparison = await (await admin.send('/api/knowledge-drafts/current/comparison')).json();
  expect(
    (
      await admin.send('/api/knowledge-drafts/current/publications', 'POST', {
        expectedRevision: comparison.revision,
      })
    ).status,
  ).toBe(201);
  const fresh = await create('합성 게시 후');
  expect(fresh.knowledgePublicationId).toBe(2);
  expect(
    (await (await owner.send(`/api/business-cases/${old.businessCaseId}`)).json())
      .knowledgePublicationId,
  ).toBe(1);
  expect(
    await (await infra.send('/api/private-contexts/suggestions?knowledgePublicationId=1')).json(),
  ).toEqual([]);
  expect((await owner.send('/api/knowledge-publications/2')).status).toBe(403);
  expect((await infra.send('/api/insights/summary')).status).toBe(403);
  expect((await admin.send('/api/insights/summary')).status).toBe(200);
});
