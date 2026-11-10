'use client';

import { answerValueError } from './answerFieldPolicy';
import { networkFormatHelp } from './networkAnswerFormat';

import Link from 'next/link';
import { useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import {
  EmptyState,
  ErrorState,
  Icon,
  LoadingState,
  Notice,
  PageHeading,
  Badge,
} from '@/components/ui';
import { useSession } from '@/features/auth';
import { useInputDraft } from '@/lib/inputDrafts';
import {
  getUploads,
  getInitialAnalysis,
  rememberUpload,
  validateUploadFiles,
} from '@/lib/uploadDraft';
import { AnswerView } from './AnswerEditor';
import { CollectedAnswerEditor } from './CollectedAnswerEditor';
import { DateRangeAnswer } from './DateRangeAnswer';
import { useChatAttachments } from './useChatAttachments';
import {
  InterviewAssistance,
  InterviewComposer,
  InterviewTurnMessage,
} from './InterviewAssistance';
import { useInterviewAssistance } from './useInterviewAssistance';
import { useInterviewStaffCheck, useInterviewTurns } from './useInterview';
import { DOCUMENT_LABELS, STATUS_LABELS, type BusinessCase, type Answer } from './types';
import {
  useAnalysis,
  useApplyAnalysis,
  useCase,
  useRelatedRequests,
  useRequests,
  useSaveCase,
} from './useRequests';

/** 명시적 분석 요청과 제안 적용을 구분하고 실패 시 직접 입력을 유지한다. */
export function AnalysisPanel({
  businessCase,
  chat = false,
  uploadInput,
}: {
  businessCase: BusinessCase;
  chat?: boolean;
  uploadInput?: RefObject<HTMLInputElement | null>;
}) {
  const attachmentInput = useRef<HTMLInputElement>(null);
  const session = useSession();
  const actorId = session.data?.member.id ?? '';
  const { draft, saveDraft, clearDraft } = useInputDraft<{ text: string; files?: File[] }>(
    actorId,
    `case:${businessCase.id}:analysis`,
  );
  const files = draft?.files ?? getUploads(actorId, businessCase.id);
  const [fileIndex, setFileIndex] = useState(0);
  const file = files[fileIndex];
  const text = chat ? businessCase.description : (draft?.text ?? businessCase.description);
  const [fileError, setFileError] = useState('');
  const analysis = useAnalysis();
  const apply = useApplyAnalysis();
  const [applied, setApplied] = useState(false);

  return (
    <section
      className={`analysis-panel${chat ? ' chat-attachments' : ''}`}
      aria-label={chat ? '채팅 첨부파일' : '문서 분석'}
      hidden={Boolean(uploadInput) && !files.length && !fileError}
    >
      {!chat && (
        <>
          <h3 className="h-panel" id="analysis-title">
            <Icon name="sparkles" /> 기획서·개요에서 정보 찾기
          </h3>
          <p className="help">
            {session.data?.mock
              ? '모의 분석은 합성 후보를 반환합니다. 실제 파일 파싱·LLM 호출은 Back 연동 후 지원합니다.'
              : '분석 결과는 제안입니다. 출처와 내용을 읽고 사람이 확인해 주세요.'}
          </p>
          <div className="field">
            <label htmlFor="analysis-text">분석할 사업 개요</label>
            <textarea
              id="analysis-text"
              className="input"
              rows={3}
              value={text}
              maxLength={4000}
              disabled={analysis.isPending || apply.isPending}
              onChange={(e) => {
                saveDraft({ text: e.target.value, files });
                setApplied(false);
                analysis.reset();
              }}
              placeholder="업무 목적과 다루는 정보를 적어 주세요."
            />
          </div>
        </>
      )}
      <div className="field">
        {chat && !uploadInput ? (
          <button
            type="button"
            className="btn btn-sm"
            disabled={analysis.isPending || apply.isPending}
            onClick={() => attachmentInput.current?.click()}
          >
            <Icon name="file" size={18} /> 파일 첨부
          </button>
        ) : !chat ? (
          <label htmlFor="analysis-file">문서 첨부 (선택)</label>
        ) : null}
        <input
          ref={uploadInput ?? attachmentInput}
          className={chat ? 'sr-only' : undefined}
          tabIndex={chat ? -1 : undefined}
          aria-label="문서 첨부 (선택)"
          id="analysis-file"
          type="file"
          accept=".pdf,.hwpx,.docx,.txt"
          multiple
          disabled={analysis.isPending || apply.isPending}
          onChange={(e) => {
            const selected = Array.from(e.target.files ?? []);
            e.target.value = '';
            if (!selected.length) return;
            const next = [...files, ...selected];
            const message = validateUploadFiles(next);
            setFileError(message);
            if (message) return;
            analysis.reset();
            setApplied(false);
            saveDraft({ text, files: next });
          }}
        />
        <p className="help">
          최대 3개 · 파일당 20MB · 합계 60MB. 문서는 한 개씩 분석하고 제안을 확인합니다.
        </p>
        {files.length > 0 && (
          <ul className="pend" aria-label="분석할 파일 목록">
            {files.map((item, index) => (
              <li key={`${item.name}-${index}`}>
                <button
                  type="button"
                  className="btn"
                  aria-pressed={index === fileIndex}
                  disabled={analysis.isPending || apply.isPending}
                  onClick={() => {
                    setFileIndex(index);
                    analysis.reset();
                    apply.reset();
                    setApplied(false);
                  }}
                >
                  {item.name}
                </button>
                <button
                  type="button"
                  className="btn btn-tertiary"
                  aria-label={`${item.name} 선택 취소`}
                  disabled={analysis.isPending || apply.isPending}
                  onClick={() => {
                    saveDraft({ text, files: files.filter((_, i) => i !== index) });
                    setFileIndex(0);
                    setFileError('');
                    analysis.reset();
                    apply.reset();
                    setApplied(false);
                  }}
                >
                  선택 취소
                </button>
              </li>
            ))}
          </ul>
        )}
        {file && (
          <p className="help file-name">
            {file.name} · 선택됨, 분석 요청 전에는 전송하지 않습니다.
          </p>
        )}
      </div>
      {fileError && <Notice tone="danger">{fileError}</Notice>}
      {(!chat || files.length > 0) && (
        <button
          className="btn"
          type="button"
          disabled={analysis.isPending || (!text.trim() && !file) || Boolean(fileError)}
          onClick={async () => {
            analysis.reset();
            apply.reset();
            setApplied(false);
            try {
              await analysis.mutateAsync({
                caseId: businessCase.id,
                expectedRevision: businessCase.revision,
                text,
                file,
              });
              saveDraft({ text, files });
            } catch {
              /* mutation 오류 영역에서 재시도 수단과 함께 설명한다. */
            }
          }}
        >
          <Icon name="sparkles" />
          {analysis.isPending ? '처리 중…' : file ? '문서 분석 요청' : '사업 개요 저장'}
        </button>
      )}
      {analysis.isPending && (
        <p role="status">
          파일을 전송하고 분석 결과를 기다리고 있습니다. 입력한 개요는 유지됩니다.
        </p>
      )}
      {analysis.error && (
        <Notice tone="danger">
          {analysis.error.message} 직접 입력을 계속하거나 다시 분석을 요청할 수 있습니다.
        </Notice>
      )}
      {analysis.data && !analysis.error && (
        <div className="analysis-result">
          {chat && !analysis.data.summaryOnly && (
            <p role="status">
              문서 분석을 완료했습니다. 이제 도우미가 분석 요약을 참고할 수 있습니다.
            </p>
          )}
          {!analysis.data.summaryOnly && (
            <>
              <Badge tone="warning">
                {session.data?.mock ? '모의 AI 제안' : 'AI 제안'} · 미확정
              </Badge>
              <p className="help">이 제안을 적용해도 확인 완료로 바뀌지 않습니다.</p>
            </>
          )}
          {analysis.data.suggestions.map((suggestion) => (
            <div className="candidate" key={suggestion.key}>
              <p>{suggestion.value}</p>
              <small>근거: {suggestion.evidence}</small>
            </div>
          ))}
          {analysis.data.revision !== businessCase.revision && !applied && (
            <Notice tone="warning">
              분석 이후 사업 정보가 변경되었습니다. 최신 내용으로 다시 분석해 주세요.
            </Notice>
          )}
          {apply.error && <Notice tone="danger">{apply.error.message}</Notice>}
          {apply.data?.warnings.map((warning) => (
            <Notice key={warning} tone="warning">
              {warning}
            </Notice>
          ))}
          {analysis.data.summaryOnly ? (
            <p role="status">사업 개요를 저장했습니다.</p>
          ) : applied ? (
            <p role="status" className="save-success">
              제안을 미확정 상태로 적용했습니다. 아래 답변에서 확인해 주세요.
            </p>
          ) : (
            <button
              type="button"
              className="btn"
              disabled={apply.isPending || analysis.data.revision !== businessCase.revision}
              onClick={async () => {
                if (!analysis.data) return;
                try {
                  await apply.mutateAsync({
                    id: analysis.data.id,
                    expectedRevision: businessCase.revision,
                  });
                  rememberUpload(actorId, businessCase.id, files);
                  clearDraft();
                  setApplied(true);
                } catch {
                  /* 적용 실패는 위 오류 영역에 표시한다. */
                }
              }}
            >
              {apply.isPending ? '적용 중…' : '제안을 미확정 답변으로 적용'}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

/** 공통 질문을 한 번 답하고 서류별 독립 신청으로 이어 준다. */
export function CaseInterview({ id }: { id: string }) {
  const query = useCase(id);
  const requests = useRelatedRequests(id);
  const session = useSession();
  if (query.isPending || requests.isPending || session.isPending) return <LoadingState />;
  if (query.error || requests.error)
    return (
      <ErrorState
        error={query.error || requests.error}
        onRetry={() => {
          void query.refetch();
          void requests.refetch();
        }}
      />
    );
  if (!query.data || !session.data) return <EmptyState title="사업 건을 찾을 수 없습니다" />;
  return (
    <InterviewWorkspace
      key={`${query.data.id}:${session.data.member.id}`}
      businessCase={query.data}
      requests={(requests.data ?? []).filter((request) => request.caseId === id)}
      actor={session.data.member}
    />
  );
}

function InterviewWorkspace({
  businessCase,
  requests,
  actor,
}: {
  businessCase: BusinessCase;
  requests: NonNullable<ReturnType<typeof useRequests>['data']>;
  actor: NonNullable<ReturnType<typeof useSession>['data']>['member'];
}) {
  const save = useSaveCase(businessCase.id);
  const initialAnalysis = getInitialAnalysis(actor.id, businessCase.id);
  const questions = businessCase.answers.filter((answer) => answer.ownerRole === 'APPLICANT');
  const { draft, saveDraft, clearDraft } = useInputDraft<{
    questionIndex: number;
    answers: Record<string, { value: string; revision: number; answerRevision?: number }>;
  }>(actor.id, `case:${businessCase.id}:interview`);
  const [questionIndex, setQuestionIndex] = useState(() => {
    if (draft) return draft.questionIndex;
    // 새로고침 후에도 서버에 저장한 미확정 추천을 먼저 확인한다.
    const pendingSuggestion = questions.findIndex(
      (answer) =>
        answer.source === 'AI_INFERRED' &&
        answer.value &&
        (!answer.confirmed || answer.needsReview),
    );
    if (pendingSuggestion >= 0) return pendingSuggestion;
    const incomplete = questions.findIndex(
      (answer) =>
        !(answer.value || answer.notApplicable) || !answer.confirmed || answer.needsReview,
    );
    return incomplete >= 0 ? incomplete : questions.length;
  });
  const [chat, setChat] = useState<{ question: string; answer: string; createdAt: number }[]>([]);
  const conversationRef = useRef<HTMLDivElement>(null);
  const latestMessageRef = useRef<HTMLDivElement>(null);
  const questionCardRef = useRef<HTMLFormElement>(null);
  const chatUploadInput = useRef<HTMLInputElement>(null);
  const currentQuestionRef = useRef<HTMLDivElement>(null);
  const latestAiRef = useRef<HTMLDivElement>(null);
  const latestAttachmentRef = useRef<HTMLDivElement>(null);
  const [panelWidth, setPanelWidth] = useState(380);
  const [composerMode, setComposerMode] = useState({ key: '', answer: true });
  const [error, setError] = useState('');
  const [today] = useState(() =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date()),
  );
  const savingRef = useRef(false);

  const question = questions[questionIndex];
  useLayoutEffect(() => {
    if (questionCardRef.current) questionCardRef.current.scrollTop = 0;
  }, [question?.key]);
  const draftAnswer = question ? draft?.answers[question.key] : undefined;
  const answerText =
    draftAnswer?.value ??
    (question?.value || (question?.inputType === 'DATE_RANGE' ? `${today} ~ ${today}` : ''));
  const answerRevision = draftAnswer?.revision ?? businessCase.revision;
  const conflict = Boolean(
    draftAnswer &&
    (answerRevision !== businessCase.revision || draftAnswer.answerRevision !== question?.revision),
  );
  const goToQuestion = (next: number) => {
    setStaffNotice('');
    setQuestionIndex(next);
    if (draft) saveDraft({ ...draft, questionIndex: next });
  };
  const requiredQuestions = questions.filter((answer) => answer.required);
  const commonComplete = requiredQuestions.filter(
    (answer) => (answer.value || answer.notApplicable) && answer.confirmed && !answer.needsReview,
  ).length;
  const editable =
    actor.role === 'APPLICANT' &&
    actor.id === businessCase.ownerId &&
    requests.some(
      (request) =>
        request.stage < 4 && !['CLOSED', 'WITHDRAWN', 'FINALIZED'].includes(request.status),
    );
  const viewStyle = { '--info-w': `${panelWidth}px` } as CSSProperties;
  const turns = useInterviewTurns(
    businessCase.id,
    actor.id,
    actor.role === 'APPLICANT' && actor.id === businessCase.ownerId,
  );
  const staffCheck = useInterviewStaffCheck(businessCase.id);
  const attachments = useChatAttachments(businessCase);
  const [staffNotice, setStaffNotice] = useState('');
  const [sideEditing, setSideEditing] = useState(false);
  const advanceAfterApplied = () => {
    if (!question) return;
    const next = questionIndex + 1;
    const remaining = { ...draft?.answers };
    delete remaining[question.key];
    if (Object.keys(remaining).length) saveDraft({ questionIndex: next, answers: remaining });
    else clearDraft();
    setStaffNotice('');
    setError('');
    setQuestionIndex(next);
  };
  const assistance = useInterviewAssistance({
    businessCase,
    question,
    actorId: actor.id,
    answerText,
    turns: turns.data ?? [],
    disabled:
      !editable ||
      sideEditing ||
      attachments.busy ||
      save.isPending ||
      staffCheck.isPending ||
      conflict,
    onApplied: advanceAfterApplied,
  });
  const answerBusy =
    sideEditing ||
    attachments.busy ||
    save.isPending ||
    staffCheck.isPending ||
    assistance.apply.isPending;
  const latestTurnId = assistance.history.at(-1)?.interviewTurnId;
  const messages = [
    ...chat.map((item, index) => ({ kind: 'answer' as const, item, index, at: item.createdAt })),
    ...assistance.history.map((turn, index) => ({
      kind: 'ai' as const,
      turn,
      index,
      at: Date.parse(turn.createdAt),
    })),
  ].sort((a, b) => a.at - b.at);
  useLayoutEffect(() => {
    const conversation = conversationRef.current;
    const latestMessage = currentQuestionRef.current ?? latestMessageRef.current;
    if (!conversation || !latestMessage) return;

    // 다음 질문을 대화 안에서 보여 주되 페이지와 입력 초점은 옮기지 않는다.
    const contentTop = conversation.getBoundingClientRect().top + conversation.clientTop;
    const paddingBottom = Number.parseFloat(getComputedStyle(conversation).paddingBottom) || 0;
    conversation.scrollTop = Math.max(
      0,
      conversation.scrollTop +
        latestMessage.getBoundingClientRect().bottom -
        contentTop -
        conversation.clientHeight +
        paddingBottom,
    );
  }, [chat.length, question?.key]);

  useLayoutEffect(() => {
    const container = conversationRef.current;
    const message = assistance.ask.isPending
      ? container?.querySelector<HTMLElement>('.interview-pending')
      : assistance.ask.error || assistance.apply.error
        ? container?.querySelector<HTMLElement>('.interview-feedback')
        : latestAiRef.current;
    if (!container || !message) return;
    const bounds = message.getBoundingClientRect();
    const top = container.getBoundingClientRect().top + container.clientTop;
    // 긴 AI 답변은 시작부터 읽고, 짧은 답변은 끝까지 보이게 한다. 페이지·입력 초점은 유지한다.
    container.scrollTop +=
      bounds.height > container.clientHeight
        ? bounds.top - top
        : Math.max(0, bounds.bottom - top - container.clientHeight + 24);
  }, [latestTurnId, assistance.ask.isPending, assistance.ask.error, assistance.apply.error]);
  useLayoutEffect(() => {
    const container = conversationRef.current;
    const message = latestAttachmentRef.current;
    if (!container || !message) return;
    const bounds = message.getBoundingClientRect();
    const top = container.getBoundingClientRect().top + container.clientTop;
    container.scrollTop +=
      bounds.height > container.clientHeight
        ? bounds.top - top
        : Math.max(0, bounds.bottom - top - container.clientHeight + 24);
  }, [attachments.items]);
  const presentation = question ? questionPresentation(question) : undefined;
  const updateAnswer = (value: string) => {
    if (!question) return;
    saveDraft({
      questionIndex,
      answers: {
        ...draft?.answers,
        [question.key]: {
          value,
          revision: answerRevision,
          answerRevision: draftAnswer?.answerRevision ?? question.revision,
        },
      },
    });
  };
  const saveAnswer = async (value: string, notApplicable = false) => {
    if (!question || !editable || conflict || answerBusy || savingRef.current) return;
    savingRef.current = true;
    setError('');
    // 선택형 답변도 저장 실패 시 직접 입력과 같은 초안으로 보존한다.
    updateAnswer(value);
    try {
      const issue = answerValueError(question, notApplicable ? '미해당' : value);
      if (issue) throw new Error(issue);
      await save.mutateAsync({
        expectedRevision: answerRevision,
        answers: [
          {
            key: question.key,
            expectedRevision: draftAnswer?.answerRevision ?? question.revision,
            value,
            confirmed: notApplicable || Boolean(value.trim()),
            notApplicable,
          },
        ],
      });
      setChat((old) => [
        ...old,
        {
          question: question.label,
          answer: notApplicable ? '미해당' : value || '담당자 확인 필요',
          createdAt: Date.now(),
        },
      ]);
      const remaining = { ...draft?.answers };
      delete remaining[question.key];
      if (Object.keys(remaining).length)
        saveDraft({ questionIndex: questionIndex + 1, answers: remaining });
      else clearDraft();
      setQuestionIndex(questionIndex + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '답변을 저장하지 못했습니다.');
    } finally {
      savingRef.current = false;
    }
  };

  const requestStaffCheck = async () => {
    if (!question || !editable || answerBusy || conflict) return;

    try {
      const result = await staffCheck.mutateAsync({
        fieldKey: question.key,
        expectedRevision: question.revision ?? 0,
      });
      if (draftAnswer)
        saveDraft({
          questionIndex,
          answers: {
            ...draft?.answers,
            [question.key]: {
              value: answerText,
              revision: businessCase.revision,
              answerRevision: result.revision,
            },
          },
        });
      setStaffNotice(
        `${question.label}: 담당자 확인 필요로 표시했습니다. 입력 중인 내용은 보존되며, 서류별 화면에서 협의를 요청할 수 있습니다.`,
      );
    } catch {
      /* 입력 보존 */
    }
  };

  const answerFields =
    question && presentation ? (
      <>
        {presentation.options && (
          <div
            className="qchips"
            role="group"
            aria-label={`${question.label} 보기, 누르면 바로 답변됩니다`}
            aria-describedby="interview-question-help"
          >
            {presentation.options.map((option) => (
              <button
                className="qchip"
                type="button"
                key={option}
                disabled={answerBusy || conflict}
                onClick={() => void saveAnswer(option)}
              >
                {option}
              </button>
            ))}
          </div>
        )}
        <div className="field">
          {question.inputType !== 'DATE_RANGE' && (
            <label className="sr-only" htmlFor={'interview-answer'}>
              {question.label}
            </label>
          )}
          <div className="qrow">
            {question.inputType === 'DATE_RANGE' ? (
              <DateRangeAnswer value={answerText} disabled={answerBusy} onChange={updateAnswer} />
            ) : question.inputType === 'LONG_TEXT' ? (
              <textarea
                className="input"
                id={'interview-answer'}
                rows={2}
                maxLength={4000}
                aria-describedby="interview-question-help"
                value={answerText}
                disabled={answerBusy}
                onChange={(e) => updateAnswer(e.target.value)}
                onKeyDown={(event) => {
                  if (
                    event.key !== 'Enter' ||
                    event.shiftKey ||
                    event.nativeEvent.isComposing ||
                    event.keyCode === 229
                  )
                    return;
                  event.preventDefault();
                  if (answerText.trim() && !answerBusy && !conflict)
                    event.currentTarget.form?.requestSubmit();
                }}
                placeholder={presentation.placeholder}
              />
            ) : (
              <input
                className="input"
                id={'interview-answer'}
                type={question.inputType === 'NUMBER' ? 'number' : 'text'}
                step={question.inputType === 'NUMBER' ? 'any' : undefined}
                aria-describedby="interview-question-help"
                autoComplete="off"
                maxLength={4000}
                value={answerText}
                disabled={answerBusy}
                onChange={(e) => updateAnswer(e.target.value)}
                placeholder={presentation.placeholder}
              />
            )}
            <button
              className="btn btn-primary"
              disabled={answerBusy || conflict || !answerText.trim()}
            >
              {save.isPending
                ? '저장 중…'
                : question.source === 'AI_INFERRED' &&
                    !question.confirmed &&
                    answerText === question.value
                  ? 'AI 답변 확인하고 다음'
                  : questionIndex === questions.length - 1
                    ? '공통 답변 저장'
                    : '답변 저장하고 다음'}
            </button>
          </div>
        </div>
      </>
    ) : null;

  return (
    <>
      <nav className="crumb" aria-label="현재 위치">
        <Link href="/requests">신청 현황</Link>
        <Icon name="chevronRight" size={14} />
        <span>공통 정보 작성</span>
      </nav>
      <PageHeading
        title={businessCase.title}
        description={
          <>
            {businessCase.id} · 공통 인터뷰 한 번으로 {requests.length}종 서류 작성
          </>
        }
      />
      <div className="case-document-tabs" aria-label="이 사업의 신청 서류">
        {requests.map((request) => (
          <Link className="case-document-link" key={request.id} href={`/requests/${request.id}`}>
            <Icon name="file" />
            <strong>{DOCUMENT_LABELS[request.docType] ?? request.docType}</strong>
            <Badge>{STATUS_LABELS[request.status]}</Badge>
            <Icon name="arrowRight" size={18} />
          </Link>
        ))}
      </div>
      {initialAnalysis && (
        <Notice tone={initialAnalysis.failures.length ? 'warning' : 'info'}>
          작성 시작 시 첨부 문서 {initialAnalysis.total}개 중{' '}
          {initialAnalysis.total - initialAnalysis.failures.length}개를 분석했습니다.
          {initialAnalysis.failures.length ? (
            <>
              <p>
                분석하지 못한 문서는 보안정보 도우미의 ‘파일 첨부’로 다시 올려 주세요. 도우미는
                완료된 분석 요약만 참조합니다.
              </p>
              <ul>
                {initialAnalysis.failures.map((failure, index) => (
                  <li key={index}>
                    {failure.name}: {failure.message}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            ' 보안정보 도우미가 분석 요약을 미확정 참고자료로 사용합니다.'
          )}
        </Notice>
      )}
      <div className="work case-work" style={viewStyle}>
        <section className="chatp" aria-labelledby="chat-heading">
          <div className="chatp-h">
            <div className="ttl">
              <span className="av" aria-hidden="true">
                <Icon name="sparkles" size={18} />
              </span>
              <h2 className="h-panel" id="chat-heading">
                보안정보 도우미
              </h2>
            </div>
            <span className="meta">AI 답변은 제안이며 확정 전 확인이 필요합니다</span>
          </div>
          <div
            className="msgs conversation-body"
            ref={conversationRef}
            role="region"
            aria-label="인터뷰 대화"
            tabIndex={0}
          >
            <div className="conversation-log" role="log" aria-label="대화 내용">
              <div className="m-ai">
                <span className="av" aria-hidden="true">
                  <Icon name="sparkles" size={18} />
                </span>
                <div className="body">
                  <div className="bubble">
                    <p>안녕하세요. 사업 목적과 처리하는 정보부터 살펴볼게요.</p>
                    <p>
                      기관 관리자가 정한 항목을 하나씩 작성합니다. 모르는 질문은 AI에게 물어보고,
                      추천답변은 직접 확인해 주세요.
                    </p>
                    <p>
                      서버·IP·포트는 담당자 확인 항목입니다. 공통 정보를 작성한 뒤 서류별 화면에서
                      협의를 요청합니다.
                    </p>
                  </div>
                </div>
              </div>
              {messages.map((message) =>
                message.kind === 'answer' ? (
                  <div
                    className="chat-pair"
                    key={`answer-${message.index}`}
                    ref={message.index === chat.length - 1 ? latestMessageRef : null}
                  >
                    <div className="m-ai">
                      <span className="av" aria-hidden="true">
                        <Icon name="sparkles" size={18} />
                      </span>
                      <div className="body">
                        <div className="bubble">{message.item.question}</div>
                      </div>
                    </div>
                    <p className="m-me">{message.item.answer}</p>
                  </div>
                ) : (
                  <div
                    className="chat-pair"
                    key={`turn-${message.turn.interviewTurnId}`}
                    ref={message.turn.interviewTurnId === latestTurnId ? latestAiRef : null}
                  >
                    <InterviewTurnMessage
                      turn={message.turn}
                      question={questions.find((q) => q.key === message.turn.fieldKey)}
                      active={editable && question?.key === message.turn.fieldKey}
                      state={assistance}
                      onSelect={
                        editable
                          ? () =>
                              goToQuestion(
                                questions.findIndex((q) => q.key === message.turn.fieldKey),
                              )
                          : undefined
                      }
                    />
                  </div>
                ),
              )}
              {attachments.items.map((item) => (
                <div
                  className="chat-pair"
                  key={`attachment-${item.id}`}
                  ref={item.id === attachments.items.at(-1)?.id ? latestAttachmentRef : undefined}
                >
                  <p className="m-me">첨부: {item.file.name}</p>
                  <div className="m-ai">
                    <span className="av" aria-hidden="true">
                      <Icon name="file" size={18} />
                    </span>
                    <div className="body">
                      <div className="bubble" aria-label={`${item.file.name} 분석 결과`}>
                        {item.status === 'selected' ? (
                          <>
                            <p>선택됨 · 분석을 요청하면 문서를 전송합니다.</p>
                            <button
                              type="button"
                              className="btn btn-sm"
                              disabled={answerBusy}
                              onClick={() => void attachments.retry(item)}
                            >
                              첨부 문서 분석
                            </button>
                          </>
                        ) : item.status === 'pending' ? (
                          <p role="status">
                            문서를 업로드하고 분석하고 있습니다… 완료되면 질문을 보낼 수 있습니다.
                          </p>
                        ) : item.status === 'failed' ? (
                          <>
                            <Notice tone="danger">
                              {item.error} 이 문서는 아직 도우미에 반영되지 않았습니다.
                            </Notice>
                            <button
                              type="button"
                              className="btn btn-sm"
                              disabled={
                                attachments.busy ||
                                sideEditing ||
                                save.isPending ||
                                assistance.ask.isPending ||
                                assistance.apply.isPending
                              }
                              onClick={() => void attachments.retry(item)}
                            >
                              다시 분석
                            </button>
                          </>
                        ) : (
                          <>
                            <Badge tone="warning">문서 분석 요약 · 미확정</Badge>
                            <p className="interview-ai-text">
                              {item.summary || '분석이 완료됐지만 요약이 없습니다.'}
                            </p>
                            <p className="help">
                              {item.summary
                                ? '도우미가 다음 질문·추천부터 이 요약을 참고합니다. 신청서 답변은 자동 변경하지 않습니다.'
                                : '문서 내용을 확인하거나 다시 첨부해 주세요.'}
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {attachments.error && <Notice tone="danger">{attachments.error}</Notice>}
              {assistance.ask.isPending && (
                <div className="interview-pending">
                  <p className="m-me">{assistance.ask.variables?.text}</p>
                  <p role="status">AI가 답변을 작성하고 있습니다. 입력한 답변은 유지됩니다…</p>
                </div>
              )}
              {(assistance.ask.error || assistance.apply.error) && (
                <div className="interview-feedback">
                  {assistance.ask.error && (
                    <Notice tone="danger">
                      {assistance.ask.error.message} 질문과 답변을 유지했습니다. 다시 요청할 수
                      있습니다.
                    </Notice>
                  )}
                  {assistance.apply.error && (
                    <Notice tone="danger">{assistance.apply.error.message}</Notice>
                  )}
                </div>
              )}
              {editable && question && presentation && (
                <div className="m-ai interview-current" ref={currentQuestionRef}>
                  <span className="av" aria-hidden="true">
                    <Icon name="sparkles" size={18} />
                  </span>
                  <div className="body">
                    <div className="bubble">
                      <p className="qnum">
                        <span>{question.required ? '필수 항목' : '선택 항목'}</span>
                        <span className="meta">
                          공통 질문 {questionIndex + 1} / {questions.length}
                        </span>
                      </p>
                      <h3 className="qtitle" id="interview-question-title">
                        {presentation.title}
                      </h3>
                      <p className="qhelp" id="interview-question-help">
                        {presentation.help}
                      </p>
                      {question.source === 'AI_INFERRED' && !question.confirmed && (
                        <p className="help">AI가 작성한 답변</p>
                      )}
                      <InterviewAssistance state={assistance} question={question} />
                      {draftAnswer && (
                        <p className="help interview-draft-note">
                          입력 내용은 이 탭에서 임시 보관됩니다. 새로고침하거나 탭을 닫으면
                          사라집니다.
                        </p>
                      )}
                      {conflict && !save.isPending && (
                        <Notice tone="warning">
                          <p>서버에 새 내용이 있습니다. 작성한 답변은 유지했습니다.</p>
                          <p>서버 최신 값: {question.value || '입력 없음'}</p>
                          <button
                            className="btn btn-sm"
                            type="button"
                            onClick={() => {
                              if (draft)
                                saveDraft({
                                  ...draft,
                                  answers: {
                                    ...draft.answers,
                                    [question.key]: {
                                      value: answerText,
                                      revision: businessCase.revision,
                                      answerRevision: question.revision,
                                    },
                                  },
                                });
                            }}
                          >
                            내 답변을 유지하고 최신 버전 기준으로 저장 준비
                          </button>
                        </Notice>
                      )}
                      {error && <Notice tone="danger">{error}</Notice>}
                      {staffCheck.error && (
                        <Notice tone="danger">{staffCheck.error.message}</Notice>
                      )}
                      {staffNotice && <Notice>{staffNotice}</Notice>}
                      <div className="btn-row">
                        <button
                          type="button"
                          className="btn btn-tertiary"
                          disabled={answerBusy || conflict}
                          onClick={requestStaffCheck}
                        >
                          잘 모르겠어요 · 담당자 확인 요청
                        </button>
                        <button
                          type="button"
                          className="btn btn-tertiary"
                          disabled={answerBusy}
                          onClick={() => {
                            setError('');
                            goToQuestion(questionIndex + 1);
                          }}
                        >
                          나중에 입력
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {turns.error && (
                <Notice tone="warning">
                  대화 이력을 불러오지 못했습니다. 직접 입력은 계속할 수 있습니다.
                </Notice>
              )}
            </div>
            {!editable && (
              <Notice>
                이 사업 건은 현재 읽기 전용입니다. 서류별 상세에서 진행 상황을 확인하세요.
              </Notice>
            )}
          </div>
          {editable && (
            <input
              ref={chatUploadInput}
              type="file"
              className="sr-only"
              tabIndex={-1}
              aria-label="문서 첨부 (선택)"
              accept=".pdf,.hwpx,.docx,.txt"
              multiple
              disabled={answerBusy || assistance.ask.isPending}
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                event.target.value = '';
                void attachments.attach(files);
              }}
            />
          )}
          {editable && question && presentation && (
            <form
              ref={questionCardRef}
              className="qcard interview-question"
              aria-labelledby="interview-question-title"
              onSubmit={(event) => {
                event.preventDefault();
                if (composerMode.key !== question.key || composerMode.answer)
                  void saveAnswer(answerText);
                else void assistance.send('ASK');
              }}
            >
              <InterviewComposer
                questionKey={question.key}
                state={assistance}
                onModeChange={(answer) => setComposerMode({ key: question.key, answer })}
                answers={
                  question.inputType === 'BOOLEAN' ? (
                    <div>
                      <p className="help">{question.label} · 선택하면 바로 반영됩니다.</p>
                      <div
                        className="qchips"
                        role="group"
                        aria-label={`${question.label} 답변 선택`}
                      >
                        {['예', '아니요'].map((option) => (
                          <button
                            type="button"
                            className="qchip"
                            key={option}
                            disabled={answerBusy || conflict}
                            onClick={() => void saveAnswer(option)}
                          >
                            {option}
                          </button>
                        ))}
                        <button
                          type="button"
                          className="qchip"
                          disabled={answerBusy || conflict}
                          onClick={requestStaffCheck}
                        >
                          몰라요
                        </button>
                      </div>
                      <p className="help">
                        ‘몰라요’는 담당자 확인 필요로 표시하며 완료 답변으로 계산하지 않습니다.
                      </p>
                      {staffNotice && <p role="status">{staffNotice}</p>}
                      {staffCheck.error && (
                        <Notice tone="danger">{staffCheck.error.message}</Notice>
                      )}
                    </div>
                  ) : (
                    answerFields
                  )
                }
                attachment={
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={answerBusy || assistance.ask.isPending}
                    title="한 번에 최대 3개 · 파일당 20MB · 합계 60MB · 선택 후 분석 요청"
                    onClick={() => chatUploadInput.current?.click()}
                  >
                    파일 선택
                  </button>
                }
              />
              {!question.required && (
                <button
                  type="button"
                  className="btn"
                  disabled={answerBusy || conflict}
                  onClick={() => void saveAnswer('', true)}
                >
                  미해당으로 저장
                </button>
              )}
            </form>
          )}
          {editable && !question && (
            <div className="qcard interview-question">
              <h3 className="qtitle">
                {commonComplete === requiredQuestions.length
                  ? '공통 정보를 정리했습니다'
                  : `확인이 필요한 필수 항목이 ${requiredQuestions.length - commonComplete}개 남았습니다`}
              </h3>
              {commonComplete < requiredQuestions.length && (
                <p>나중에 입력하거나 담당자 확인을 요청한 항목은 완료로 계산하지 않습니다.</p>
              )}
              <p>서류별 상세 화면에서 추가 항목을 확인하고 담당자에게 협의를 요청해 주세요.</p>
              <div className="btn-row interview-complete-actions">
                {requests.map((request, index) => (
                  <Link
                    className={`btn ${index === 0 ? 'btn-primary' : ''}`}
                    key={request.id}
                    href={`/requests/${request.id}`}
                  >
                    {DOCUMENT_LABELS[request.docType] ?? request.docType} 작성
                    <Icon name="arrowRight" />
                  </Link>
                ))}
                <button
                  type="button"
                  className="btn btn-tertiary"
                  onClick={() => {
                    goToQuestion(0);
                  }}
                >
                  공통 질문 다시 보기
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={attachments.busy}
                  onClick={() => chatUploadInput.current?.click()}
                >
                  파일 첨부
                </button>
              </div>
            </div>
          )}
        </section>
        <div
          role="separator"
          tabIndex={0}
          aria-label="수집 정보 패널 너비"
          aria-orientation="vertical"
          aria-valuemin={320}
          aria-valuemax={560}
          aria-valuenow={panelWidth}
          className="splitter"
          onKeyDown={(event) => {
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
              event.preventDefault();
              setPanelWidth((old) =>
                Math.max(320, Math.min(560, old + (event.key === 'ArrowLeft' ? 20 : -20))),
              );
            }
          }}
          onDoubleClick={() => setPanelWidth(380)}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId))
              setPanelWidth((old) => Math.max(320, Math.min(560, old - event.movementX)));
          }}
          onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
        >
          <span />
        </div>
        <aside className="infop" aria-labelledby="info-heading">
          <div className="infop-h">
            <div className="row">
              <h2 className="h-panel" id="info-heading">
                수집된 보안정보
              </h2>
              <span className="help">
                공통 필수정보 {commonComplete} / {requiredQuestions.length}
              </span>
            </div>
            <progress
              className="prog"
              value={commonComplete}
              max={Math.max(1, requiredQuestions.length)}
              aria-label="확인한 공통 답변"
            />
          </div>
          <div className="infop-b">
            <h3 className="grp">사업 정보</h3>
            <p className="help">
              {businessCase.department} · 설정 게시본 v{businessCase.publicationVersion}
              {businessCase.knowledgePublicationId != null &&
                ` · 지식 기준 #${businessCase.knowledgePublicationId}`}
            </p>
            {editable ? (
              <CollectedAnswerEditor
                answers={questions}
                revision={businessCase.revision}
                disabled={
                  attachments.busy ||
                  save.isPending ||
                  staffCheck.isPending ||
                  assistance.ask.isPending ||
                  assistance.apply.isPending
                }
                onEditingChange={setSideEditing}
                onSave={async (expectedRevision, answer) => {
                  await save.mutateAsync({ expectedRevision, answers: [answer] });
                  if (draft?.answers[answer.key]) {
                    const remaining = { ...draft.answers };
                    delete remaining[answer.key];
                    if (Object.keys(remaining).length)
                      saveDraft({ questionIndex, answers: remaining });
                    else clearDraft();
                  }
                  setChat((old) => [
                    ...old,
                    {
                      question: `${questions.find((item) => item.key === answer.key)?.label ?? answer.key} · 수집 정보 수정`,
                      answer: answer.notApplicable ? '미해당' : answer.value,
                      createdAt: Date.now(),
                    },
                  ]);
                }}
              />
            ) : (
              <AnswerView answers={questions} />
            )}
            <h3 className="grp">담당자 확인 항목</h3>
            <p className="help">내부 시스템 정보는 담당자가 직접 입력합니다.</p>
            <AnswerView
              answers={businessCase.answers.filter((answer) => answer.ownerRole !== 'APPLICANT')}
            />
          </div>
        </aside>
      </div>
    </>
  );
}

interface InterviewQuestionPresentation {
  title: string;
  help: string;
  placeholder: string;
  options?: string[];
}

/** 시안의 질문 표현을 사용하되 게시본의 공통 항목과 저장 키를 유지한다. */
function questionPresentation(question: Answer): InterviewQuestionPresentation {
  if (question.inputType || question.hint)
    return {
      title: question.label,
      help:
        [question.hint, networkFormatHelp[question.inputType ?? '']].filter(Boolean).join(' ') ||
        '알고 있는 사실을 적어 주세요. 모르는 내용은 AI에게 물어보거나 담당자 확인을 요청할 수 있습니다.',
      placeholder:
        question.inputType === 'DATE_RANGE'
          ? '예: 2026-11-01 ~ 2027-03-31'
          : '답변을 입력해 주세요.',
      options: question.inputType === 'BOOLEAN' ? ['예', '아니요'] : undefined,
    };
  const questions: Record<string, InterviewQuestionPresentation> = {
    purpose: {
      title: '어떤 사업인가요?',
      help: '사업 목적을 한두 문장으로 적어 주세요. 신청서의 신청 사유로 들어갑니다.',
      placeholder: '예: 공개 자료를 검색하고 안내하는 서비스를 만들어요.',
    },
    dataTypes: {
      title: '어떤 정보를 다루나요?',
      help: '공개 자료, 개인정보 등 처리하는 정보의 종류를 알려 주세요. 개인정보가 포함되면 정보보안 담당자가 처리 기준을 함께 검토합니다.',
      placeholder: '자료의 종류와 개인정보 포함 여부를 적어 주세요.',
      options: [
        '공개 자료만 다뤄요',
        '개인정보가 포함돼요',
        '개인정보 없는 내부 업무자료를 다뤄요',
      ],
    },
    externalTransfer: {
      title: '외부 기관이나 서비스와 연결되나요?',
      help: '본인인증, 알림 발송처럼 기관 밖으로 나가거나 외부에서 가져오는 정보가 있는지 확인합니다.',
      placeholder: '연결하는 서비스와 주고받는 정보를 적어 주세요.',
      options: ['외부 연계 있음 (본인인증·알림 등)', '외부 연계 없음'],
    },
    dataFlow: {
      title: '정보는 어떤 경로로 오가나요?',
      help: '누가 어떤 서비스를 거쳐 정보를 주고받는지 순서대로 적어 주세요. 서버 주소와 포트는 담당자가 확인합니다.',
      placeholder: '예: 이용자 → 안내 서비스 → 공개 자료 조회',
    },
  };
  return (
    questions[question.key] ?? {
      title: question.label,
      help: '알고 있는 사실을 적어 주세요. 모르는 내용은 나중에 입력할 수 있습니다.',
      placeholder: '답변을 입력해 주세요.',
    }
  );
}
