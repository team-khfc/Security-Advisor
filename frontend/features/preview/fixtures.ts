import type { Analysis, Answer, SecurityRequest } from '@/features/request';
import type { Policy } from '@/lib/sharedTypes';
import type { Settings } from '@/features/configuration';

const now = '2026-11-06T06:30:00Z';
const source = {
  kind: 'USER_ANSWER' as const,
  evidence: '합성 사업개요서의 신청자 작성 내용',
  actorName: '신청 담당자 (합성)',
  at: now,
};
const confirmed = { actorName: '신청 담당자 (합성)', role: 'APPLICANT' as const, at: now };
export const previewPolicy: Policy = {
  institutionName: '디지털혁신기관 (합성)',
  reviewMode: 'INFRA_FIRST',
  requireSecurity: true,
  requireInfra: true,
  questions: [
    {
      key: 'custom_audience',
      label: '서비스 공개 범위',
      reason: '공개 범위에 따라 안내와 접근 통제 방법을 확인합니다.',
      ownerRole: 'APPLICANT',
      required: true,
    },
    {
      key: 'custom_channel',
      label: '이용자 문의 채널',
      reason: '사용자가 오류나 부정확한 응답을 알려 줄 경로를 설명합니다.',
      ownerRole: 'APPLICANT',
      required: false,
    },
    {
      key: 'custom_operation',
      label: '시연 운영 계획',
      reason: '운영 기간과 종료 시 자료 정리 계획을 확인합니다.',
      ownerRole: 'APPLICANT',
      required: true,
    },
    {
      key: 'custom_data',
      label: '학습·참고 자료 범위',
      reason: '공개 자료와 기관 비공개 정보를 분리합니다.',
      ownerRole: 'SECURITY',
      required: true,
    },
    {
      key: 'custom_review',
      label: 'AI 응답 검토 절차',
      reason: '정보 후보를 사람이 확인하는 절차를 정합니다.',
      ownerRole: 'SECURITY',
      required: true,
    },
    {
      key: 'custom_incident',
      label: '오류 대응 담당',
      reason: '시연 중 오류를 확인할 담당 역할을 적습니다.',
      ownerRole: 'SECURITY',
      required: false,
    },
    {
      key: 'custom_backup',
      label: '합성 데이터 복구 계획',
      reason: '시연 자료의 복구 절차를 담당자가 확인합니다.',
      ownerRole: 'INFRA',
      required: false,
    },
    {
      key: 'custom_close',
      label: '시연 종료 점검',
      reason: '만료 후 통신 규칙과 시연 자료를 정리합니다.',
      ownerRole: 'INFRA',
      required: true,
    },
  ],
  documentFooter: '본 문서는 합성 시연 자료입니다. 검토 완료와 실제 처리 완료를 구분합니다.',
  model: {
    provider: 'EXAMPLE',
    endpoint: '',
    model: 'extractive-demo',
    keyReference: '',
    temperature: 0.2,
    maxTokens: 1200,
    timeoutSeconds: 30,
  },
};
const answers: Answer[] = [
  {
    key: 'purpose',
    label: '사업 목적 및 배경',
    reason: '사업을 추진하는 목적과 기대 효과를 알려 주세요.',
    ownerRole: 'APPLICANT',
    requiredAt: 'CONSULT',
    value: '공개된 주택연금 안내를 국민이 쉽게 찾을 수 있도록 돕습니다.',
    status: 'CONFIRMED',
    source,
    confirmation: confirmed,
  },
  {
    key: 'audience',
    label: '서비스 이용 대상',
    reason: '누가 서비스를 이용하는지 확인합니다.',
    ownerRole: 'APPLICANT',
    requiredAt: 'CONSULT',
    value: '일반 국민과 안내 담당자 (합성 시연)',
    status: 'CONFIRMED',
    source,
    confirmation: confirmed,
  },
  {
    key: 'dataTypes',
    label: '처리하는 정보',
    reason: '개인정보 여부와 처리 항목을 확인합니다.',
    ownerRole: 'APPLICANT',
    requiredAt: 'SUBMIT',
    value: '공개 FAQ와 합성 질문. 실제 개인정보를 사용하지 않습니다.',
    status: 'PROPOSED',
    source: {
      kind: 'AI_INFERRED',
      evidence: '합성 사업개요서: “공개 FAQ와 합성 질문. 실제 개인정보를 사용하지 않습니다.”',
      actorName: '예시 분석 어댑터',
      at: now,
    },
    confirmation: null,
  },
  {
    key: 'externalTransfer',
    label: '외부 전송 여부',
    reason: '기관 밖으로 정보를 전송하는지 확인합니다.',
    ownerRole: 'APPLICANT',
    requiredAt: 'SUBMIT',
    value: 'NO',
    status: 'CONFIRMED',
    source,
    confirmation: confirmed,
  },
  {
    key: 'period',
    label: '서비스 운영 기간',
    reason: '시작과 종료 시점을 확인합니다.',
    ownerRole: 'APPLICANT',
    requiredAt: 'SUBMIT',
    value: '2026-11-06부터 2026-12-06까지 합성 시연',
    status: 'CONFIRMED',
    source,
    confirmation: confirmed,
  },
  {
    key: 'dataFlow',
    label: '데이터 흐름',
    reason: '입력·처리·저장의 흐름을 설명해 주세요.',
    ownerRole: 'APPLICANT',
    requiredAt: 'SUBMIT',
    value: '합성 질문 → 공개 안내 검색 → 안내 답변',
    status: 'PROPOSED',
    source: {
      kind: 'AI_INFERRED',
      evidence: '합성 사업개요서: “합성 질문 → 공개 안내 검색 → 안내 답변”',
      actorName: '예시 분석 어댑터',
      at: now,
    },
    confirmation: null,
  },
  {
    key: 'operatingEnvironment',
    label: '운영 환경',
    reason: 'ICT인프라 담당자가 실제 근거를 확인해 입력합니다.',
    ownerRole: 'INFRA',
    requiredAt: 'SUBMIT',
    value: '합성 시연 서버 1대 · 합성 검색 저장소 1개',
    status: 'CONFIRMED',
    source: {
      kind: 'STAFF_INPUT',
      evidence: '합성 시연용 구성 확인 기록',
      actorName: '인프라 담당자 (합성)',
      at: now,
    },
    confirmation: { actorName: '인프라 담당자 (합성)', role: 'INFRA', at: now },
  },
  {
    key: 'accessControl',
    label: '접근 통제',
    reason: '허용된 사용자와 관리 권한을 확인합니다.',
    ownerRole: 'SECURITY',
    requiredAt: 'SUBMIT',
    value: '',
    status: 'EMPTY',
    source: null,
    confirmation: null,
  },
  {
    key: 'retention',
    label: '보유·파기 기준',
    reason: '자료의 보유 기간과 파기 기준을 확인합니다.',
    ownerRole: 'SECURITY',
    requiredAt: 'OPTIONAL',
    value: '',
    status: 'EMPTY',
    source: null,
    confirmation: null,
  },
  {
    key: 'logging',
    label: '로그 관리',
    reason: '필요한 이력과 열람 권한을 확인합니다.',
    ownerRole: 'SECURITY',
    requiredAt: 'OPTIONAL',
    value: '',
    status: 'EMPTY',
    source: null,
    confirmation: null,
  },
];
export const previewRequest: SecurityRequest = {
  id: 'd1000001-0000-4000-8000-000000000001',
  title: '주택연금 공개 안내 챗봇 구축',
  documentType: 'FIREWALL',
  department: '디지털서비스팀 (합성)',
  description:
    '일반 국민이 공개된 주택연금 안내를 쉽게 찾을 수 있도록 챗봇을 준비합니다. 공개 FAQ와 합성 질문으로 시연하며, 실제 개인정보와 기관 내부 정보는 사용하지 않습니다. 전문 기술 정보와 접근 통제는 담당자와 함께 확인합니다.',
  ownerName: '신청 담당자 (합성)',
  status: 'COLLABORATING',
  stage: 2,
  allocation: {
    status: 'COMPLETE',
    revision: 3,
    comment: '합성 서버·IP·포트 할당 확인',
    actorName: '인프라 담당자 (합성)',
    at: now,
  },
  finalReviews: [
    { role: 'INFRA', status: 'PENDING', revision: null, comment: '', actorName: null, at: null },
    { role: 'SECURITY', status: 'PENDING', revision: null, comment: '', actorName: null, at: null },
  ],
  returnItems: [],
  terminalReason: null,
  submissionVersion: 0,
  finalDraft: null,
  revision: 3,
  policyVersion: 1,
  createdAt: '2026-11-03T01:30:00Z',
  updatedAt: now,
  answers,
  rules: [
    {
      id: 'e1000001-0000-4000-8000-000000000001',
      sourceName: '합성 챗봇 시연 서버',
      sourceIp: '192.0.2.10',
      destinationName: '합성 공개 검색 API',
      destinationIp: '198.51.100.20',
      port: '443',
      protocol: 'TCP',
      direction: 'ONE_WAY',
      startsOn: '2026-11-06',
      endsOn: '2026-12-06',
      purpose: '합성 시연에서 공개 안내 검색 응답 확인',
      source: {
        kind: 'STAFF_INPUT',
        evidence: '문서 예시용 IP 범위를 사용한 합성 통신 규칙',
        actorName: '인프라 담당자 (합성)',
        at: now,
      },
      confirmation: { actorName: '인프라 담당자 (합성)', role: 'INFRA', at: now },
    },
  ],
  reviews: [
    { role: 'SECURITY', status: 'PENDING', revision: null, comment: '', actorName: null, at: null },
    {
      role: 'INFRA',
      status: 'INVALIDATED',
      revision: 2,
      comment: '이전 수정본 검토 이후 답변이 바뀌어 재확인이 필요합니다.',
      actorName: '인프라 담당자 (합성)',
      at: now,
    },
  ],
  supplements: [
    {
      id: 'f1000001-0000-4000-8000-000000000001',
      question: '실제 개인정보를 입력하지 않는다는 안내 위치를 확인해 주세요.',
      answer: '',
      requestedByRole: 'SECURITY',
      requestedBy: '보안 담당자 (합성)',
      status: 'OPEN',
      createdAt: now,
      resolvedAt: null,
    },
  ],
  timeline: [
    {
      id: 'event-3',
      action: 'NETWORK_UPDATED',
      description: '합성 통신 규칙과 담당자 확인을 저장했습니다.',
      actorName: '인프라 담당자 (합성)',
      at: now,
    },
    {
      id: 'event-2',
      action: 'CONSULT',
      description: '정보보안·ICT인프라 사전 협의를 요청했습니다.',
      actorName: '신청 담당자 (합성)',
      at: '2026-11-05T01:30:00Z',
    },
    {
      id: 'event-1',
      action: 'CREATE',
      description: '보안 신청 초안을 만들었습니다.',
      actorName: '신청 담당자 (합성)',
      at: '2026-11-03T01:30:00Z',
    },
  ],
  blockers: [
    '처리 정보와 데이터 흐름의 확인이 필요합니다.',
    '정보보안 검토가 완료되지 않았습니다.',
    '미해소 보완 요청이 1건 있습니다.',
  ],
  allowedActions: ['EDIT', 'ANALYZE', 'ANSWER'],
  policy: { ...previewPolicy, questions: [] },
};
const cases: {
  title: string;
  status: SecurityRequest['status'];
  documentType: SecurityRequest['documentType'];
  department: string;
}[] = [
  {
    title: '주택연금 공개 안내 챗봇 구축',
    status: 'COLLABORATING',
    documentType: 'FIREWALL',
    department: '디지털서비스팀 (합성)',
  },
  {
    title: '차세대 업무포털 구축',
    status: 'COLLABORATING',
    documentType: 'SECURITY_REVIEW',
    department: '업무혁신팀 (합성)',
  },
  {
    title: '공개 통계 대시보드 연계',
    status: 'FINAL_REVIEW',
    documentType: 'FIREWALL',
    department: '데이터지원팀 (합성)',
  },
  {
    title: '문서 검색 서비스 시연',
    status: 'DRAFT',
    documentType: 'SECURITY_REVIEW',
    department: '정보지원팀 (합성)',
  },
  {
    title: '합성 자료 전송 자동화',
    status: 'COLLABORATING',
    documentType: 'FIREWALL',
    department: '업무혁신팀 (합성)',
  },
  {
    title: '대국민 서비스 접근성 개선',
    status: 'SUBMITTED',
    documentType: 'SECURITY_REVIEW',
    department: '디지털서비스팀 (합성)',
  },
  {
    title: '공개 API 통신 경로 정리',
    status: 'CONFIRMED',
    documentType: 'FIREWALL',
    department: '데이터지원팀 (합성)',
  },
  {
    title: '합성 모니터링 환경 구축',
    status: 'CLOSED',
    documentType: 'FIREWALL',
    department: '정보지원팀 (합성)',
  },
  {
    title: '공개 안내 모바일 서비스',
    status: 'WITHDRAWN',
    documentType: 'SECURITY_REVIEW',
    department: '서비스기획팀 (합성)',
  },
  {
    title: '공개 공고 검색 서비스',
    status: 'FINAL_REVIEW',
    documentType: 'SECURITY_REVIEW',
    department: '정보지원팀 (합성)',
  },
];
/** 단계와 출처·검토 버전이 일치하는 합성 목록이며 서버의 업무 상태로 사용하지 않는다. */
export const previewRequests: SecurityRequest[] = cases.map((entry, index) => {
  const updatedAt = `2026-11-0${Math.max(1, 6 - index)}T06:30:00Z`;
  const complete =
    entry.status === 'FINAL_REVIEW' || entry.status === 'SUBMITTED' || entry.status === 'CONFIRMED';
  const draft = entry.status === 'DRAFT' || entry.status === 'WITHDRAWN';
  const finalValues: Record<string, string> = {
    accessControl: '합성 계정의 역할별 권한으로 접근을 구분합니다.',
    retention: '시연 종료 후 합성 입력과 임시 파일을 정리합니다.',
    logging: '합성 시연 이력만 기록하고 담당 역할의 열람 권한을 확인했습니다.',
  };
  const caseAnswers = answers.map((answer): Answer => {
    const actorName =
      answer.ownerRole === 'APPLICANT'
        ? '신청 담당자 (합성)'
        : answer.ownerRole === 'SECURITY'
          ? '보안 담당자 (합성)'
          : '인프라 담당자 (합성)';
    const requiredAt =
      entry.documentType === 'SECURITY_REVIEW' && ['retention', 'logging'].includes(answer.key)
        ? 'SUBMIT'
        : answer.requiredAt;
    if (draft && answer.ownerRole !== 'APPLICANT')
      return {
        ...answer,
        requiredAt,
        value: '',
        status: 'EMPTY',
        source: null,
        confirmation: null,
      };
    if (!complete)
      return {
        ...answer,
        requiredAt,
        source: answer.source ? { ...answer.source, at: updatedAt } : null,
        confirmation: answer.confirmation ? { ...answer.confirmation, at: updatedAt } : null,
      };
    const value = answer.value || finalValues[answer.key];
    return {
      ...answer,
      requiredAt,
      value,
      status: 'CONFIRMED',
      source: answer.source
        ? { ...answer.source, at: updatedAt }
        : {
            kind: 'STAFF_INPUT',
            evidence: '합성 검토 기록에서 담당 분야 확인',
            actorName,
            at: updatedAt,
          },
      confirmation: { actorName, role: answer.ownerRole, at: updatedAt },
    };
  });
  const reviews: SecurityRequest['reviews'] = (['SECURITY', 'INFRA'] as const).map((role) => ({
    role,
    status: complete ? 'COMPLETE' : !draft && role === 'INFRA' ? 'INVALIDATED' : 'PENDING',
    revision: complete ? 3 : !draft && role === 'INFRA' ? 2 : null,
    comment: complete ? '현재 수정본의 합성 근거 확인 완료' : '',
    actorName: complete ? `${role === 'SECURITY' ? '보안' : '인프라'} 담당자 (합성)` : null,
    at: complete ? updatedAt : null,
  }));
  const supplements: SecurityRequest['supplements'] = complete
    ? previewRequest.supplements.map((supplement) => ({
        ...supplement,
        status: 'RESOLVED',
        answer: '합성 화면의 입력란 앞에서 실제 개인정보를 사용하지 않도록 안내합니다.',
        createdAt: updatedAt,
        resolvedAt: updatedAt,
      }))
    : index < 2
      ? previewRequest.supplements.map((supplement) => ({ ...supplement, createdAt: updatedAt }))
      : [];
  const action =
    entry.status === 'CONFIRMED'
      ? 'CONFIRMED'
      : entry.status === 'SUBMITTED'
        ? 'SUBMITTED'
        : complete
          ? 'REVIEW_COMPLETED'
          : draft
            ? 'DRAFT_SAVED'
            : 'CONSULTED';
  const description =
    entry.status === 'CONFIRMED'
      ? '정보보안·ICT인프라 양측 최종 검토 후 서류를 확정했습니다.'
      : entry.status === 'SUBMITTED'
        ? '제출본을 확정했습니다.'
        : complete
          ? '필수 담당 분야의 현재 수정본 검토를 마쳤습니다.'
          : draft
            ? '신청 초안을 저장했습니다.'
            : '담당자와 사전 협의를 진행하고 있습니다.';
  return {
    ...previewRequest,
    ...entry,
    stage: draft
      ? 1
      : entry.status === 'FINAL_REVIEW'
        ? 3
        : ['SUBMITTED', 'CONFIRMED'].includes(entry.status)
          ? 4
          : 2,
    allocation: {
      ...previewRequest.allocation,
      status: draft || index === 1 ? 'PENDING' : 'COMPLETE',
      revision: draft || index === 1 ? null : 3,
    },
    finalReviews: previewRequest.finalReviews.map((review) => ({
      ...review,
      status: entry.status === 'CONFIRMED' ? 'COMPLETE' : 'PENDING',
      revision: entry.status === 'CONFIRMED' ? 3 : null,
      actorName: entry.status === 'CONFIRMED' ? '합성 최종검토 담당자' : null,
      at: entry.status === 'CONFIRMED' ? updatedAt : null,
    })),
    submissionVersion: ['SUBMITTED', 'CONFIRMED'].includes(entry.status) ? 1 : index === 4 ? 1 : 0,
    terminalReason:
      entry.status === 'CLOSED'
        ? '요청 범위가 합성 시연 목적과 맞지 않아 종결했습니다.'
        : entry.status === 'WITHDRAWN'
          ? '사업 일정이 변경되어 신청자가 철회했습니다.'
          : null,
    returnItems:
      index === 4
        ? [
            {
              id: 'return-network',
              fieldKey: 'network',
              label: '통신 규칙',
              reason: '합성 목적지의 연결 기간과 포트 범위를 다시 확인해 주세요.',
              fromStage: 3,
              toStage: 2,
              status: 'OPEN',
              requestedByRole: 'APPLICANT',
              requestedBy: '신청 담당자 (합성)',
              createdAt: updatedAt,
              resolvedAt: null,
              affected: false,
            },
            {
              id: 'return-environment',
              fieldKey: 'operatingEnvironment',
              label: '운영 환경',
              reason: '변경된 통신 규칙과 연관된 운영 환경을 재확인해 주세요.',
              fromStage: 3,
              toStage: 2,
              status: 'OPEN',
              requestedByRole: 'APPLICANT',
              requestedBy: '신청 담당자 (합성)',
              createdAt: updatedAt,
              resolvedAt: null,
              affected: true,
            },
          ]
        : [],
    finalDraft: complete
      ? {
          analysisId: `synthetic-final-${index}`,
          summary:
            '공개 자료와 합성 질문을 활용하는 서비스입니다. 인프라 할당과 보안 검토 내용을 바탕으로 신청 목적·운영 기간·접근 통제 범위를 정리했습니다. 장비 적용은 이 문서의 확정과 별도입니다.',
          evidence: '합성 신청 답변 · ICT인프라 할당 기록 · 정보보안 협의 기록',
          source: 'AI_INFERRED',
          confirmed: index !== 9,
          confirmation: index !== 9 ? confirmed : null,
        }
      : null,
    id: `d100000${index + 1}-0000-4000-8000-000000000001`,
    createdAt: '2026-11-01T01:30:00Z',
    updatedAt,
    answers: caseAnswers,
    rules:
      draft || entry.documentType !== 'FIREWALL'
        ? []
        : previewRequest.rules.map((rule) => ({
            ...rule,
            source: rule.source ? { ...rule.source, at: updatedAt } : null,
            confirmation: rule.confirmation ? { ...rule.confirmation, at: updatedAt } : null,
          })),
    reviews,
    supplements,
    blockers: complete ? [] : ['미확정 답변과 담당 분야 검토를 확인해 주세요.'],
    allowedActions: ['SUBMITTED', 'CONFIRMED', 'CLOSED', 'WITHDRAWN'].includes(entry.status)
      ? []
      : complete
        ? index === 9
          ? ['EDIT', 'FINAL_DRAFT_ANALYZE', 'RETURN', 'WITHDRAW']
          : ['SUBMIT', 'RETURN', 'WITHDRAW']
        : draft
          ? ['EDIT', 'ANALYZE', 'CONSULT']
          : ['EDIT', 'ANALYZE', 'ANSWER'],
    timeline: [
      {
        id: `event-latest-${index}`,
        action,
        description,
        actorName: '합성 시연 담당자',
        at: updatedAt,
      },
      {
        id: `event-created-${index}`,
        action: 'CREATED',
        description: '신청 초안을 만들었습니다.',
        actorName: '신청 담당자 (합성)',
        at: '2026-11-01T01:30:00Z',
      },
    ],
  };
});
export const previewSettings: Settings = {
  revision: 3,
  publishedVersion: 2,
  draft: previewPolicy,
  published: previewPolicy,
  history: [
    { version: 2, publishedAt: '2026-11-04T00:00:00Z', publishedBy: '기관 관리자 (합성)' },
    { version: 1, publishedAt: '2026-11-01T00:00:00Z', publishedBy: '기관 관리자 (합성)' },
  ],
};
export const previewAnalyses: Analysis[] = [
  {
    id: 'analysis-preview',
    procedureId: previewRequest.id,
    revision: 3,
    status: 'SUCCEEDED',
    mode: 'EXAMPLE',
    provider: 'EXAMPLE',
    model: 'extractive-demo',
    createdAt: now,
    error: null,
    suggestions: [
      {
        key: 'purpose',
        label: '사업 목적',
        value: '공개된 주택연금 안내를 쉽게 찾을 수 있는 챗봇을 준비합니다.',
        evidence: '합성 계획서: “공개된 주택연금 안내를 쉽게 찾을 수 있는 챗봇을 준비합니다.”',
      },
      {
        key: 'dataTypes',
        label: '처리 정보',
        value: '공개 FAQ와 합성 질문',
        evidence: '합성 계획서: “공개 FAQ와 합성 질문. 실제 개인정보를 사용하지 않습니다.”',
      },
      {
        key: 'dataFlow',
        label: '데이터 흐름',
        value: '합성 질문 → 공개 안내 검색 → 안내 답변',
        evidence: '합성 계획서: “합성 질문 → 공개 안내 검색 → 안내 답변”',
      },
    ],
    references: [],
  },
];
