import type { GeneratedDocument } from '@/features/document/types';

/** 브라우저에서 만든 값과 구별되는 계약 응답으로 서버 원본 사용을 검증한다. */
export function serverDocument(overrides: Partial<GeneratedDocument> = {}): GeneratedDocument {
  return {
    generatedDocumentId: 88,
    securityRequestId: 42,
    submissionId: null,
    kind: 'DRAFT',
    kindLabel: '초안',
    version: 9,
    title: '서버의 문서 제목',
    sections: [
      {
        title: '사업 공통 정보',
        values: [
          {
            fieldKey: 'purpose',
            label: '사업 목적',
            scope: 'CASE',
            value: '원시 값',
            display: '<script>서버 합성 답변</script>',
            valueSource: 'AI_INFERRED',
            confirmed: false,
            needsReview: true,
            status: '담당자 확인 필요',
          },
        ],
      },
    ],
    markdown: '# 서버의 문서 제목',
    aiSupplement: null,
    modelReference: null,
    unconfirmedCount: 1,
    generatedBy: 'applicant',
    generatedAt: '2026-11-10T00:00:00Z',
    ...overrides,
  };
}
