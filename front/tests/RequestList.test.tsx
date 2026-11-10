import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';
import { RequestList } from '@/features/request/RequestList';
import type { SecurityRequest } from '@/features/request/types';
import type { Session } from '@/lib/types';
import { createMockState, MOCK_MEMBERS } from '@/mocks/seed';

const controls = vi.hoisted(() => ({
  session: null as Session | null,
  requests: [] as SecurityRequest[],
  replace: vi.fn(),
  listeners: new Set<() => void>(),
}));

vi.mock('next/navigation', async () => {
  const { useSyncExternalStore } = await import('react');
  const getSearch = () => window.location.search;
  const subscribe = (listener: () => void) => {
    controls.listeners.add(listener);
    return () => {
      controls.listeners.delete(listener);
    };
  };

  return {
    useRouter: () => ({ replace: controls.replace }),
    useSearchParams: () =>
      new URLSearchParams(useSyncExternalStore(subscribe, getSearch, getSearch)),
  };
});

vi.mock('@/features/auth', () => ({
  useSession: () => ({ data: controls.session, isPending: false }),
}));

vi.mock('@/features/request/useRequests', () => ({
  useRequests: () => ({ data: controls.requests, isPending: false, isError: false }),
}));

function searchInput() {
  return screen.getByRole('searchbox', { name: '사업명·신청번호 검색' }) as HTMLInputElement;
}

function searchParams() {
  return new URLSearchParams(window.location.search);
}

function composeInput(input: HTMLInputElement, value: string) {
  fireEvent.compositionUpdate(input, { data: value });
  fireEvent.input(input, {
    target: { value },
    data: value,
    inputType: 'insertCompositionText',
    isComposing: true,
  });
}

beforeEach(() => {
  const applicant = MOCK_MEMBERS[0];
  controls.session = { member: applicant, mock: true, expiresAt: null };
  controls.requests = createMockState().requests.filter(
    (request) => request.ownerId === applicant.id,
  );
  controls.listeners.clear();
  controls.replace.mockReset().mockImplementation((href: string) => {
    window.history.replaceState(null, '', href);
  });
  window.history.replaceState(null, '', '/requests');

  // Next의 history 연동처럼 URL 변경을 useSearchParams 구독자에게 전달한다.
  const replaceState = window.history.replaceState.bind(window.history);
  vi.spyOn(window.history, 'replaceState').mockImplementation((data, unused, url) => {
    replaceState(data, unused, url);
    for (const listener of controls.listeners) listener();
  });
});

test('입력과 삭제 중에는 기존 결과를 유지하고 신청 검색 버튼으로 검색어를 적용한다', async () => {
  const user = userEvent.setup();
  render(<RequestList />);
  const input = searchInput();
  expect(screen.getByRole('status').textContent).toContain('결과 6건');

  await user.type(input, 'API');
  expect(screen.getByRole('status').textContent).toContain('결과 6건');
  expect(searchParams().has('q')).toBe(false);
  await user.clear(input);
  await user.type(input, '정책');
  expect(input.value).toBe('정책');
  expect(screen.getByRole('status').textContent).toContain('결과 6건');
  expect(searchParams().has('q')).toBe(false);
  expect(controls.replace).not.toHaveBeenCalled();
  expect(searchInput()).toBe(input);
  expect(document.activeElement).toBe(input);

  await user.click(screen.getByRole('button', { name: '신청 검색' }));
  expect(screen.getByRole('status').textContent).toContain('결과 1건');
  expect(screen.getByRole('link', { name: '정책정보 API 연계' })).toBeTruthy();
  expect(searchParams().get('q')).toBe('정책');
  expect(searchInput()).toBe(input);

  await user.type(input, '정보 API 연계 ');
  expect(input.value).toBe('정책정보 API 연계 ');
  expect(screen.getByRole('status').textContent).toContain('결과 1건');
  expect(searchParams().get('q')).toBe('정책');
  expect(searchInput()).toBe(input);
  expect(document.activeElement).toBe(input);

  await user.click(screen.getByRole('button', { name: '신청 검색' }));
  expect(searchParams().get('q')).toBe('정책정보 API 연계');
  expect(screen.getByRole('status').textContent).toContain('결과 1건');

  await user.clear(input);
  expect(input.value).toBe('');
  expect(screen.getByRole('status').textContent).toContain('결과 1건');
  expect(searchParams().get('q')).toBe('정책정보 API 연계');
  await user.click(screen.getByRole('button', { name: '신청 검색' }));
  expect(screen.getByRole('status').textContent).toContain('결과 6건');
  expect(searchParams().has('q')).toBe(false);
  expect(searchInput()).toBe(input);
});

