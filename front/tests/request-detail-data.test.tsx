import { render, screen, within } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { RequestTechnicalDetails } from '@/features/request/RequestTechnicalDetails';
import { getRequestDetailData } from '@/features/request/requestDetailData';
import type { Answer, SecurityRequest, Submission } from '@/features/request/types';
import { createMockState } from '@/mocks/seed';

function answer(key: string, value: string, options: Partial<Answer> = {}): Answer {
  return {
    key,
    value,
    label: key,
    scope: 'CASE',
    ownerRole: 'APPLICANT',
    required: true,
    source: 'USER_ANSWER',
    evidence: null,
    confirmed: true,
    notApplicable: false,
    confirmation: null,
    ...options,
  };
}

function request(options: Partial<SecurityRequest> = {}): SecurityRequest {
  return {
    ...createMockState().requests[0],
    docType: 'FIREWALL',
    stage: 2,
    status: 'CONSULTING',
    currentSubmissionId: null,
    submissions: [],
    commonAnswers: [
      answer('project.summary', '합성 자료 조회 서비스'),
      answer('system.target_server', '합성 대상 시스템'),
      answer('network.source', '192.0.2.10'),
      answer('network.destination', '198.51.100.20'),
      answer('project.custom_field', '기관 추가 질문의 합성 답변'),
    ],
    answers: [
      answer('firewall.purpose', '합성 공개 자료 조회', { scope: 'REQUEST' }),
      answer('firewall.protocol', 'TCP', { scope: 'REQUEST' }),
      answer('firewall.port', '443,8443', { scope: 'REQUEST' }),
      answer('firewall.period', '2026-11-09 ~ 2026-12-09', { scope: 'REQUEST' }),
    ],
    highlightedFields: [],
    blockers: [],
    ...options,
  };
}

function submission(id: string, source: string): Submission {
  return {
    id,
    number: 1,
    requestRevision: 1,
    caseRevision: 1,
    publicationVersion: 1,
    commonAnswers: [answer('network.source', source)],
    answers: [answer('firewall.port', '443', { scope: 'REQUEST' })],
    idempotencyKey: `synthetic-${id}`,
    createdAt: '2026-11-09T00:00:00Z',
  };
}

describe('request detail display data', () => {
  test('Back dotted keys populate the rule without inventing system names or directions', () => {
    const value = request();
    const result = getRequestDetailData(value);
    expect(result.rules).toHaveLength(1);
    expect(result.rules[0].sourceAddress).toBe(value.commonAnswers[2]);
    expect(result.rules[0].destinationAddress?.value).toBe('198.51.100.20');
    expect(result.rules[0].port?.value).toBe('443,8443');
    expect(result.rules[0].purpose?.value).toBe('합성 공개 자료 조회');
    expect(result.rules[0].sourceSystem).toBeUndefined();
    expect(result.rules[0].destinationSystem).toBeUndefined();
    expect(result.rules[0].direction).toBeUndefined();
    expect(result.businessAnswers.map((item) => item.key)).toEqual([
      'project.summary',
      'system.target_server',
      'project.custom_field',
    ]);
    expect(result.additionalAnswers.map((item) => item.key)).toEqual(['firewall.period']);
  });

  test('legacy mock fields preserve provenance and explicit optional system names', () => {
    const value = request({
      commonAnswers: [
        answer('purpose', '합성 목적'),
        answer('sourceSystem', '합성 출발지'),
        answer('sourceIp', '192.0.2.11'),
        answer('destinationSystem', '합성 목적지'),
        answer('destinationIp', '198.51.100.21'),
        answer('protocol', 'TCP'),
        answer('port', '443', {
          source: 'AI_INFERRED',
          evidence: '합성 계획서 1절',
          confirmed: false,
        }),
      ],
      answers: [answer('connectionPurpose', '합성 연결 목적', { scope: 'REQUEST' })],
    });
    const result = getRequestDetailData(value);
    expect(result.rules[0].sourceSystem?.value).toBe('합성 출발지');
    expect(result.rules[0].port).toBe(value.commonAnswers[6]);
    expect(result.rules[0].port?.confirmed).toBe(false);
    expect(result.unconfirmedCount).toBe(1);
  });

  test('an empty published key takes precedence over an obsolete legacy answer', () => {
    const result = getRequestDetailData(
      request({
        commonAnswers: [
          answer('network.source', '', { source: null }),
          answer('sourceIp', '192.0.2.99'),
        ],
      }),
    );
    expect(result.rules[0].sourceAddress?.value).toBe('');
  });

  test('frozen stage uses selected submission rather than array order or changed current answers', () => {
    const selected = submission('selected', '192.0.2.30');
    const other = submission('other', '192.0.2.40');
    const value = request({
      stage: 4,
      status: 'SUBMITTED',
      currentSubmissionId: selected.id,
      submissions: [selected, other],
    });
    const result = getRequestDetailData(value);
    expect(result.selectedSubmission).toBe(selected);
    expect(result.rules[0].sourceAddress?.value).toBe('192.0.2.30');
    expect(result.documentAnswers).toEqual([...selected.commonAnswers, ...selected.answers]);
    const returned = getRequestDetailData({ ...value, stage: 2, status: 'CONSULTING' });
    expect(returned.rules[0].sourceAddress?.value).toBe('192.0.2.10');
    expect(returned.documentAnswers[0].value).toBe('192.0.2.30');
  });

  test('unconfigured/blank fields produce no fabricated rule and unknown fields remain visible', () => {
    const result = getRequestDetailData(
      request({
        commonAnswers: [
          answer('network.source', '', { source: null }),
          answer('custom.note', '합성 메모'),
        ],
        answers: [],
      }),
    );
    expect(result.rules).toEqual([]);
    expect(result.businessAnswers.map((item) => item.key)).toContain('custom.note');
    expect(result.businessAnswers.map((item) => item.key)).toContain('network.source');
    expect(result.unconfirmedCount).toBe(1);
  });

  test('an unavailable frozen submission never falls back to mutable current answers', () => {
    const result = getRequestDetailData(
      request({
        stage: 4,
        status: 'SUBMITTED',
        currentSubmissionId: 'unavailable',
        submissions: [],
      }),
    );
    expect(result.snapshotUnavailable).toBe(true);
    expect(result.businessAnswers).toEqual([]);
    expect(result.additionalAnswers).toEqual([]);
    expect(result.rules).toEqual([]);
    expect(result.documentAnswers).toEqual([]);
  });
});

