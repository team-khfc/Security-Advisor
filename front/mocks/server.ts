import {
  infrastructurePlanSchema,
  connectionSchema,
  serverSchema,
  resolveConnections,
  infraCheckLabels,
} from '@/features/request/infrastructurePlan';
import { networkValueValid } from '@/features/request/networkAnswerFormat';
import { mockRequestListing, mockAuditListing } from './listing';
import { ContractMapper } from './contractMapper';
import { MockPolicies } from './policies';
import { MockInquiries } from './inquiries';
import { MockReviewerPools } from './reviewerPools';
import { MockActivity } from './activity';
import { MockConfigurations } from './configurations';
import { MockKnowledge } from './knowledge';
import { MockLlmConfigurations } from './llmConfigurations';
import { mockInsights } from './insights';
import { settingsSchema } from '@/features/configuration/types';
import { mockGeneratedDocument } from './generatedDocument';
import type { GeneratedDocument } from '@/features/document/types';
import type { InterviewTurn } from '@/features/request/useInterview';
import type { FinalDraft } from '@/features/request/useFinalDraft';
import { compare, hash } from 'bcryptjs';
import { z } from 'zod';
import { loginInputSchema, signupInputSchema } from '@/features/auth';
import {
  applyAnalysis,
  createCase,
  executeCommand,
  requestForActor,
  saveCaseAnswers,
  type BusinessCase,
  type AuditEvent,
  type CaseAnalysis,
  type CommandAction,
  type CommandInput,
  type MockState,
  type SecurityRequest,
} from '@/features/request';
import { DomainError } from '@/lib/problem';
import { problemResponse, readLimitedBody } from '@/lib/serverProxy';
import type { Actor, PageResponse, Session } from '@/lib/types';
import { createMockState, MOCK_MEMBERS } from './seed';

const SESSION_COOKIE = 'SA_MOCK_SESSION';
const SESSION_MS = 30 * 60 * 1000;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const CSRF_COOKIE = 'XSRF-TOKEN';
const MAX_MEMBERS = 500;

const answerInputSchema = z.object({
  key: z.string().min(1).max(100),
  value: z.string().max(20_000),
  confirmed: z.boolean(),
  notApplicable: z.boolean(),
});
const commandSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    reason: z.string().max(2_000).optional(),
    fieldKeys: z.array(z.string().min(1).max(100)).max(100).optional(),
    targetStage: z.number().int().min(1).max(4).optional(),
    answers: z.array(answerInputSchema).max(100).optional(),
    comment: z.string().max(5_000).optional(),
    answer: z.string().max(5_000).optional(),
    assigneeId: z.string().max(100).optional(),
    field: z.enum(['INFRA', 'SECURITY']).optional(),
    supplementId: z.string().max(100).optional(),
  })
  .strict();

interface MemberRecord {
  actor: Actor;
  passwordHash: string | null;
}
interface StoredSession {
  memberId: string;
  expiresAt: number;
}
interface LoginAttempt {
  count: number;
  lockedUntil: number;
}
interface MockRuntime {
  llmConfigurations: MockLlmConfigurations;
  knowledge: MockKnowledge;
  configurations: MockConfigurations;
  activity: MockActivity;
  reviewerPools: MockReviewerPools;
  inquiries: MockInquiries;
  generatedDocuments: Map<number, GeneratedDocument>;
  policies: MockPolicies;
  state: MockState;
  members: MemberRecord[];
  sessions: Map<string, StoredSession>;
  attempts: Map<string, LoginAttempt>;
  analyses: Map<string, CaseAnalysis>;
  interviewTurns: Map<number, { turn: InterviewTurn; fingerprint: string }>;
  finalDrafts: Map<string, { draft: FinalDraft; fingerprint: string }>;
  dummyHash: string;
}
export interface MockApiOptions {
  password?: string;
  now?: () => Date;
  institutionName?: string;
  institutionCode?: string;
}

function cookiesOf(request: Request): Map<string, string> {
  const pairs = (request.headers.get('cookie') ?? '').split(';');
  const result = new Map<string, string>();
  for (const part of pairs) {
    const delimiter = part.indexOf('=');
    if (delimiter < 0) continue;
    try {
      result.set(part.slice(0, delimiter).trim(), decodeURIComponent(part.slice(delimiter + 1)));
    } catch {
      // 인코딩이 깨진 쿠키는 인증 근거가 될 수 없으므로 해당 항목만 버린다.
    }
  }
  return result;
}

function json(value: unknown, status = 200, location?: string): Response {
  return Response.json(value, {
    status,
    headers: { 'Cache-Control': 'no-store', ...(location ? { Location: location } : {}) },
  });
}

function fail(status: number, code: string, detail: string): never {
  throw new DomainError(status, code, detail);
}

function pageOf<T>(items: T[], url: URL): PageResponse<T> {
  const page = Number(url.searchParams.get('page') ?? '0');
  const size = Number(url.searchParams.get('size') ?? '20');
  if (
    !Number.isInteger(page) ||
    page < 0 ||
    page > 1_000_000 ||
    !Number.isInteger(size) ||
    size < 1 ||
    size > 100
  ) {
    fail(400, 'INVALID_PAGINATION', 'page는 0 이상의 정수, size는 1~100 사이여야 합니다.');
  }
  return {
    content: items.slice(page * size, (page + 1) * size),
    page,
    size,
    totalElements: items.length,
  };
}

async function bodyJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return fail(400, 'INVALID_JSON', 'JSON 요청 형식을 확인해 주세요.');
  }
}

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success)
    fail(400, 'INVALID_INPUT', result.error.issues[0]?.message ?? '입력값을 확인해 주세요.');
  return result.data;
}

function secureSuffix(request: Request) {
  return new URL(request.url).protocol === 'https:' ? '; Secure' : '';
}

/** Next 개발 서버의 바인딩 주소 대신 브라우저가 요청한 Host를 같은 출처 기준으로 쓴다. */
function requestOrigin(request: Request): string {
  const url = new URL(request.url);
  const host = request.headers.get('host') ?? url.host;
  if (!host || /[\\/?#@\u0000-\u0020\u007f]/.test(host)) {
    return fail(403, 'CSRF_REJECTED', '요청 주소를 확인한 뒤 다시 시도해 주세요.');
  }
  try {
    // Host는 브라우저가 임의로 바꿀 수 없는 헤더다. 프록시 전달 헤더는 신뢰하지 않는다.
    return new URL(`${url.protocol}//${host}`).origin;
  } catch {
    return fail(403, 'CSRF_REJECTED', '요청 주소를 확인한 뒤 다시 시도해 주세요.');
  }
}

function csrfCheck(request: Request, cookies: Map<string, string>) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;
  const origin = request.headers.get('origin');
  if (origin && origin !== requestOrigin(request))
    fail(403, 'CSRF_REJECTED', '같은 화면에서 다시 요청해 주세요.');
  if (request.headers.get('sec-fetch-site') === 'cross-site')
    fail(403, 'CSRF_REJECTED', '같은 화면에서 다시 요청해 주세요.');
  const cookieToken = cookies.get(CSRF_COOKIE);
  if (
    request.headers.get('x-requested-with') !== 'SecurityAdvisor' ||
    !cookieToken ||
    request.headers.get('x-xsrf-token') !== cookieToken
  ) {
    fail(403, 'CSRF_REJECTED', '화면을 다시 불러온 뒤 요청해 주세요.');
  }
}

function withCsrfCookie(response: Response, request: Request, cookieToken: string | undefined) {
  if (!cookieToken) {
    response.headers.append(
      'Set-Cookie',
      `${CSRF_COOKIE}=${crypto.randomUUID()}; Path=/; SameSite=Lax${secureSuffix(request)}`,
    );
  }
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  return response;
}

async function initialize(options: MockApiOptions): Promise<MockRuntime> {
  const configured = options.password ?? process.env.DEMO_ACCOUNT_PASSWORD;
  const passwordHash = configured ? await hash(configured, 10) : null;
  const state = createMockState();
  const configurations = new MockConfigurations(state);
  return {
    state,
    configurations,
    llmConfigurations: new MockLlmConfigurations(state),
    knowledge: new MockKnowledge(state, () =>
      configurations.publication('current').fieldSchema.fields.map((f) => f.key),
    ),
    reviewerPools: new MockReviewerPools(MOCK_MEMBERS),
    activity: new MockActivity(),
    policies: new MockPolicies(),
    inquiries: new MockInquiries(),
    members: MOCK_MEMBERS.map((actor) => ({ actor: structuredClone(actor), passwordHash })),
    sessions: new Map(),
    attempts: new Map(),
    analyses: new Map(),
    interviewTurns: new Map(),
    finalDrafts: new Map(),
    generatedDocuments: new Map(),
    dummyHash: await hash(crypto.randomUUID(), 10),
  };
}

function sessionMember(runtime: MockRuntime, request: Request, now: number): Actor {
  const token = cookiesOf(request).get(SESSION_COOKIE);
  const session = token ? runtime.sessions.get(token) : undefined;
  if (!session || session.expiresAt <= now) {
    if (token) runtime.sessions.delete(token);
    return fail(
      401,
      'AUTHENTICATION_REQUIRED',
      '로그인이 필요합니다. 다시 로그인한 뒤 이어서 진행해 주세요.',
    );
  }
  const member = runtime.members.find((entry) => entry.actor.id === session.memberId)?.actor;
  if (!member?.active)
    return fail(
      401,
      'AUTHENTICATION_REQUIRED',
      '로그인 정보를 확인할 수 없습니다. 다시 로그인해 주세요.',
    );
  return member;
}

function currentSession(runtime: MockRuntime, request: Request, now: number): Session {
  const member = sessionMember(runtime, request, now);
  const token = cookiesOf(request).get(SESSION_COOKIE) ?? '';
  const session = runtime.sessions.get(token);
  if (!session) return fail(401, 'AUTHENTICATION_REQUIRED', '로그인이 필요합니다.');
  return { member, expiresAt: new Date(session.expiresAt).toISOString(), mock: true };
}

function startSession(
  runtime: MockRuntime,
  request: Request,
  member: Actor,
  now: number,
): Response {
  const oldToken = cookiesOf(request).get(SESSION_COOKIE);
  if (oldToken) runtime.sessions.delete(oldToken);
  for (const [token, session] of runtime.sessions) {
    if (session.expiresAt <= now) runtime.sessions.delete(token);
  }
  if (runtime.sessions.size >= 2_000)
    fail(429, 'SESSION_CAPACITY', '모의 세션이 많습니다. 사용하지 않는 세션을 종료해 주세요.');
  const token = crypto.randomUUID();
  const expiresAt = now + SESSION_MS;
  runtime.sessions.set(token, { memberId: member.id, expiresAt });
  const response = json({ member, expiresAt: new Date(expiresAt).toISOString(), mock: true });
  response.headers.append(
    'Set-Cookie',
    `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MS / 1000}${secureSuffix(request)}`,
  );
  return response;
}