test('검색어 입력 중에는 현재 페이지를 유지하고 검색 버튼을 누르면 첫 페이지로 돌아온다', async () => {
  window.history.replaceState(null, '', '/requests?page=2');
  const user = userEvent.setup();
  render(<RequestList />);
  const input = searchInput();
  expect(screen.getByRole('status').textContent).toContain('2 / 2페이지');
  expect(screen.queryByRole('link', { name: '합성 교육 통계 연계' })).toBeNull();

  await user.type(input, 'demo-request');
  expect(screen.getByRole('status').textContent).toContain('2 / 2페이지');
  expect(searchParams().get('page')).toBe('2');
  expect(searchParams().has('q')).toBe(false);
  expect(searchInput()).toBe(input);
  expect(document.activeElement).toBe(input);

  await user.click(screen.getByRole('button', { name: '신청 검색' }));
  expect(screen.getByRole('status').textContent).toContain('결과 6건');
  expect(screen.getByRole('status').textContent).toContain('1 / 2페이지');
  expect(screen.getByRole('link', { name: '합성 교육 통계 연계' })).toBeTruthy();
  expect(searchParams().get('q')).toBe('demo-request');
  expect(searchParams().has('page')).toBe(false);
  expect(searchInput()).toBe(input);
});

test('한글 조합과 조합 완료만으로 검색하지 않고 버튼을 누르면 마지막 글자까지 적용한다', async () => {
  window.history.replaceState(null, '', '/requests?page=2');
  const user = userEvent.setup();
  render(<RequestList />);
  const input = searchInput();
  await user.click(input);

  fireEvent.compositionStart(input);
  for (const value of ['ㅅ', '시', '신', '신ㅊ', '신처', '신청', '신', '', '신청']) {
    composeInput(input, value);
    expect(input.value).toBe(value);
    expect(searchParams().has('q')).toBe(false);
    expect(searchParams().get('page')).toBe('2');
    expect(screen.getByRole('status').textContent).toContain('결과 6건');
    expect(screen.getByRole('status').textContent).toContain('2 / 2페이지');
    expect(screen.getByRole('status').textContent).not.toContain('검색어');
    expect(searchInput()).toBe(input);
    expect(document.activeElement).toBe(input);
  }

  fireEvent.compositionEnd(input, { data: '신청' });
  expect(input.value).toBe('신청');
  expect(searchParams().has('q')).toBe(false);
  expect(searchParams().get('page')).toBe('2');
  expect(searchInput()).toBe(input);
  expect(document.activeElement).toBe(input);
  expect(controls.replace).not.toHaveBeenCalled();

  await user.click(screen.getByRole('button', { name: '신청 검색' }));
  expect(searchParams().get('q')).toBe('신청');
  expect(searchParams().has('page')).toBe(false);
  expect(screen.getByRole('status').textContent).toContain('검색어 “신청”');
});

test('한글 확정용 Enter는 폼을 제출하지 않고 검색 버튼을 누른 뒤 결과를 갱신한다', async () => {
  window.history.replaceState(null, '', '/requests?q=%EA%B3%B5%EA%B3%B5');
  const user = userEvent.setup();
  render(<RequestList />);
  const input = searchInput();
  await user.click(input);
  expect(screen.getByRole('status').textContent).toContain('결과 3건');

  fireEvent.compositionStart(input);
  composeInput(input, '교');
  expect(input.value).toBe('교');
  expect(screen.getByRole('status').textContent).toContain('결과 3건');
  expect(searchParams().get('q')).toBe('공공');

  composeInput(input, '교육');
  expect(searchParams().get('q')).toBe('공공');
  expect(screen.getByRole('status').textContent).toContain('결과 3건');
  expect(
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', isComposing: true, keyCode: 229 }),
  ).toBe(false);
  fireEvent.submit(input.form!);
  expect(input.value).toBe('교육');
  expect(searchParams().get('q')).toBe('공공');
  expect(controls.replace).not.toHaveBeenCalled();

  fireEvent.compositionEnd(input, { data: '교육' });
  expect(searchParams().get('q')).toBe('공공');
  expect(screen.getByRole('status').textContent).toContain('결과 3건');
  expect(controls.replace).not.toHaveBeenCalled();
  expect(searchInput()).toBe(input);
  expect(document.activeElement).toBe(input);

  await user.click(screen.getByRole('button', { name: '신청 검색' }));
  expect(screen.getByRole('status').textContent).toContain('결과 2건');
  expect(searchParams().get('q')).toBe('교육');
  expect(screen.getByRole('link', { name: '교육지원 포털 개선' })).toBeTruthy();
  expect(screen.getByRole('link', { name: '합성 교육 통계 연계' })).toBeTruthy();
});

