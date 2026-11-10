import type { GeneratedDocument } from '@/features/document/types';
import type { SecurityRequest, Submission, Answer } from '@/features/request/types';
import type { FinalDraft } from '@/features/request/useFinalDraft';
import { z } from 'zod';

const snapshotDraftSchema = z.object({
  text: z.string(),
  valueSource: z.string().optional(),
  confirmed: z.boolean().optional(),
  stale: z.boolean().optional(),
});

/** 모의 서버도 계약상의 문서 자원을 반환한다. PDF 바이트는 실제 Back에서만 제공한다. */
export function mockGeneratedDocument(
  request: SecurityRequest,
  submission: Submission | undefined,
  draft: FinalDraft | undefined,
  metadata: Pick<
    GeneratedDocument,
    | 'generatedDocumentId'
    | 'securityRequestId'
    | 'submissionId'
    | 'version'
    | 'generatedBy'
    | 'generatedAt'
  >,
): GeneratedDocument {
  const snapshot = submission?.snapshot as { caseTitle?: string; finalDraft?: unknown } | undefined;
  const frozenDraft = snapshotDraftSchema.safeParse(snapshot?.finalDraft);
  const final = submission ? (frozenDraft.success ? frozenDraft.data : undefined) : draft;
  const answers = submission
    ? [...submission.commonAnswers, ...submission.answers]
    : [...request.commonAnswers, ...request.answers];
  const field = (answer: Answer) => ({
    fieldKey: answer.key,
    label: answer.label,
    scope: answer.scope,
    value: answer.value || null,
    valueSource: answer.source,
    confirmed: answer.confirmed,
    needsReview: answer.needsReview ?? false,
    display: answer.notApplicable
      ? '미해당'
      : answer.value === 'true'
        ? '예'
        : answer.value === 'false'
          ? '아니요'
          : answer.value || '담당자 확인 필요',
    status: answer.confirmed && !answer.needsReview ? '확인됨' : '담당자 확인 필요',
  });
  const sections: GeneratedDocument['sections'] = (['CASE', 'REQUEST'] as const).map((scope) => ({
    title: scope === 'CASE' ? '사업 공통 정보' : '신청 정보',
    values: answers.filter((a) => a.scope === scope).map(field),
  }));
  if (final?.text)
    sections.push({
      title: '최종 보고서',
      values: [
        {
          fieldKey: 'finalSummary',
          label: '최종 보고서',
          scope: 'REQUEST',
          value: final.text,
          display: final.text,
          valueSource: final.valueSource ?? null,
          confirmed: !!final.confirmed,
          needsReview: !!final.stale,
          status: final.confirmed && !final.stale ? '확인됨' : '담당자 확인 필요',
        },
      ],
    });
  const kind = !submission
    ? 'DRAFT'
    : request.status === 'FINALIZED' && submission.id === request.currentSubmissionId
      ? 'CONFIRMED'
      : 'SUBMITTED';
  return {
    ...metadata,
    kind,
    kindLabel: { DRAFT: '초안', SUBMITTED: '제출본', CONFIRMED: '확정본' }[kind],
    title: snapshot?.caseTitle ?? request.caseTitle,
    sections,
    markdown: sections
      .map((s) => s.title + '\n' + s.values.map((v) => v.label + ': ' + v.display).join('\n'))
      .join('\n\n'),
    aiSupplement: null,
    modelReference: null,
    unconfirmedCount: sections.flatMap((s) => s.values).filter((v) => !v.confirmed || v.needsReview)
      .length,
  };
}
