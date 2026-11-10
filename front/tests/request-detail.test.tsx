import { render } from './queryRender';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RequestDetail } from '@/features/request/RequestDetail';
import type { BusinessCase, ReviewField, SecurityRequest } from '@/features/request/types';
import type { Actor, Role, Session } from '@/lib/types';
import { createMockState, MOCK_MEMBERS } from '@/mocks/seed';
import * as http from '@/lib/httpClient';

const controls = vi.hoisted(() => ({
  request: null as SecurityRequest | null,
  businessCase: null as BusinessCase | null,
  session: null as Session | null,
  mutate: vi.fn(),
  pending: false,
  loading: false,
}));

vi.mock('@/features/auth', () => ({
  useSession: () => ({ data: controls.session, isPending: false }),
  useMembers: () => ({ data: [], isPending: false }),
}));

vi.mock('@/features/request/useRequests', () => ({
  useRequest: () => ({ data: controls.request, isPending: controls.loading, error: null }),
  useCase: () => ({ data: controls.businessCase, isPending: false, error: null }),
  useRelatedRequests: () => ({ data: [], isPending: false }),
  useRequestCommand: () => ({ mutateAsync: controls.mutate, isPending: controls.pending }),
  useSaveCase: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/lib/queries', () => ({
  useAudit: () => ({ data: [], isPending: false, error: null }),
}));

function actor(role: Role): Actor {
  const value = MOCK_MEMBERS.find((member) => member.role === role);
  if (!value) throw new Error('합성 테스트 계정 누락');
  return value;
}

function request(): SecurityRequest {
  if (!controls.request) throw new Error('합성 테스트 신청 누락');
  return controls.request;
}

function selectRole(role: Role) {
  controls.session = { member: actor(role), mock: true, expiresAt: null };
}

function reviewRequest(field: ReviewField) {
  selectRole(field);
  controls.request = {
    ...request(),
    allowedActions: ['COMPLETE_REVIEW'],
    reviews: request().reviews.map((review) => ({
      ...review,
      revision: 3,
      checklist: {},
      status: review.field === field ? 'IN_REVIEW' : field === 'SECURITY' ? 'COMPLETE' : 'PENDING',
    })),
  };
}

function reviewPanel(name: string) {
  return within(screen.getByRole('complementary', { name }));
}

beforeEach(() => {
  // 담당자 대화는 별도 통합 테스트에서 검사한다. 검토 폼 테스트에도 빈 목록 계약을 제공한다.
  vi.spyOn(http, 'requestJson').mockImplementation(async (path) =>
    path.endsWith('/infrastructure-plan')
      ? { revision: 0, connections: [], notes: '', updatedBy: null, updatedAt: null }
      : [],
  );
  const state = createMockState();
  const seeded = state.requests.find((item) => item.id === 'demo-request-1');
  if (!seeded) throw new Error('합성 테스트 신청 누락');
  controls.request = {
    ...structuredClone(seeded),
    id: 'synthetic-detail-request',
    caseTitle: '합성 신청 상세 검증 사업',
    stage: 2,
    status: 'CONSULTING',
    docType: 'FIREWALL',
    allowedActions: [],
    supplements: [],
    returns: [],
    submissions: [],
    currentSubmissionId: null,
    highlightedFields: [],
    changedCommonFields: [],
    blockers: [],
  };
  controls.businessCase = state.cases.find((item) => item.id === seeded.caseId) ?? null;
  selectRole('ADMIN');
  controls.mutate.mockReset().mockResolvedValue({});
  controls.pending = false;
  controls.loading = false;
});

test('정보보안 화면은 선행 확인 전 최종 확인·확정을 막고 완료한 확인은 반복하지 않는다', () => {
  selectRole('SECURITY');
  const security = actor('SECURITY');
  controls.request = {
    ...request(),
    stage: 4,
    status: 'SUBMITTED',
    currentSubmissionId: 'latest',
    requiredReviewFields: ['INFRA', 'SECURITY'],
    allowedActions: ['FINAL_CONFIRM', 'FINALIZE'],
    finalConfirmations: [],
    assignments: [
      {
        id: 'security',
        field: 'SECURITY',
        assigneeId: security.id,
        assigneeName: security.displayName,
        active: true,
        reason: null,
        assignedAt: request().updatedAt,
      },
    ],
  };
  const view = render(<RequestDetail id={request().id} />);
  expect(screen.getByRole<HTMLButtonElement>('button', { name: '제출본 최종 확인' }).disabled).toBe(
    true,
  );
  expect(screen.getByRole<HTMLButtonElement>('button', { name: '서류 확정' }).disabled).toBe(true);
  expect(
    screen.getByText('ICT인프라 담당자의 최종 확인 후 정보보안 담당자가 확인할 수 있습니다.'),
  ).toBeTruthy();
  controls.request = {
    ...request(),
    finalConfirmations: (['INFRA', 'SECURITY'] as const).map((field) => ({
      id: field,
      field,
      submissionId: 'latest',
      actorName: '합성 담당자',
      confirmedAt: request().updatedAt,
    })),
  };
  view.rerender(<RequestDetail id={request().id} />);
  expect(
    screen.getByRole<HTMLButtonElement>('button', { name: '담당 분야 최종 확인 완료' }).disabled,
  ).toBe(true);
  expect(screen.getByRole<HTMLButtonElement>('button', { name: '서류 확정' }).disabled).toBe(false);
  expect(screen.queryByRole('textbox', { name: '검토 의견' })).toBeNull();
});