test('기간 검증 후 버튼으로 검색하며 상태 변경에는 마지막 적용 검색어를 사용한다', async () => {
  window.history.replaceState(null, '', '/requests?filter=mine');
  const user = userEvent.setup();
  render(<RequestList />);
  const previousResult = screen.getByRole('status').textContent;
  await user.selectOptions(screen.getByLabelText('접수 기간'), 'custom');
  await user.type(searchInput(), '정책');
  expect(screen.getByRole('status').textContent).toBe(previousResult);
  expect(searchParams().has('q')).toBe(false);
  await user.click(screen.getByRole('button', { name: '신청 검색' }));
  expect(screen.getByRole('alert').textContent).toContain('시작일이나 종료일을 하나 이상');
  expect(searchParams().has('q')).toBe(false);

  const from = screen.getByLabelText('시작일') as HTMLInputElement;
  const to = screen.getByLabelText('종료일') as HTMLInputElement;
  fireEvent.change(from, { target: { value: '2026-11-02' } });
  fireEvent.change(to, { target: { value: '2026-11-04' } });

  expect(screen.getByRole('status').textContent).toBe(previousResult);
  expect((screen.getByLabelText('접수 기간') as HTMLSelectElement).value).toBe('custom');
  expect(screen.getByLabelText('시작일')).toBe(from);
  expect(screen.getByLabelText('종료일')).toBe(to);
  expect(from.value).toBe('2026-11-02');
  expect(to.value).toBe('2026-11-04');
  expect(searchParams().get('filter')).toBe('mine');
  expect(searchParams().has('q')).toBe(false);
  expect(searchParams().has('period')).toBe(false);

  await user.click(screen.getByRole('button', { name: '신청 검색' }));
  expect(screen.getByRole('status').textContent).toContain('내가 할 일 결과 1건');
  expect(screen.getByRole('link', { name: '정책정보 API 연계' })).toBeTruthy();
  expect(searchParams().get('q')).toBe('정책');
  expect(searchParams().get('period')).toBe('custom');
  expect(searchParams().get('from')).toBe('2026-11-02');
  expect(searchParams().get('to')).toBe('2026-11-04');

  await user.clear(searchInput());
  await user.type(searchInput(), '교육');
  await user.click(screen.getByRole('button', { name: /^담당자 확인 중$/ }));
  expect(screen.getByRole('status').textContent).toContain('담당자 확인 중 결과 0건');
  expect(screen.getByRole('heading', { name: '조건에 맞는 신청이 없습니다' })).toBeTruthy();
  expect(searchParams().get('filter')).toBe('staff');
  expect(searchParams().get('q')).toBe('정책');
});

test('외부 URL의 검색어 변경과 조건 초기화를 입력창 및 결과에 동기화한다', async () => {
  window.history.replaceState(null, '', '/requests?q=%EC%A0%95%EC%B1%85');
  const user = userEvent.setup();
  render(<RequestList />);
  const input = searchInput();
  expect(input.value).toBe('정책');
  expect(screen.getByRole('status').textContent).toContain('결과 1건');

  await user.clear(input);
  await user.type(input, '교육');
  expect(input.value).toBe('교육');
  expect(searchParams().get('q')).toBe('정책');

  act(() => {
    window.history.replaceState(null, '', '/requests?q=%EA%B3%B5%EA%B3%B5');
  });
  expect(searchInput()).toBe(input);
  expect(input.value).toBe('공공');
  expect(screen.getByRole('status').textContent).toContain('결과 3건');
  expect(screen.queryByRole('link', { name: '정책정보 API 연계' })).toBeNull();

  await user.type(input, ' 신청');
  expect(searchParams().get('q')).toBe('공공');
  await user.click(screen.getByRole('button', { name: /^조건 초기화$/ }));
  expect(input.value).toBe('');
  expect(screen.getByRole('status').textContent).toContain('결과 6건');
  expect(window.location.search).toBe('');
  expect(searchInput()).toBe(input);
});

test.each([
  ['DRAFT', 'DRAFTING', '작성 중'],
  ['CONSULTING', 'IN_REVIEW', '협의 중'],
  ['SUPPLEMENT_REQUESTED', 'SUPPLEMENT_REQUESTED', '보완 요청'],
  ['FINAL_REVIEW', 'FINAL_REVIEW', '최종 검토 중'],
  ['SUBMITTED', 'SUBMITTED', '제출됨'],
  ['FINALIZED', 'CONFIRMED', '확정'],
  ['CLOSED', 'CLOSED', '종결(반려)'],
  ['WITHDRAWN', 'WITHDRAWN', '철회'],
] as const)(
  '서버 표시명이 %s의 영문 코드여도 목록에는 %s 대신 %s를 표시한다',
  (status, rawLabel, label) => {
    controls.requests = [{ ...controls.requests[0], status, statusLabel: rawLabel }];
    const { container } = render(<RequestList />);

    const badge = container.querySelector('.request-table .badge');
    expect(badge?.textContent).toBe(label);
    expect(container.textContent).not.toContain(rawLabel);
  },
);
