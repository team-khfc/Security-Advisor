import { render } from './queryRender';
import { afterEach, expect, test, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InfrastructureWorkspace } from '@/features/request/InfrastructureWorkspace';
import { InfrastructureServerAi } from '@/features/request/InfrastructureServerAi';
import { emptyServer } from '@/features/request/infrastructurePlan';
import { createMockState, MOCK_MEMBERS } from '@/mocks/seed';
import * as http from '@/lib/httpClient';

afterEach(() => vi.restoreAllMocks());
test.each(['INFRA', 'SECURITY'] as const)(
  '%s 담당자가 보안성검토의 서버와 통신 구간을 임시 저장한다',
  async (role) => {
    const actor = MOCK_MEMBERS.find((m) => m.role === role)!;
    const request = structuredClone(createMockState().requests[0]);
    request.docType = 'SECURITY_REVIEW';
    request.stage = 2;
    request.status = 'CONSULTING';
    request.assignments = [
      {
        ...request.assignments[0],
        field: role,
        active: true,
        assigneeId: actor.id,
        reassignmentReason: null,
      },
    ];
    let plan: unknown = {
      revision: 0,
      connections: [],
      notes: '',
      updatedBy: null,
      updatedAt: null,
    };
    const call = vi.spyOn(http, 'requestJson').mockImplementation(async (_path, options) => {
      if (options?.method === 'PUT')
        plan = {
          ...(options.body as object),
          revision: 1,
          updatedBy: actor.username,
          updatedAt: null,
        };
      return plan;
    });
    render(<InfrastructureWorkspace request={request} actor={actor} onDirtyChange={() => {}} />);
    await userEvent.click(await screen.findByRole('button', { name: '서버 추가' }));
    await userEvent.type(screen.getByLabelText(/^서버·시스템명/), '합성 웹');
    const option = screen.getAllByRole('option', {
      name: '서버 1: 합성 웹',
    })[0] as HTMLOptionElement;
    await userEvent.selectOptions(screen.getByLabelText('출발지 서버 연결'), option.value);
    await userEvent.click(screen.getByRole('button', { name: '임시 저장' }));
    await waitFor(() =>
      expect(call).toHaveBeenCalledWith(
        expect.stringContaining('/infrastructure-plan'),
        expect.objectContaining({
          method: 'PUT',
          body: expect.objectContaining({
            draft: true,
            schemaVersion: 2,
            servers: expect.arrayContaining([
              expect.objectContaining({ name: '합성 웹', cpu: '' }),
            ]),
            connections: expect.arrayContaining([
              expect.objectContaining({ sourceServerId: option.value, sourceSystem: '합성 웹' }),
            ]),
          }),
        }),
      ),
    );
    expect(await screen.findByText(/임시 저장했습니다/)).toBeTruthy();
  },
);

test('서버 AI 사양은 선택 적용 후에도 미확정이며 근거와 기존 값을 보존한다', async () => {
  vi.spyOn(http, 'requestJson').mockResolvedValue({
    baseRevision: 1,
    servers: [
      {
        fields: {
          cpu: {
            value: '4 vCPU',
            sourceTag: 'U1',
            sourceLabel: '합성 기획서',
            quote: 'CPU 4 vCPU',
          },
        },
      },
    ],
    warnings: [],
  });
  const server = { ...emptyServer(), name: '합성 웹', memory: '8 GB' };
  const apply = vi.fn();
  render(
    <InfrastructureServerAi
      requestId="1"
      revision={1}
      servers={[server]}
      contextVersion="v1"
      disabled={false}
      onApply={apply}
    />,
  );
  await userEvent.click(screen.getByRole('button', { name: 'AI 서버 사양 제안 받기' }));
  await screen.findByText('AI 서버 제안 1');
  await userEvent.selectOptions(screen.getByLabelText('서버 제안 1 적용 대상'), server.id);
  await userEvent.click(screen.getByRole('checkbox', { name: '서버 제안 1 CPU (코어·vCPU) 적용' }));
  await userEvent.click(screen.getByRole('button', { name: '선택한 서버 사양 적용' }));
  expect(apply).toHaveBeenCalledWith([
    expect.objectContaining({
      id: server.id,
      cpu: '4 vCPU',
      memory: '8 GB',
      aiInferred: true,
      aiConfirmed: false,
      evidence: expect.objectContaining({ cpu: expect.stringContaining('U1') }),
    }),
  ]);
});