afterEach(() => vi.restoreAllMocks());

test('제출 후 하위 자원 조회로 작업 영역이 재생성되어도 완료 안내와 초점을 유지한다', async () => {
  const descriptors = Object.fromEntries(
    ['showModal', 'close'].map((name) => [
      name,
      Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, name),
    ]),
  );
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.open = true;
      },
    },
    close: {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.open = false;
      },
    },
  });
  try {
    selectRole('APPLICANT');
    controls.request = {
      ...request(),
      stage: 3,
      status: 'FINAL_REVIEW',
      allowedActions: ['SUBMIT'],
    };
    vi.spyOn(http, 'requestJson').mockResolvedValue({
      finalDraftId: 21,
      securityRequestId: 42,
      text: '확인한 합성 보고서',
      valueSource: 'AI_INFERRED',
      modelReference: 'fake/offline',
      confirmedBy: 'applicant',
      confirmedAt: '2026-11-10T00:00:00Z',
      confirmed: true,
      stale: false,
      revision: 1,
    });
    let complete!: () => void;
    controls.mutate.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          complete = resolve;
        }),
    );
    const view = render(<RequestDetail id={request().id} />);
    const user = userEvent.setup();
    await waitFor(() =>
      expect(screen.getByRole<HTMLButtonElement>('button', { name: '최종 제출' }).disabled).toBe(
        false,
      ),
    );
    await user.click(screen.getByRole('button', { name: '최종 제출' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '최종 제출' }));
    controls.loading = true;
    view.rerender(<RequestDetail id={request().id} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    complete();
    controls.loading = false;
    controls.request = { ...request(), stage: 4, status: 'SUBMITTED', allowedActions: [] };
    view.rerender(<RequestDetail id={request().id} />);
    const message = await screen.findByText(
      '최종 제출을 완료했습니다. 제출본을 확인하거나 PDF를 내려받을 수 있습니다.',
    );
    await waitFor(() => expect(document.activeElement).toBe(message.closest('[role="status"]')));
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('link', { name: '제출본 문서로 이동' }));
  } finally {
    for (const [name, descriptor] of Object.entries(descriptors)) {
      if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
      else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
    }
  }
});

test('시안의 주요 카드 순서를 유지하고 자동 점검을 수행한 것처럼 표시하지 않는다', () => {
  render(<RequestDetail id={request().id} />);

  const titles = screen
    .getAllByRole('heading', { level: 2 })
    .filter((heading) => heading.closest('.detail-content'))
    .map((heading) => heading.textContent);
  expect(titles).toEqual([
    '사업 정보',
    '문서',
    '데이터 흐름도',
    '방화벽 규칙',
    '기관 기준 자동 점검',
    '처리 이력',
  ]);
  expect(screen.getByRole('button', { name: '문서 미리보기' })).toBeTruthy();
  expect(screen.getByRole('table', { name: /방화벽 규칙/ })).toBeTruthy();

  const checks = within(screen.getByRole('region', { name: '기관 기준 자동 점검' }));
  expect(checks.getByText('미실시')).toBeTruthy();
  expect(checks.queryByText('통과', { exact: true })).toBeNull();
  expect(checks.getByText(/자동 점검 결과가 아직 없습니다/)).toBeTruthy();
});

test('관리자 조회 패널은 실제 협의 상태와 IN_REVIEW를 표시하고 검토 동작을 만들지 않는다', () => {
  controls.request = {
    ...request(),
    reviews: request().reviews.map((review) => ({
      ...review,
      status: review.field === 'INFRA' ? 'COMPLETE' : 'IN_REVIEW',
      statusLabel: undefined,
      allocationCompleted: review.field === 'INFRA',
    })),
  };
  render(<RequestDetail id={request().id} />);

  const panel = reviewPanel('현재 처리 상황');
  expect(panel.getByText('협의 완료', { exact: true })).toBeTruthy();
  expect(panel.getByText('검토 중', { exact: true })).toBeTruthy();
  expect(panel.getByText(/정보보안 검토 중입니다/)).toBeTruthy();
  expect(panel.queryAllByRole('checkbox')).toHaveLength(0);
  expect(panel.queryAllByRole('button')).toHaveLength(0);
});

