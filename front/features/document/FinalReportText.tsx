'use client';

import { useFinalDraft } from '@/features/request/useFinalDraft';
import type { SecurityRequest, Submission } from '@/features/request/types';

/** 제출본에서는 현재 초안 대신 불변 스냅샷의 확인된 서술을 보여 준다. */
export function FinalReportText({
  request,
  submission,
}: {
  request: SecurityRequest;
  submission?: Submission;
}) {
  const query = useFinalDraft(request.id, !submission && request.stage === 3);
  const snapshot = submission?.snapshot;
  const saved =
    snapshot && typeof snapshot === 'object' && 'finalDraft' in snapshot
      ? snapshot.finalDraft
      : null;
  const draft = submission ? saved : query.data;
  if (!draft || typeof draft !== 'object' || !('text' in draft) || typeof draft.text !== 'string')
    return null;
  const confirmed =
    submission || ('confirmed' in draft && draft.confirmed && !('stale' in draft && draft.stale));
  return (
    <section className="final-report-preview">
      <h3 className="h-panel">최종 보고서</h3>
      <p className="help">
        {'valueSource' in draft && draft.valueSource === 'AI_INFERRED' ? 'AI 추론' : '사용자 작성'}{' '}
        · {confirmed ? '사용자 확인 완료' : '미확정 · 확인 필요'}
      </p>
      <pre className="docpre">{draft.text}</pre>
    </section>
  );
}
