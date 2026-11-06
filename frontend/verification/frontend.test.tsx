import assert from 'node:assert/strict';
import { test } from 'vitest';
import { z } from 'zod';
import { ApiError, invalidateIdentity, requestJson } from '../lib/http';
import { activateDraftScope, clearDrafts, readDraft, writeDraft } from '../lib/draft';
import { requestSchema, analysisSchema, validateAnalysisFile } from '@/features/request';
import { settingsSchema } from '@/features/configuration';
import { createVersionedDraft, reconcileVersionedDraft } from '../lib/versionedDraft';
import {
  previewRequest,
  previewRequests,
  previewSettings,
  previewAnalyses,
} from '@/features/preview';

test('변경 요청은 서버가 발급한 CSRF 헤더를 포함한다', async () => {
  const original = globalThis.fetch;
  const calls: { url: string; init?: RequestInit }[] = [];
  invalidateIdentity();
  globalThis.fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    return new Response(
      JSON.stringify(
        String(input).endsWith('/auth/csrf')
          ? { token: 'synthetic-csrf-token', headerName: 'X-CSRF-TOKEN' }
          : { saved: true },
      ),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  };
  try {
    const response = await requestJson('/security-requests', z.object({ saved: z.boolean() }), {
      method: 'POST',
      body: JSON.stringify({ title: '합성 신청' }),
    });
    assert.equal(response.saved, true);
    assert.equal(calls[0].url, '/api/auth/csrf');
    assert.equal(calls[1].url, '/api/security-requests');
    assert.equal(new Headers(calls[1].init?.headers).get('X-CSRF-TOKEN'), 'synthetic-csrf-token');
    assert.equal(calls[1].init?.credentials, 'same-origin');
    assert.equal(calls[1].init?.cache, 'no-store');
  } finally {
    globalThis.fetch = original;
    invalidateIdentity();
  }
});

test('계정 변경 이전에 시작한 응답은 뒤늦게 도착해도 폐기한다', async () => {
  const original = globalThis.fetch;
  let complete: ((response: Response) => void) | undefined;
  invalidateIdentity();
  globalThis.fetch = () =>
    new Promise<Response>((resolve) => {
      complete = resolve;
    });
  try {
    const pending = requestJson('/security-requests', z.array(z.string()));
    invalidateIdentity();
    assert.ok(complete);
    complete(new Response(JSON.stringify(['previous user value'])));
    await assert.rejects(
      pending,
      (error: unknown) => error instanceof DOMException && error.name === 'AbortError',
    );
  } finally {
    globalThis.fetch = original;
    invalidateIdentity();
  }
});

test('충돌 오류에는 최신 수정본과 문의 식별자가 보존된다', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        detail: '최신 수정본을 확인해 주세요.',
        code: 'REVISION_CONFLICT',
        requestId: 'synthetic-request',
        latestRevision: 9,
      }),
      { status: 409 },
    );
  try {
    await assert.rejects(
      requestJson('/security-requests/example', z.object({})),
      (error: unknown) =>
        error instanceof ApiError &&
        error.status === 409 &&
        error.latestRevision === 9 &&
        error.requestId === 'synthetic-request',
    );
  } finally {
    globalThis.fetch = original;
    invalidateIdentity();
  }
});

test('계약과 다른 서버 응답은 성공으로 수용하지 않는다', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ saved: 'not a boolean' }));
  try {
    await assert.rejects(
      requestJson('/example', z.object({ saved: z.boolean() })),
      (error: unknown) => error instanceof ApiError && error.code === 'INVALID_RESPONSE',
    );
  } finally {
    globalThis.fetch = original;
    invalidateIdentity();
  }
});

test('같은 계정 재인증에서는 초안을 유지하고 다른 신원에서는 지운다', () => {
  clearDrafts();
  activateDraftScope('tenant-a:user-a');
  writeDraft('tenant-a:user-a', 'answer', { value: '저장 전 합성 입력', revision: 2 });
  activateDraftScope('tenant-a:user-a');
  assert.deepEqual(readDraft('tenant-a:user-a', 'answer', null), {
    value: '저장 전 합성 입력',
    revision: 2,
  });
  activateDraftScope('tenant-b:user-b');
  assert.equal(readDraft('tenant-a:user-a', 'answer', null), null);
  clearDrafts();
});

