import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

/** 시드 신청 하나를 복제해 통신 6개 값만 원하는 대로 바꾼다(다른 답변·계약은 그대로). */
function requestWith(values: Partial<Record<Key, string>>, title = '합성 통신 사업', id = 'net-1') {
  const base = structuredClone(createMockState().requests[0]);
  const keys = Object.keys(FULL) as Key[];
  const template = base.commonAnswers[0];
  const others = base.commonAnswers.filter((answer) => !keys.includes(answer.key as Key));
  return {
    ...base,
    id,
    caseTitle: title,
    commonAnswers: [
      ...others,
      ...keys.map((key) => ({ ...template, key, value: values[key] ?? '' })),
    ],
  } as SecurityRequest;
}

function rowOf(title: string) {
  return screen.getByRole('link', { name: title }).closest('tr')!;
}
const cells = (row: HTMLElement) => within(row).getAllByRole('cell');

beforeEach(() => {
  const member = MOCK_MEMBERS.find((item) => item.role === 'INFRA')!;
  controls.session = { member, mock: true, expiresAt: null };
});

describe('통신 정보 빈 값 표시(A02)', () => {
  test('모든 값이 있으면 값 6개를 그대로 보여 주고 경고는 없다', () => {
    controls.requests = [requestWith(FULL)];
    render(<NetworkList />);
    const row = rowOf('합성 통신 사업');
    for (const value of Object.values(FULL)) expect(within(row).getByText(value)).toBeTruthy();
    expect(row.querySelector('.badge.b-warning')).toBeNull();
    expect(within(row).queryByText('담당자 확인 필요')).toBeNull();
  });

  test('모두 비어 있으면 칸마다 필드 이름을 밝히고 담당자 확인 필요는 행에서 한 번만 보인다', () => {
    controls.requests = [requestWith({})];
    render(<NetworkList />);
    const row = rowOf('합성 통신 사업');
    const [, source, destination, transport] = cells(row);
    expect(within(source).getByText('시스템명 미입력')).toBeTruthy();
    expect(within(source).getByText('IP 미입력')).toBeTruthy();
    expect(within(destination).getByText('시스템명 미입력')).toBeTruthy();
    expect(within(destination).getByText('IP 미입력')).toBeTruthy();
    expect(within(transport).getByText('통신 방식 미입력')).toBeTruthy();
    expect(within(transport).getByText('포트 미입력')).toBeTruthy();
    expect(within(row).getAllByText('담당자 확인 필요')).toHaveLength(1);
    expect(within(row).getByText(/미입력 6개/)).toBeTruthy();
    // 같은 문구의 경고 배지가 칸 안에서 반복되지 않는다.
    for (const cell of [source, destination, transport]) {
      const texts = [...cell.querySelectorAll('.badge')].map((badge) => badge.textContent);
      expect(new Set(texts).size).toBe(texts.length);
    }
  });

  test('화면 낭독기에는 출발지·목적지를 앞에 붙여 같은 이름의 빈 값도 구별된다', () => {
    controls.requests = [requestWith({})];
    render(<NetworkList />);
    const badges = [...rowOf('합성 통신 사업').querySelectorAll('.badge.b-warning')].map(
      (badge) => badge.textContent,
    );
    expect(badges).toEqual([
      '출발지 시스템명 미입력',
      '출발지 IP 미입력',
      '목적지 시스템명 미입력',
      '목적지 IP 미입력',
      '통신 방식 미입력',
      '포트 미입력',
    ]);
  });

  test('시스템명만 없으면 시스템명 배지만, IP는 실제 값을 보여 준다', () => {
    controls.requests = [requestWith({ ...FULL, sourceSystem: '', destinationSystem: '' })];
    render(<NetworkList />);
    const row = rowOf('합성 통신 사업');
    expect(within(row).getAllByText('시스템명 미입력')).toHaveLength(2);
    expect(within(row).queryByText('IP 미입력')).toBeNull();
    expect(within(row).getByText('192.0.2.10')).toBeTruthy();
    expect(within(row).getByText(/미입력 2개/)).toBeTruthy();
  });

  test('IP만 없으면 시스템명은 값으로, IP만 미입력으로 표시한다', () => {
    controls.requests = [requestWith({ ...FULL, sourceIp: '', destinationIp: '' })];
    render(<NetworkList />);
    const row = rowOf('합성 통신 사업');
    expect(within(row).getAllByText('IP 미입력')).toHaveLength(2);
    expect(within(row).getByText('합성 안내 서버')).toBeTruthy();
    expect(within(row).queryByText('시스템명 미입력')).toBeNull();
  });

  test.each<[string, Key, string, string]>([
    ['통신 방식', 'protocol', '통신 방식 미입력', '443'],
    ['포트', 'port', '포트 미입력', 'TCP'],
  ])('%s만 없으면 그 값만 미입력이고 나머지는 유지된다', (_name, key, label, kept) => {
    controls.requests = [requestWith({ ...FULL, [key]: '' })];
    render(<NetworkList />);
    const row = rowOf('합성 통신 사업');
    const transport = cells(row)[3];
    expect(within(transport).getByText(label)).toBeTruthy();
    expect(within(transport).getByText(kept)).toBeTruthy();
    expect(within(row).getByText(/미입력 1개/)).toBeTruthy();
  });

  test('일부만 채워진 행은 채워진 값과 빠진 필드를 함께 구별해 보여 준다', () => {
    controls.requests = [requestWith({ sourceSystem: '합성 안내 서버', port: '443' })];
    render(<NetworkList />);
    const row = rowOf('합성 통신 사업');
    const [, source, destination, transport] = cells(row);
    expect(within(source).getByText('합성 안내 서버')).toBeTruthy();
    expect(within(source).getByText('IP 미입력')).toBeTruthy();
    expect(within(destination).getByText('시스템명 미입력')).toBeTruthy();
    expect(within(destination).getByText('IP 미입력')).toBeTruthy();
    expect(within(transport).getByText('통신 방식 미입력')).toBeTruthy();
    expect(within(transport).getByText('443')).toBeTruthy();
    expect(within(row).getByText(/미입력 4개/)).toBeTruthy();
  });

  test('사업명 링크는 신청 상세로 이동하며 키보드 Tab 순서로 도달한다', async () => {
    controls.requests = [requestWith({}, '합성 이동 사업', 'net-move')];
    render(<NetworkList />);
    const link = screen.getByRole('link', { name: '합성 이동 사업' });
    expect(link.getAttribute('href')).toBe('/requests/net-move');
    const user = userEvent.setup();
    for (let i = 0; i < 5 && document.activeElement !== link; i += 1) await user.tab();
    expect(document.activeElement).toBe(link);
  });
});
