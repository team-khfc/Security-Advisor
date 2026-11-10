import * as http from '@/lib/httpClient';
import { serverDocument } from './documentFixture';
import { render } from './queryRender';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { DocumentList } from '@/features/document';
import type { SecurityRequest } from '@/features/request';
import { createMockState } from '@/mocks/seed';

const controls = vi.hoisted(() => ({ requests: [] as SecurityRequest[] }));

vi.mock('@/features/request', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/request')>();
  return {
    ...actual,
    useRequests: () => ({ data: controls.requests, isPending: false, isError: false }),
  };
});

const dialogMethods = {
  showModal: Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal'),
  close: Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close'),
};

beforeAll(() => {
  // jsdom에 없는 열기·닫기만 보완하고 미리보기 내용은 실제 Modal로 검증한다.
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

function createDocuments(count = 13): SecurityRequest[] {
  const requests = createMockState().requests;
  const draft = requests.find(
    (request) => !request.currentSubmissionId && request.status !== 'FINALIZED',
  );
  const finalized = requests.find((request) => request.status === 'FINALIZED');
  if (!draft || !finalized) throw new Error('문서함 검증에 필요한 합성 시드가 없습니다.');

  return Array.from({ length: count }, (_, index) => {
    const number = String(index + 1).padStart(2, '0');
    return {
      ...structuredClone(index < 6 ? draft : finalized),
      id: String(index + 1),
      currentSubmissionId: index < 6 ? null : '123',
      submissions: index < 6 ? [] : finalized.submissions.map((v) => ({ ...v, id: '123' })),
      caseId: `demo-document-case-${number}`,
      caseTitle: `합성 문서 ${number}`,
    };
  });
}

function visibleTitles() {
  return screen
    .queryAllByRole('article')
    .map((card) => within(card).getByRole('heading', { level: 2 }).textContent);
}

function pageButton(name: string) {
  const pager = screen.getByRole('navigation', { name: '문서함 페이지' });
  return within(pager).getByRole('button', { name }) as HTMLButtonElement;
}

afterEach(() => vi.restoreAllMocks());

beforeEach(() => {
  controls.requests = createDocuments();
});

test.each([6, 7])(
  '문서 %i건에서 한 화면에 최대 6개를 표시하고 초과분만 다음 페이지로 보낸다',
  async (count) => {
    controls.requests = createDocuments(count);
    const user = userEvent.setup();
    render(<DocumentList />);

    expect(screen.getAllByRole('article')).toHaveLength(6);
    expect(visibleTitles()).toEqual(controls.requests.slice(0, 6).map((item) => item.caseTitle));
    expect(screen.getByRole('status').textContent).toContain(`문서 ${count}건`);
    if (count === 6) {
      expect(screen.queryByRole('navigation', { name: '문서함 페이지' })).toBeNull();
      expect(screen.getByRole('status').textContent).toContain('1 / 1페이지');
    } else {
      await user.click(pageButton('다음'));
      expect(visibleTitles()).toEqual(['합성 문서 07']);
      expect(screen.getByRole('status').textContent).toContain('2 / 2페이지');
      expect(pageButton('다음').disabled).toBe(true);
      expect(pageButton('마지막 페이지').disabled).toBe(true);
    }
  },
);

test('13건을 6개·6개·1개로 나누고 페이지 번호와 처음·이전·다음·마지막 이동을 제공한다', async () => {
  const user = userEvent.setup();
  render(<DocumentList />);
  expect(pageButton('처음 페이지').disabled).toBe(true);
  expect(pageButton('이전').disabled).toBe(true);
  expect(pageButton('1페이지').getAttribute('aria-current')).toBe('page');

  await user.click(pageButton('다음'));
  expect(visibleTitles()).toEqual(controls.requests.slice(6, 12).map((item) => item.caseTitle));
  expect(screen.getByRole('status').textContent).toContain('문서 13건 · 2 / 3페이지');
  expect(pageButton('2페이지').getAttribute('aria-current')).toBe('page');
  expect(pageButton('1페이지').getAttribute('aria-current')).toBeNull();

  await user.click(pageButton('마지막 페이지'));
  expect(visibleTitles()).toEqual(['합성 문서 13']);
  expect(pageButton('3페이지').getAttribute('aria-current')).toBe('page');
  expect(pageButton('다음').disabled).toBe(true);
  expect(pageButton('마지막 페이지').disabled).toBe(true);

  await user.click(pageButton('이전'));
  expect(visibleTitles()).toEqual(controls.requests.slice(6, 12).map((item) => item.caseTitle));
  await user.click(pageButton('처음 페이지'));
  expect(visibleTitles()).toEqual(controls.requests.slice(0, 6).map((item) => item.caseTitle));
  await user.click(pageButton('3페이지'));
  expect(visibleTitles()).toEqual(['합성 문서 13']);
});

test('검색 입력 중에는 페이지를 유지하고 검색 제출·빈 결과 초기화 시 첫 페이지로 돌아온다', async () => {
  const user = userEvent.setup();
  render(<DocumentList />);
  await user.click(pageButton('3페이지'));
  const input = screen.getByRole('searchbox', { name: '사업명·신청번호' }) as HTMLInputElement;

  await user.type(input, '합성 문서');
  expect(visibleTitles()).toEqual(['합성 문서 13']);
  expect(screen.getByRole('status').textContent).toContain('3 / 3페이지');
  await user.click(screen.getByRole('button', { name: '검색' }));
  expect(screen.getByRole('status').textContent).toContain('문서 13건 · 1 / 3페이지');
  expect(screen.getAllByRole('article')).toHaveLength(6);

  await user.click(pageButton('3페이지'));
  await user.clear(input);
  await user.type(input, '합성 문서 08');
  expect(visibleTitles()).toEqual(['합성 문서 13']);
  await user.click(screen.getByRole('button', { name: '검색' }));
  expect(visibleTitles()).toEqual(['합성 문서 08']);
  expect(screen.getByRole('status').textContent).toContain('문서 1건 · 1 / 1페이지');
  expect(screen.queryByRole('navigation', { name: '문서함 페이지' })).toBeNull();

  await user.clear(input);
  await user.type(input, '존재하지 않는 합성 문서');
  await user.click(screen.getByRole('button', { name: '검색' }));
  expect(screen.getByRole('heading', { name: '조건에 맞는 문서가 없습니다' })).toBeTruthy();
  expect(screen.queryAllByRole('article')).toHaveLength(0);
  expect(screen.queryByRole('navigation', { name: '문서함 페이지' })).toBeNull();
  const [, emptyReset] = screen.getAllByRole('button', { name: '검색 초기화' });
  await user.click(emptyReset);
  expect(input.value).toBe('');
  expect(screen.getByRole('status').textContent).toContain('문서 13건 · 1 / 3페이지');
  expect(screen.getAllByRole('article')).toHaveLength(6);
});

test('문서 구분 변경과 검색 초기화는 뒤쪽 페이지에서도 첫 페이지의 결과를 보여 준다', async () => {
  const user = userEvent.setup();
  render(<DocumentList />);
  await user.click(pageButton('3페이지'));
  const kind = screen.getByRole('combobox', { name: '문서 구분' }) as HTMLSelectElement;

  await user.selectOptions(kind, 'finalized');
  expect(screen.getByRole('status').textContent).toContain('문서 7건 · 1 / 2페이지');
  expect(visibleTitles()).toEqual(controls.requests.slice(6, 12).map((item) => item.caseTitle));
  await user.click(pageButton('다음'));
  expect(visibleTitles()).toEqual(['합성 문서 13']);

  await user.click(screen.getByRole('button', { name: '검색 초기화' }));
  expect(kind.value).toBe('all');
  expect(screen.getByRole('status').textContent).toContain('문서 13건 · 1 / 3페이지');
  expect(visibleTitles()).toEqual(controls.requests.slice(0, 6).map((item) => item.caseTitle));
});

test('재조회로 문서 수가 줄면 유효한 페이지로 보정하고 다시 늘어도 그 페이지를 유지한다', async () => {
  const original = controls.requests;
  const user = userEvent.setup();
  const { rerender } = render(<DocumentList />);
  await user.click(pageButton('3페이지'));

  controls.requests = original.slice(0, 7);
  rerender(<DocumentList />);
  expect(visibleTitles()).toEqual(['합성 문서 07']);
  expect(screen.getByRole('status').textContent).toContain('문서 7건 · 2 / 2페이지');
  expect(pageButton('2페이지').getAttribute('aria-current')).toBe('page');

  controls.requests = original;
  rerender(<DocumentList />);
  expect(screen.getByRole('status').textContent).toContain('문서 13건 · 2 / 3페이지');
  expect(visibleTitles()).toEqual(original.slice(6, 12).map((item) => item.caseTitle));
});

test('뒤쪽 페이지의 미리보기와 상세·다운로드 링크가 선택한 문서를 가리킨다', async () => {
  const user = userEvent.setup();
  render(<DocumentList />);
  await user.click(pageButton('2페이지'));
  const card = screen.getAllByRole('article')[0];
  expect(within(card).getByRole('heading', { name: '합성 문서 07' })).toBeTruthy();
  expect(within(card).getByRole('link', { name: '신청 상세' }).getAttribute('href')).toBe(
    '/requests/7#documents',
  );
  expect(within(card).getByRole('button', { name: 'PDF 다운로드' })).toBeTruthy();

  vi.spyOn(http, 'requestJson').mockResolvedValue(
    serverDocument({ securityRequestId: 7, submissionId: 123, title: '서버 문서 07' }),
  );
  await user.click(within(card).getByRole('button', { name: '미리보기' }));
  const dialog = screen.getByRole('dialog', { name: '문서 미리보기' });
  await within(dialog).findByText('서버 문서 07');
  expect(dialog.textContent).toContain('신청 7');
  expect(within(dialog).getByRole('button', { name: 'PDF 다운로드' })).toBeTruthy();

  await user.click(within(dialog).getByRole('button', { name: '닫기' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByRole('status').textContent).toContain('2 / 3페이지');
  expect(visibleTitles()).toEqual(controls.requests.slice(6, 12).map((item) => item.caseTitle));
});

test('4단계 제출본 정보가 없으면 현재 초안 PDF를 대신 다운로드하지 않는다', async () => {
  const request = createDocuments(7)[6];
  controls.requests = [{ ...request, stage: 4, currentSubmissionId: null, submissions: [] }];
  const user = userEvent.setup();
  render(<DocumentList />);
  expect((screen.getByRole('button', { name: 'PDF 다운로드' }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  expect((screen.getByRole('button', { name: '미리보기' }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  await user.click(screen.getByRole('button', { name: '미리보기' }));
  expect(screen.queryByRole('dialog')).toBeNull();
});
