import { afterEach, expect, test, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as http from '@/lib/httpClient';
import { useCase, useSaveCase } from '@/features/request/useRequests';

vi.mock('@/features/auth', () => ({
  useSession: () => ({ data: { member: { role: 'APPLICANT' } } }),
}));
afterEach(() => vi.restoreAllMocks());

test('새 게시본의 질문 하나를 답할 때 아직 입력하지 않은 다른 질문을 빈 값으로 전송하지 않는다', async () => {
  const saved = {
    answerId: 1,
    fieldKey: 'custom.note',
    scope: 'CASE',
    value: '합성 답변',
    valueSource: 'USER_ANSWER',
    evidence: null,
    confirmed: true,
    confirmedBy: null,
    confirmedAt: null,
    needsReview: false,
    revision: 0,
  };
  const read = vi.spyOn(http, 'requestJson').mockImplementation(async (path, options) => {
    if (options?.method === 'PATCH') return [saved];
    if (path.startsWith('/api/publications/'))
      return {
        publicationId: 2,
        version: 2,
        fieldSchema: {
          fields: ['project.summary', 'custom.note'].map((key) => ({
            key,
            label: key,
            scope: 'CASE',
            docTypes: [],
            type: 'LONG_TEXT',
            required: false,
            askRole: 'APPLICANT',
            hint: null,
          })),
        },
      };
    return {
      businessCaseId: 2,
      applicantUsername: 'synthetic',
      title: '합성',
      summary: '',
      department: '검증부',
      publicationId: 2,
      revision: 0,
      caseAnswers: [],
      createdAt: '2026-11-10T00:00:00Z',
      updatedAt: '2026-11-10T00:00:00Z',
    };
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { result } = renderHook(() => ({ businessCase: useCase('2'), save: useSaveCase('2') }), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  await waitFor(() => expect(result.current.businessCase.isSuccess).toBe(true));
  await act(async () =>
    result.current.save.mutateAsync({
      expectedRevision: 0,
      answers: [
        { key: 'project.summary', value: '', confirmed: false, notApplicable: false },
        { key: 'custom.note', value: '합성 답변', confirmed: false, notApplicable: false },
      ],
    }),
  );
  expect(read.mock.calls.filter((call) => call[1]?.method === 'PATCH')).toEqual([
    [
      '/api/business-cases/2/answers',
      {
        method: 'PATCH',
        body: {
          answers: [{ fieldKey: 'custom.note', value: '합성 답변', expectedRevision: undefined }],
        },
      },
    ],
  ]);
});