test('지원하지 않는 형식과 빈 파일 및 초과 용량은 선택 단계에서 거절한다', () => {
  assert.equal(validateAnalysisFile({ name: 'synthetic.md', size: 1024 }), null);
  assert.ok(validateAnalysisFile({ name: 'synthetic.pdf', size: 1024 }));
  assert.ok(validateAnalysisFile({ name: 'synthetic.txt', size: 0 }));
  assert.ok(validateAnalysisFile({ name: 'synthetic.txt', size: 1024 * 1024 + 1 }));
});

test('읽기전용 합성 시안 자료가 현재 응답 계약을 충족한다', () => {
  assert.equal(requestSchema.safeParse(previewRequest).success, true);
  assert.equal(settingsSchema.safeParse(previewSettings).success, true);
  for (const analysis of previewAnalyses)
    assert.equal(analysisSchema.safeParse(analysis).success, true);
  assert.match(previewRequest.rules[0].sourceIp, /^192\.0\.2\./);
  assert.match(previewRequest.rules[0].destinationIp, /^198\.51\.100\./);
});

test('미편집 초안은 같은 신청의 다른 편집폼 저장 후 최신 버전으로 동기화한다', () => {
  const original = createVersionedDraft(3, [{ key: 'operatingEnvironment', value: '합성 환경' }]);
  const next = reconcileVersionedDraft(original, 4, [
    { key: 'operatingEnvironment', value: '합성 환경' },
  ]);
  assert.equal(next.revision, 4);
  assert.equal(next.value[0].value, '합성 환경');
});

test('미저장 입력은 서버 변경 시 비교 기준 버전과 함께 유지한다', () => {
  const original = createVersionedDraft(3, [{ key: 'purpose', value: '저장된 설명' }]);
  const edited = { ...original, value: [{ key: 'purpose', value: '아직 저장하지 않은 설명' }] };
  const next = reconcileVersionedDraft(edited, 4, [
    { key: 'purpose', value: '다른 담당자가 저장한 설명' },
  ]);
  assert.equal(next, edited);
  assert.equal(next.revision, 3);
});

test('미편집 질문 단계에 복귀하면 새로 적용한 AI 후보를 표시한다', () => {
  const original = createVersionedDraft(1, [{ key: 'dataTypes', value: '', confirmed: false }]);
  const next = reconcileVersionedDraft(original, 2, [
    { key: 'dataTypes', value: '공개 자료', confirmed: false },
  ]);
  assert.equal(next.value[0].value, '공개 자료');
  assert.equal(next.value[0].confirmed, false);
  assert.equal(next.revision, 2);
});

test('제출 준비·제출본 합성 자료는 확인과 현재 수정본 검토 조건을 모두 충족한다', () => {
  for (const item of previewRequests) {
    if (
      item.allowedActions.includes('SUBMIT') ||
      ['SUBMITTED', 'CONFIRMED'].includes(item.status)
    ) {
      assert.ok(
        item.answers
          .filter((answer) => answer.requiredAt !== 'OPTIONAL')
          .every((answer) => answer.status === 'CONFIRMED'),
      );
      assert.ok(
        item.reviews.every(
          (review) => review.status === 'COMPLETE' && review.revision === item.revision,
        ),
      );
      assert.ok(item.supplements.every((supplement) => supplement.status === 'RESOLVED'));
      assert.equal(item.blockers.length, 0);
    }
    if (item.status === 'DRAFT')
      assert.ok(item.reviews.every((review) => review.status !== 'COMPLETE'));
  }
  for (const analysis of previewAnalyses)
    for (const suggestion of analysis.suggestions)
      assert.ok(suggestion.evidence.includes(suggestion.value));
});
