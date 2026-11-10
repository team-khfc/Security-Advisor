import * as http from '@/lib/httpClient';
import { render } from './queryRender';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, expect, test, vi } from 'vitest';
import { RequestDocument } from '@/features/document/RequestDocument';
import { DocumentActions } from '@/features/document/DocumentActions';
import type { SecurityRequest, Submission } from '@/features/request/types';
import { createMockState } from '@/mocks/seed';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { serverDocument } from './documentFixture';

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
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function request(overrides: Partial<SecurityRequest> = {}): SecurityRequest {
  return {
    ...structuredClone(createMockState().requests[0]),
    id: '42',
    caseTitle: '현재 사업명',
    stage: 2,
    status: 'CONSULTING',
    commonAnswers: [],
    answers: [],
    currentSubmissionId: null,
    submissions: [],
    ...overrides,
  };
}
function submission(id = '123'): Submission {
  return {
    id,
    number: 2,
    requestRevision: 3,
    caseRevision: 2,
    publicationVersion: 4,
    commonAnswers: [],
    answers: [],
    idempotencyKey: 'synthetic',
    createdAt: '2026-11-08T00:00:00Z',
    snapshot: { caseTitle: '제출 당시 합성 사업명' },
  };
}
async function openPreview() {
  await userEvent.setup().click(screen.getAllByRole('button', { name: '문서 미리보기' })[0]);
  return await within(screen.getByRole('dialog')).findByLabelText('문서 내용');
}
function pdf() {
  const blob = new Blob(['%PDF-1.7 합성 테스트 바이트'], { type: 'application/pdf' });
  const binary = vi
    .spyOn(http, 'requestPdf')
    .mockResolvedValue({ blob, fileName: '확정본_42_v9.pdf' });
  const create = vi.fn(() => 'blob:synthetic-pdf');
  const revoke = vi.fn();
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke }));
  const names: string[] = [];
  const clicked = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    names.push(this.download);
  });
  return { blob, binary, create, revoke, clicked, names };
}

test('미리보기는 서버 문서 제목·표시값·출처·확인 상태를 사용하며 HTML 입력을 실행하지 않는다', async () => {
  vi.spyOn(http, 'requestJson').mockResolvedValue(serverDocument());
  render(<RequestDocument request={request()} />);
  const preview = await openPreview();
  expect(preview.textContent).toContain('<script>서버 합성 답변</script>');
  expect(preview.textContent).toContain('출처: AI 추론');
  expect(preview.textContent).toContain('담당자 확인 필요');
  expect(preview.querySelector('script')).toBeNull();
  const dialog = screen.getByRole('dialog');
  expect(dialog.textContent).toContain('서버의 문서 제목');
  expect(dialog.textContent).toContain('미확정 항목 1개');
  expect(dialog.textContent).not.toContain('현재 사업명');
});

test('미리보기 다음 다운로드는 같은 문서 ID를 사용하고 카드에서도 재생성하지 않는다', async () => {
  const json = vi
    .spyOn(http, 'requestJson')
    .mockResolvedValue(
      serverDocument({ submissionId: 123, kind: 'CONFIRMED', kindLabel: '확정본' }),
    );
  const file = pdf();
  render(
    <RequestDocument
      request={request({
        stage: 4,
        status: 'FINALIZED',
        currentSubmissionId: '123',
        submissions: [submission()],
      })}
    />,
  );
  await openPreview();
  const dialog = screen.getByRole('dialog');
  await userEvent.setup().click(within(dialog).getByRole('button', { name: 'PDF 다운로드' }));
  await waitFor(() => expect(file.clicked).toHaveBeenCalledOnce());
  expect(json).toHaveBeenCalledOnce();
  expect(json).toHaveBeenCalledWith('/api/security-requests/42/generated-documents', {
    method: 'POST',
    body: { submissionId: 123, aiSupplement: false },
  });
  expect(file.binary).toHaveBeenCalledWith('/api/generated-documents/88/download?format=PDF');
  expect(file.names).toEqual(['확정본_42_v9.pdf']);
  expect(file.create).toHaveBeenCalledWith(file.blob);
  await userEvent.setup().click(within(dialog).getByRole('button', { name: '닫기' }));
  fireEvent.click(screen.getAllByRole('button', { name: 'PDF 다운로드' })[0]);
  await waitFor(() => expect(file.clicked).toHaveBeenCalledTimes(2));
  expect(json).toHaveBeenCalledOnce();
  expect(file.binary).toHaveBeenCalledOnce();
  await waitFor(() => expect(file.revoke).toHaveBeenCalledWith('blob:synthetic-pdf'), {
    timeout: 2000,
  });
});

test('이전 제출본은 현재 확정 상태나 현재 초안을 섞지 않고 서버의 제출본 구분을 보인다', async () => {
  const json = vi
    .spyOn(http, 'requestJson')
    .mockResolvedValue(
      serverDocument({ submissionId: 122, kind: 'SUBMITTED', kindLabel: '제출본' }),
    );
  const client = new QueryClient();
  client.setQueryData(['final-draft', '42'], { text: '현재 초안', confirmed: false, stale: true });
  render(
    <QueryClientProvider client={client}>
      <DocumentActions
        request={request({ stage: 4, status: 'FINALIZED', currentSubmissionId: '123' })}
        submissionId="122"
      />
    </QueryClientProvider>,
  );
  await openPreview();
  expect(screen.getByRole('dialog').textContent).toContain('제출본 · 문서 v9');
  expect(screen.getByRole('dialog').textContent).not.toContain('현재 초안');
  expect(json).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({ body: { submissionId: 122, aiSupplement: false } }),
  );
});

