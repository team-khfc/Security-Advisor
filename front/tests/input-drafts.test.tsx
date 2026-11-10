import { beforeAll, afterAll, beforeEach, afterEach, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NewRequest } from '@/features/request/NewRequest';
import { AnalysisPanel, CaseInterview } from '@/features/request/CaseInterview';
import { clearInputDraft, getInputDraft } from '@/lib/inputDrafts';
import type { Session } from '@/lib/types';
import type { BusinessCase, CaseAnalysis, SecurityRequest } from '@/features/request/types';
import { createMockState, MOCK_MEMBERS } from '@/mocks/seed';

const controls = vi.hoisted(() => ({
  session: null as Session | null,
  businessCase: undefined as BusinessCase | undefined,
  requests: [] as SecurityRequest[],
  analysis: undefined as CaseAnalysis | undefined,
  create: vi.fn(),
  save: vi.fn(),
  analyze: vi.fn(),
  apply: vi.fn(),
  push: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: controls.push }) }));
vi.mock('@/features/auth', () => ({
  useSession: () => ({ data: controls.session, isPending: false }),
}));
vi.mock('@/features/request/useRequests', () => ({
  useCreateCase: () => ({ mutateAsync: controls.create, isPending: false }),
  useCase: () => ({ data: controls.businessCase, isPending: false }),
  useRelatedRequests: () => ({ data: controls.requests, isPending: false }),
  useSaveCase: () => ({ mutateAsync: controls.save, isPending: false }),
  useAnalysis: () => ({
    data: controls.analysis,
    mutateAsync: controls.analyze,
    reset: vi.fn(),
    isPending: false,
  }),
  useApplyAnalysis: () => ({ mutateAsync: controls.apply, reset: vi.fn(), isPending: false }),
}));

const dialogMethods = {
  showModal: Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal'),
  close: Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close'),
};

beforeAll(() => {
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
});

afterAll(() => {
  for (const [name, descriptor] of Object.entries(dialogMethods)) {
    if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
  }
});

const applicant = MOCK_MEMBERS[0];
const otherApplicant = MOCK_MEMBERS[1];

beforeEach(() => {
  const state = createMockState();
  controls.session = { member: applicant, mock: true, expiresAt: null };
  controls.businessCase = state.cases[0];
  controls.requests = state.requests;
  controls.analysis = undefined;
  controls.create.mockReset().mockResolvedValue({ id: 'new-synthetic-case' });
  controls.save.mockReset().mockResolvedValue({});
  controls.analyze.mockReset().mockResolvedValue({});
  controls.apply.mockReset().mockResolvedValue({});
  controls.push.mockReset();
});

afterEach(() => {
  for (const actor of [applicant, otherApplicant]) {
    for (const key of [
      'new-case',
      `case:${controls.businessCase?.id}:interview`,
      `case:${controls.businessCase?.id}:analysis`,
    ])
      clearInputDraft(actor.id, key);
  }
});

test('실제 API 모드에서 담당 부서는 필수이며 비어 있는 부서를 합성 값으로 전송하지 않는다', async () => {
  controls.session = { member: { ...applicant, department: '' }, mock: false, expiresAt: null };
  const user = userEvent.setup();
  render(<NewRequest />);
  await user.click(screen.getByRole('button', { name: '기획서 없이 대화로 시작' }));
  await user.type(screen.getByLabelText('사업명 (필수)'), '합성 새 사업');
  const department = screen.getByLabelText('담당 부서 (필수)') as HTMLInputElement;
  expect(department.required).toBe(true);
  expect(department.value).toBe('');
  await user.click(screen.getByRole('button', { name: '인터뷰 시작' }));
  expect(controls.create).not.toHaveBeenCalled();
  await user.type(department, '입력한 합성 부서');
  await user.click(screen.getByRole('button', { name: '인터뷰 시작' }));
  await waitFor(() =>
    expect(controls.create).toHaveBeenCalledWith(
      expect.objectContaining({ department: '입력한 합성 부서' }),
    ),
  );
  expect(getInputDraft(applicant.id, 'new-case')).toBeUndefined();
});

test('새 신청 입력은 화면 복귀 시 복원하며 다른 계정의 새 신청에는 표시하지 않는다', async () => {
  const user = userEvent.setup();
  const first = render(<NewRequest />);
  await user.click(screen.getByRole('button', { name: '기획서 없이 대화로 시작' }));
  await user.type(screen.getByLabelText('사업명 (필수)'), '저장 전 합성 사업');
  first.unmount();
  controls.session = { member: otherApplicant, mock: true, expiresAt: null };
  const second = render(<NewRequest />);
  await user.click(screen.getByRole('button', { name: '기획서 없이 대화로 시작' }));
  expect((screen.getByLabelText('사업명 (필수)') as HTMLInputElement).value).toBe('');
  expect((screen.getByLabelText('담당 부서 (필수)') as HTMLInputElement).value).toBe(
    otherApplicant.department,
  );
  second.unmount();
  controls.session = { member: applicant, mock: true, expiresAt: null };
  render(<NewRequest />);
  await user.click(screen.getByRole('button', { name: '기획서 없이 대화로 시작' }));
  expect((screen.getByLabelText('사업명 (필수)') as HTMLInputElement).value).toBe(
    '저장 전 합성 사업',
  );
});

