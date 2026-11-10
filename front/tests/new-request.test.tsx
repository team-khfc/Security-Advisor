import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NewRequest } from '@/features/request/NewRequest';
import { clearInputDraft, getInputDraft } from '@/lib/inputDrafts';
import { forgetUpload, getUpload, getUploads, getInitialAnalysis } from '@/lib/uploadDraft';
import type { Session } from '@/lib/types';
import { MOCK_MEMBERS } from '@/mocks/seed';

const controls = vi.hoisted(() => ({
  session: null as Session | null,
  sessionPending: false,
  createPending: false,
  create: vi.fn(),
  analyze: vi.fn(),
  push: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: controls.push }) }));
vi.mock('@/features/auth', () => ({
  useSession: () => ({ data: controls.session, isPending: controls.sessionPending }),
}));
vi.mock('@/features/request/useRequests', () => ({
  useAnalysis: () => ({ mutateAsync: controls.analyze }),
  useCreateCase: () => ({ mutateAsync: controls.create, isPending: controls.createPending }),
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

beforeEach(() => {
  controls.session = { member: applicant, mock: true, expiresAt: null };
  controls.sessionPending = false;
  controls.createPending = false;
  controls.create.mockReset().mockResolvedValue({ id: 'synthetic-case-stage3', revision: 0 });
  controls.analyze.mockReset().mockResolvedValue({ id: 'synthetic-analysis' });
  controls.push.mockReset();
});

afterEach(() => {
  clearInputDraft(applicant.id, 'new-case');
  forgetUpload(applicant.id, 'synthetic-case-stage3');
});

function fileInput() {
  return screen.getByLabelText('기획서 파일') as HTMLInputElement;
}

test('처음에는 시안의 파일 영역과 대화 시작을 보여 주며 시작 클릭만으로 사업을 만들지 않는다', async () => {
  const user = userEvent.setup();
  render(<NewRequest />);
  expect(screen.getByRole('heading', { level: 1, name: '새 신청' })).toBeTruthy();
  expect(screen.getByRole('heading', { name: '기획서를 끌어다 놓으세요' })).toBeTruthy();
  expect(screen.getByRole('button', { name: '파일 선택' })).toBeTruthy();
  expect(screen.queryByRole('textbox', { name: '사업명 (필수)' })).toBeNull();
  expect(screen.queryByRole('checkbox', { name: /방화벽신청서/ })).toBeNull();
  expect(screen.queryByRole('dialog')).toBeNull();
  await user.click(screen.getByRole('button', { name: '기획서 없이 대화로 시작' }));
  expect(screen.getByRole('dialog', { name: '신청 정보 입력' })).toBeTruthy();
  expect(screen.getByLabelText('사업명 (필수)')).toBeTruthy();
  expect(controls.create).not.toHaveBeenCalled();
  expect(controls.push).not.toHaveBeenCalled();
});

test('지원하지 않는 형식과 20MB 초과 파일은 파일 영역 안의 오류로 거부하고 선택하지 않는다', async () => {
  const user = userEvent.setup({ applyAccept: false });
  render(<NewRequest />);
  await user.upload(fileInput(), new File(['x'], 'synthetic.exe'));
  expect(screen.getByRole('alert').textContent).toBe('PDF, HWPX, DOCX, TXT 파일을 선택해 주세요.');
  expect(screen.queryByRole('list', { name: '분석 전 파일' })).toBeNull();
  const big = new File(['x'], 'synthetic.pdf');
  Object.defineProperty(big, 'size', { value: 20 * 1024 * 1024 + 1 });
  await user.upload(fileInput(), big);
  expect(screen.getByRole('alert')).toBeTruthy();
  expect(screen.queryByRole('list', { name: '분석 전 파일' })).toBeNull();
  expect(controls.create).not.toHaveBeenCalled();
});

test('현재 프론트 지원 형식에 따라 HWP는 거부하고 TXT는 분석 전 파일로 선택한다', async () => {
  const user = userEvent.setup({ applyAccept: false });
  render(<NewRequest />);
  await user.upload(fileInput(), new File(['synthetic'], '합성기획서.hwp'));
  expect(screen.getByRole('alert')).toBeTruthy();
  expect(screen.queryByRole('list', { name: '분석 전 파일' })).toBeNull();
  await user.upload(fileInput(), new File(['synthetic'], '합성기획서.txt', { type: 'text/plain' }));
  expect(screen.queryByRole('alert')).toBeNull();
  expect(
    within(screen.getByRole('list', { name: '분석 전 파일' })).getByText('합성기획서.txt'),
  ).toBeTruthy();
  expect(fileInput().value).toBe('');
  expect(controls.create).not.toHaveBeenCalled();
});

test('끌어다 놓은 파일을 분석 전 목록에 표시하고 선택 취소 시 파일 선택 버튼으로 초점을 옮긴다', async () => {
  const user = userEvent.setup();
  render(<NewRequest />);
  const zone = screen.getByRole('heading', { name: '기획서를 끌어다 놓으세요' }).parentElement!;
  const file = new File([new Uint8Array(2048)], '합성기획서.pdf', { type: 'application/pdf' });
  fireEvent.dragOver(zone, { dataTransfer: { files: [file] } });
  expect(zone.classList.contains('drag')).toBe(true);
  fireEvent.drop(zone, { dataTransfer: { files: [file] } });
  expect(zone.classList.contains('drag')).toBe(false);
  const list = screen.getByRole('list', { name: '분석 전 파일' });
  expect(within(list).getByText('합성기획서.pdf')).toBeTruthy();
  expect(within(list).getByText('PDF, 2.0KB')).toBeTruthy();
  expect(screen.getByRole('button', { name: /기획서와 함께 작성 시작/ })).toBeTruthy();
  await user.click(screen.getByRole('button', { name: '합성기획서.pdf 선택 취소' }));
  expect(screen.queryByRole('list', { name: '분석 전 파일' })).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole('button', { name: '파일 선택' }));
});

test('4개 이상 파일과 빈 파일은 거부하고 이미 선택한 파일을 보존한다', async () => {
  const user = userEvent.setup();
  render(<NewRequest />);
  await user.upload(fileInput(), new File(['synthetic'], '보존할합성파일.txt'));
  const zone = screen.getByRole('heading', { name: '기획서를 끌어다 놓으세요' }).parentElement!;
  fireEvent.drop(zone, {
    dataTransfer: {
      files: [
        new File(['a'], '합성자료1.pdf'),
        new File(['b'], '합성자료2.pdf'),
        new File(['c'], '합성자료3.pdf'),
      ],
    },
  });
  expect(screen.getByRole('alert').textContent).toBe('파일은 최대 3개까지 선택해 주세요.');
  expect(
    within(screen.getByRole('list', { name: '분석 전 파일' })).getByText('보존할합성파일.txt'),
  ).toBeTruthy();
  await user.upload(fileInput(), new File([], '빈합성파일.txt'));
  expect(screen.getByRole('alert').textContent).toBe('빈 파일은 선택할 수 없습니다.');
  expect(
    within(screen.getByRole('list', { name: '분석 전 파일' })).getByText('보존할합성파일.txt'),
  ).toBeTruthy();
  expect(controls.create).not.toHaveBeenCalled();
});

test('선택한 서류만 생성 요청에 담고 성공하면 선택 파일을 사업 건에 넘긴 뒤 사업 건 화면으로 이동한다', async () => {
  const user = userEvent.setup();
  render(<NewRequest />);
  await user.upload(fileInput(), new File(['x'], '합성기획서.hwpx'));
  await user.click(screen.getByRole('button', { name: /기획서와 함께 작성 시작/ }));
  expect(controls.create).not.toHaveBeenCalled();
  await user.type(screen.getByLabelText('사업명 (필수)'), '합성 방화벽 사업');
  await user.click(screen.getByRole('checkbox', { name: /보안성검토 신청서/ }));
  await user.click(screen.getByRole('button', { name: '인터뷰 시작' }));
  await waitFor(() =>
    expect(controls.create).toHaveBeenCalledWith(
      expect.objectContaining({ title: '합성 방화벽 사업', docTypes: ['FIREWALL'] }),
    ),
  );
  expect(controls.push).toHaveBeenCalledWith('/cases/synthetic-case-stage3');
  expect(getUpload(applicant.id, 'synthetic-case-stage3')?.name).toBe('합성기획서.hwpx');
  expect(getInputDraft(applicant.id, 'new-case')).toBeUndefined();
});

test('선택 파일이 있어도 파일 없이 대화로 시작하면 첨부 파일을 다음 사업 건에 넘기지 않는다', async () => {
  const user = userEvent.setup();
  render(<NewRequest />);
  await user.upload(fileInput(), new File(['synthetic'], '전송하지않을합성파일.txt'));
  await user.click(screen.getByRole('button', { name: '기획서 없이 대화로 시작' }));
  await user.type(screen.getByLabelText('사업명 (필수)'), '대화로 시작할 합성 사업');
  await user.click(screen.getByRole('button', { name: '인터뷰 시작' }));
  await waitFor(() => expect(controls.push).toHaveBeenCalledWith('/cases/synthetic-case-stage3'));
  expect(getUpload(applicant.id, 'synthetic-case-stage3')).toBeUndefined();
  expect(controls.create).toHaveBeenCalledTimes(1);
  expect(controls.analyze).not.toHaveBeenCalled();
});

test('취소와 Escape는 사업 입력과 파일을 유지하고 시작 버튼으로 초점을 돌린다', async () => {
  const user = userEvent.setup();
  render(<NewRequest />);
  await user.upload(fileInput(), new File(['synthetic'], '취소후유지할합성파일.txt'));
  const fileStart = screen.getByRole('button', { name: /기획서와 함께 작성 시작/ });
  await user.click(fileStart);
  await user.type(screen.getByLabelText('사업명 (필수)'), '아직 제출하지 않은 합성 사업');
  await user.click(screen.getByRole('checkbox', { name: /방화벽신청서/ }));
  await user.click(screen.getByRole('button', { name: '취소' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(fileStart);
  expect(
    within(screen.getByRole('list', { name: '분석 전 파일' })).getByText(
      '취소후유지할합성파일.txt',
    ),
  ).toBeTruthy();
  const conversationStart = screen.getByRole('button', { name: '기획서 없이 대화로 시작' });
  await user.click(conversationStart);
  expect((screen.getByLabelText('사업명 (필수)') as HTMLInputElement).value).toBe(
    '아직 제출하지 않은 합성 사업',
  );
  expect((screen.getByRole('checkbox', { name: /방화벽신청서/ }) as HTMLInputElement).checked).toBe(
    false,
  );
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { bubbles: false, cancelable: true }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(conversationStart);
  expect(controls.create).not.toHaveBeenCalled();
});

test('생성이 실패하면 오류를 보여 주고 입력한 사업명·부서·서류·파일을 그대로 유지한다', async () => {
  controls.create.mockRejectedValueOnce(new Error('합성 서버 오류로 사업 건을 만들지 못했습니다.'));
  const user = userEvent.setup();
  render(<NewRequest />);
  await user.upload(fileInput(), new File(['x'], '유지할기획서.pdf'));
  const fileList = screen.getByRole('list', { name: '분석 전 파일' });
  await user.click(screen.getByRole('button', { name: /기획서와 함께 작성 시작/ }));
  await user.type(screen.getByLabelText('사업명 (필수)'), '실패 검증 합성 사업');
  await user.click(screen.getByRole('checkbox', { name: /방화벽신청서/ }));
  await user.click(screen.getByRole('button', { name: '인터뷰 시작' }));
  expect(await screen.findByText('합성 서버 오류로 사업 건을 만들지 못했습니다.')).toBeTruthy();
  expect(controls.push).not.toHaveBeenCalled();
  expect((screen.getByLabelText('사업명 (필수)') as HTMLInputElement).value).toBe(
    '실패 검증 합성 사업',
  );
  expect((screen.getByLabelText('담당 부서 (필수)') as HTMLInputElement).value).toBe(
    applicant.department,
  );
  expect((screen.getByRole('checkbox', { name: /방화벽신청서/ }) as HTMLInputElement).checked).toBe(
    false,
  );
  expect(
    (screen.getByRole('checkbox', { name: /보안성검토 신청서/ }) as HTMLInputElement).checked,
  ).toBe(true);
  expect(within(fileList).getByText('유지할기획서.pdf')).toBeTruthy();
});

test('서류를 모두 해제하면 생성하지 않고 선택 안내를 표시한다', async () => {
  const user = userEvent.setup();
  render(<NewRequest />);
  await user.click(screen.getByRole('button', { name: '기획서 없이 대화로 시작' }));
  await user.type(screen.getByLabelText('사업명 (필수)'), '합성 사업');
  await user.click(screen.getByRole('checkbox', { name: /방화벽신청서/ }));
  await user.click(screen.getByRole('checkbox', { name: /보안성검토 신청서/ }));
  await user.click(screen.getByRole('button', { name: '인터뷰 시작' }));
  expect(await screen.findByText('신청할 서류를 한 가지 이상 선택해 주세요.')).toBeTruthy();
  expect(controls.create).not.toHaveBeenCalled();
});

test('생성 중 중복 제출과 모달 닫기를 막는다', async () => {
  let resolveCreation: ((value: { id: string }) => void) | undefined;
  controls.create.mockImplementation(
    () =>
      new Promise<{ id: string }>((resolve) => {
        resolveCreation = resolve;
      }),
  );
  const user = userEvent.setup();
  const { rerender } = render(<NewRequest />);
  await user.click(screen.getByRole('button', { name: '기획서 없이 대화로 시작' }));
  await user.type(screen.getByLabelText('사업명 (필수)'), '중복 요청 방지 합성 사업');
  const form = screen.getByRole('button', { name: '인터뷰 시작' }).closest('form')!;
  fireEvent.submit(form);
  fireEvent.submit(form);
  expect(controls.create).toHaveBeenCalledTimes(1);
  controls.createPending = true;
  rerender(<NewRequest />);
  expect((screen.getByLabelText('사업명 (필수)') as HTMLInputElement).disabled).toBe(true);
  const dialog = screen.getByRole('dialog');
  fireEvent(dialog, new Event('cancel', { bubbles: false, cancelable: true }));
  await user.click(screen.getByRole('button', { name: '신청 정보 입력 닫기' }));
  expect(screen.getByRole('dialog')).toBe(dialog);
  await act(async () => {
    resolveCreation?.({ id: 'synthetic-case-stage3' });
  });
  await waitFor(() => expect(controls.push).toHaveBeenCalledWith('/cases/synthetic-case-stage3'));
});

test('세션 조회 중에는 권한 경고 대신 로딩 상태를 표시한다', () => {
  controls.session = null;
  controls.sessionPending = true;
  render(<NewRequest />);
  expect(screen.getByRole('status').textContent).toContain('내용을 불러오고 있습니다.');
  expect(screen.queryByText('일반 사용자로 로그인하면 새 사업을 신청할 수 있습니다.')).toBeNull();
});

test('20MB 문서 3개를 선택하고 개별 취소·추가한 뒤 모두 다음 화면으로 전달한다', async () => {
  const user = userEvent.setup();
  render(<NewRequest />);
  const files = ['기획서.pdf', '구성도.hwpx', '요구사항.docx'].map((name) => {
    const file = new File(['synthetic'], name);
    Object.defineProperty(file, 'size', { value: 20 * 1024 * 1024 });
    return file;
  });
  await user.upload(fileInput(), files);
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.getByRole('button', { name: '기획서와 함께 작성 시작 (3)' })).toBeTruthy();
  await user.click(screen.getByRole('button', { name: '구성도.hwpx 선택 취소' }));
  expect(screen.getByRole('button', { name: '기획서와 함께 작성 시작 (2)' })).toBeTruthy();
  await user.upload(fileInput(), files[1]);
  await user.click(screen.getByRole('button', { name: '기획서와 함께 작성 시작 (3)' }));
  await user.type(screen.getByLabelText('사업명 (필수)'), '다중 문서 합성 사업');
  await user.click(screen.getByRole('button', { name: '인터뷰 시작' }));
  await waitFor(() => expect(controls.push).toHaveBeenCalled());
  expect(getUploads(applicant.id, 'synthetic-case-stage3')).toEqual([files[0], files[2], files[1]]);
});

test('작성 시작은 세 문서를 분석한 뒤 이동하고 일부 실패도 숨기지 않으며 사업을 중복 생성하지 않는다', async () => {
  const user = userEvent.setup();
  let finish: (() => void) | undefined;
  controls.analyze
    .mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    )
    .mockRejectedValueOnce(new Error('합성 분석 오류'))
    .mockResolvedValueOnce({ id: 'third' });
  render(<NewRequest />);
  const files = ['첫째.txt', '둘째.txt', '셋째.txt'].map((name) => new File(['synthetic'], name));
  await user.upload(fileInput(), files);
  expect(controls.analyze).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: /기획서와 함께 작성 시작/ }));
  expect(controls.analyze).not.toHaveBeenCalled();
  await user.type(screen.getByLabelText('사업명 (필수)'), '자동 분석 합성 사업');
  await user.click(screen.getByRole('button', { name: '인터뷰 시작' }));
  await waitFor(() => expect(controls.analyze).toHaveBeenCalledTimes(1));
  expect(controls.push).not.toHaveBeenCalled();
  expect(
    (screen.getByRole('button', { name: '문서 분석 중…' }) as HTMLButtonElement).disabled,
  ).toBe(true);
  fireEvent.submit(screen.getByRole('button', { name: '문서 분석 중…' }).closest('form')!);
  await act(async () => {
    finish?.();
  });
  await waitFor(() => expect(controls.push).toHaveBeenCalledTimes(1));
  expect(controls.create).toHaveBeenCalledTimes(1);
  expect(controls.analyze.mock.calls.map(([input]) => input.file)).toEqual(files);
  expect(getInitialAnalysis(applicant.id, 'synthetic-case-stage3')).toEqual({
    total: 3,
    failures: [{ name: '둘째.txt', message: '합성 분석 오류' }],
  });
  expect(getUploads(applicant.id, 'synthetic-case-stage3')).toEqual(files);
});
