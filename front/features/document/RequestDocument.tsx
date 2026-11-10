'use client';

import { DocumentActions } from './DocumentActions';
import { FinalReportText } from './FinalReportText';
import { useFinalDraft } from '@/features/request/useFinalDraft';
import { Badge, Notice } from '@/components/ui';
import { AnswerView } from '@/features/request/AnswerEditor';
import {
  DOCUMENT_LABELS,
  type Answer,
  type SecurityRequest,
  type Submission,
} from '@/features/request/types';

function isConfirmed(answer: Answer) {
  return Boolean(
    answer.source &&
    answer.confirmed &&
    !answer.needsReview &&
    (answer.source === 'USER_ANSWER' || answer.confirmation) &&
    (answer.notApplicable || answer.value.trim()),
  );
}

function needsConfirmation(answer: Answer) {
  return (
    Boolean(answer.required || answer.value.trim() || answer.notApplicable) && !isConfirmed(answer)
  );
}

function documentLabel(request: SecurityRequest, submission?: Submission) {
  if (submission) {
    return `${request.status === 'FINALIZED' ? '확정본 · ' : ''}제출본 v${submission.number}`;
  }
  return `${request.stage === 1 ? '작성 초안' : '검토 초안'} · 수정본 ${request.revision}`;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Asia/Seoul',
  }).format(new Date(value));
}

/** 시안의 문서 카드에서 실제 저장값과 불변 제출본을 구분해 미리보고 내려받는다. */
export function RequestDocument({ request }: { request: SecurityRequest }) {
  const submission = request.submissions.find((item) => item.id === request.currentSubmissionId);
  const finalDraft = useFinalDraft(request.id, !submission && request.stage === 3);
  // 비활성 질의에도 캐시는 남으므로 제출본에는 현재 초안의 재확인 상태를 섞지 않는다.
  const finalPending =
    !submission && !!finalDraft.data && (!finalDraft.data.confirmed || finalDraft.data.stale);
  const unavailable = Boolean(
    (request.currentSubmissionId || request.stage === 4 || request.status === 'FINALIZED') &&
    !submission,
  );
  const answers = unavailable
    ? []
    : submission
      ? [...submission.commonAnswers, ...submission.answers]
      : [...request.commonAnswers, ...request.answers];
  const aiPending =
    answers.filter((answer) => answer.source === 'AI_INFERRED' && needsConfirmation(answer))
      .length + (finalPending && finalDraft.data?.valueSource === 'AI_INFERRED' ? 1 : 0);
  const otherPending =
    answers.filter((answer) => answer.source !== 'AI_INFERRED' && needsConfirmation(answer))
      .length + (finalPending && finalDraft.data?.valueSource === 'USER_ANSWER' ? 1 : 0);
  const checkState = [
    otherPending > 0 ? `미확정 ${otherPending}개` : '',
    aiPending > 0 ? `AI 추론 미확인 ${aiPending}개` : '',
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <section className="card" id="documents" aria-labelledby="d-docs">
      <h2 className="h-panel" id="d-docs" tabIndex={-1}>
        문서
      </h2>
      <div className="doc in">
        <div className="doc-h">
          <Badge
            tone={request.status === 'FINALIZED' ? 'success' : submission ? 'info' : 'neutral'}
          >
            {unavailable ? '제출본' : documentLabel(request, submission)}
          </Badge>
        </div>
        <h3 className="doc-t">{DOCUMENT_LABELS[request.docType] ?? request.docType}</h3>
        <dl className="doc-dl">
          <div>
            <dt>적용 설정</dt>
            <dd>
              {unavailable
                ? '확인 필요'
                : `v${submission?.publicationVersion ?? request.publicationVersion}`}
            </dd>
          </div>
          <div>
            <dt>확인 상태</dt>
            <dd>
              {unavailable ? (
                '확인 필요'
              ) : checkState ? (
                <span className="need-txt">{checkState}</span>
              ) : answers.some(
                  (answer) => answer.required || answer.value.trim() || answer.notApplicable,
                ) ? (
                '모든 값 확인됨'
              ) : (
                '작성한 값 없음'
              )}
            </dd>
          </div>
          <div>
            <dt>문서 형식</dt>
            <dd>{unavailable ? '확인 필요' : 'PDF · 생성 후 용량 표시'}</dd>
          </div>
        </dl>
        {unavailable && (
          <Notice tone="warning">
            제출본 내용을 불러오지 못했습니다. 화면을 새로고침해 다시 확인해 주세요.
          </Notice>
        )}
        {submission && (
          <p className="help document-readonly">
            <time dateTime={submission.createdAt}>{formatTime(submission.createdAt)}</time> 제출,
            읽기 전용
          </p>
        )}
        <DocumentActions request={request} submissionId={submission?.id} disabled={unavailable} />
      </div>
      {request.submissions.length > 0 && (
        <details className="sub-block">
          <summary>제출본 버전 {request.submissions.length}개 보기</summary>
          {request.submissions.map((version) => (
            <div className="submission-version" key={version.id}>
              <h3 className="h-panel">제출본 v{version.number}</h3>
              <p className="help">
                {formatTime(version.createdAt)} · 게시본 v{version.publicationVersion}
              </p>
              <AnswerView answers={[...version.commonAnswers, ...version.answers]} />
              <FinalReportText request={request} submission={version} />
              <DocumentActions request={request} submissionId={version.id} />
            </div>
          ))}
        </details>
      )}
    </section>
  );
}
