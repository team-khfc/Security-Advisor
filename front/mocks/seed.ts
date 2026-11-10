import type { Actor, Role } from '@/lib/types';
import type {
  Answer,
  BusinessCase,
  DocumentType,
  MockState,
  SecurityRequest,
} from '@/features/request/types';

export const MOCK_TIME = '2026-11-07T09:00:00+09:00';

/** 실존 인물과 무관한 합성 계정이며 비밀번호는 실행 환경에서 별도로 받는다. */
export const MOCK_MEMBERS: Actor[] = [
  {
    id: 'demo-applicant',
    username: 'applicant',
    displayName: '신청자 가',
    department: '합성 디지털사업팀',
    role: 'APPLICANT',
    active: true,
  },
  {
    id: 'demo-applicant-2',
    username: 'applicant2',
    displayName: '신청자 나',
    department: '합성 운영지원팀',
    role: 'APPLICANT',
    active: true,
  },
  {
    id: 'demo-infra',
    username: 'infra',
    displayName: '인프라 담당 가',
    department: '합성 인프라팀',
    role: 'INFRA',
    active: true,
  },
  {
    id: 'demo-security',
    username: 'security',
    displayName: '보안 담당 가',
    department: '합성 정보보안팀',
    role: 'SECURITY',
    active: true,
  },
  {
    id: 'demo-admin',
    username: 'admin',
    displayName: '관리자 가',
    department: '합성 운영지원팀',
    role: 'ADMIN',
    active: true,
  },
];

const COMMON_FIELDS: [string, string, Role, string][] = [
  ['purpose', '사업 목적', 'APPLICANT', '공개 자료를 검색하고 안내하는 합성 서비스 구축'],
  ['dataTypes', '처리하는 정보', 'APPLICANT', '공개 정책 자료와 합성 시험 데이터'],
  ['externalTransfer', '외부 전송 여부', 'APPLICANT', '공개 자료 조회 요청만 전송'],
  ['dataFlow', '자료의 흐름', 'APPLICANT', '이용자 → 합성 안내 서비스 → 공개 자료 API'],
  ['sourceSystem', '출발지 시스템', 'INFRA', '합성 안내 서버'],
  ['sourceIp', '출발지 IP', 'INFRA', '192.0.2.10'],
  ['destinationSystem', '목적지 시스템', 'INFRA', '합성 공개 API'],
  ['destinationIp', '목적지 IP', 'INFRA', '198.51.100.20'],
  ['protocol', '통신 방식', 'INFRA', 'TCP'],
  ['port', '목적지 포트', 'INFRA', '443'],
  ['period', '사용 기간', 'INFRA', '2026-11-11 ~ 2026-12-11'],
];

function member(role: Role): Actor {
  const result = MOCK_MEMBERS.find((item) => item.role === role);
  if (!result) throw new Error('합성 계정 정의가 누락되었습니다.');
  return result;
}

function makeAnswer(
  key: string,
  label: string,
  ownerRole: Role,
  scope: Answer['scope'],
  value = '',
): Answer {
  const actor = member(ownerRole);
  return {
    key,
    label,
    scope,
    ownerRole,
    required: true,
    value,
    source: value ? (ownerRole === 'APPLICANT' ? 'USER_ANSWER' : 'STAFF_INPUT') : null,
    evidence: null,
    confirmed: Boolean(value),
    notApplicable: false,
    confirmation: value
      ? { actorId: actor.id, actorName: actor.displayName, role: actor.role, at: MOCK_TIME }
      : null,
  };
}

/** 빈 질문 스키마에도 담당 역할을 남겨 내부 사실을 AI가 채우지 못하게 한다. */
export function createEmptyCommonAnswers(): Answer[] {
  return COMMON_FIELDS.map(([key, label, role]) => makeAnswer(key, label, role, 'CASE'));
}

/** 서류마다 다른 질문만 생성하여 CASE 질문의 중복을 피한다. */
export function createEmptyRequestAnswers(docType: DocumentType): Answer[] {
  return docType === 'FIREWALL'
    ? [
        makeAnswer('connectionPurpose', '연결 목적', 'APPLICANT', 'REQUEST'),
        makeAnswer('accessControl', '접근 통제 방안', 'SECURITY', 'REQUEST'),
      ]
    : [
        makeAnswer('serviceScope', '검토 대상 범위', 'APPLICANT', 'REQUEST'),
        makeAnswer('securityControls', '보안 대책', 'SECURITY', 'REQUEST'),
      ];
}

