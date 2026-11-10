import { render } from './queryRender';
import { afterEach, expect, test, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InfrastructureAiProposal } from '@/features/request/InfrastructureAiProposal';
import * as http from '@/lib/httpClient';
import { upstreamTimeoutMs } from '@/lib/aiProxy';

afterEach(() => vi.restoreAllMocks());
const row = {
  id: 'existing',
  sourceSystem: '합성 웹',
  sourceAddress: '192.0.2.1',
  sourceZone: 'DMZ',
  destinationSystem: '합성 API',
  destinationAddress: '198.51.100.1',
  destinationZone: '내부망',
  protocol: 'TCP',
  port: '80',
  purpose: '합성 연결',
  direction: '인바운드',
  startDate: '2026-11-11',
  endDate: '2027-11-11',
};
const response = {
  baseRevision: 2,
  connections: [
    {
      fields: {
        port: { value: '443', sourceTag: 'H', sourceLabel: '담당자 설명', quote: 'TCP 포트 443' },
      },
    },
  ],
  warnings: [],
  modelReference: 'synthetic/test',
};

test('기존 값과 비교하고 선택한 항목만 적용하며 서버에 자동 저장하지 않는다', async () => {
  const call = vi.spyOn(http, 'requestJson').mockResolvedValue(response);
  const apply = vi.fn();
  render(
    <InfrastructureAiProposal
      requestId="1"
      revision={2}
      rows={[row]}
      contextVersion="v1"
      disabled={false}
      onApply={apply}
    />,
  );
  await userEvent.click(screen.getByRole('button', { name: 'AI 망 구성 초안 작성' }));
  await screen.findByText('AI 제안 구간 1');
  expect(
    (screen.getByRole('checkbox', { name: '제안 1 출발지 IP·CIDR 적용' }) as HTMLInputElement)
      .disabled,
  ).toBe(true);
  expect(screen.getAllByText('확인 필요').length).toBeGreaterThan(0);
  await userEvent.selectOptions(screen.getByLabelText('제안 1 적용 대상'), 'existing');
  expect(screen.getByText('80')).toBeTruthy();
  await userEvent.click(screen.getByRole('checkbox', { name: '제안 1 포트·포트 범위 적용' }));
  await userEvent.click(screen.getByRole('button', { name: '선택한 항목을 입력칸에 적용' }));
  expect(apply).toHaveBeenCalledWith([{ ...row, port: '443' }]);
  expect(call).toHaveBeenCalledTimes(1);
  expect(upstreamTimeoutMs('POST', '/api/security-requests/1/infrastructure-proposals')).toBe(
    660000,
  );
});

test('AI가 응답하는 동안 입력이 바뀌면 오래된 제안의 적용을 막는다', async () => {
  let resolve!: (value: unknown) => void;
  vi.spyOn(http, 'requestJson').mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const apply = vi.fn();
  const props = {
    requestId: '1',
    revision: 2,
    contextVersion: 'v1',
    disabled: false,
    onApply: apply,
  };
  const view = render(<InfrastructureAiProposal {...props} rows={[row]} />);
  await userEvent.click(screen.getByRole('button', { name: 'AI 망 구성 초안 작성' }));
  view.rerender(<InfrastructureAiProposal {...props} rows={[{ ...row, port: '8080' }]} />);
  resolve(response);
  await waitFor(() =>
    expect(screen.getByText(/초안 요청 후 입력 또는 저장된 자료가 변경/)).toBeTruthy(),
  );
  expect(
    (screen.getByRole('button', { name: '선택한 항목을 입력칸에 적용' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect(apply).not.toHaveBeenCalled();
});