describe('request technical sections', () => {
  test('table renders actual values, sources and nine prototype columns without fake pass results', () => {
    const value = request();
    value.answers[2] = answer('firewall.port', '443,8443', {
      scope: 'REQUEST',
      source: 'AI_INFERRED',
      confirmed: false,
      evidence: '합성 계획서 1절',
    });
    render(
      <RequestTechnicalDetails request={value}>
        <p>추가 답변 영역</p>
      </RequestTechnicalDetails>,
    );
    const table = screen.getByRole('table', { name: '방화벽 규칙: 신청 답변의 통신 정보' });
    expect(within(table).getAllByRole('columnheader')).toHaveLength(9);
    expect(within(table).getByText('192.0.2.10')).toBeTruthy();
    expect(within(table).getByText('198.51.100.20')).toBeTruthy();
    expect(within(table).getByText('443,8443')).toBeTruthy();
    expect(within(table).getByText('AI 추론 · 미확정')).toBeTruthy();
    expect(within(table).getByText('근거: 합성 계획서 1절')).toBeTruthy();
    expect(within(table).getAllByText('담당자 확인 필요')).toHaveLength(3);
    expect(screen.getByText('미실시')).toBeTruthy();
    expect(screen.queryByText('통과')).toBeNull();
    expect(screen.getByRole('img', { name: /등록된 통신 정보의 데이터 흐름도/ })).toBeTruthy();
    expect(screen.getByText('추가 답변 영역')).toBeTruthy();
  });

  test('missing answers show empty states without guessing addresses, zones or connection rules', () => {
    render(<RequestTechnicalDetails request={request({ commonAnswers: [], answers: [] })} />);
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText(/등록된 통신 정보가 없습니다/)).toBeTruthy();
    expect(screen.getByText(/아직 입력된 방화벽 규칙이 없습니다/)).toBeTruthy();
    expect(screen.queryByText(/DMZ/)).toBeNull();
    expect(screen.queryByText('통과')).toBeNull();
  });

  test('blank returned fields retain anchors and explicit review highlighting', () => {
    const value = request({ highlightedFields: ['network.source'] });
    value.commonAnswers[2] = answer('network.source', '', { source: null, confirmed: false });
    const { container } = render(<RequestTechnicalDetails request={value} />);
    const field = container.querySelector('[id="field-network.source"]');
    expect(field?.classList.contains('needs-supplement')).toBe(true);
    expect(field?.textContent).toContain('담당자 확인 필요');
    expect(field?.textContent).toContain('보완 필요');
  });

  test('보안성검토도 통신 정보를 방화벽 표에 표시하고 추가 검토 항목을 유지한다', () => {
    const value = request({ docType: 'SECURITY_REVIEW' });
    expect(
      getRequestDetailData(value).businessAnswers.some((item) => item.key === 'network.source'),
    ).toBe(false);
    render(
      <RequestTechnicalDetails request={value}>
        <p>보안 대책 답변</p>
      </RequestTechnicalDetails>,
    );
    expect(screen.getByRole('heading', { name: '방화벽 규칙' })).toBeTruthy();
    const table = screen.getByRole('table');
    expect(within(table).getByText('192.0.2.10')).toBeTruthy();
    expect(within(table).getByText('198.51.100.20')).toBeTruthy();
    expect(within(table).getByText('443,8443')).toBeTruthy();
    expect(screen.getByText('보안 대책 답변')).toBeTruthy();
  });
});