/** 합성 신규 신청과 연장 신청은 같은 빈 업무 상태에서 시작한다. */
export function makeRequest(
  businessCase: BusinessCase,
  docType: DocumentType,
  id: string,
): SecurityRequest {
  return {
    id,
    caseId: businessCase.id,
    caseTitle: businessCase.title,
    department: businessCase.department,
    docType,
    ownerId: businessCase.ownerId,
    ownerName: businessCase.ownerName,
    stage: 1,
    status: 'DRAFT',
    revision: 1,
    caseRevision: businessCase.revision,
    publicationVersion: businessCase.publicationVersion,
    commonAnswers: structuredClone(businessCase.answers),
    answers: createEmptyRequestAnswers(docType),
    reviews: (['INFRA', 'SECURITY'] as const).map((field) => ({
      id: `${id}-${field.toLowerCase()}`,
      field,
      status: 'PENDING',
      allocationCompleted: false,
      comment: null,
      completedBy: null,
      completedAt: null,
    })),
    assignments: [],
    supplements: [],
    returns: [],
    deadlines: [],
    submissions: [],
    finalConfirmations: [],
    currentSubmissionId: null,
    changedCommonFields: [],
    highlightedFields: [],
    blockers: [],
    allowedActions: [],
    createdAt: businessCase.createdAt,
    updatedAt: MOCK_TIME,
  };
}

function seedReviews(request: SecurityRequest, complete: boolean) {
  request.assignments = (['INFRA', 'SECURITY'] as const).map((field) => ({
    id: `${request.id}-assignment-${field.toLowerCase()}`,
    field,
    assigneeId: member(field).id,
    assigneeName: member(field).displayName,
    active: true,
    reason: '합성 게시본의 기본 담당자 배정',
    assignedAt: request.createdAt,
  }));
  for (const review of request.reviews) {
    review.status = complete ? 'COMPLETE' : 'PENDING';
    review.allocationCompleted = complete && review.field === 'INFRA';
    review.comment = complete ? '합성 자료의 담당 분야를 확인했습니다.' : null;
    review.completedBy = complete ? member(review.field).id : null;
    review.completedAt = complete ? MOCK_TIME : null;
    request.deadlines.push({
      id: `${request.id}-consultation-${review.field.toLowerCase()}`,
      field: review.field,
      kind: 'CONSULTATION',
      dueAt: '2026-11-13T23:59:59+09:00',
      active: !complete,
      closedAt: complete ? MOCK_TIME : null,
      timing: complete ? 'CLOSED' : 'WITHIN',
    });
  }
}

function fillRequestAnswers(request: SecurityRequest) {
  request.answers = request.answers.map((answer) =>
    makeAnswer(
      answer.key,
      answer.label,
      answer.ownerRole,
      'REQUEST',
      answer.ownerRole === 'SECURITY'
        ? '합성 서비스 계정의 최소 권한과 접근 기록을 확인합니다.'
        : '공개 자료 조회 기능과 합성 시험 환경을 대상으로 합니다.',
    ),
  );
}

function seedSubmission(request: SecurityRequest, finalized: boolean) {
  const id = `${request.id}-submission-1`;
  request.stage = 4;
  request.status = finalized ? 'FINALIZED' : 'SUBMITTED';
  request.currentSubmissionId = id;
  request.submissions = [
    {
      id,
      number: 1,
      requestRevision: request.revision,
      caseRevision: request.caseRevision,
      publicationVersion: request.publicationVersion,
      commonAnswers: structuredClone(request.commonAnswers),
      answers: structuredClone(request.answers),
      idempotencyKey: `${id}-synthetic-key`,
      createdAt: MOCK_TIME,
    },
  ];
  request.deadlines.push({
    id: `${request.id}-finalization-1`,
    field: null,
    kind: 'FINALIZATION',
    dueAt: '2026-11-13T23:59:59+09:00',
    active: !finalized,
    closedAt: finalized ? MOCK_TIME : null,
    timing: finalized ? 'CLOSED' : 'WITHIN',
  });
  if (finalized) {
    request.finalConfirmations = (['INFRA', 'SECURITY'] as const).map((field) => ({
      id: `${id}-${field.toLowerCase()}`,
      submissionId: id,
      field,
      actorName: member(field).displayName,
      confirmedAt: MOCK_TIME,
    }));
  }
}