test('인터뷰 답변을 재로그인 후 복원하고 그동안 서버 값이 바뀌면 비교 전 저장을 막는다', async () => {
  const user = userEvent.setup();
  const businessCase = controls.businessCase!;
  const first = renderForEditing(businessCase.id);
  await user.clear(screen.getByLabelText('사업 목적'));
  await user.type(screen.getByLabelText('사업 목적'), '아직 보내지 않은 인터뷰 답변');
  first.unmount();
  controls.businessCase = { ...businessCase, revision: businessCase.revision + 1 };
  renderForEditing(businessCase.id);
  expect((screen.getByLabelText('사업 목적') as HTMLTextAreaElement).value).toBe(
    '아직 보내지 않은 인터뷰 답변',
  );
  expect(
    (screen.getByRole('button', { name: '답변 저장하고 다음' }) as HTMLButtonElement).disabled,
  ).toBe(true);
  await user.click(
    screen.getByRole('button', { name: '내 답변을 유지하고 최신 버전 기준으로 저장 준비' }),
  );
  await user.click(screen.getByRole('button', { name: '답변 저장하고 다음' }));
  await waitFor(() =>
    expect(controls.save).toHaveBeenCalledWith({
      expectedRevision: businessCase.revision + 1,
      answers: [expect.objectContaining({ key: 'purpose', value: '아직 보내지 않은 인터뷰 답변' })],
    }),
  );
  expect(getInputDraft(applicant.id, `case:${businessCase.id}:interview`)).toBeUndefined();
});

test('분석 개요는 복귀 시 복원하고 사용자가 분석을 요청할 때만 전송한다', async () => {
  const user = userEvent.setup();
  const businessCase = controls.businessCase!;
  const first = render(<AnalysisPanel businessCase={businessCase} />);
  await user.clear(screen.getByLabelText('분석할 사업 개요'));
  await user.type(screen.getByLabelText('분석할 사업 개요'), '전송 전 합성 개요');
  first.unmount();
  render(<AnalysisPanel businessCase={businessCase} />);
  expect((screen.getByLabelText('분석할 사업 개요') as HTMLTextAreaElement).value).toBe(
    '전송 전 합성 개요',
  );
  expect(controls.analyze).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: '사업 개요 저장' }));
  await waitFor(() =>
    expect(controls.analyze).toHaveBeenCalledWith(
      expect.objectContaining({ text: '전송 전 합성 개요' }),
    ),
  );
});
vi.mock('@/features/request/useInterview', () => ({
  useInterviewTurns: () => ({ data: [] }),
  useInterviewStaffCheck: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/features/request/useInterviewAssistance', () => ({
  useInterviewAssistance: () => ({
    history: [],
    ask: { isPending: false },
    apply: { isPending: false },
    mode: 'ANSWER',
    help: {},
    busy: false,
    showHelp: false,
    toggleHelp: vi.fn(),
    send: vi.fn(),
    prompt: '',
    setPrompt: vi.fn(),
    isStale: () => false,
  }),
}));

// 기존 합성 자료는 완료된 답변이다. 재작성 검사는 사용자가 다시 보기로 여는 흐름을 따른다.
function renderForEditing(id: string) {
  const view = render(<CaseInterview id={id} />);
  const restart = screen.queryByRole('button', { name: '공통 질문 다시 보기' });
  if (restart) fireEvent.click(restart);
  return view;
}

test('다중 문서를 보존하고 선택한 파일만 명시적 분석 요청에 전달한다', async () => {
  const user = userEvent.setup();
  const businessCase = controls.businessCase!;
  const files = ['기획서.txt', '구성도.txt', '요구사항.txt'].map(
    (name) => new File(['synthetic'], name),
  );
  const first = render(<AnalysisPanel businessCase={businessCase} />);
  await user.upload(screen.getByLabelText('문서 첨부 (선택)'), files);
  expect(controls.analyze).not.toHaveBeenCalled();
  first.unmount();
  render(<AnalysisPanel businessCase={businessCase} />);
  for (const file of files) {
    await user.click(screen.getByRole('button', { name: file.name }));
    await user.click(screen.getByRole('button', { name: '문서 분석 요청' }));
    await waitFor(() =>
      expect(controls.analyze).toHaveBeenLastCalledWith(expect.objectContaining({ file })),
    );
  }
  expect(controls.analyze).toHaveBeenCalledTimes(3);
  expect(screen.getByRole('list', { name: '분석할 파일 목록' }).children).toHaveLength(3);
});
