import { render } from './queryRender';
import { afterEach, expect, test, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InfrastructureWorkspace } from '@/features/request/InfrastructureWorkspace';
import { createMockState, MOCK_MEMBERS } from '@/mocks/seed';
import * as http from '@/lib/httpClient';

afterEach(() => vi.restoreAllMocks());
test('배정된 인프라 담당자에게 입력 영역을 펼치고 여러 구간을 함께 저장한다', async () => {
  const actor = MOCK_MEMBERS.find((m) => m.role === 'INFRA')!;
  const request = structuredClone(createMockState().requests[0]);
  request.stage = 2;
  request.status = 'CONSULTING';
  request.assignments = [
    {
      ...request.assignments[0],
      field: 'INFRA',
      active: true,
      assigneeId: actor.id,
      reassignmentReason: null,
    },
  ];
  const connection = {
    id: 'segment-1',
    sourceSystem: '합성 웹',
    sourceAddress: '192.0.2.10',
    sourceZone: 'DMZ',
    destinationSystem: '합성 API',
    destinationAddress: '198.51.100.20',
    destinationZone: '내부망',
    protocol: 'TCP',
    port: '443',
    purpose: '서비스 연결',
    direction: '인바운드',
    startDate: '2026-11-11',
    endDate: '2027-11-11',
  };
  const plan = {
    revision: 1,
    connections: [
      connection,
      { ...connection, id: 'segment-2', destinationSystem: '합성 DB', port: '5432' },
    ],
    notes: '',
    updatedBy: actor.username,
    updatedAt: null,
  };
  const call = vi.spyOn(http, 'requestJson').mockImplementation(async (_url, options) => {
    if (options?.method === 'PUT') return { ...plan, revision: 2, notes: '망 분리 확인' };
    return plan;
  });
  render(<InfrastructureWorkspace request={request} actor={actor} onDirtyChange={() => {}} />);
  expect(await screen.findByRole('heading', { name: 'ICT인프라 검토 정보 입력' })).toBeTruthy();
  expect(screen.getAllByLabelText('목적지 서버·시스템명')).toHaveLength(2);
  await userEvent.type(screen.getByLabelText('ICT인프라 검토 사항'), '망 분리 확인');
  await userEvent.click(screen.getByRole('button', { name: 'ICT인프라 검토 정보 저장' }));
  await waitFor(() =>
    expect(call).toHaveBeenCalledWith(
      expect.stringContaining('/infrastructure-plan'),
      expect.objectContaining({
        method: 'PUT',
        body: expect.objectContaining({
          expectedRevision: 1,
          connections: expect.arrayContaining([expect.objectContaining({ port: '5432' })]),
        }),
      }),
    ),
  );
  expect(await screen.findByText('ICT인프라 검토 정보를 저장했습니다.')).toBeTruthy();
});
