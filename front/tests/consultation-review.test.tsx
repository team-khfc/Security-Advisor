import { render } from './queryRender';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import * as http from '@/lib/httpClient';
import { ConsultationReview } from '@/features/request/ConsultationReview';

afterEach(() => vi.restoreAllMocks());
const field = {
  label: '사업 목적',
  group: '사업 정보',
  value: '합성 자료 조회',
  confirmed: true,
  evidence: '',
};
const base = {
  fingerprint: 'v2',
  baselineAvailable: true,
  baselineAt: '2026-11-11T00:00:00Z',
  caseTitle: '합성 사업',
  department: '합성부',
  baseline: { purpose: field },
  current: { purpose: { ...field, value: '합성 자료 내부 조회' } },
  changes: [
    {
      id: 1,
      kind: 'ANSWER',
      actorName: '합성 담당자',
      actorRole: 'SECURITY',
      at: '2026-11-11T01:00:00Z',
      before: { purpose: field },
      after: { purpose: { ...field, value: '합성 자료 내부 조회' } },
    },
  ],
  summary: null,
};

test('기준본 없는 기존 신청은 현재 값만 보여주고 과거 추가·수정을 추정하지 않는다', async () => {
  vi.spyOn(http, 'requestJson').mockResolvedValue({
    ...base,
    baselineAvailable: false,
    baselineAt: null,
    baseline: {},
    changes: [],
  });
  render(<ConsultationReview requestId="5" actorId="synthetic" canSummarize={true} />);
  await screen.findByText(/협의 요청 당시 기준본이 없습니다/);
  expect(screen.getByText('과거 비교 불가')).toBeTruthy();
  expect(screen.queryByText('추가')).toBeNull();
  expect(screen.getByText('합성 자료 내부 조회')).toBeTruthy();
});

test('전후 비교·담당자 기록과 원본에 연결된 AI 요약을 제공하고 오래된 요약은 숨긴다', async () => {
  let result: unknown = base;
  const call = vi.spyOn(http, 'requestJson').mockImplementation(async (_url, options) => {
    if (options?.method === 'POST') {
      const summary = {
        fingerprint: 'v2',
        model: 'synthetic/model',
        at: '2026-11-11T02:00:00Z',
        items: [{ text: '자료 조회 범위를 확인해 주세요.', evidenceIds: ['purpose'] }],
      };
      result = { ...base, summary };
      return summary;
    }
    return result;
  });
  render(<ConsultationReview requestId="5" actorId="synthetic" canSummarize={true} />);
  await userEvent.click(await screen.findByRole('button', { name: 'AI 협의 결과 요약' }));
  await screen.findByText('자료 조회 범위를 확인해 주세요.');
  expect(screen.getByRole('link', { name: '근거: 사업 목적' }).getAttribute('href')).toBe(
    '#consultation-field-purpose',
  );
  expect(screen.getByText(/정보보안 · 합성 담당자/)).toBeTruthy();
  await waitFor(() =>
    expect(call).toHaveBeenCalledWith(
      expect.stringContaining('/consultation-summaries'),
      expect.objectContaining({ body: { expectedFingerprint: 'v2' } }),
    ),
  );
});

test('원본이 바뀐 저장 요약은 재요약을 안내하고 근거 문장을 재사용하지 않는다', async () => {
  vi.spyOn(http, 'requestJson').mockResolvedValue({
    ...base,
    summary: {
      fingerprint: 'v1',
      model: 'synthetic/model',
      at: '2026-11-11T01:00:00Z',
      items: [{ text: '이전 요약', evidenceIds: ['purpose'] }],
    },
  });
  render(<ConsultationReview requestId="5" actorId="synthetic" canSummarize={true} />);
  await screen.findByText('원본 변경 · 다시 요약 필요');
  expect(screen.queryByText('이전 요약')).toBeNull();
});