const reviewCases: {
  field: ReviewField;
  title: string;
  labels: string[];
  expectedChecklist: Record<string, boolean>;
}[] = [
  {
    field: 'INFRA',
    title: 'ICT인프라 검토',
    labels: [
      '출발지 주소를 확인했습니다',
      '목적지 주소를 확인했습니다',
      '프로토콜을 확인했습니다',
      '서비스 포트를 확인했습니다',
      '허용 기간을 확인했습니다',
    ],
    expectedChecklist: {
      source: true,
      destination: true,
      protocol: true,
      port: true,
      period: true,
    },
  },
  {
    field: 'SECURITY',
    title: '정보보안 검토',
    labels: [
      '처리 정보와 개인정보 범위를 확인했습니다',
      '외부 전송 여부와 목적지를 확인했습니다',
      '접근 권한 통제를 확인했습니다',
      '접속·처리 기록 보관을 확인했습니다',
    ],
    expectedChecklist: {
      processed_info: true,
      external_transfer: true,
      access_control: true,
      logging: true,
    },
  },
];

describe('담당자 협의 완료', () => {
  test.each(reviewCases)(
    '$field는 사람이 필수 항목과 의견을 입력해야 서버 계약에 맞는 체크리스트를 전송한다',
    async ({ field, title, labels, expectedChecklist }) => {
      reviewRequest(field);
      const user = userEvent.setup();
      render(<RequestDetail id={request().id} />);
      const panel = reviewPanel(title);
      const submit = panel.getByRole<HTMLButtonElement>('button', { name: '담당 분야 협의 완료' });
      const opinion = panel.getByRole<HTMLTextAreaElement>('textbox', { name: /검토 의견/ });

      expect(opinion.required).toBe(true);
      expect(panel.getAllByRole<HTMLInputElement>('checkbox').every((box) => !box.checked)).toBe(
        true,
      );
      expect(submit.disabled).toBe(true);
      await user.type(opinion, '합성 자료의 검토 근거와 후속 조치를 확인했습니다.');
      for (const label of labels.slice(0, -1)) {
        await user.click(panel.getByRole('checkbox', { name: label }));
      }
      expect(submit.disabled).toBe(true);
      await user.click(submit);
      expect(controls.mutate).not.toHaveBeenCalled();

      await user.click(panel.getByRole('checkbox', { name: labels.at(-1) }));
      await user.clear(opinion);
      await user.type(opinion, '   ');
      expect(submit.disabled).toBe(true);
      await user.clear(opinion);
      await user.type(opinion, '합성 검토 근거를 확인했습니다.');
      expect(submit.disabled).toBe(false);
      await user.click(submit);

      await waitFor(() => expect(controls.mutate).toHaveBeenCalledTimes(1));
      expect(controls.mutate).toHaveBeenCalledWith({
        action: 'COMPLETE_REVIEW',
        expectedRevision: request().revision,
        field,
        comment: '합성 검토 근거를 확인했습니다.',
        checklist: expectedChecklist,
      });
    },
  );

  test('저장에 실패하면 직접 체크한 항목과 검토 의견을 보존해 다시 시도할 수 있다', async () => {
    reviewRequest('SECURITY');
    controls.mutate.mockRejectedValueOnce(new Error('합성 저장 오류입니다. 다시 시도해 주세요.'));
    const user = userEvent.setup();
    render(<RequestDetail id={request().id} />);
    const panel = reviewPanel('정보보안 검토');
    const opinion = panel.getByRole<HTMLTextAreaElement>('textbox', { name: /검토 의견/ });
    const submit = panel.getByRole<HTMLButtonElement>('button', { name: '담당 분야 협의 완료' });
    for (const box of panel.getAllByRole('checkbox')) await user.click(box);
    await user.type(opinion, '재시도 시 보존할 합성 검토 의견');
    await user.click(submit);

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText('합성 저장 오류입니다. 다시 시도해 주세요.')).toBeTruthy();
    expect(opinion.value).toBe('재시도 시 보존할 합성 검토 의견');
    expect(panel.getAllByRole<HTMLInputElement>('checkbox').every((box) => box.checked)).toBe(true);
    expect(submit.disabled).toBe(false);
    await user.click(submit);
    await waitFor(() => expect(controls.mutate).toHaveBeenCalledTimes(2));
    expect(controls.mutate.mock.calls[1]).toEqual(controls.mutate.mock.calls[0]);
  });

  test('검토 수정본이 바뀌면 이전 로컬 체크를 승계하지 않고 최신 서버 확인값으로 돌아간다', async () => {
    reviewRequest('INFRA');
    const user = userEvent.setup();
    const rendered = render(<RequestDetail id={request().id} />);
    const panel = reviewPanel('ICT인프라 검토');
    for (const box of panel.getAllByRole('checkbox')) await user.click(box);
    await user.type(panel.getByRole('textbox', { name: /검토 의견/ }), '합성 검토 의견');
    expect(
      panel.getByRole<HTMLButtonElement>('button', { name: '담당 분야 협의 완료' }).disabled,
    ).toBe(false);

    controls.request = {
      ...request(),
      reviews: request().reviews.map((review) =>
        review.field === 'INFRA' ? { ...review, revision: 4, checklist: { source: true } } : review,
      ),
    };
    rendered.rerender(<RequestDetail id={request().id} />);

    expect(
      panel.getByRole<HTMLInputElement>('checkbox', { name: '출발지 주소를 확인했습니다' }).checked,
    ).toBe(true);
    expect(
      panel.getAllByRole<HTMLInputElement>('checkbox').filter((box) => box.checked),
    ).toHaveLength(1);
    expect(
      panel.getByRole<HTMLButtonElement>('button', { name: '담당 분야 협의 완료' }).disabled,
    ).toBe(true);
    expect(controls.mutate).not.toHaveBeenCalled();
  });
});

