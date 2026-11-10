import { expect, test } from 'vitest';
import { z } from 'zod';
import {
  answerDto,
  pageDto,
  publicationDto,
  requestDto,
  requestListDto,
} from '@/features/request/apiTypes';
import {
  actionCandidates,
  adaptAnswers,
  adaptCase,
  adaptList,
  adaptRequest,
} from '@/features/request/adapters/backend';
import { commandRequest } from '@/features/request/useRequests';

const summary = {
  securityRequestId: 42,
  businessCaseId: 7,
  docType: 'CUSTOM_FORM',
  stage: 3,
  status: 'FINAL_REVIEW',
  statusLabel: '서버 최종 검토',
  revision: 0,
  updatedAt: '2026-11-09T01:00:00Z',
  caseTitle: '합성 사업',
  department: '합성 부서',
  applicantUsername: 'synthetic',
};

test('실제 API의 3단계 반환은 신청자가 아니라 배정된 담당자의 작업 후보다', () => {
  expect(actionCandidates(3, 'FINAL_REVIEW', 'APPLICANT')).not.toContain('RETURN');
  expect(actionCandidates(3, 'FINAL_REVIEW', 'INFRA')).toContain('RETURN');
  expect(actionCandidates(3, 'FINAL_REVIEW', 'SECURITY')).toContain('RETURN');
});

test('게시본의 단일 분야·적용 항목을 따르고 해결한 반환 항목을 계속 강조하지 않는다', () => {
  const publication = publicationDto.parse({
    publicationId: 1,
    version: 1,
    fieldSchema: {
      docTypes: [{ code: 'CUSTOM_FORM', reviewFields: ['SECURITY'] }],
      fields: [
        {
          key: 'other',
          label: '다른 서류 전용',
          scope: 'CASE',
          docTypes: ['FIREWALL'],
          required: true,
          askRole: 'INFRA',
        },
      ],
    },
  });
  const businessCase = adaptCase(
    {
      businessCaseId: 7,
      title: '합성',
      summary: '',
      department: '',
      applicantUsername: 'synthetic',
      revision: 0,
      publicationId: 1,
      knowledgePublicationId: 1,
      caseAnswers: [],
      createdAt: summary.updatedAt,
      updatedAt: summary.updatedAt,
    },
    publication,
  );
  const request = adaptRequest(
    requestDto.parse({ ...summary, answers: [], createdAt: summary.updatedAt }),
    businessCase,
    publication,
    {
      reviews: [],
      assignments: [],
      supplements: [],
      deadlines: [],
      submissions: [],
      finalConfirmations: [],
      returns: [
        {
          stageReturnId: 1,
          fromStage: 4,
          toStage: 3,
          reason: '합성 반환',
          fieldKeys: ['resolved'],
          fieldReasons: {},
          returnedBy: 'security',
          returnedAt: summary.updatedAt,
        },
      ],
    },
    'SECURITY',
  );
  expect(request.requiredReviewFields).toEqual(['SECURITY']);
  expect(request.commonAnswers).toEqual([]);
  expect(request.blockers).toEqual(['정보보안 협의가 완료되지 않았습니다.']);
  expect(request.highlightedFields).toEqual([]);
  expect(request.returns[0].fieldKeys).toEqual(['resolved']);
});

test('확장 서류 코드·숫자 식별자·0부터 시작하는 revision과 서버 표시 문구를 보존한다', () => {
  const request = adaptList(requestListDto.parse(summary), 'APPLICANT');
  expect(request).toMatchObject({
    id: '42',
    caseId: '7',
    docType: 'CUSTOM_FORM',
    revision: 0,
    statusLabel: '서버 최종 검토',
  });
  expect(request.allowedActions).toContain('SUBMIT');
  expect(request.blockers).toEqual([]);
  expect(
    requestDto.safeParse({
      ...summary,
      securityRequestId: '42',
      answers: [],
      createdAt: summary.updatedAt,
    }).success,
  ).toBe(false);
});

test('Spring Page와 명시적 PageResponse의 메타데이터를 읽는다', () => {
  const schema = pageDto(z.string());
  expect(
    schema.parse({
      content: ['a'],
      page: { size: 20, number: 1, totalElements: 21, totalPages: 2 },
    }).page.number,
  ).toBe(1);
  expect(
    schema.parse({ content: ['a'], page: 1, size: 20, totalElements: 21 }).page.totalPages,
  ).toBe(2);
});

test('답변은 게시본 질문과 조인하고 확인자 역할을 만들어내지 않는다', () => {
  const pub = publicationDto.parse({
    publicationId: 1,
    version: 1,
    fieldSchema: {
      fields: [
        {
          key: 'project.summary',
          label: '사업 개요',
          scope: 'CASE',
          docTypes: [],
          required: true,
          askRole: 'APPLICANT',
        },
      ],
    },
  });
  const answer = answerDto.parse({
    answerId: 9,
    fieldKey: 'project.summary',
    scope: 'CASE',
    value: '합성 자료',
    valueSource: 'AI_INFERRED',
    evidence: null,
    confirmed: true,
    confirmedBy: 'synthetic',
    confirmedAt: '2026-11-09T01:00:00Z',
    needsReview: true,
    revision: 8,
  });
  const [view] = adaptAnswers([answer], pub, 'CASE');
  expect(view).toMatchObject({
    key: 'project.summary',
    label: '사업 개요',
    revision: 8,
    needsReview: true,
  });
  expect(view.confirmation).not.toHaveProperty('role');
});

test('협의·보완은 해당 자원의 revision과 실제 필드명으로 전송한다', () => {
  const request = adaptList(requestListDto.parse(summary), 'INFRA');
  request.reviews = [
    {
      id: '5',
      field: 'INFRA',
      status: 'IN_REVIEW',
      allocationCompleted: true,
      comment: null,
      completedAt: null,
      completedBy: null,
      revision: 11,
    },
  ];
  const completed = commandRequest(request, {
    action: 'COMPLETE_REVIEW',
    field: 'INFRA',
    expectedRevision: 3,
    comment: '합성 검토 의견',
    checklist: { network: true },
  });
  expect(completed).toEqual({
    path: '/api/reviews/5/completion',
    method: 'PUT',
    body: { opinion: '합성 검토 의견', checklist: { network: true }, expectedRevision: 11 },
  });
  const supplement = commandRequest(request, {
    action: 'REQUEST_SUPPLEMENT',
    field: 'INFRA',
    expectedRevision: 3,
    fieldKeys: ['project.summary'],
    reason: '확인 필요',
  });
  expect(supplement.path).toBe('/api/reviews/5/supplements');
  expect(supplement.body).not.toHaveProperty('field');
});

test('제출은 Back 컨트롤러가 요구하는 revision 본문과 멱등 헤더만 보낸다', () => {
  const request = adaptList(requestListDto.parse(summary), 'APPLICANT');
  expect(
    commandRequest(request, {
      action: 'SUBMIT',
      expectedRevision: 4,
      idempotencyKey: 'synthetic-key',
    }),
  ).toEqual({
    path: '/api/security-requests/42/submissions',
    method: 'POST',
    body: { expectedRevision: 4 },
    headers: { 'Idempotency-Key': 'synthetic-key' },
  });
});