function auditMember(
  runtime: MockRuntime,
  actor: Actor,
  target: Actor,
  action: string,
  reason: string | null,
  now: number,
) {
  runtime.state.auditEvents.push({
    id: crypto.randomUUID(),
    actorId: actor.id,
    actorName: actor.displayName,
    actorRole: actor.role,
    targetType: 'Member',
    targetId: target.id,
    targetRevision: 1,
    action,
    reason,
    fieldKeys: [],
    requestId: crypto.randomUUID(),
    createdAt: new Date(now).toISOString(),
  });
}

function visibleRequests(runtime: MockRuntime, actor: Actor): SecurityRequest[] {
  return runtime.state.requests.flatMap((request) => {
    try {
      return [requestForActor(runtime.state, request, actor)];
    } catch (error) {
      if (error instanceof DomainError && error.status === 404) return [];
      throw error;
    }
  });
}

function getRequest(runtime: MockRuntime, id: string, actor: Actor): SecurityRequest {
  const request = runtime.state.requests.find((entry) => entry.id === id);
  if (!request) return fail(404, 'RESOURCE_NOT_FOUND', '신청을 찾을 수 없습니다.');
  return requestForActor(runtime.state, request, actor);
}

function getCase(runtime: MockRuntime, id: string, actor: Actor): BusinessCase {
  const businessCase = runtime.state.cases.find((entry) => entry.id === id);
  if (!businessCase) return fail(404, 'RESOURCE_NOT_FOUND', '사업 건을 찾을 수 없습니다.');
  if (actor.role === 'APPLICANT' && businessCase.ownerId !== actor.id) {
    return fail(404, 'RESOURCE_NOT_FOUND', '사업 건을 찾을 수 없습니다.');
  }
  if (
    ['INFRA', 'SECURITY'].includes(actor.role) &&
    !runtime.state.requests.some(
      (entry) =>
        entry.caseId === id &&
        entry.assignments.some(
          (assignment) => assignment.active && assignment.assigneeId === actor.id,
        ),
    )
  ) {
    return fail(404, 'RESOURCE_NOT_FOUND', '사업 건을 찾을 수 없습니다.');
  }
  return businessCase;
}

function caseDetail(runtime: MockRuntime, businessCase: BusinessCase, actor: Actor) {
  return {
    ...businessCase,
    requests: visibleRequests(runtime, actor)
      .filter((request) => request.caseId === businessCase.id)
      .map(
        ({ id, caseId, caseTitle, department, docType, stage, status, revision, updatedAt }) => ({
          id,
          caseId,
          caseTitle,
          department,
          docType,
          stage,
          status,
          revision,
          updatedAt,
        }),
      ),
  };
}

function findParent(runtime: MockRuntime, collection: string, id: string, actor: Actor) {
  const key = collection === 'stage-returns' ? 'returns' : collection;
  const allowed = ['reviews', 'supplements', 'returns', 'submissions', 'assignments'] as const;
  const property = allowed.find((item) => item === key);
  if (!property) return fail(404, 'RESOURCE_NOT_FOUND', '자원을 찾을 수 없습니다.');
  const request = runtime.state.requests.find((entry) =>
    entry[property].some((value) => value.id === id),
  );
  if (!request) return fail(404, 'RESOURCE_NOT_FOUND', '자원을 찾을 수 없습니다.');
  const visible = getRequest(runtime, request.id, actor);
  const resource = visible[property].find((entry) => entry.id === id);
  return { request: visible, resource };
}

function conflictResponse(error: unknown, currentRevision: number): Response {
  if (!(error instanceof DomainError) || error.status !== 409) throw error;
  return json(
    {
      type: 'about:blank',
      title: '변경 충돌',
      status: 409,
      detail: error.message,
      code: error.code,
      currentRevision,
      requestId: crypto.randomUUID(),
    },
    409,
  );
}