test('알 수 없는 서버 권한만 있으면 담당자 역할만으로 검토 동작을 노출하지 않는다', () => {
  selectRole('SECURITY');
  controls.request = { ...request(), allowedActions: ['FUTURE_REVIEW_ACTION'] };
  render(<RequestDetail id={request().id} />);

  const panel = reviewPanel('현재 처리 상황');
  expect(panel.queryAllByRole('button')).toHaveLength(0);
  expect(panel.queryAllByRole('checkbox')).toHaveLength(0);
  expect(panel.queryByRole('textbox', { name: /검토 의견/ })).toBeNull();
  expect(controls.mutate).not.toHaveBeenCalled();
});

test.each([
  ['PENDING', 'WAITING', '검토 대기'],
  ['ALLOCATED', 'ALLOCATED', '할당 완료'],
  ['IN_REVIEW', 'IN_PROGRESS', '검토 중'],
  ['SUPPLEMENT_REQUESTED', 'SUPPLEMENT_REQUESTED', '보완 요청'],
  ['COMPLETE', 'COMPLETED', '협의 완료'],
  ['RECHECK', 'RECHECK', '재검토'],
] as const)(
  '서버 협의 표시명이 %s의 영문 코드여도 %s 대신 %s를 표시한다',
  (status, rawLabel, label) => {
    controls.request = {
      ...request(),
      statusLabel: 'IN_REVIEW',
      reviews: request().reviews.map((review) => ({ ...review, status, statusLabel: rawLabel })),
    };
    const { container } = render(<RequestDetail id={request().id} />);

    const panel = reviewPanel('현재 처리 상황');
    expect(panel.getAllByText(label, { exact: true })).toHaveLength(2);
    expect(container.textContent).not.toContain(rawLabel);
    expect(container.textContent).not.toContain('IN_REVIEW');
    expect(container.querySelector('.page-head .badge')?.textContent).toBe('협의 중');
  },
);

test('인프라 협의 미완료이면 정보보안 완료 대신 확인 모달을 표시한다', async () => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    },
  });
  reviewRequest('SECURITY');
  request().reviews.find((r) => r.field === 'INFRA')!.status = 'RECHECK';
  render(<RequestDetail id={request().id} />);
  await userEvent.setup().click(screen.getByRole('button', { name: '담당 분야 협의 완료' }));
  const modal = screen.getByRole('dialog', { name: 'ICT인프라 협의 필요' });
  expect(within(modal).getByText(/ICT인프라의 협의 단계가 끝나지 않았습니다/)).toBeTruthy();
  expect(within(modal).getByText(request().caseTitle)).toBeTruthy();
  expect(within(modal).getByText('배정된 ICT인프라 담당자')).toBeTruthy();
  expect(within(modal).getByText('협의 단계 진입 · 요청 일시')).toBeTruthy();
  await userEvent.setup().click(within(modal).getByRole('button', { name: '확인' }));
  expect(screen.queryByRole('dialog', { name: 'ICT인프라 협의 필요' })).toBeNull();
  expect(controls.mutate).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: '자원 할당 완료' })).toBeNull();
});