/** 각 상태를 확인할 수 있는 합성 자료이며 실제 내부망·실존 인물을 포함하지 않는다. */
export function createMockState(): MockState {
  const state: MockState = { cases: [], requests: [], auditEvents: [], sequence: 100 };
  const titles = [
    '공공자료 안내 서비스 구축',
    '정책정보 API 연계',
    '교육지원 포털 개선',
    '공공기록 열람 서비스',
    '합성 교육 통계 연계',
    '합성 업무자료 검색 서비스',
  ];

  for (const [index, title] of titles.entries()) {
    const owner = index === 5 ? MOCK_MEMBERS[1] : member('APPLICANT');
    const businessCase: BusinessCase = {
      id: `demo-case-${index + 1}`,
      title,
      department: owner.department,
      description: '공개 자료와 합성 데이터로 작성한 개발용 사업입니다.',
      ownerId: owner.id,
      ownerName: owner.displayName,
      revision: 1,
      publicationVersion: 1,
      answers: COMMON_FIELDS.map(([key, label, role, value]) =>
        makeAnswer(key, label, role, 'CASE', index === 0 && role === 'INFRA' ? '' : value),
      ),
      createdAt: `2026-11-0${Math.max(1, index + 1)}T09:00:00+09:00`,
      updatedAt: MOCK_TIME,
    };
    state.cases.push(businessCase);
    const request = makeRequest(
      businessCase,
      index === 2 ? 'SECURITY_REVIEW' : 'FIREWALL',
      `demo-request-${index + 1}`,
    );
    fillRequestAnswers(request);

    if (index === 0) {
      request.stage = 2;
      request.status = 'CONSULTING';
      request.answers[1] = createEmptyRequestAnswers('FIREWALL')[1];
      seedReviews(request, false);
      const sibling = makeRequest(businessCase, 'SECURITY_REVIEW', 'demo-request-1-security');
      sibling.answers[0] = makeAnswer(
        'serviceScope',
        '검토 대상 범위',
        'APPLICANT',
        'REQUEST',
        '공개 자료를 활용하는 합성 안내 서비스의 구축 범위',
      );
      state.requests.push(sibling);
    } else if (index === 1) {
      seedReviews(request, true);
      request.stage = 3;
      request.status = 'FINAL_REVIEW';
      request.answers[0].source = 'AI_INFERRED';
      request.answers[0].evidence = '합성 사업개요서 2절 · AI 모의 응답';
      request.answers[0].confirmed = false;
      request.answers[0].confirmation = null;
    } else if (index === 2 || index === 3) {
      seedReviews(request, true);
      seedSubmission(request, index === 3);
    } else if (index === 4) {
      seedReviews(request, false);
      request.stage = 2;
      request.status = 'SUPPLEMENT_REQUESTED';
      request.reviews[0].status = 'COMPLETE';
      request.reviews[0].allocationCompleted = true;
      request.reviews[0].completedBy = member('INFRA').id;
      request.reviews[0].completedAt = MOCK_TIME;
      request.reviews[1].status = 'SUPPLEMENT_REQUESTED';
      request.highlightedFields = ['purpose'];
      request.supplements = [
        {
          id: 'demo-supplement-1',
          field: 'SECURITY',
          fieldKeys: ['purpose'],
          reason: '공개 자료를 사용하는 업무 목적을 한 문장 더 설명해 주세요.',
          answer: null,
          status: 'OPEN',
          requestedBy: member('SECURITY').id,
          createdAt: MOCK_TIME,
          resolvedAt: null,
        },
      ];
      request.deadlines.push({
        id: 'demo-supplement-deadline-1',
        field: null,
        kind: 'SUPPLEMENT',
        dueAt: '2026-11-06T23:59:59+09:00',
        active: true,
        closedAt: null,
        timing: 'OVERDUE',
      });
    }

    state.requests.push(request);
    state.auditEvents.push({
      id: `demo-audit-${index + 1}`,
      actorId: owner.id,
      actorName: owner.displayName,
      actorRole: owner.role,
      targetType: 'SecurityRequest',
      targetId: request.id,
      targetRevision: request.revision,
      action: 'SEED_CREATED',
      reason: '화면 검증용 합성 신청을 준비했습니다.',
      fieldKeys: [],
      requestId: `demo-trace-${index + 1}`,
      createdAt: request.createdAt,
    });
  }
  return state;
}