test.each(['SUBMITTED', 'FINALIZED'] as const)(
  '%s 제출본 누락 시 미리보기·PDF를 모두 막는다',
  (status) => {
    render(<RequestDocument request={request({ stage: 4, status })} />);
    expect(screen.getByText(/제출본 내용을 불러오지 못했습니다/)).toBeTruthy();
    for (const label of ['문서 미리보기', 'PDF 다운로드'])
      expect((screen.getByRole('button', { name: label }) as HTMLButtonElement).disabled).toBe(
        true,
      );
    expect(screen.queryByLabelText('문서 내용')).toBeNull();
  },
);

test('출처나 확인자가 없는 값은 확인됨으로 표시하지 않는다', () => {
  const seed = createMockState().requests[0].commonAnswers[0];
  render(
    <RequestDocument
      request={request({
        commonAnswers: [
          { ...seed, value: '합성', source: 'AI_INFERRED', confirmed: true, confirmation: null },
          { ...seed, key: 'unknown', value: '합성', source: null, confirmed: true },
        ],
      })}
    />,
  );
  expect(screen.getByText('미확정 1개, AI 추론 미확인 1개')).toBeTruthy();
});

test('다른 신청·제출본의 응답은 표시하거나 다운로드하지 않는다', async () => {
  vi.spyOn(http, 'requestJson').mockResolvedValue(serverDocument({ securityRequestId: 99 }));
  const binary = vi.spyOn(http, 'requestPdf');
  render(<RequestDocument request={request()} />);
  fireEvent.click(screen.getByRole('button', { name: '문서 미리보기' }));
  await screen.findByText(/요청한 문서 내용을 확인할 수 없습니다/);
  expect(screen.queryByLabelText('문서 내용')).toBeNull();
  expect(binary).not.toHaveBeenCalled();
});

test('PDF 실패 후 재시도해도 서버 문서를 새로 만들지 않는다', async () => {
  const json = vi.spyOn(http, 'requestJson').mockResolvedValue(serverDocument());
  const file = pdf();
  file.binary.mockRejectedValueOnce(new Error('PDF 일시 오류'));
  render(<RequestDocument request={request()} />);
  fireEvent.click(screen.getByRole('button', { name: 'PDF 다운로드' }));
  await screen.findByText('PDF 일시 오류');
  expect(file.clicked).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'PDF 다운로드' }));
  await waitFor(() => expect(file.clicked).toHaveBeenCalledOnce());
  expect(json).toHaveBeenCalledOnce();
  expect(file.binary).toHaveBeenCalledTimes(2);
});

test('생성 실패는 안내하고 재시도할 수 있으며 로컬 본문으로 대체하지 않는다', async () => {
  vi.spyOn(http, 'requestJson')
    .mockRejectedValueOnce(new Error('서버 생성 오류'))
    .mockResolvedValue(serverDocument());
  render(<RequestDocument request={request()} />);
  fireEvent.click(screen.getByRole('button', { name: '문서 미리보기' }));
  await screen.findByText('서버 생성 오류');
  expect(screen.queryByLabelText('문서 내용')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
  await within(screen.getByRole('dialog')).findByLabelText('문서 내용');
});

test('원본 수정 뒤에는 이전 문서가 아닌 새 서버 문서로 준비한다', async () => {
  const json = vi.spyOn(http, 'requestJson').mockResolvedValue(serverDocument());
  const original = request();
  const { rerender } = render(<DocumentActions request={original} />);
  await openPreview();
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '닫기' }));
  json.mockResolvedValue(serverDocument({ version: 10, title: '수정 후 문서' }));
  rerender(<DocumentActions request={{ ...original, caseRevision: original.caseRevision + 1 }} />);
  await openPreview();
  expect(screen.getByRole('dialog').textContent).toContain('수정 후 문서');
  expect(json).toHaveBeenCalledTimes(2);
});

test('준비 중 키보드 초점을 유지하고 반복 입력과 동시 미리보기는 한 번만 생성한다', async () => {
  let complete!: (value: ReturnType<typeof serverDocument>) => void;
  const json = vi.spyOn(http, 'requestJson').mockImplementation(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  const file = pdf();
  render(<RequestDocument request={request()} />);
  const user = userEvent.setup();
  const button = screen.getByRole('button', { name: 'PDF 다운로드' });
  button.focus();
  await user.keyboard('{Enter}{Enter}');
  expect(document.activeElement).toBe(button);
  expect(button.getAttribute('aria-disabled')).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: '문서 미리보기' }));
  expect(json).toHaveBeenCalledOnce();
  complete(serverDocument());
  await waitFor(() => expect(file.clicked).toHaveBeenCalledOnce());
  await within(screen.getByRole('dialog')).findByLabelText('문서 내용');
});