function documentResponse(request: SecurityRequest, url: URL) {
  const submissionId = url.searchParams.get('submissionId');
  const submission = submissionId
    ? request.submissions.find((entry) => entry.id === submissionId)
    : request.stage === 4
      ? request.submissions.find((entry) => entry.id === request.currentSubmissionId)
      : undefined;
  if (submissionId && !submission)
    return fail(404, 'RESOURCE_NOT_FOUND', '제출본을 찾을 수 없습니다.');
  const content = {
    service: 'SecurityAdvisor',
    mode: 'MOCK',
    notice:
      '합성 데이터의 JSON 미리보기입니다. 정식 신청서 파일이나 실제 방화벽 적용 결과가 아닙니다.',
    documentKind: submission
      ? request.status === 'FINALIZED' && submission.id === request.currentSubmissionId
        ? 'CONFIRMED'
        : 'SUBMISSION'
      : 'DRAFT',
    requestId: request.id,
    title: request.caseTitle,
    docType: request.docType,
    publicationVersion: submission?.publicationVersion ?? request.publicationVersion,
    version: submission?.number ?? request.revision,
    createdAt: submission?.createdAt ?? request.updatedAt,
    commonAnswers: submission?.commonAnswers ?? request.commonAnswers,
    answers: submission?.answers ?? request.answers,
  };
  return new Response(JSON.stringify(content, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="security-advisor-${request.id}-v${content.version}.json"`,
      'Cache-Control': 'no-store',
    },
  });
}

async function validateFile(file: File) {
  if (file.size <= 0 || file.size > MAX_FILE_BYTES)
    fail(400, 'INVALID_FILE_SIZE', '파일은 0바이트보다 크고 10MB 이하여야 합니다.');
  const extension = file.name.split('.').at(-1)?.toLowerCase() ?? '';
  const types: Record<string, string[]> = {
    pdf: ['application/pdf'],
    txt: ['text/plain', ''],
    hwpx: [
      'application/vnd.hancom.hwpx',
      'application/haansofthwpx',
      'application/zip',
      'application/octet-stream',
      '',
    ],
    docx: [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/zip',
    ],
  };
  if (!types[extension]?.includes(file.type))
    fail(
      400,
      'INVALID_FILE_TYPE',
      'PDF·HWPX·DOCX·TXT 문서만 선택해 주세요. HWP는 HWPX 로 변환해 올려 주세요.',
    );
  if (extension === 'txt') return;
  const signature = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const pdf = [0x25, 0x50, 0x44, 0x46, 0x2d];
  const zip = [0x50, 0x4b, 0x03, 0x04];
  const hwp = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
  const expected = extension === 'pdf' ? pdf : extension === 'hwp' ? hwp : zip;
  if (!expected.every((value, index) => signature[index] === value))
    fail(400, 'INVALID_FILE_SIGNATURE', '파일 내용과 확장자가 일치하지 않습니다.');
}

/** 테스트마다 독립된 모의 저장소를 만들며 외부 업무 서버와 연결하지 않는다. */
export function createMockApi(options: MockApiOptions = {}) {
  const initialized = initialize(options);
  const now = () => (options.now?.() ?? new Date()).getTime();
  let mapper: ContractMapper | undefined;
  const uploads = new Map<string, { caseId: string; file: File }>();

  return async function handle(requestInput: Request): Promise<Response> {
    const cookieToken = cookiesOf(requestInput).get(CSRF_COOKIE);
    let response: Response;
    try {
      csrfCheck(requestInput, cookiesOf(requestInput));
      let request = requestInput;
      if (!['GET', 'HEAD'].includes(request.method)) {
        const bytes = await readLimitedBody(request);
        request = new Request(request.url, {
          method: request.method,
          headers: request.headers,
          body: bytes as Uint8Array<ArrayBuffer>,
        });
      }
      const runtime = await initialized;
      mapper ??= new ContractMapper(() => runtime.members.map((m) => m.actor));
      for (const c of runtime.state.cases) {
        for (const a of c.answers) a.revision ??= c.revision;
        mapper.businessCase(c, runtime.state.requests);
      }
      for (const r of runtime.state.requests) {
        for (const a of r.assignments) {
          const username = runtime.members.find((m) => m.actor.id === a.assigneeId)?.actor.username;
          a.reassignmentReason = a.active
            ? runtime.reviewerPools.reason(
                username,
                a.field,
                runtime.members.map((m) => m.actor),
              )
            : null;
        }
        for (const a of r.answers) a.revision ??= r.revision;
        mapper.request(r);
        mapper.reviews(r);
        mapper.assignments(r);
        mapper.supplements(r);
        mapper.submissions(r);
      }
      response = await dispatchContract(runtime, request, now(), options, mapper, uploads);
      if (response.ok)
        runtime.activity.sync(
          runtime.state,
          runtime.members.map((m) => m.actor),
          mapper,
        );
    } catch (error) {
      response = problemResponse(error);
    }
    return withCsrfCookie(response, requestInput, cookieToken);
  };
}

async function dispatch(
  runtime: MockRuntime,
  request: Request,
  now: number,
  options: MockApiOptions,
): Promise<Response> {
  const url = new URL(request.url);
  const parts = url.pathname
    .split('/')
    .filter(Boolean)
    .map((part) => decodeURIComponent(part));
  const [prefix, resource, id, subresource] = parts;
  const method = request.method;
  if (prefix !== 'api' || parts.length > 4)
    return fail(404, 'RESOURCE_NOT_FOUND', '자원을 찾을 수 없습니다.');

  if (resource === 'installation' && !id && method === 'GET') {
    return json({
      institutionName: options.institutionName ?? process.env.INSTITUTION_NAME ?? '가상공공기관',
      institutionCode: options.institutionCode ?? process.env.INSTITUTION_CODE ?? 'DEMO',
      mode: 'mock',
    });
  }
  if (resource === 'auth' && id === 'me' && method === 'GET')
    return json(currentSession(runtime, request, now));
  if (resource === 'auth' && id === 'login' && method === 'POST') {
    const input = parse(loginInputSchema, await bodyJson(request));
    const attempt = runtime.attempts.get(input.username);
    if (attempt && attempt.lockedUntil > now)
      return fail(
        429,
        'LOGIN_LOCKED',
        '로그인 시도가 반복되어 15분 동안 잠겼습니다. 잠시 후 다시 시도해 주세요.',
      );
    const record = runtime.members.find((entry) => entry.actor.username === input.username);
    const valid = await compare(input.password, record?.passwordHash ?? runtime.dummyHash);
    if (!record?.actor.active || !valid) {
      const count = attempt && attempt.lockedUntil === 0 ? attempt.count + 1 : 1;
      if (runtime.attempts.size > 1_000) runtime.attempts.clear();
      runtime.attempts.set(input.username, {
        count,
        lockedUntil: count >= 5 ? now + 15 * 60 * 1000 : 0,
      });
      if (record) auditMember(runtime, record.actor, record.actor, '로그인 실패', null, now);
      return fail(
        count >= 5 ? 429 : 401,
        count >= 5 ? 'LOGIN_LOCKED' : 'INVALID_CREDENTIALS',
        count >= 5
          ? '로그인 시도가 반복되어 15분 동안 잠겼습니다.'
          : '아이디 또는 비밀번호를 확인해 주세요. 모의 계정은 설정한 시연 비밀번호를 사용합니다.',
      );
    }
    runtime.attempts.delete(input.username);
    auditMember(runtime, record.actor, record.actor, '로그인', null, now);
    return startSession(runtime, request, record.actor, now);
  }
  if (resource === 'auth' && id === 'logout' && method === 'POST') {
    const token = cookiesOf(request).get(SESSION_COOKIE);
    if (token) runtime.sessions.delete(token);
    const response = new Response(null, { status: 204 });
    response.headers.append(
      'Set-Cookie',
      `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureSuffix(request)}`,
    );
    return response;
  }
  if (resource === 'demo-sessions' && !id && method === 'POST') {
    const input = parse(
      z.object({ username: z.string().max(50) }).strict(),
      await bodyJson(request),
    );
    const seed = MOCK_MEMBERS.find((entry) => entry.username === input.username);
    const member = seed && runtime.members.find((entry) => entry.actor.id === seed.id)?.actor;
    if (!member?.active) return fail(404, 'RESOURCE_NOT_FOUND', '모의 계정을 찾을 수 없습니다.');
    return startSession(runtime, request, member, now);
  }
  if (resource === 'members' && !id && method === 'POST') {
    const input = parse(signupInputSchema, await bodyJson(request));
    if (runtime.members.length >= MAX_MEMBERS)
      return fail(
        429,
        'MEMBER_CAPACITY',
        '모의 계정 등록 한도에 도달했습니다. 개발 서버를 다시 시작해 주세요.',
      );
    const passwordHash = await hash(input.password, 10);
    if (runtime.members.some((entry) => entry.actor.username === input.username))
      return fail(
        409,
        'USERNAME_DUPLICATE',
        '이미 사용 중인 아이디입니다. 다른 아이디를 입력해 주세요.',
      );
    const actor: Actor = {
      id: crypto.randomUUID(),
      username: input.username,
      displayName: input.displayName,
      department: input.department,
      role: 'APPLICANT',
      active: true,
    };
    runtime.members.push({ actor, passwordHash });
    auditMember(runtime, actor, actor, '회원가입', null, now);
    return json(actor, 201, `/api/members/${actor.id}`);
  }

  const actor = sessionMember(runtime, request, now);
  const members = runtime.reviewerPools.directory(runtime.members.map((entry) => entry.actor));
  if (
    resource === 'sessions' &&
    id === 'current' &&
    subresource === 'renewals' &&
    method === 'POST'
  ) {
    const token = cookiesOf(request).get(SESSION_COOKIE) ?? '';
    const session = runtime.sessions.get(token);
    if (!session) return fail(401, 'AUTHENTICATION_REQUIRED', '로그인이 필요합니다.');
    session.expiresAt = now + SESSION_MS;
    const response = json(currentSession(runtime, request, now));
    response.headers.append(
      'Set-Cookie',
      `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MS / 1000}${secureSuffix(request)}`,
    );
    return response;
  }
  if (resource === 'members' && method === 'GET') {
    if (id === actor.id && !subresource) return json(actor);
    if (actor.role !== 'ADMIN')
      return fail(403, 'FORBIDDEN', '기관 관리자만 계정 목록을 확인할 수 있습니다.');
    if (!id) return json(pageOf(members, url));
    const member = members.find((entry) => entry.id === id);
    if (!member) return fail(404, 'RESOURCE_NOT_FOUND', '계정을 찾을 수 없습니다.');
    return json(member);
  }
  if (resource === 'members' && id && subresource === 'role-assignments' && method === 'POST') {
    if (actor.role !== 'ADMIN')
      return fail(403, 'FORBIDDEN', '기관 관리자만 역할을 변경할 수 있습니다.');
    const input = parse(
      z
        .object({
          role: z.enum(['APPLICANT', 'INFRA', 'SECURITY', 'ADMIN']),
          active: z.boolean(),
          reason: z.string().trim().min(1, '변경 사유를 입력해 주세요.').max(2_000),
        })
        .strict(),
      await bodyJson(request),
    );
    const member = runtime.members.find((entry) => entry.actor.id === id);
    if (!member) return fail(404, 'RESOURCE_NOT_FOUND', '계정을 찾을 수 없습니다.');
    if (
      member.actor.role === 'ADMIN' &&
      (!input.active || input.role !== 'ADMIN') &&
      members.filter((entry) => entry.role === 'ADMIN' && entry.active).length <= 1
    )
      return fail(422, 'LAST_ADMIN', '마지막 활성 관리자의 권한은 해제할 수 없습니다.');
    const updated = { ...member.actor, role: input.role, active: input.active };
    auditMember(runtime, actor, updated, '계정 역할·활성 변경', input.reason, now);
    member.actor = updated;
    return json(updated, 201, `/api/audit-events/${runtime.state.auditEvents.at(-1)?.id}`);
  }
  if (resource === 'audit-events' && method === 'GET') {
    const allowedIds = new Set(visibleRequests(runtime, actor).map((entry) => entry.id));
    const events = runtime.state.auditEvents
      .filter(
        (event) =>
          actor.role === 'ADMIN' || allowedIds.has(event.targetId) || event.actorId === actor.id,
      )
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
    if (id) {
      const event = events.find((entry) => entry.id === id);
      if (!event) return fail(404, 'RESOURCE_NOT_FOUND', '이력을 찾을 수 없습니다.');
      return json(event);
    }
    return json(pageOf(events, url));
  }
  if (resource === 'business-cases' && !id && method === 'GET') {
    const cases = runtime.state.cases.flatMap((entry) => {
      try {
        return [caseDetail(runtime, getCase(runtime, entry.id, actor), actor)];
      } catch (error) {
        if (error instanceof DomainError && error.status === 404) return [];
        throw error;
      }
    });
    return json(pageOf(cases, url));
  }
  if (resource === 'business-cases' && !id && method === 'POST') {
    const input = parse(
      z
        .object({
          title: z.string().trim().min(1).max(200),
          department: z.string().trim().min(1).max(100),
          description: z.string().max(20_000),
          docTypes: z
            .array(z.enum(['FIREWALL', 'SECURITY_REVIEW']))
            .min(1)
            .max(2),
        })
        .strict(),
      await bodyJson(request),
    );
    const result = createCase(runtime.state, actor, input);
    runtime.state = result.state;
    runtime.configurations.pinNewCase(runtime.state, result.caseId);
    runtime.knowledge.pinCase(runtime.state, result.caseId);
    return json(
      caseDetail(runtime, getCase(runtime, result.caseId, actor), actor),
      201,
      `/api/business-cases/${result.caseId}`,
    );
  }
  if (resource === 'business-cases' && id && !subresource && method === 'GET')
    return json(caseDetail(runtime, getCase(runtime, id, actor), actor));
  if (
    resource === 'business-cases' &&
    id &&
    subresource === 'security-requests' &&
    method === 'GET'
  ) {
    getCase(runtime, id, actor);
    return json(
      pageOf(
        visibleRequests(runtime, actor).filter((entry) => entry.caseId === id),
        url,
      ),
    );
  }
  if (resource === 'business-cases' && id && !subresource && method === 'PATCH') {
    const current = getCase(runtime, id, actor);
    const input = parse(
      z
        .object({
          expectedRevision: z.number().int().positive(),
          answers: z.array(answerInputSchema).max(100),
        })
        .strict(),
      await bodyJson(request),
    );
    try {
      runtime.state = saveCaseAnswers(
        runtime.state,
        actor,
        id,
        input.expectedRevision,
        input.answers,
      );
    } catch (error) {
      return conflictResponse(error, current.revision);
    }
    return json(caseDetail(runtime, getCase(runtime, id, actor), actor));
  }
  if (resource === 'business-cases' && id && subresource === 'analysis-jobs' && method === 'POST') {
    const businessCase = getCase(runtime, id, actor);
    if (actor.role !== 'APPLICANT' || businessCase.ownerId !== actor.id)
      return fail(403, 'FORBIDDEN', '신청자만 분석을 요청할 수 있습니다.');
    let text = '';
    let expectedRevision = 0;
    if (request.headers.get('content-type')?.includes('multipart/form-data')) {
      const form = await request.formData();
      text = String(form.get('text') ?? '');
      expectedRevision = Number(form.get('expectedRevision'));
      const file = form.get('file');
      if (file instanceof File) await validateFile(file);
      if (!(file instanceof File) && !text.trim())
        return fail(400, 'ANALYSIS_INPUT_REQUIRED', '분석할 개요나 파일을 선택해 주세요.');
    } else {
      const input = parse(
        z
          .object({ text: z.string().max(20_000), expectedRevision: z.number().int().positive() })
          .strict(),
        await bodyJson(request),
      );
      text = input.text;
      expectedRevision = input.expectedRevision;
    }
    if (text.length > 20_000)
      return fail(400, 'ANALYSIS_TEXT_TOO_LONG', '개요는 20,000자 이하로 입력해 주세요.');
    if (businessCase.revision !== expectedRevision)
      return conflictResponse(
        new DomainError(
          409,
          'REVISION_CONFLICT',
          '입력한 내용을 보존한 채 최신 사업 정보를 확인해 주세요.',
        ),
        businessCase.revision,
      );
    if (runtime.analyses.size >= 500)
      return fail(
        429,
        'ANALYSIS_CAPACITY',
        '모의 분석 한도에 도달했습니다. 개발 서버를 다시 시작해 주세요.',
      );
    const analysis: CaseAnalysis = {
      id: crypto.randomUUID(),
      caseId: id,
      revision: expectedRevision,
      status: 'SUCCEEDED',
      mode: 'EXAMPLE',
      provider: '모의 분석 — 실제 문서 해석·LLM 미사용',
      model: 'synthetic-fixture-v1',
      error: null,
      suggestions: [
        {
          key: 'purpose',
          value: text.trim().slice(0, 500) || '공개 자료를 검색하고 안내하는 합성 서비스입니다.',
          evidence:
            '화면 검증용 합성 제안입니다. 실제 파일 내용을 해석하지 않았으며 기관 내부 사실을 추정하지 않습니다.',
        },
      ],
      createdAt: new Date(now).toISOString(),
    };
    runtime.analyses.set(analysis.id, analysis);
    return json(analysis, 202, `/api/analysis-jobs/${analysis.id}`);
  }
  if (resource === 'analysis-jobs' && id) {
    const analysis = runtime.analyses.get(id);
    if (!analysis) return fail(404, 'RESOURCE_NOT_FOUND', '분석 작업을 찾을 수 없습니다.');
    const businessCase = getCase(runtime, analysis.caseId, actor);
    if (actor.role !== 'APPLICANT' || businessCase.ownerId !== actor.id)
      return fail(404, 'RESOURCE_NOT_FOUND', '분석 작업을 찾을 수 없습니다.');
    if (!subresource && method === 'GET') return json(analysis);
    if (subresource === 'applications' && method === 'POST') {
      const input = parse(
        z.object({ expectedRevision: z.number().int().positive() }).strict(),
        await bodyJson(request),
      );
      if (analysis.revision !== input.expectedRevision)
        return fail(
          409,
          'STALE_ANALYSIS',
          '이전 입력 기준 분석입니다. 최신 내용으로 다시 분석해 주세요.',
        );
      try {
        runtime.state = applyAnalysis(
          runtime.state,
          actor,
          analysis.caseId,
          input.expectedRevision,
          analysis.suggestions,
        );
      } catch (error) {
        return conflictResponse(error, businessCase.revision);
      }
      return json(
        caseDetail(runtime, getCase(runtime, analysis.caseId, actor), actor),
        201,
        `/api/business-cases/${analysis.caseId}`,
      );
    }
  }
  if (resource === 'security-requests' && !id && method === 'GET') {
    let requests = visibleRequests(runtime, actor);
    for (const field of ['caseId', 'status', 'docType'] as const) {
      const filter = url.searchParams.get(field);
      if (filter) requests = requests.filter((entry) => entry[field] === filter);
    }
    return json(pageOf(requests, url));
  }
  if (resource === 'security-requests' && id && !subresource && method === 'GET')
    return json(getRequest(runtime, id, actor));
  if (resource === 'security-requests' && id && subresource === 'documents' && method === 'GET')
    return documentResponse(getRequest(runtime, id, actor), url);
  if (
    id &&
    !subresource &&
    method === 'GET' &&
    ['reviews', 'supplements', 'stage-returns', 'submissions', 'assignments'].includes(resource)
  ) {
    const found = findParent(runtime, resource, id, actor);
    return json({ ...found.resource, requestId: found.request.id });
  }

  let target: SecurityRequest | undefined;
  let action: CommandAction | undefined;
  let extra: Partial<CommandInput> = {};
  if (resource === 'security-requests' && id && subresource) {
    const routes: Record<string, { method: string; action: CommandAction }> = {
      reviews: { method: 'POST', action: 'REQUEST_REVIEW' },
      supplements: { method: 'POST', action: 'REQUEST_SUPPLEMENT' },
      'stage-returns': { method: 'POST', action: 'RETURN' },
      submissions: { method: 'POST', action: 'SUBMIT' },
      assignments: { method: 'POST', action: 'REASSIGN' },
      'draft-generations': { method: 'POST', action: 'GENERATE_DRAFT' },
      closure: { method: 'PUT', action: 'CLOSE' },
      withdrawal: { method: 'PUT', action: 'WITHDRAW' },
      answers: { method: 'PATCH', action: 'SAVE_ANSWERS' },
    };
    const route = routes[subresource];
    if (route?.method === method) {
      target = getRequest(runtime, id, actor);
      action = route.action;
    }
  } else if (resource === 'reviews' && id && subresource && method === 'PUT') {
    const found = findParent(runtime, resource, id, actor);
    const review = found.request.reviews.find((entry) => entry.id === id);
    if (review?.field !== actor.role)
      return fail(403, 'FORBIDDEN', '배정된 분야의 담당자만 검토할 수 있습니다.');
    if (subresource === 'allocation-completion' || subresource === 'completion') {
      target = found.request;
      action = subresource === 'allocation-completion' ? 'COMPLETE_ALLOCATION' : 'COMPLETE_REVIEW';
      extra = { field: review.field };
    }
  } else if (
    resource === 'supplements' &&
    id &&
    ((subresource === 'answers' && method === 'POST') ||
      (subresource === 'resolution' && method === 'PUT'))
  ) {
    target = findParent(runtime, resource, id, actor).request;
    action = subresource === 'answers' ? 'ANSWER_SUPPLEMENT' : 'RESOLVE_SUPPLEMENT';
    extra = { supplementId: id };
  } else if (
    resource === 'submissions' &&
    id &&
    ((subresource === 'final-confirmations' && method === 'POST') ||
      (subresource === 'confirmation' && method === 'PUT'))
  ) {
    target = findParent(runtime, resource, id, actor).request;
    if (target.currentSubmissionId !== id)
      return fail(422, 'NOT_CURRENT_SUBMISSION', '현재 제출본에 대해서만 확인·확정할 수 있습니다.');
    action = subresource === 'final-confirmations' ? 'FINAL_CONFIRM' : 'FINALIZE';
  }
  if (target && action) {
    const input = parse(commandSchema, await bodyJson(request));
    const idempotencyKey = request.headers.get('idempotency-key') ?? undefined;
    if (action === 'SUBMIT' && (!idempotencyKey || idempotencyKey.length > 200))
      return fail(400, 'IDEMPOTENCY_KEY_REQUIRED', '중복 제출 방지 키가 필요합니다.');
    try {
      runtime.state = executeCommand(
        runtime.state,
        actor,
        target.id,
        { ...input, ...extra, action, idempotencyKey },
        members,
      );
    } catch (error) {
      return conflictResponse(error, target.revision);
    }
    const updated = getRequest(runtime, target.id, actor);
    const created = method === 'POST';
    const locations: Partial<Record<CommandAction, string>> = {
      REQUEST_REVIEW: `/api/reviews/${updated.reviews[0]?.id}`,
      REQUEST_SUPPLEMENT: `/api/supplements/${updated.supplements.at(-1)?.id}`,
      RETURN: `/api/stage-returns/${updated.returns.at(-1)?.id}`,
      SUBMIT: `/api/submissions/${updated.currentSubmissionId}`,
      REASSIGN: `/api/assignments/${updated.assignments.at(-1)?.id}`,
    };
    return json(
      updated,
      created ? 201 : 200,
      created ? (locations[action] ?? `/api/security-requests/${updated.id}`) : undefined,
    );
  }
  return fail(404, 'RESOURCE_NOT_FOUND', '요청한 자원을 찾을 수 없습니다.');
}

let defaultHandler: ReturnType<typeof createMockApi> | undefined;

/** 기본 모의 모드의 상태는 서버 프로세스 메모리에만 남고 재시작하면 초기화된다. */
export async function handleMockRequest(request: Request): Promise<Response> {
  defaultHandler ??= createMockApi();
  return defaultHandler(request);
}

async function dispatchContract(
  runtime: MockRuntime,
  request: Request,
  now: number,
  options: MockApiOptions,
  wire: ContractMapper,
  uploads: Map<string, { caseId: string; file: File }>,
): Promise<Response> {
  const url = new URL(request.url);
  const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  const resource = parts[1],
    numericId = parts[2],
    sub = parts[3],
    fieldKey = parts[4];
  const id = wire.original(numericId ?? '');
  const method = request.method;
  if (['llm-configurations', 'llm-connection-tests'].includes(resource)) {
    const actor = sessionMember(runtime, request, now),
      models = runtime.llmConfigurations;
    models.bindState(runtime.state);
    const timestamp = new Date(now).toISOString();
    if (resource === 'llm-connection-tests') {
      if (method === 'POST' && !numericId)
        return json(models.test(actor, await bodyJson(request), timestamp), 201);
      if (method === 'GET' && numericId) return json(models.result(actor, Number(numericId)));
    } else {
      if (method === 'GET' && numericId === 'management') return json(models.management(actor));
      if (method === 'POST' && (numericId === 'comparisons' || sub === 'comparisons'))
        return json(models.compare(actor, sub ? Number(numericId) : null, await bodyJson(request)));
      if (method === 'GET' && sub === 'history')
        return json(
          models.history(
            actor,
            Number(numericId),
            Number(url.searchParams.get('page') ?? 0),
            Number(url.searchParams.get('size') ?? 20),
          ),
        );
      if (method === 'POST' && sub === 'restorations')
        return json(models.restore(actor, Number(numericId), await bodyJson(request), timestamp));
      if (method === 'GET' && !sub)
        return json(numericId ? models.item(actor, Number(numericId)) : models.list(actor));
      if (method === 'POST' && !numericId)
        return json(models.save(actor, null, await bodyJson(request), timestamp), 201);
      if (method === 'PUT' && numericId && !sub)
        return json(models.save(actor, Number(numericId), await bodyJson(request), timestamp));
    }
    fail(404, 'NOT_FOUND', '모델 구성 경로를 찾을 수 없습니다.');
  }

  if (
    [
      'knowledge-drafts',
      'knowledge-publications',
      'knowledge-snippets',
      'private-contexts',
      'insights',
    ].includes(resource)
  ) {
    const actor = sessionMember(runtime, request, now);
    const knowledge = runtime.knowledge;
    knowledge.bindState(runtime.state);
    const page = Number(url.searchParams.get('page') ?? 0),
      size = Number(url.searchParams.get('size') ?? 20);
    const q = url.searchParams.get('q') ?? '';
    const publicationId = url.searchParams.has('knowledgePublicationId')
      ? Number(url.searchParams.get('knowledgePublicationId'))
      : undefined;
    const timestamp = new Date(now).toISOString();
    if (resource === 'insights' && numericId === 'summary' && method === 'GET') {
      if (actor.role !== 'ADMIN')
        fail(403, 'FORBIDDEN', '기관 관리자만 업무 지표를 조회할 수 있습니다.');
      const rules = await runtime.policies
        .handle(runtime.state, wire, actor, new URL('/api/firewall-rules', url), 'GET', null, now)
        .json();
      return json(mockInsights(runtime.state, actor, timestamp, rules));
    }
    if (resource === 'knowledge-drafts' && numericId === 'current') {
      if (!sub && method === 'GET') return json(knowledge.current(actor));
      if (!sub && method === 'PUT') {
        const input = parse(
          z.object({
            expectedRevision: z.number().int().nonnegative(),
            note: z.string().max(500).nullable(),
          }),
          await bodyJson(request),
        );
        return json(knowledge.saveNote(actor, input.note, input.expectedRevision, timestamp));
      }
      if (sub === 'comparison' && method === 'GET') return json(knowledge.compare(actor));
      if (sub === 'publications' && method === 'POST') {
        const input = parse(
          z.object({ expectedRevision: z.number().int().nonnegative() }),
          await bodyJson(request),
        );
        return json(knowledge.publish(actor, input.expectedRevision, timestamp), 201);
      }
      if (['snippets', 'private-contexts'].includes(sub) && method === 'GET') {
        const kind = sub === 'snippets' ? 'public' : 'private';
        return json(
          fieldKey
            ? knowledge.item(actor, kind, Number(fieldKey))
            : knowledge.list(actor, kind, q, page, size),
        );
      }
    }
    if (resource === 'knowledge-publications' && method === 'GET')
      return json(
        !numericId
          ? knowledge.history(actor, page, size)
          : sub === 'comparison'
            ? knowledge.comparison(actor, Number(numericId))
            : knowledge.published(actor, Number(numericId)),
      );
    if (['knowledge-snippets', 'private-contexts'].includes(resource)) {
      const kind = resource === 'knowledge-snippets' ? 'public' : 'private';
      if (method === 'GET')
        return json(
          kind === 'public'
            ? knowledge.publicSearch(q, publicationId)
            : numericId === 'suggestions'
              ? knowledge.suggestions(actor, q, publicationId)
              : knowledge.list(actor, 'private', q, page, size).content,
        );
      if ((method === 'POST' && !numericId) || (method === 'PUT' && numericId))
        return json(
          knowledge.save(
            actor,
            kind,
            numericId ? Number(numericId) : null,
            parse(z.record(z.string(), z.unknown()), await bodyJson(request)),
            timestamp,
          ),
          method === 'POST' ? 201 : 200,
        );
    }
    fail(404, 'NOT_FOUND', '지식·지표 요청을 찾을 수 없습니다.');
  }
  if (resource === 'configurations') {
    const actor = sessionMember(runtime, request, now);
    if (actor.role !== 'ADMIN') fail(403, 'FORBIDDEN', '기관 관리자만 설정을 변경할 수 있습니다.');
    if (numericId === 'current' && method === 'GET')
      return json(runtime.configurations.current(actor));
    if (numericId !== '1') fail(404, 'NOT_FOUND', '설정 초안을 찾을 수 없습니다.');
    if (sub === 'comparison' && method === 'GET')
      return json(runtime.configurations.comparison(actor));
    if (sub === 'publications' && method === 'POST') {
      const input = parse(
        z.object({ expectedRevision: z.number().int().nonnegative() }),
        await bodyJson(request),
      );
      const value = runtime.configurations.publish(
        actor,
        input.expectedRevision,
        new Date(now).toISOString(),
      );
      return json(value, 201, `/api/publications/${value.publicationId}`);
    }
    if (!sub && method === 'PUT') {
      const input = parse(
        z.object({
          draft: settingsSchema,
          note: z.string().max(500).nullable(),
          expectedRevision: z.number().int().nonnegative(),
        }),
        await bodyJson(request),
      );
      return json(
        runtime.configurations.save(
          actor,
          input.draft,
          input.note ?? '',
          input.expectedRevision,
          new Date(now).toISOString(),
        ),
      );
    }
    fail(404, 'NOT_FOUND', '설정 요청을 찾을 수 없습니다.');
  }
  if (resource === 'publications' && method === 'GET') {
    const actor = sessionMember(runtime, request, now);
    if (!numericId)
      return json(
        runtime.configurations.history(
          actor,
          Number(url.searchParams.get('page') ?? 0),
          Number(url.searchParams.get('size') ?? 20),
        ),
      );
    if (sub === 'comparison')
      return json(runtime.configurations.publishedComparison(actor, Number(numericId)));
    return json(
      runtime.configurations.publication(numericId === 'current' ? 'current' : Number(numericId)),
    );
  }
  if (resource === 'business-cases' && sub === 'uploaded-files' && method === 'POST') {
    const actor = sessionMember(runtime, request, now);
    const c = getCase(runtime, id, actor);
    if (c.ownerId !== actor.id) fail(403, 'FORBIDDEN', '신청자만 파일을 업로드할 수 있습니다.');
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) fail(400, 'FILE_REQUIRED', '파일을 선택해 주세요.');
    await validateFile(file);
    const fileId = String(wire.id(crypto.randomUUID()));
    uploads.set(fileId, { caseId: id, file });
    return json(
      {
        uploadedFileId: Number(fileId),
        businessCaseId: Number(numericId),
        originalName: file.name,
        contentType: file.type,
        sizeBytes: file.size,
      },
      201,
    );
  }
  const actor =
    resource === 'installation' ||
    resource === 'auth' ||
    resource === 'demo-sessions' ||
    (resource === 'members' && method === 'POST' && !numericId)
      ? undefined
      : sessionMember(runtime, request, now);
  if (resource === 'security-requests' && sub === 'consultation-comparison' && method === 'GET') {
    const visible = getRequest(runtime, id, actor!);
    const current = Object.fromEntries(
      [...visible.commonAnswers, ...visible.answers].map((a) => [
        'answer:' + a.key,
        {
          label: a.label,
          group: a.scope === 'CASE' ? '사업 정보' : '신청 정보',
          value: a.value,
          confirmed: a.confirmed && !a.needsReview,
          evidence: a.evidence ?? '',
        },
      ]),
    );
    return json({
      fingerprint: 'mock:' + visible.revision,
      baselineAvailable: false,
      baselineAt: null,
      caseTitle: visible.caseTitle,
      department: visible.department,
      baseline: {},
      current,
      changes: [],
      summary: null,
    });
  }
  if (resource === 'security-requests' && sub === 'consultation-summaries' && method === 'POST') {
    getRequest(runtime, id, actor!);
    fail(
      503,
      'MOCK_AI_UNAVAILABLE',
      '모의 화면에서는 실제 AI 협의 요약을 만들지 않습니다. 업무 서버에서 이용해 주세요.',
    );
  }
  if (resource === 'security-requests' && sub === 'infrastructure-proposals' && method === 'POST') {
    const visible = getRequest(runtime, id, actor!);
    if (
      !['INFRA', 'SECURITY'].includes(actor!.role) ||
      !visible.assignments.some(
        (a) =>
          a.active &&
          a.field === actor!.role &&
          a.assigneeId === actor!.id &&
          !a.reassignmentReason,
      )
    )
      fail(403, 'FORBIDDEN', '배정된 ICT인프라·정보보안 담당자만 초안을 요청할 수 있습니다.');
    if (visible.stage !== 2)
      fail(422, 'INVALID_STAGE', '담당자 협의 단계에서만 초안을 요청할 수 있습니다.');
    const input = parse(
      z.object({
        expectedRevision: z.number().int().nonnegative(),
        explanation: z.string().max(6000),
      }),
      await bodyJson(request),
    );
    if (input.expectedRevision !== (visible.infrastructurePlan?.revision ?? 0))
      fail(409, 'REVISION_CONFLICT', '망 구성 정보가 변경되었습니다.');
    return json({
      baseRevision: input.expectedRevision,
      connections: [],
      warnings: [
        '모의 API에서는 실제 AI 분석을 하지 않습니다. 직접 입력하거나 업무 서버에 연결해 주세요.',
      ],
      modelReference: 'mock/offline',
      servers: [],
    });
  }
  if (resource === 'security-requests' && sub === 'infrastructure-plan') {
    const visible = getRequest(runtime, id, actor!);
    const empty = { revision: 0, connections: [], notes: '', updatedBy: null, updatedAt: null };
    if (method === 'GET') return json(visible.infrastructurePlan ?? empty);
    if (method === 'PUT') {
      if (
        !['INFRA', 'SECURITY'].includes(actor!.role) ||
        !visible.assignments.some(
          (a) => a.active && a.field === actor!.role && a.assigneeId === actor!.id,
        )
      )
        fail(403, 'FORBIDDEN', '배정된 ICT인프라·정보보안 담당자만 수정할 수 있습니다.');
      if (visible.stage !== 2)
        fail(422, 'INVALID_STAGE', '담당자 협의 단계에서만 수정할 수 있습니다.');
      const input = parse(
        z.object({
          expectedRevision: z.number(),
          connections: z.array(connectionSchema).max(50),
          schemaVersion: z.number().default(1),
          draft: z.boolean().default(false),
          aiPending: z.boolean().default(false),
          servers: z.array(serverSchema).max(50).default([]),
          operations: z.record(z.string(), z.string().max(4000)).default({}),
          checklist: z.record(z.string(), z.boolean()).default({}),
          notes: z.string().max(4000),
          answerRevisions: z.record(z.string(), z.number()),
        }),
        await bodyJson(request),
      );
      if (input.expectedRevision !== (visible.infrastructurePlan?.revision ?? 0))
        fail(409, 'REVISION_CONFLICT', '다른 담당자가 수정했습니다. 새로고침해 주세요.');
      if (new Set(input.connections.map((c) => c.id)).size !== input.connections.length)
        fail(422, 'INVALID_VALUE', '통신 구간 식별자가 중복되었습니다.');
      if (new Set(input.servers.map((s) => s.id)).size !== input.servers.length)
        fail(422, 'INVALID_VALUE', '서버 식별자가 중복되었습니다.');
      for (const c of input.connections)
        for (const key of [c.sourceServerId, c.destinationServerId])
          if (key && !input.servers.some((s) => s.id === key))
            fail(422, 'INVALID_VALUE', '연결된 서버를 찾을 수 없습니다.');
      input.connections = resolveConnections(input.connections, input.servers);
      for (const c of input.connections) {
        for (const [type, value] of [
          ['IP_ADDRESS', c.sourceAddress],
          ['IP_ADDRESS', c.destinationAddress],
          ['PORT', c.port],
          ['PROTOCOL', c.protocol],
        ] as const)
          if ((!input.draft || value) && !networkValueValid(type, value))
            fail(422, 'INVALID_VALUE', '통신 구간 형식을 확인해 주세요.');
        if (c.startDate && c.endDate && c.endDate < c.startDate)
          fail(422, 'INVALID_VALUE', '허용 기간을 확인해 주세요.');
      }
      for (const server of input.servers) {
        if (server.address && !networkValueValid('IP_ADDRESS', server.address))
          fail(422, 'INVALID_VALUE', '서버 주소를 확인해 주세요.');
        if (
          !input.draft &&
          (!server.name ||
            !server.purpose ||
            !server.environment ||
            !server.address ||
            !server.zone ||
            (server.aiInferred && !server.aiConfirmed))
        )
          fail(422, 'INVALID_VALUE', '서버 필수 정보와 AI 제안을 확인해 주세요.');
      }
      if (!input.draft && (!input.connections.length || input.aiPending))
        fail(422, 'INVALID_VALUE', '통신 구간과 AI 제안을 확인해 주세요.');
      if (
        !input.draft &&
        input.schemaVersion >= 2 &&
        (!input.servers.length ||
          ['network', 'management', 'owner'].some((k) => !input.operations[k]?.trim()) ||
          Object.keys(infraCheckLabels).some((k) => !input.checklist[k]))
      )
        fail(422, 'INVALID_VALUE', '서버·운영 정보와 체크리스트를 확인해 주세요.');
      const raw = runtime.state.requests.find((r) => r.id === id)!;
      raw.infrastructurePlan = infrastructurePlanSchema.parse({
        ...input,
        revision: input.expectedRevision + 1,
        connections: input.connections,
        notes: input.notes,
        updatedBy: actor!.username,
        updatedAt: new Date(now).toISOString(),
      });
      for (const review of raw.reviews) if (review.status === 'COMPLETE') review.status = 'RECHECK';
      raw.revision++;
      return json(raw.infrastructurePlan);
    }
  }
  if (resource === 'reviewer-pools')
    return json(
      runtime.reviewerPools.handle(
        actor!,
        runtime.state,
        runtime.members.map((m) => m.actor),
        method,
        numericId,
        sub,
        method === 'POST' || (method === 'PUT' && sub === 'activation')
          ? await request.json()
          : undefined,
      ),
      method === 'POST' ? 201 : 200,
    );
  if (resource === 'todo-summary' && method === 'GET') {
    const items = runtime.activity.todos(actor!, runtime.state, wire);
    const count = (kind: string) => items.filter((i) => i.kind === kind).length;
    return json({
      role: actor!.role,
      total: items.length,
      pendingReviews: count('REVIEW'),
      answeredSupplements: count('SUPPLEMENT_ANSWERED'),
      pendingFinalConfirmations: count('FINAL_CONFIRMATION'),
      openSupplements: count('SUPPLEMENT_OPEN'),
      finalReviews: count('FINAL_REVIEW'),
      unassignedRequests: count('REASSIGNMENT'),
    });
  }
  if (resource === 'todos' && method === 'GET')
    return json(pageOf(runtime.activity.todos(actor!, runtime.state, wire), url));
  if (resource === 'notifications') {
    const items = runtime.activity.notifications(actor!, runtime.state);
    if (method === 'GET' && numericId === 'unread-count')
      return json({ unread: items.filter((n) => !n.readAt).length });
    if (method === 'GET' && !numericId)
      return json(
        pageOf(
          url.searchParams.get('unreadOnly') === 'true' ? items.filter((n) => !n.readAt) : items,
          url,
        ),
      );
    if (method === 'PATCH' && numericId) {
      const body = z.object({ read: z.literal(true) }).parse(await request.json());
      if (body.read) return json(runtime.activity.read(actor!, runtime.state, Number(numericId)));
    }
  }
  if (
    resource === 'firewall-rules' ||
    (resource === 'security-requests' && sub === 'firewall-rules')
  ) {
    return runtime.policies.handle(
      runtime.state,
      wire,
      actor!,
      url,
      method,
      method === 'GET' ? undefined : await bodyJson(request),
      now,
    );
  }
  if (resource === 'inquiries' || (resource === 'security-requests' && sub === 'inquiries')) {
    return runtime.inquiries.handle(
      runtime.state,
      wire,
      actor!,
      url,
      method,
      method === 'GET' ? undefined : await bodyJson(request),
      now,
    );
  }
  const draftFingerprint = (r: SecurityRequest) =>
    JSON.stringify([r.revision, getCase(runtime, r.caseId, actor!).answers, r.answers]);
  if (resource === 'security-requests' && sub === 'final-draft' && method === 'GET') {
    const r = getRequest(runtime, id, actor!);
    const stored = runtime.finalDrafts.get(id);
    return stored
      ? json({ ...stored.draft, stale: stored.fingerprint !== draftFingerprint(r) })
      : new Response(null, { status: 204 });
  }
  if (
    resource === 'security-requests' &&
    ['final-draft-generations', 'final-drafts'].includes(sub) &&
    method === 'POST'
  ) {
    const r = getRequest(runtime, id, actor!);
    if (actor!.id !== r.ownerId) fail(403, 'FORBIDDEN', '신청자만 초안을 작성할 수 있습니다.');
    if (r.stage !== 3 || r.status !== 'FINAL_REVIEW')
      fail(422, 'INVALID_STAGE', '최종 검토 단계에서 작성해 주세요.');
    const input = parse(
      z.object({
        expectedRevision: z.number(),
        text: z.string().trim().min(1).max(12000).optional(),
      }),
      await request.json(),
    );
    if (input.expectedRevision !== r.revision)
      fail(409, 'STALE_REVISION', '신청이 변경되었습니다.');
    if (sub === 'final-drafts' && !input.text)
      fail(422, 'EMPTY_DRAFT', '최종 보고서 내용을 작성해 주세요.');
    const draft: FinalDraft = {
      finalDraftId: Number(wire.id(crypto.randomUUID())),
      securityRequestId: Number(numericId),
      text:
        sub === 'final-drafts'
          ? input.text!
          : `${r.caseTitle} 사업의 요청 내용입니다. 저장된 답변을 확인하고 담당자 협의 내용을 반영합니다. (모의 AI 합성 초안)`,
      valueSource: sub === 'final-drafts' ? 'USER_ANSWER' : 'AI_INFERRED',
      modelReference: sub === 'final-drafts' ? null : 'fake/offline',
      confirmedBy: null,
      confirmedAt: null,
      confirmed: false,
      stale: false,
      revision: 0,
    };
    runtime.finalDrafts.set(id, { draft, fingerprint: draftFingerprint(r) });
    return json(draft, 201);
  }
  if (resource === 'final-drafts' && sub === 'confirmation' && method === 'PUT') {
    const entry = [...runtime.finalDrafts.entries()].find(
      ([, s]) => String(s.draft.finalDraftId) === numericId,
    );
    if (!entry) fail(404, 'NOT_FOUND', '최신 초안을 다시 확인해 주세요.');
    const [requestId, stored] = entry;
    const r = getRequest(runtime, requestId, actor!);
    if (actor!.id !== r.ownerId) fail(403, 'FORBIDDEN', '신청자만 확인할 수 있습니다.');
    if (r.stage !== 3 || r.status !== 'FINAL_REVIEW')
      fail(422, 'INVALID_STAGE', '최종 검토 단계에서 확인해 주세요.');
    const input = parse(
      z.object({ expectedRevision: z.number(), text: z.string().trim().min(1).max(12000) }),
      await request.json(),
    );
    if (
      input.expectedRevision !== stored.draft.revision ||
      stored.fingerprint !== draftFingerprint(r)
    )
      fail(409, 'STALE_DRAFT', '원본 답변 또는 초안이 변경되었습니다. 다시 작성해 주세요.');
    stored.draft = {
      ...stored.draft,
      text: input.text,
      confirmed: true,
      confirmedBy: actor!.username ?? actor!.id,
      confirmedAt: new Date(now).toISOString(),
      revision: stored.draft.revision + 1,
    };
    return json(stored.draft);
  }
  if (resource === 'security-requests' && sub === 'generated-documents' && method === 'POST') {
    const r = getRequest(runtime, id, actor!);
    const input = parse(
      z.object({
        submissionId: z.number().int().positive().optional(),
        aiSupplement: z.boolean().optional(),
      }),
      await request.json(),
    );
    const submission = input.submissionId
      ? r.submissions.find((s) => wire.id(s.id) === input.submissionId)
      : undefined;
    if (input.submissionId && !submission) fail(404, 'NOT_FOUND', '제출본을 찾을 수 없습니다.');
    const stored = runtime.finalDrafts.get(id);
    const doc = mockGeneratedDocument(
      r,
      submission,
      stored ? { ...stored.draft, stale: stored.fingerprint !== draftFingerprint(r) } : undefined,
      {
        generatedDocumentId: wire.id(crypto.randomUUID()),
        securityRequestId: Number(numericId),
        submissionId: input.submissionId ?? null,
        version:
          [...runtime.generatedDocuments.values()].filter(
            (d) => d.securityRequestId === Number(numericId),
          ).length + 1,
        generatedBy: actor!.username,
        generatedAt: new Date(now).toISOString(),
      },
    );
    runtime.generatedDocuments.set(doc.generatedDocumentId, doc);
    return json(doc, 201);
  }
  if (resource === 'security-requests' && sub === 'generated-documents' && method === 'GET') {
    getRequest(runtime, id, actor!);
    return json(
      [...runtime.generatedDocuments.values()].filter(
        (d) => d.securityRequestId === Number(numericId),
      ),
    );
  }
  if (resource === 'generated-documents' && method === 'GET') {
    const doc = runtime.generatedDocuments.get(Number(numericId));
    if (!doc) fail(404, 'NOT_FOUND', '문서를 찾을 수 없습니다.');
    getRequest(runtime, wire.original(String(doc.securityRequestId)), actor!);
    if (!sub) return json(doc);
    fail(
      503,
      'PDF_REQUIRES_BACKEND',
      '모의 환경에서는 PDF를 생성하지 않습니다. 실제 서버 연결 환경에서 내려받아 주세요.',
    );
  }
  if (resource === 'security-requests' && sub === 'submissions' && method === 'POST') {
    const r = getRequest(runtime, id, actor!);
    const stored = runtime.finalDrafts.get(id);
    if (
      r.stage === 3 &&
      stored &&
      (!stored.draft.confirmed || stored.fingerprint !== draftFingerprint(r))
    )
      fail(422, 'UNCONFIRMED_FINAL_DRAFT', '최신 최종 초안을 확인한 뒤 제출해 주세요.');
  }
  if (resource === 'security-requests' && method === 'GET' && sub && sub !== 'documents') {
    const r = getRequest(runtime, id, actor!);
    const collections: Record<string, unknown> = {
      reviews: wire.reviews(r),
      assignments: wire.assignments(r),
      supplements: wire.supplements(r),
      'stage-returns': wire.returns(r),
      deadlines: wire.deadlines(r),
      submissions: wire.submissions(r),
      'audit-events': runtime.state.auditEvents
        .filter((e) => e.targetId === id)
        .map((e) => wire.audit(e)),
    };
    if (sub in collections) return json(collections[sub]);
  }
  if (resource === 'submissions' && sub === 'final-confirmations' && method === 'GET') {
    const r = findParent(runtime, 'submissions', id, actor!).request;
    return json(wire.confirmations(r).filter((c) => String(c.submissionId) === numericId));
  }
  let body: Record<string, unknown> | undefined;
  if (
    !['GET', 'HEAD'].includes(method) &&
    request.headers.get('content-type')?.includes('application/json')
  )
    body = parse(z.record(z.string(), z.unknown()), await bodyJson(request));
  if (resource === 'field-help' && method === 'GET') {
    const publication = runtime.configurations.publication(
      url.searchParams.has('publicationId')
        ? Number(url.searchParams.get('publicationId'))
        : 'current',
    );
    const fields = publication.fieldSchema.fields as {
      key: string;
      label: string;
      hint?: string;
      required: boolean;
      askRole: string;
    }[];
    const field = fields.find((f) => f.key === numericId);
    if (!field) fail(404, 'FIELD_NOT_FOUND', '항목을 찾을 수 없습니다.');
    return json({
      fieldKey: field.key,
      label: field.label,
      required: field.required,
      askRole: field.askRole,
      whyAsked: field.hint ?? '사업의 보안 검토 범위를 확인하기 위한 항목입니다. (모의 안내)',
      snippets: runtime.knowledge.publicSearch(
        '',
        url.searchParams.has('knowledgePublicationId')
          ? Number(url.searchParams.get('knowledgePublicationId'))
          : undefined,
        field.key,
      ),
    });
  }
  if (resource === 'business-cases' && sub === 'interview-turns') {
    const c = getCase(runtime, id, actor!);
    if (actor!.role !== 'APPLICANT' || c.ownerId !== actor!.id)
      fail(403, 'FORBIDDEN', '신청자 본인만 이용할 수 있습니다.');
    if (method === 'GET' && !fieldKey)
      return json(
        [...runtime.interviewTurns.values()]
          .map((v) => v.turn)
          .filter((t) => t.businessCaseId === Number(numericId))
          .slice(-30),
      );
    if (
      !runtime.state.requests.some(
        (r) =>
          r.caseId === id &&
          r.stage < 4 &&
          !['CLOSED', 'WITHDRAWN', 'FINALIZED'].includes(r.status),
      )
    )
      fail(422, 'NOT_EDITABLE', '작성 가능한 신청이 없습니다.');
    const fingerprint = JSON.stringify([c.revision, c.answers]);
    if (method === 'POST' && !fieldKey) {
      const input = parse(
        z.object({
          fieldKey: z.string().min(1).max(100),
          mode: z.enum(['ASK', 'SUGGEST']),
          text: z.string().trim().min(1).max(4000),
          draft: z.string().max(4000).optional(),
          expectedRevision: z.number().int().nonnegative(),
        }),
        body,
      );
      if (input.expectedRevision !== c.revision)
        fail(409, 'REVISION_CONFLICT', '최신 사업 정보를 확인해 주세요.');
      const field = c.answers.find((a) => a.key === input.fieldKey);
      if (!field) fail(404, 'FIELD_NOT_FOUND', '항목을 찾을 수 없습니다.');
      if (input.mode === 'SUGGEST' && field.ownerRole !== 'APPLICANT')
        fail(422, 'STAFF_FIELD', '담당자 항목은 추천하지 않습니다.');
      const turn: InterviewTurn = {
        interviewTurnId: runtime.interviewTurns.size + 1,
        businessCaseId: Number(numericId),
        fieldKey: field.key,
        mode: input.mode,
        question: input.text,
        reply: '합성 AI 설명입니다. 알고 있는 사업 사실을 확인해 입력해 주세요.',
        proposedValue: input.mode === 'SUGGEST' ? '합성 사업 추천답변입니다.' : null,
        evidence: [{ tag: 'F', label: `모의 게시본 · ${field.label}` }],
        basedRevision: c.revision,
        answerRevision: field.revision ?? c.revision,
        modelReference: 'fake/offline',
        flagged: false,
        applied: false,
        createdAt: new Date(now).toISOString(),
      };
      runtime.interviewTurns.set(turn.interviewTurnId, { turn, fingerprint });
      return json(turn, 201);
    }
    if (method === 'POST' && parts[5] === 'applications') {
      const entry = runtime.interviewTurns.get(Number(fieldKey));
      if (!entry || entry.turn.businessCaseId !== Number(numericId))
        fail(404, 'NOT_FOUND', '추천답변을 찾을 수 없습니다.');
      if (entry.turn.applied) return json(entry.turn);
      const input = parse(z.object({ expectedRevision: z.number().int().nonnegative() }), body);
      if (input.expectedRevision !== c.revision || fingerprint !== entry.fingerprint)
        fail(409, 'REVISION_CONFLICT', '입력이 변경되었습니다. 다시 추천받아 주세요.');
      const a = runtime.state.cases
        .find((v) => v.id === id)!
        .answers.find((a) => a.key === entry.turn.fieldKey)!;
      if (a.confirmed || !entry.turn.proposedValue || entry.turn.flagged)
        fail(422, 'INVALID_PROPOSAL', '적용할 수 없는 제안입니다.');
      Object.assign(a, {
        value: entry.turn.proposedValue,
        source: 'AI_INFERRED',
        confirmed: false,
        confirmation: null,
        evidence: entry.turn.evidence.map((e) => e.label).join('; '),
        revision: (a.revision ?? c.revision) + 1,
      });
      entry.turn.applied = true;
      return json(entry.turn);
    }
    fail(404, 'NOT_FOUND', '인터뷰 자원을 찾을 수 없습니다.');
  }
  if (
    resource === 'business-cases' &&
    sub === 'answers' &&
    parts[5] === 'staff-check' &&
    method === 'PUT'
  ) {
    const c = getCase(runtime, id, actor!);
    if (actor!.role !== 'APPLICANT' || c.ownerId !== actor!.id)
      fail(403, 'FORBIDDEN', '신청자 본인만 요청할 수 있습니다.');
    if (
      !runtime.state.requests.some(
        (r) =>
          r.caseId === id &&
          r.stage < 4 &&
          !['CLOSED', 'WITHDRAWN', 'FINALIZED'].includes(r.status),
      )
    )
      fail(422, 'NOT_EDITABLE', '작성 가능한 신청이 없습니다.');
    const a = runtime.state.cases.find((v) => v.id === id)!.answers.find((a) => a.key === fieldKey);
    if (!a) fail(404, 'NOT_FOUND', '항목을 찾을 수 없습니다.');
    const input = parse(z.object({ expectedRevision: z.number() }), body);
    if (input.expectedRevision !== (a.revision ?? c.revision))
      fail(409, 'REVISION_CONFLICT', '최신 답변을 확인해 주세요.');
    Object.assign(a, {
      source: null,
      confirmed: false,
      confirmation: null,
      evidence: null,
      revision: input.expectedRevision + 1,
    });
    return json(wire.answer(a, id, c.revision));
  }
  if (resource === 'business-cases' && numericId && !sub && method === 'PUT') {
    const c = getCase(runtime, id, actor!);
    if (c.ownerId !== actor!.id) fail(403, 'FORBIDDEN', '신청자만 개요를 수정할 수 있습니다.');
    const input = parse(
      z.object({
        title: z.string().min(1).max(200),
        summary: z.string().max(4000),
        department: z.string().max(100),
        expectedRevision: z.number().optional(),
      }),
      body,
    );
    if (input.expectedRevision !== undefined && input.expectedRevision !== c.revision)
      fail(409, 'REVISION_CONFLICT', '최신 사업 정보를 확인해 주세요.');
    Object.assign(c, {
      title: input.title,
      description: input.summary,
      department: input.department,
      revision: c.revision + 1,
      updatedAt: new Date(now).toISOString(),
    });
    return json(wire.businessCase(c, runtime.state.requests));
  }
  if (resource === 'reviews' && sub === 'answers' && fieldKey && method === 'PUT') {
    const r = findParent(runtime, 'reviews', id, actor!).request;
    const review = r.reviews.find((v) => v.id === id)!;
    if (
      review.field !== actor!.role ||
      !r.assignments.some((v) => v.active && v.field === actor!.role && v.assigneeId === actor!.id)
    )
      fail(403, 'FORBIDDEN', '배정된 담당자만 답변을 입력할 수 있습니다.');
    const common = runtime.state.cases.find((c) => c.id === r.caseId)!;
    const stored = runtime.state.requests.find((v) => v.id === r.id)!;
    const a = [...common.answers, ...stored.answers].find((v) => v.key === fieldKey);
    if (!a) fail(404, 'ANSWER_NOT_FOUND', '답변을 찾을 수 없습니다.');
    const input = parse(
      z.object({
        value: z.string().max(4000).optional(),
        expectedRevision: z.number().optional(),
        notApplicable: z.boolean().optional(),
      }),
      body,
    );
    if (
      input.expectedRevision !== undefined &&
      input.expectedRevision !== (a.revision ?? (a.scope === 'CASE' ? common.revision : r.revision))
    )
      fail(409, 'REVISION_CONFLICT', '최신 답변을 확인해 주세요.');
    const value = {
      key: fieldKey,
      value: input.notApplicable ? '미해당' : (input.value ?? ''),
      confirmed: true,
      notApplicable: input.notApplicable ?? input.value === '미해당',
    };
    if (a.scope === 'CASE')
      runtime.state = saveCaseAnswers(runtime.state, actor!, common.id, common.revision, [value]);
    else
      runtime.state = executeCommand(
        runtime.state,
        actor!,
        r.id,
        { action: 'SAVE_ANSWERS', expectedRevision: r.revision, answers: [value] },
        runtime.members.map((m) => m.actor),
      );
    const owner =
      a.scope === 'CASE'
        ? runtime.state.cases.find((v) => v.id === common.id)!
        : runtime.state.requests.find((v) => v.id === r.id)!;
    const updated = owner.answers.find((v) => v.key === fieldKey)!;
    updated.revision = (a.revision ?? owner.revision - 1) + 1;
    return json(wire.answer(updated, owner.id, owner.revision));
  }
  if (
    (resource === 'business-cases' || resource === 'security-requests') &&
    sub === 'answers' &&
    method === 'PUT' &&
    parts[5] === 'confirmation'
  ) {
    const current =
      resource === 'business-cases'
        ? getCase(runtime, id, actor!)
        : getRequest(runtime, id, actor!);
    const answer = current.answers.find((a) => a.key === fieldKey);
    if (!answer) fail(404, 'ANSWER_NOT_FOUND', '답변을 찾을 수 없습니다.');
    if (answer.source !== 'AI_INFERRED')
      fail(422, 'AI_CONFIRMATION_REQUIRED', 'AI 제안 값만 사용자가 확인할 수 있습니다.');
    const input = parse(z.object({ expectedRevision: z.number() }), body);
    if (input.expectedRevision !== (answer.revision ?? current.revision))
      fail(409, 'REVISION_CONFLICT', '최신 답변을 확인해 주세요.');
    const values = [
      { key: fieldKey, value: answer.value, confirmed: true, notApplicable: answer.notApplicable },
    ];
    if (resource === 'business-cases')
      runtime.state = saveCaseAnswers(runtime.state, actor!, id, current.revision, values);
    else
      runtime.state = executeCommand(
        runtime.state,
        actor!,
        id,
        { action: 'SAVE_ANSWERS', expectedRevision: current.revision, answers: values },
        runtime.members.map((m) => m.actor),
      );
    const updated =
      resource === 'business-cases'
        ? getCase(runtime, id, actor!)
        : getRequest(runtime, id, actor!);
    const stored =
      resource === 'business-cases'
        ? runtime.state.cases.find((c) => c.id === id)!
        : runtime.state.requests.find((r) => r.id === id)!;
    const a = stored.answers.find((a) => a.key === fieldKey)!;
    a.revision = input.expectedRevision + 1;
    return json(wire.answer(a, id, updated.revision));
  }
  let legacyResource = resource,
    legacyId = id,
    legacySub: string | undefined = sub,
    legacyMethod = method;
  if (resource === 'members' && numericId) {
    legacyId = runtime.members.find((m) => m.actor.username === numericId)?.actor.id ?? id;
    if (sub === 'activation' && method === 'PUT') {
      body = { ...body, role: runtime.members.find((m) => m.actor.id === legacyId)?.actor.role };
      legacySub = 'role-assignments';
      legacyMethod = 'POST';
    }
  }
  if (resource === 'business-cases' && !numericId && method === 'POST' && body) {
    body = { ...body, description: body.summary };
    delete body.summary;
  }
  if (resource === 'business-cases' && sub === 'analysis-jobs' && method === 'POST' && body) {
    const upload = uploads.get(String(body.uploadedFileId));
    if (!upload || upload.caseId !== id)
      fail(404, 'FILE_NOT_FOUND', '업로드 파일을 찾을 수 없습니다.');
    const c = getCase(runtime, id, actor!);
    body = { text: c.description, expectedRevision: c.revision };
  }
  let savedKeys: string[] | undefined;
  if (
    (resource === 'business-cases' || resource === 'security-requests') &&
    sub === 'answers' &&
    method === 'PATCH' &&
    body
  ) {
    const c =
      resource === 'business-cases'
        ? getCase(runtime, id, actor!)
        : getRequest(runtime, id, actor!);
    const items = parse(
      z.array(
        z.object({
          fieldKey: z.string(),
          value: z.string().max(4000).default(''),
          expectedRevision: z.number().optional(),
          notApplicable: z.boolean().optional(),
        }),
      ),
      body.answers,
    );
    for (const item of items) {
      const a = c.answers.find((v) => v.key === item.fieldKey);
      if (
        item.expectedRevision !== undefined &&
        item.expectedRevision !== (a?.revision ?? c.revision)
      )
        fail(409, 'REVISION_CONFLICT', '입력한 내용을 보존한 채 최신 답변을 확인해 주세요.');
    }
    savedKeys = items.map((v) => v.fieldKey);
    body = {
      expectedRevision: c.revision,
      answers: items.map((v) => ({
        key: v.fieldKey,
        value: v.notApplicable ? '미해당' : v.value,
        confirmed: true,
        notApplicable: v.notApplicable ?? v.value === '미해당',
      })),
    };
    if (resource === 'business-cases') legacySub = undefined;
  }
  if (resource === 'reviews' && sub === 'supplements' && method === 'POST') {
    const parent = findParent(runtime, 'reviews', id, actor!).request;
    const review = parent.reviews.find((v) => v.id === id)!;
    legacyResource = 'security-requests';
    legacyId = parent.id;
    legacySub = 'supplements';
    body = { ...body, field: review.field };
  }
  if (body) {
    if ('opinion' in body) {
      body.comment = body.opinion;
      delete body.opinion;
    }
    if ('note' in body) {
      body.answer = body.note;
      delete body.note;
    }
    if ('assigneeUsername' in body) {
      body.assigneeId = runtime.members.find(
        (m) => m.actor.username === body!.assigneeUsername,
      )?.actor.id;
      delete body.assigneeUsername;
    }
    delete body.checklist;
    delete body.fieldReasons;
    if (resource === 'security-requests' && sub === 'assignments')
      body.expectedRevision = getRequest(runtime, id, actor!).revision;
  }
  if (method === 'GET' && resource === 'security-requests' && !numericId)
    return json(
      mockRequestListing(
        visibleRequests(runtime, actor!),
        actor!,
        new URL(request.url).searchParams,
        wire,
      ),
    );
  if (method === 'GET' && resource === 'audit-events')
    return json(mockAuditListing(runtime.state, actor!, new URL(request.url).searchParams, wire));
  const legacyUrl = new URL(request.url);
  legacyUrl.pathname =
    '/api/' +
    [legacyResource, legacyId || undefined, legacySub]
      .filter((v): v is string => Boolean(v))
      .map(encodeURIComponent)
      .join('/');
  if (legacyUrl.searchParams.has('submissionId'))
    legacyUrl.searchParams.set(
      'submissionId',
      wire.original(legacyUrl.searchParams.get('submissionId')!),
    );
  const headers = new Headers(request.headers);
  if (body) headers.set('content-type', 'application/json');
  const legacy = new Request(legacyUrl, {
    method: legacyMethod,
    headers,
    body: body
      ? JSON.stringify(body)
      : !['GET', 'HEAD'].includes(method)
        ? await request.arrayBuffer()
        : undefined,
  });
  const preserved =
    resource === 'analysis-jobs' && sub === 'applications'
      ? getCase(runtime, runtime.analyses.get(id)!.caseId, actor!)
          .answers.filter(
            (a) => a.confirmed && (a.key === 'purpose' || a.key === 'project.summary'),
          )
          .map((a) => a.key)
      : [];
  const response = await dispatch(runtime, legacy, now, options);
  if (!response.ok || response.status === 204 || sub === 'documents') return response;
  if (resource === 'security-requests' && sub === 'submissions' && method === 'POST') {
    const r = runtime.state.requests.find((item) => item.id === id)!;
    const submission = r.submissions.find((item) => item.id === r.currentSubmissionId);
    const stored = runtime.finalDrafts.get(id);
    if (submission && stored && !submission.snapshot)
      submission.snapshot = { finalDraft: structuredClone(stored.draft) };
  }
  const value: unknown = await response.json();
  let output: unknown = value;
  if (
    (resource === 'auth' && (numericId === 'me' || numericId === 'login')) ||
    resource === 'demo-sessions'
  )
    output = wire.session(value as Session);
  else if (resource === 'sessions' && sub === 'renewals')
    output = { expiresAt: (value as Session).expiresAt };
  else if (resource === 'members') {
    const data = value as Actor | { content: Actor[] };
    output = 'content' in data ? data.content.map((m) => wire.member(m)) : wire.member(data);
  } else if (resource === 'audit-events') {
    const data = value as
      | AuditEvent
      | { content: AuditEvent[]; page: number; size: number; totalElements: number };
    output =
      'content' in data
        ? { ...data, content: data.content.map((e) => wire.audit(e)) }
        : wire.audit(data);
  } else if (resource === 'business-cases' && sub === 'analysis-jobs')
    output = wire.analysis(value as CaseAnalysis);
  else if (resource === 'analysis-jobs') {
    const analysis = runtime.analyses.get(id)!;
    output =
      sub === 'applications'
        ? {
            job: wire.analysis(analysis),
            summaryProposal: (() => {
              const c = getCase(runtime, analysis.caseId, actor!);
              const a = c.answers.find((a) => a.key === analysis.suggestions[0]?.key);
              return a && !preserved.includes(a.key) ? wire.answer(a, c.id, c.revision) : null;
            })(),
            proposals: [],
            warnings: preserved.map((k) => `${k}: 사용자가 확인한 값은 덮어쓰지 않았습니다.`),
          }
        : wire.analysis(value as CaseAnalysis);
  } else if (resource === 'business-cases') {
    if (savedKeys) {
      getCase(runtime, id, actor!);
      const c = runtime.state.cases.find((c) => c.id === id)!;
      output = c.answers
        .filter((a) => savedKeys!.includes(a.key))
        .map((a) => {
          a.revision = (a.revision ?? c.revision - 1) + 1;
          return wire.answer(a, id, c.revision);
        });
    } else if (value && typeof value === 'object' && 'content' in value) {
      const page = value as { content: BusinessCase[] };
      output = {
        ...page,
        content: page.content.map((c) => wire.businessCase(c, runtime.state.requests)),
      };
    } else output = wire.businessCase(value as BusinessCase, runtime.state.requests);
  } else if (resource === 'security-requests' && !numericId) {
    const page = value as { content: SecurityRequest[] };
    output = { ...page, content: page.content.map((r) => wire.list(r)) };
  } else if (
    resource === 'security-requests' ||
    ['reviews', 'supplements', 'submissions'].includes(resource)
  ) {
    const r =
      resource === 'security-requests'
        ? getRequest(runtime, id, actor!)
        : findParent(runtime, resource, id, actor!).request;
    if (savedKeys)
      output = runtime.state.requests
        .find((v) => v.id === r.id)!
        .answers.filter((a) => savedKeys!.includes(a.key))
        .map((a) => {
          a.revision = (a.revision ?? r.revision - 1) + 1;
          return wire.answer(a, r.id, r.revision);
        });
    else if (sub === 'submissions' || (resource === 'submissions' && !sub))
      output = wire.submissions(r).find((v) => v.latest);
    else if (resource === 'reviews')
      output =
        sub === 'supplements'
          ? wire.supplements(r).at(-1)
          : wire.reviews(r).find((v) => String(v.reviewId) === numericId);
    else if (resource === 'supplements')
      output = wire.supplements(r).find((v) => String(v.supplementId) === numericId);
    else output = wire.request(r);
  }
  const result = new Response(JSON.stringify(output), {
    status: resource === 'sessions' && sub === 'renewals' ? 201 : response.status,
    headers: response.headers,
  });
  const location = result.headers.get('location');
  if (location) {
    const segments = location.split('/');
    segments[segments.length - 1] = String(wire.id(segments.at(-1)!));
    result.headers.set('location', segments.join('/'));
  }
  return result;
}
