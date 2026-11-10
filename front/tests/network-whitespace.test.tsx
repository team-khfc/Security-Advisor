import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { NetworkList } from '@/features/request/SupportingPages';
import type { SecurityRequest } from '@/features/request/types';
import type { Session } from '@/lib/types';
import { createMockState, MOCK_MEMBERS } from '@/mocks/seed';

const controls = vi.hoisted(() => ({
  session: null as Session | null,
  requests: [] as SecurityRequest[],
}));
vi.mock('@/features/auth', () => ({
  useSession: () => ({ data: controls.session, isPending: false }),
}));
vi.mock('@/features/request/useRequests', () => ({
  useRequests: () => ({ data: controls.requests, isPending: false, error: null, refetch: vi.fn() }),
}));

const FULL = {
  sourceSystem: '합성 안내 서버',
  sourceIp: '192.0.2.10',
  destinationSystem: '합성 공개 API',
  destinationIp: '198.51.100.20',
  protocol: 'TCP',
  port: '443',
};
type Key = keyof typeof FULL;
const KEYS = Object.keys(FULL) as Key[];

/** 시드 신청 하나의 통신 6개 답변만 바꾼다. 값은 저장된 그대로(정규화하지 않음) 넣는다. */
function requestWith(
  values: Partial<Record<Key, string>>,
  notApplicable: Key[] = [],
): SecurityRequest {
  const base = structuredClone(createMockState().requests[0]);
  const template = base.commonAnswers[0];
  const others = base.commonAnswers.filter((answer) => !KEYS.includes(answer.key as Key));
  return {
    ...base,
    id: 'net-ws',
    caseTitle: '합성 공백 사업',
    commonAnswers: [
      ...others,
      ...KEYS.map((key) => ({
        ...template,
        key,
        value: values[key] ?? '',
        notApplicable: notApplicable.includes(key),
      })),
    ],
  } as SecurityRequest;
}

const row = () => screen.getByRole('link', { name: '합성 공백 사업' }).closest('tr')!;
const cells = () => within(row()).getAllByRole('cell');
const warningBadges = () =>
  [...row().querySelectorAll('.badge.b-warning')].map((badge) => badge.textContent);

beforeEach(() => {
  const member = MOCK_MEMBERS.find((item) => item.role === 'INFRA')!;
  controls.session = { member, mock: true, expiresAt: null };
});

describe('통신 정보 공백 값 판정(R01)', () => {
  test('출발지 시스템명이 공백(" ")이면 미입력 1개로 표시한다', () => {
    controls.requests = [requestWith({ ...FULL, sourceSystem: ' ' })];
    render(<NetworkList />);
    expect(within(cells()[1]).getByText('시스템명 미입력')).toBeTruthy();
    expect(warningBadges()).toEqual(['출발지 시스템명 미입력']);
    expect(within(row()).getAllByText('담당자 확인 필요')).toHaveLength(1);
    expect(within(row()).getByText(/미입력 1개/)).toBeTruthy();
  });

  test.each([
    ['여러 칸 공백', '   '],
    ['탭', '\t'],
    ['줄바꿈', '\n'],
    ['공백·탭·줄바꿈 혼합', ' \t\r\n '],
  ])('%s만 있는 값은 미입력이다', (_name, blank) => {
    controls.requests = [requestWith({ ...FULL, port: blank })];
    render(<NetworkList />);
    expect(within(cells()[3]).getByText('포트 미입력')).toBeTruthy();
    expect(within(row()).getByText(/미입력 1개/)).toBeTruthy();
  });

  test('앞뒤 공백이 있어도 실질 값이 있으면 입력된 값이다', () => {
    controls.requests = [requestWith({ ...FULL, sourceIp: '  192.0.2.10 \n', protocol: ' TCP ' })];
    render(<NetworkList />);
    expect(warningBadges()).toEqual([]);
    expect(within(row()).queryByText('담당자 확인 필요')).toBeNull();
    expect(within(cells()[1]).getByText('192.0.2.10')).toBeTruthy();
    expect(within(cells()[3]).getByText('TCP')).toBeTruthy();
  });

  test('"0"은 유효한 값으로 표시한다', () => {
    controls.requests = [requestWith({ ...FULL, port: '0' })];
    render(<NetworkList />);
    expect(within(cells()[3]).getByText('0')).toBeTruthy();
    expect(warningBadges()).toEqual([]);
  });

  test('일부만 공백이면 공백·빈 필드 수만큼 정확히 센다', () => {
    controls.requests = [
      requestWith({ ...FULL, sourceSystem: ' ', destinationIp: '\t', protocol: '' }),
    ];
    render(<NetworkList />);
    expect(warningBadges()).toEqual([
      '출발지 시스템명 미입력',
      '목적지 IP 미입력',
      '통신 방식 미입력',
    ]);
    expect(within(row()).getByText(/미입력 3개/)).toBeTruthy();
    expect(within(cells()[1]).getByText('192.0.2.10')).toBeTruthy();
    expect(within(cells()[3]).getByText('443')).toBeTruthy();
  });

  test('모든 필드가 공백이면 미입력 6개', () => {
    controls.requests = [
      requestWith(Object.fromEntries(KEYS.map((key) => [key, ' '])) as Record<Key, string>),
    ];
    render(<NetworkList />);
    expect(warningBadges()).toHaveLength(6);
    expect(within(row()).getByText(/미입력 6개/)).toBeTruthy();
  });

  test('공백 판정은 표시에만 적용되고 실제 값·할당 상태 배지·행 링크는 그대로다', () => {
    const request = requestWith({ ...FULL, sourceSystem: ' ' });
    controls.requests = [request];
    render(<NetworkList />);
    // 저장값을 바꾸지 않는다.
    expect(request.commonAnswers.find((answer) => answer.key === 'sourceSystem')?.value).toBe(' ');
    expect(
      within(row())
        .getByText(/할당 (대기|완료)/)
        .classList.contains('badge'),
    ).toBe(true);
    expect(screen.getByRole('link', { name: '합성 공백 사업' }).getAttribute('href')).toBe(
      '/requests/net-ws',
    );
  });

  test('미해당(notApplicable)은 도메인 규칙처럼 채워진 것으로 보고 미입력으로 세지 않는다', () => {
    controls.requests = [requestWith({ ...FULL, sourceIp: '', destinationIp: ' ' }, ['sourceIp'])];
    render(<NetworkList />);
    expect(within(cells()[1]).getByText('미해당')).toBeTruthy();
    expect(warningBadges()).toEqual(['목적지 IP 미입력']);
    expect(within(row()).getByText(/미입력 1개/)).toBeTruthy();
  });
});
