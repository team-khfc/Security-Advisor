'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  Badge,
  EmptyState,
  ErrorState,
  Icon,
  LoadingState,
  Modal,
  Notice,
  PageHeading,
} from '@/components/ui';
import { useMembers, useSession } from '@/features/auth';
import { useReviewerPools } from '@/features/assignment';
import { reassignmentLabel } from '@/lib/assignmentStatus';
import { StaffInquiryPanel } from '@/features/llm';
import { auditActionLabel } from '@/features/audit/labels';
import { RequestDocument } from '@/features/document/RequestDocument';
import { useAudit } from '@/lib/queries';
import type { Actor } from '@/lib/types';
import { AnswerEditor, AnswerView } from './AnswerEditor';
import { FinalDraftPanel } from './FinalDraftPanel';
import { ConsultationReview } from './ConsultationReview';
import { useFinalDraft } from './useFinalDraft';
import { InfrastructureWorkspace } from './InfrastructureWorkspace';
import { INFRA_PRIMARY_KEYS } from './infrastructurePlan';
import { getRequestDetailData } from './requestDetailData';
import { waitingLine, handoffFields } from './turns';
import { finalReviewReadiness, pendingReviews, reviewFields } from './readiness';
import {
  DOCUMENT_LABELS,
  FIELD_LABELS,
  REVIEW_STATUS_LABELS,
  STAGE_LABELS,
  STATUS_LABELS,
  type CommandAction,
  type CommandInput,
  type ReviewField,
  type SecurityRequest,
} from './types';
import { ListPager } from '@/components/ui';
import {
  useCase,
  useRequest,
  useRequestCommand,
  useRelatedRequests,
  useSaveCase,
} from './useRequests';

/** Back ReviewChecklist의 필수 항목. 확인 여부는 담당자가 직접 입력한다. */
const REVIEW_CHECKLIST_ITEMS: Record<ReviewField, { key: string; label: string }[]> = {
  INFRA: [
    { key: 'source', label: '출발지 주소를 확인했습니다' },
    { key: 'destination', label: '목적지 주소를 확인했습니다' },
    { key: 'protocol', label: '프로토콜을 확인했습니다' },
    { key: 'port', label: '서비스 포트를 확인했습니다' },
    { key: 'period', label: '허용 기간을 확인했습니다' },
  ],
  SECURITY: [
    { key: 'processed_info', label: '처리 정보와 개인정보 범위를 확인했습니다' },
    { key: 'external_transfer', label: '외부 전송 여부와 목적지를 확인했습니다' },
    { key: 'access_control', label: '접근 권한 통제를 확인했습니다' },
    { key: 'logging', label: '접속·처리 기록 보관을 확인했습니다' },
  ],
};

/** URL을 직접 열어도 실제 조회 권한은 API가 판단한다. */
export function RequestDetail({ id }: { id: string }) {
  const query = useRequest(id);
  const session = useSession();
  const [submitted, setSubmitted] = useState<{ requestId: string; actorId: string } | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const submissionComplete =
    submitted?.requestId === id && submitted?.actorId === session.data?.member.id;
  useEffect(() => {
    if (submissionComplete && !query.isPending) resultRef.current?.focus();
  }, [submissionComplete, query.isPending]);
  if (query.isPending || session.isPending) return <LoadingState />;
  if (query.error)
    return (
      <ErrorState
        error={query.error}
        onRetry={() => {
          void query.refetch();
        }}
      />
    );
  if (!query.data || !session.data)
    return (
      <EmptyState
        title="신청을 찾을 수 없습니다"
        description="신청 현황에서 접근 가능한 신청을 선택해 주세요."
      />
    );
  const actor = session.data.member;
  return (
    <>
      {submissionComplete && (
        <div ref={resultRef} role="status" tabIndex={-1}>
          <Notice tone="success">
            최종 제출을 완료했습니다. 제출본을 확인하거나 PDF를 내려받을 수 있습니다.
          </Notice>
          <a className="btn" href="#d-docs">
            제출본 문서로 이동
          </a>
        </div>
      )}
      <RequestWorkspace
        key={`${query.data.id}-${actor.id}`}
        request={query.data}
        actor={actor}
        onSubmitted={() => setSubmitted({ requestId: id, actorId: actor.id })}
      />
    </>
  );
}

function RequestWorkspace({
  request,
  actor,
  onSubmitted,
}: {
  request: SecurityRequest;
  actor: Actor;
  onSubmitted: () => void;
}) {
  const canViewCase =
    actor.role === 'ADMIN' ||
    actor.id === request.ownerId ||
    request.allowedActions.includes('EDIT_CASE');
  const caseQuery = useCase(request.caseId, canViewCase);
  const allRequests = useRelatedRequests(request.caseId);
  const command = useRequestCommand(request);
  const saveCase = useSaveCase(request.caseId, request);
  const [dialogAction, setDialogAction] = useState<CommandAction | null>(null);
  const [message, setMessage] = useState('');
  const [failure, setFailure] = useState('');
  const [infraNoticeOpen, setInfraNoticeOpen] = useState(false);
  const [infraDirty, setInfraDirty] = useState(false);
  const [comment, setComment] = useState('');
  const [finalDraftDirty, setFinalDraftDirty] = useState(false);
  const finalDraft = useFinalDraft(request.id, request.stage === 3);
  const finalDraftReady =
    !!finalDraft.data?.confirmed && !finalDraft.data.stale && !finalDraftDirty;
  const [reviewDraft, setReviewDraft] = useState<{
    reviewId: string;
    revision: number | undefined;
    values: Record<string, boolean>;
  } | null>(null);
  const terminal = ['FINALIZED', 'CLOSED', 'WITHDRAWN'].includes(request.status);
  const has = (action: string) => request.allowedActions.includes(action);
  const fields = [...request.commonAnswers, ...request.answers];
  const detail = getRequestDetailData(request);
  const latestReturn = request.returns
    .slice()
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))[0];
  const siblings = (allRequests.data ?? []).filter(
    (item) => item.caseId === request.caseId && item.id !== request.id,
  );
  const roleField = actor.role === 'INFRA' || actor.role === 'SECURITY' ? actor.role : undefined;
  const canInquire = Boolean(
    roleField &&
    request.assignments.some(
      (assignment) =>
        assignment.active && assignment.field === roleField && assignment.assigneeId === actor.id,
    ),
  );
  const currentReview = request.reviews.find((review) => review.field === roleField);
  const infraPending =
    actor.role === 'SECURITY' &&
    request.reviews.some((review) => review.field === 'INFRA' && review.status !== 'COMPLETE');
  const finalReview = finalReviewReadiness(request, actor);
  const needsReconsultation = request.stage === 3 && pendingReviews(request).length > 0;
  const checklistItems = roleField ? REVIEW_CHECKLIST_ITEMS[roleField] : [];
  const checklist =
    currentReview &&
    reviewDraft?.reviewId === currentReview.id &&
    reviewDraft.revision === currentReview.revision
      ? reviewDraft.values
      : (currentReview?.checklist ?? {});
  const checklistComplete = checklistItems.every((item) => checklist[item.key]);
  const panelTitle =
    roleField && has('COMPLETE_REVIEW')
      ? `${FIELD_LABELS[roleField]} 검토`
      : has('SUBMIT')
        ? '최종 제출 확인'
        : has('FINAL_CONFIRM') || has('FINALIZE')
          ? '제출본 최종 확인'
          : has('REQUEST_REVIEW')
            ? '인터뷰 이어서 작성'
            : '현재 처리 상황';
  const invoke = async (action: CommandAction, extra: Partial<CommandInput> = {}) => {
    setFailure('');
    setMessage('');
    if (action === 'COMPLETE_REVIEW' && infraDirty) {
      setFailure('ICT인프라 검토 정보를 먼저 저장해 주세요.');
      return;
    }
    if (action === 'COMPLETE_REVIEW' && infraPending) {
      setInfraNoticeOpen(true);
      return;
    }
    try {
      await command.mutateAsync({
        action,
        expectedRevision: request.revision,
        field: roleField,
        comment,
        ...extra,
      });
      // 제출본별 추가 질의가 시작되면 작업 영역이 잠시 교체되어도 완료 안내는 보존한다.
      if (action === 'SUBMIT') onSubmitted();
      setMessage(
        action === 'SUBMIT'
          ? ''
          : action === 'GENERATE_DRAFT'
            ? 'AI 최종 초안을 생성했습니다. 미확정 값을 읽고 확인해 주세요.'
            : '요청한 업무 처리를 저장했습니다. 최신 진행 상황을 확인해 주세요.',
      );
      setDialogAction(null);
      setComment('');
    } catch (cause) {
      if (
        cause instanceof Error &&
        cause.message.includes('ICT인프라의 협의 단계가 끝나지 않았습니다.')
      ) {
        setInfraNoticeOpen(true);
        return;
      }
      setFailure(
        cause instanceof Error ? cause.message : '업무를 처리하지 못했습니다. 입력값은 유지됩니다.',
      );
    }
  };

  return (
    <div className="request-detail-page">
      <Modal
        open={infraNoticeOpen}
        onClose={() => setInfraNoticeOpen(false)}
        title="ICT인프라 협의 필요"
      >
        {infraNoticeOpen && <InfraReviewNotice request={request} />}
        <div className="btn-row">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setInfraNoticeOpen(false)}
          >
            확인
          </button>
        </div>
      </Modal>
      <nav className="crumb" aria-label="현재 위치">
        <Link href="/requests">
          {actor.role === 'APPLICANT' || actor.role === 'ADMIN' ? '신청 현황' : '협의 요청함'}
        </Link>
        <span aria-hidden="true">/</span>
        <span>
          {canViewCase ? <Link href={`/cases/${request.caseId}`}>사업 건</Link> : '사업 건'}
        </span>
        <span aria-hidden="true">/</span>
        <span>신청 상세</span>
      </nav>
      <PageHeading
        title={request.caseTitle}
        description={
          <div className="request-meta">
            <span>
              {request.id}, {request.department} {request.ownerName}, 설정 v
              {request.publicationVersion}
            </span>
            <Badge
              tone={
                request.status === 'FINALIZED'
                  ? 'success'
                  : request.status === 'SUPPLEMENT_REQUESTED'
                    ? 'warning'
                    : request.status === 'CLOSED'
                      ? 'danger'
                      : 'info'
              }
            >
              {STATUS_LABELS[request.status]}
            </Badge>
          </div>
        }
      />
      <ol className={`stepper${terminal ? ' is-terminal' : ''}`} aria-label="신청 진행 단계">
        {STAGE_LABELS.map((label, index) => {
          const step = index + 1;
          const finalized = request.status === 'FINALIZED';
          const done = step < request.stage || (finalized && step === request.stage);
          const current = step === request.stage && !finalized;
          return (
            <li
              key={label}
              aria-current={current ? 'step' : undefined}
              className={done ? 'done' : current ? 'current' : undefined}
            >
              <span className="n">
                {step}단계
                {done
                  ? ' 완료'
                  : current
                    ? terminal
                      ? ` ${STATUS_LABELS[request.status]}`
                      : ' 진행 중'
                    : ''}
              </span>
              {label}
              {current && latestReturn && !terminal && <Badge tone="warning">반환 이력 있음</Badge>}
            </li>
          );
        })}
      </ol>
      {terminal && (
        <Notice tone={request.status === 'FINALIZED' ? 'success' : 'warning'}>
          <strong>{STATUS_LABELS[request.status]}된 신청입니다.</strong> 내용은 읽기 전용이며 기록과
          제출본을 보존합니다.
          {request.status === 'FINALIZED' ? (
            <p>
              서류 확정은 방화벽 장비 적용을 의미하지 않습니다.
              {request.docType === 'FIREWALL' && (
                <>
                  {' '}
                  <Link href="/policies">방화벽 규칙과 처리 기록 보기</Link>
                </>
              )}
            </p>
          ) : (
            <TerminalReason requestId={request.id} status={request.status} />
          )}
        </Notice>
      )}
      {latestReturn && request.highlightedFields.length > 0 && (
        <Notice tone="warning">
          <strong>
            {latestReturn.fromStage}단계에서 {latestReturn.targetStage}단계로 반환되었습니다.
          </strong>
          <p>{latestReturn.reason}</p>
          {Object.entries(latestReturn.fieldReasons ?? {}).map(([key, reason]) => (
            <p key={key}>
              {key}: {reason}
            </p>
          ))}
          <p className="help">
            {latestReturn.actorName} · {formatTime(latestReturn.createdAt)} · 기존 값은
            보존했습니다.
          </p>
          <div className="btn-row">
            {request.highlightedFields.map((key) => (
              <a href={`#field-${key}`} key={key}>
                {fields.find((answer) => answer.key === key)?.label ?? key} 보완하기
              </a>
            ))}
          </div>
        </Notice>
      )}
      {request.changedCommonFields.length > 0 && (
        <Notice tone="warning">
          공통 정보가 변경되었습니다.{' '}
          {request.stage === 4 || terminal
            ? '이 신청의 제출본은 변경되지 않았습니다. 담당자는 반환 필요 여부를 확인해 주세요.'
            : '영향 항목을 다시 확인해 주세요.'}
        </Notice>
      )}
      {message && (
        <div role="status">
          <Notice tone="success">{message}</Notice>
        </div>
      )}
      {failure && !dialogAction && <Notice tone="danger">{failure}</Notice>}
      <div className="detail detail-layout">
        <div className="detail-content">
          <section className="card" aria-labelledby="d-info">
            <h2 className="h-panel" id="d-info">
              사업 정보
            </h2>
            <p className="help src-help">
              값 옆 꼬리표는 출처입니다: 사용자 답변, AI 추론(근거 포함), 담당자 입력, 담당자 확인.
              AI 추론은 사람이 확인하기 전까지 확정값이 아닙니다.
            </p>
            <AnswerView
              answers={detail.businessAnswers}
              highlighted={request.highlightedFields}
              evidenceDisplay="inline"
            />
            {detail.snapshotUnavailable && (
              <p className="help">
                제출 당시 사업 정보를 확인할 수 없습니다. 신청을 다시 불러와 주세요.
              </p>
            )}
            <dl className="dl detail-business-meta">
              {request.deadlines.filter((deadline) => deadline.active).length > 0 && (
                <>
                  <dt>처리 기한</dt>
                  <dd>
                    {request.deadlines
                      .filter((deadline) => deadline.active)
                      .map((deadline) => (
                        <div key={deadline.id} className="detail-due">
                          <Badge
                            tone={
                              deadline.timing === 'OVERDUE'
                                ? 'danger'
                                : deadline.timing === 'DUE_SOON'
                                  ? 'warning'
                                  : 'neutral'
                            }
                          >
                            {deadline.paused
                              ? '일시 중지'
                              : deadline.timing === 'OVERDUE'
                                ? '기한 초과'
                                : deadline.timing === 'DUE_SOON'
                                  ? '마감 임박'
                                  : '진행 중'}
                          </Badge>
                          <time dateTime={deadline.dueAt}>{formatDate(deadline.dueAt)}</time>
                          {deadline.field && (
                            <span className="help">{FIELD_LABELS[deadline.field]} 처리 기한</span>
                          )}
                        </div>
                      ))}
                  </dd>
                </>
              )}
              <dt>적용 설정</dt>
              <dd>
                v{detail.selectedSubmission?.publicationVersion ?? request.publicationVersion}
              </dd>
            </dl>
            {(canViewCase || siblings.length > 0) && (
              <details className="sub-block detail-related">
                <summary>관련 신청·공통 인터뷰</summary>
                <div className="btn-row">
                  {canViewCase && (
                    <Link className="link-more" href={`/cases/${request.caseId}`}>
                      공통 인터뷰 보기 <Icon name="chevronRight" size={14} />
                    </Link>
                  )}
                  {siblings.map((sibling) => (
                    <Link className="link-more" key={sibling.id} href={`/requests/${sibling.id}`}>
                      {DOCUMENT_LABELS[sibling.docType] ?? sibling.docType} ·{' '}
                      {STATUS_LABELS[sibling.status]}
                    </Link>
                  ))}
                </div>
              </details>
            )}
            {has('EDIT_CASE') && caseQuery.data && actor.role !== 'INFRA' && (
              <details className="sub-block">
                <summary>사업 공통 답변 수정·확인</summary>
                <p className="help">
                  변경 시 미제출 서류는 재검토 대상이 됩니다. 이미 제출한 서류는 보존됩니다.
                </p>
                <AnswerEditor
                  draftKey={`case:${request.caseId}:answers`}
                  answers={caseQuery.data.answers}
                  actor={actor}
                  revision={caseQuery.data.revision}
                  highlighted={request.highlightedFields}
                  onSave={(expectedRevision, answers) =>
                    saveCase.mutateAsync({ expectedRevision, answers })
                  }
                />
              </details>
            )}
            {caseQuery.error && (
              <ErrorState
                error={caseQuery.error}
                onRetry={() => {
                  void caseQuery.refetch();
                }}
              />
            )}
          </section>
          {request.supplements.length > 0 && (
            <section className="card" id="supplements">
              <h2 className="h-panel">보완 요청과 답변</h2>
              {request.supplements.map((supplement) => (
                <article className="supplement-card" key={supplement.id}>
                  <div className="section-heading">
                    <h3 className="h-panel">{FIELD_LABELS[supplement.field]} 담당자 요청</h3>
                    <Badge tone={supplement.status === 'RESOLVED' ? 'success' : 'warning'}>
                      {supplement.status === 'RESOLVED'
                        ? '확인 완료'
                        : supplement.status === 'ANSWERED'
                          ? '담당자 재검토'
                          : '답변 필요'}
                    </Badge>
                  </div>
                  <p>{supplement.reason}</p>
                  <p className="help">
                    대상:{' '}
                    {supplement.fieldKeys
                      .map((key) => fields.find((item) => item.key === key)?.label ?? key)
                      .join(', ')}
                  </p>
                  {supplement.answer && (
                    <div className="supplement-answer">
                      <strong>사용자 답변</strong>
                      <p>{supplement.answer}</p>
                    </div>
                  )}
                  {supplement.status === 'OPEN' && has('ANSWER_SUPPLEMENT') && (
                    <a className="text-link" href={`#supplement-answer-${supplement.id}`}>
                      답변 칸으로 이동 <Icon name="arrowRight" size={16} />
                    </a>
                  )}
                  {supplement.status === 'ANSWERED' &&
                    has('RESOLVE_SUPPLEMENT') &&
                    supplement.field === roleField && (
                      <button
                        className="btn btn-sm"
                        disabled={command.isPending}
                        onClick={() => {
                          void invoke('RESOLVE_SUPPLEMENT', { supplementId: supplement.id });
                        }}
                      >
                        보완 답변 확인 완료
                      </button>
                    )}
                </article>
              ))}
            </section>
          )}
          {has('GENERATE_DRAFT') &&
            (finalDraft.isPending ? (
              <LoadingState />
            ) : finalDraft.error ? (
              <ErrorState error={finalDraft.error} onRetry={() => void finalDraft.refetch()} />
            ) : (
              <FinalDraftPanel
                request={request}
                actorId={actor.id}
                draft={finalDraft.data ?? null}
                onDirtyChange={setFinalDraftDirty}
              />
            ))}
          <RequestDocument request={request} />
          <InfrastructureWorkspace
            request={request}
            actor={actor}
            onDirtyChange={setInfraDirty}
            commonEditor={
              has('EDIT_CASE') &&
              caseQuery.data && (
                <>
                  <h3 className="h-panel">기관 지정 검토 항목</h3>
                  <AnswerEditor
                    draftKey={'case:' + request.caseId + ':infra-extras'}
                    answers={caseQuery.data.answers.filter(
                      (a) => !INFRA_PRIMARY_KEYS.includes(a.key),
                    )}
                    actor={actor}
                    revision={caseQuery.data.revision}
                    onSave={(expectedRevision, answers) =>
                      saveCase.mutateAsync({ expectedRevision, answers })
                    }
                  />
                </>
              )
            }
          >
            {detail.additionalAnswers.length > 0 && (
              <details className="sub-block">
                <summary>신청 추가 정보</summary>
                <AnswerView
                  answers={detail.additionalAnswers}
                  highlighted={request.highlightedFields}
                  evidenceDisplay="inline"
                />
              </details>
            )}
            {(has('EDIT_ANSWERS') || has('SAVE_ANSWERS')) && (
              <details
                className="sub-block"
                open={request.stage === 1 || actor.role === 'INFRA' || actor.role === 'SECURITY'}
              >
                <summary>서류별 답변 수정·확인</summary>
                <AnswerEditor
                  draftKey={`request:${request.id}:answers`}
                  answers={
                    actor.role === 'INFRA' || actor.role === 'SECURITY'
                      ? request.answers.filter((a) => !INFRA_PRIMARY_KEYS.includes(a.key))
                      : request.answers
                  }
                  revision={request.revision}
                  actor={actor}
                  highlighted={request.highlightedFields}
                  onSave={(expectedRevision, answers) =>
                    command.mutateAsync({
                      action: 'SAVE_ANSWERS',
                      expectedRevision,
                      answers,
                      field: roleField,
                    })
                  }
                />
              </details>
            )}
          </InfrastructureWorkspace>
          {canInquire && <StaffInquiryPanel requestId={request.id} actor={actor} />}
          <RequestHistory requestId={request.id} />
        </div>
        <aside className="review" aria-labelledby="review-heading">
          <div className="card">
            {canInquire && (
              <a className="btn inquiry-shortcut" href="#staff-inquiry-heading">
                AI 검토 도우미로 이동
              </a>
            )}
            <h2 className="sr-only">담당자 협의 현황</h2>
            {handoffFields(request).length > 0 && (
              <Notice tone="warning">
                <strong>담당자 재배정이 필요합니다.</strong>
                {handoffFields(request).map((item) => (
                  <p key={item.field}>
                    {FIELD_LABELS[item.field]} · {reassignmentLabel(item.reassignmentReason!)}
                  </p>
                ))}
                {actor.role === 'ADMIN' ? (
                  <p>
                    아래 ‘담당자 재배정’에서 업무를 인계하세요.{' '}
                    <Link href="/members">담당자 등록·기본 지정 관리</Link>
                  </p>
                ) : (
                  <p>
                    기관 관리자가 새 담당자를 배정하면 기존 작성 내용으로 업무를 이어갈 수 있습니다.
                  </p>
                )}
              </Notice>
            )}
            <div className="consult">
              {reviewFields(request).map((field) => {
                const review = request.reviews.find((item) => item.field === field);
                const assignment = request.assignments.find(
                  (item) => item.active && item.field === field,
                );
                const status = review ? REVIEW_STATUS_LABELS[review.status] : '검토 대기';
                return (
                  <div key={field}>
                    <span
                      title={
                        assignment?.assigneeName
                          ? `담당자: ${assignment.assigneeName}`
                          : '담당자 미배정'
                      }
                    >
                      {FIELD_LABELS[field]}
                    </span>
                    <Badge
                      tone={
                        review?.status === 'COMPLETE'
                          ? 'success'
                          : review?.status === 'SUPPLEMENT_REQUESTED' ||
                              review?.status === 'RECHECK'
                            ? 'warning'
                            : review?.allocationCompleted
                              ? 'info'
                              : 'neutral'
                      }
                    >
                      {status}
                    </Badge>
                  </div>
                );
              })}
            </div>
            {request.stage === 4 && (
              <div className="final-confirmations">
                <h3 className="h-panel">제출본 최종 확인</h3>
                {reviewFields(request).map((field) => {
                  const confirmation = request.finalConfirmations.find(
                    (item) =>
                      item.submissionId === request.currentSubmissionId && item.field === field,
                  );
                  return (
                    <p key={field}>
                      <Icon name={confirmation ? 'check' : 'clock'} size={16} />
                      {FIELD_LABELS[field]}{' '}
                      <strong>{confirmation ? '최종 확인 완료' : '최종 확인 대기'}</strong>
                    </p>
                  );
                })}
              </div>
            )}
            {terminal && (
              <div className="review-actions">
                <h2 className="h-panel" id="review-heading" tabIndex={-1}>
                  현재 처리 상황
                </h2>
                <p>처리할 작업이 없습니다. 기록과 제출본은 보존됩니다.</p>
              </div>
            )}
            {!terminal && (
              <div className="review-actions">
                <h2 className="h-panel" id="review-heading" tabIndex={-1}>
                  {panelTitle}
                </h2>
                <p className="review-status">
                  {waitingLine(request) || STATUS_LABELS[request.status]}
                  입니다.
                  {actor.role === 'APPLICANT' && request.stage === 2
                    ? ' 보완 요청이 오면 답변해 주세요.'
                    : ' 담당자가 처리하면 최신 진행 상황이 표시됩니다.'}
                </p>
                {needsReconsultation && (
                  <Notice tone="warning">
                    <strong>담당자 재검토가 필요합니다.</strong>
                    <p>
                      {roleField
                        ? '아래 ‘이전 단계로 반환’에서 2단계 담당자 협의를 선택해 주세요. 보완 답변을 확인하고 필요한 분야의 협의를 다시 완료해야 재제출할 수 있습니다.'
                        : '보완할 답변을 수정·저장해 주세요. 배정된 담당자가 2단계로 반환해 재검토를 완료하면 최종 보고서를 다시 확인하고 제출할 수 있습니다.'}
                    </p>
                  </Notice>
                )}
                {request.blockers.length > 0 && (
                  <Notice tone="warning">
                    <strong>제출 전 확인할 사항</strong>
                    <ul>
                      {request.blockers.map((blocker) => (
                        <li key={blocker}>{blocker}</li>
                      ))}
                    </ul>
                  </Notice>
                )}
                {(has('COMPLETE_REVIEW') ||
                  (has('FINAL_CONFIRM') && !finalReview.ownConfirmed)) && (
                  <>
                    {has('COMPLETE_REVIEW') && currentReview && checklistItems.length > 0 && (
                      <fieldset className="review-checklist" disabled={command.isPending}>
                        <legend className="legend">
                          검토 체크리스트{' '}
                          <span className="help">
                            {checklistItems.filter((item) => checklist[item.key]).length}/
                            {checklistItems.length}
                          </span>
                          <span className="required">필수</span>
                        </legend>
                        {checklistItems.map((item) => (
                          <label className="check" key={item.key}>
                            <input
                              type="checkbox"
                              checked={checklist[item.key] === true}
                              onChange={(event) =>
                                setReviewDraft({
                                  reviewId: currentReview.id,
                                  revision: currentReview.revision,
                                  values: { ...checklist, [item.key]: event.target.checked },
                                })
                              }
                            />
                            <span>{item.label}</span>
                          </label>
                        ))}
                      </fieldset>
                    )}
                    <div className="field">
                      <label htmlFor="review-comment">
                        검토 의견
                        {has('COMPLETE_REVIEW') && <span className="required"> (필수)</span>}
                      </label>
                      <p className="help" id="review-comment-help">
                        확인 근거와 후속 조치를 구체적으로 적어 주세요.
                      </p>
                      <textarea
                        id="review-comment"
                        className="input"
                        rows={3}
                        value={comment}
                        maxLength={2000}
                        required={has('COMPLETE_REVIEW')}
                        aria-describedby="review-comment-help"
                        onChange={(e) => setComment(e.target.value)}
                        placeholder="확인한 내용을 기록해 주세요."
                      />
                    </div>
                  </>
                )}
                {has('REQUEST_REVIEW') && (
                  <button
                    className="btn btn-primary full-width"
                    disabled={command.isPending}
                    onClick={() => setDialogAction('REQUEST_REVIEW')}
                  >
                    담당자 협의 요청
                    <Icon name="arrowRight" />
                  </button>
                )}
                {has('COMPLETE_REVIEW') && (
                  <>
                    <button
                      className="btn btn-primary full-width"
                      disabled={
                        command.isPending ||
                        (!infraPending && (!checklistComplete || !comment.trim()))
                      }
                      onClick={() => {
                        void invoke('COMPLETE_REVIEW', { checklist });
                      }}
                    >
                      담당 분야 협의 완료
                    </button>
                    {(!checklistComplete || !comment.trim()) && (
                      <p className="help">
                        검토 체크리스트와 검토 의견을 입력하면 협의를 완료할 수 있습니다.
                      </p>
                    )}
                  </>
                )}
                {request.stage === 3 && (
                  <ConsultationReview
                    requestId={request.id}
                    actorId={actor.id}
                    canSummarize={actor.role === 'APPLICANT'}
                  />
                )}
                {has('GENERATE_DRAFT') && (
                  <a className="btn full-width" href="#final-draft-heading">
                    최종 초안 작성·확인으로 이동
                  </a>
                )}
                {has('SUBMIT') && (
                  <>
                    <button
                      className="btn btn-primary full-width"
                      disabled={
                        command.isPending || request.blockers.length > 0 || !finalDraftReady
                      }
                      onClick={() => setDialogAction('SUBMIT')}
                    >
                      최종 제출
                      <Icon name="arrowRight" />
                    </button>
                    {request.blockers.length > 0 && (
                      <p className="help">위 확인 사항을 해결하면 최종 제출할 수 있습니다.</p>
                    )}
                    {!finalDraftReady && (
                      <p className="help">
                        최종 보고서 초안을 작성하고 내용을 확인하면 제출할 수 있습니다.
                      </p>
                    )}
                  </>
                )}
                {has('FINAL_CONFIRM') && (
                  <>
                    {finalReview.confirmReason && (
                      <p className="help" id="final-confirm-help">
                        {finalReview.confirmReason}
                      </p>
                    )}
                    <button
                      className="btn btn-primary full-width"
                      disabled={command.isPending || !!finalReview.confirmReason}
                      aria-describedby={
                        finalReview.confirmReason ? 'final-confirm-help' : undefined
                      }
                      onClick={() => {
                        void invoke('FINAL_CONFIRM');
                      }}
                    >
                      {finalReview.ownConfirmed ? '담당 분야 최종 확인 완료' : '제출본 최종 확인'}
                    </button>
                  </>
                )}
                {has('FINALIZE') && (
                  <>
                    {finalReview.finalizeReason && (
                      <p className="help" id="finalize-help">
                        {finalReview.finalizeReason}
                      </p>
                    )}
                    <button
                      className="btn btn-primary full-width"
                      disabled={command.isPending || !!finalReview.finalizeReason}
                      aria-describedby={finalReview.finalizeReason ? 'finalize-help' : undefined}
                      onClick={() => setDialogAction('FINALIZE')}
                    >
                      서류 확정
                    </button>
                  </>
                )}
                {has('REASSIGN') && (
                  <button className="btn full-width" onClick={() => setDialogAction('REASSIGN')}>
                    담당자 재배정
                  </button>
                )}
                {request.supplements
                  .filter((item) => item.status === 'OPEN' && has('ANSWER_SUPPLEMENT'))
                  .map((supplement) => (
                    <SupplementAnswer
                      key={supplement.id}
                      id={supplement.id}
                      reason={supplement.reason}
                      pending={command.isPending}
                      onSave={(answer) =>
                        invoke('ANSWER_SUPPLEMENT', { supplementId: supplement.id, answer })
                      }
                    />
                  ))}
                {(has('REQUEST_SUPPLEMENT') ||
                  has('RETURN') ||
                  has('CLOSE') ||
                  has('WITHDRAW')) && (
                  <div className="review-secondary-actions">
                    {has('REQUEST_SUPPLEMENT') && (
                      <button
                        className="btn btn-tertiary"
                        onClick={() => setDialogAction('REQUEST_SUPPLEMENT')}
                      >
                        보완 요청하기
                      </button>
                    )}
                    {has('RETURN') && (
                      <button
                        className="btn btn-tertiary"
                        onClick={() => setDialogAction('RETURN')}
                      >
                        이전 단계로 반환
                      </button>
                    )}
                    {has('CLOSE') && (
                      <button
                        className="btn btn-tertiary danger-text"
                        onClick={() => setDialogAction('CLOSE')}
                      >
                        종결(반려)
                      </button>
                    )}
                    {has('WITHDRAW') && (
                      <button
                        className="btn btn-tertiary danger-text"
                        onClick={() => setDialogAction('WITHDRAW')}
                      >
                        신청 철회
                      </button>
                    )}
                  </div>
                )}
                {command.isPending && <p role="status">처리 중입니다. 잠시 기다려 주세요.</p>}
                {['INFRA', 'SECURITY'].includes(actor.role) &&
                  !request.assignments.some(
                    (item) => item.active && item.assigneeId === actor.id,
                  ) && <Notice>배정된 담당자만 검토할 수 있습니다. 현재 조회만 가능합니다.</Notice>}
              </div>
            )}
          </div>
        </aside>
      </div>
      <CommandDialog
        action={dialogAction}
        request={request}
        actor={actor}
        pending={command.isPending}
        error={failure}
        onClose={() => {
          setDialogAction(null);
          setFailure('');
        }}
        onSubmit={(action, extra) => invoke(action, extra)}
      />
    </div>
  );
}

function SupplementAnswer({
  id,
  reason,
  pending,
  onSave,
}: {
  id: string;
  reason: string;
  pending: boolean;
  onSave: (answer: string) => Promise<void>;
}) {
  const [answer, setAnswer] = useState('');
  return (
    <form
      className="supplement-answer-form"
      onSubmit={(e) => {
        e.preventDefault();
        void onSave(answer);
      }}
    >
      <label htmlFor={`supplement-answer-${id}`}>
        <strong>보완 답변</strong>
        <span>{reason}</span>
      </label>
      <textarea
        className="input"
        id={`supplement-answer-${id}`}
        value={answer}
        maxLength={4000}
        required
        rows={3}
        onChange={(e) => setAnswer(e.target.value)}
      />
      <button className="btn full-width" disabled={pending}>
        보완 답변 등록
      </button>
    </form>
  );
}

const ACTION_LABELS: Partial<Record<CommandAction, string>> = {
  REQUEST_REVIEW: '담당자 협의 요청',
  RETURN: '이전 단계로 반환',
  REQUEST_SUPPLEMENT: '보완 요청',
  CLOSE: '신청 종결(반려)',
  WITHDRAW: '신청 철회',
  REASSIGN: '담당자 재배정',
  SUBMIT: '최종 제출',
  FINALIZE: '서류 확정',
};

function CommandDialog(props: {
  action: CommandAction | null;
  request: SecurityRequest;
  actor: Actor;
  pending: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (action: CommandAction, extra: Partial<CommandInput>) => Promise<void>;
}) {
  return (
    <Modal
      open={props.action !== null}
      title={props.action ? (ACTION_LABELS[props.action] ?? '업무 처리') : '업무 처리'}
      onClose={props.onClose}
    >
      {props.action && <CommandForm key={props.action} {...props} action={props.action} />}
    </Modal>
  );
}

function CommandForm({
  action,
  request,
  pending,
  error,
  onClose,
  onSubmit,
}: {
  action: CommandAction;
  request: SecurityRequest;
  actor: Actor;
  pending: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (action: CommandAction, extra: Partial<CommandInput>) => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [fieldKeys, setFieldKeys] = useState<string[]>([]);
  const targets = request.stage === 2 ? [1] : request.stage === 3 ? [2, 1] : [3];
  const [targetStage, setTargetStage] = useState(targets[0]);
  const [field, setField] = useState<ReviewField>('INFRA');
  const [assigneeId, setAssigneeId] = useState('');
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [localError, setLocalError] = useState('');
  const reasonRequired = ['RETURN', 'CLOSE', 'WITHDRAW', 'REASSIGN', 'REQUEST_SUPPLEMENT'].includes(
    action,
  );
  const fieldsRequired = action === 'RETURN' || action === 'REQUEST_SUPPLEMENT';
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (fieldsRequired && !fieldKeys.length) {
          setLocalError('보완할 항목을 한 개 이상 선택해 주세요.');
          return;
        }
        setLocalError('');
        void onSubmit(action, {
          reason,
          fieldKeys,
          targetStage,
          ...(action === 'REASSIGN' ? { field, assigneeId } : {}),
          ...(action === 'SUBMIT' ? { idempotencyKey } : {}),
        });
      }}
    >
      <p>
        <strong>{DOCUMENT_LABELS[request.docType] ?? request.docType}</strong> · {request.caseTitle}
      </p>
      {action === 'REQUEST_REVIEW' && (
        <Notice>
          이 서류를 2단계로 보내고 ICT인프라·정보보안 담당자를 자동 배정합니다. 같은 사업의 다른
          서류는 현재 단계에 남습니다.
        </Notice>
      )}
      {action === 'SUBMIT' && (
        <Notice>
          현재 답변, 확인한 최종 보고서와 설정 버전을 제출본으로 고정합니다. 제출 후 수정은 담당자의
          4→3 반환을 통해 진행합니다.
        </Notice>
      )}
      {action === 'FINALIZE' && (
        <Notice>
          필요한 분야의 최종 확인이 완료된 이 제출본을 확정합니다. 방화벽 장비 적용은 별도
          업무입니다.
        </Notice>
      )}
      {(action === 'CLOSE' || action === 'WITHDRAW') && (
        <Notice tone="warning">
          {action === 'CLOSE' ? '종결' : '철회'} 후에는 신청 내용을 고치거나 다시 진행할 수
          없습니다. 기존 값과 이력은 보존됩니다.
        </Notice>
      )}
      {action === 'RETURN' && (
        <div className="field">
          <label htmlFor="return-stage">반환할 단계</label>
          <select
            id="return-stage"
            className="input"
            value={targetStage}
            onChange={(event) => setTargetStage(Number(event.target.value))}
          >
            {targets.map((stage) => (
              <option key={stage} value={stage}>
                {stage}단계 · {STAGE_LABELS[stage - 1]}
              </option>
            ))}
          </select>
        </div>
      )}
      {fieldsRequired && (
        <fieldset className="return-fields">
          <legend>보완 필요 항목 (필수)</legend>
          {[...request.commonAnswers, ...request.answers].map((answer) => (
            <label className="check-row" key={`${answer.scope}-${answer.key}`}>
              <input
                type="checkbox"
                checked={fieldKeys.includes(answer.key)}
                onChange={(event) =>
                  setFieldKeys((old) =>
                    event.target.checked
                      ? [...old, answer.key]
                      : old.filter((key) => key !== answer.key),
                  )
                }
              />
              {answer.label}
            </label>
          ))}
          <p className="help">선택한 항목만 강조합니다. 기존 값은 지우지 않습니다.</p>
        </fieldset>
      )}
      {action === 'REASSIGN' && (
        <AssigneeSelector
          field={field}
          assigneeId={assigneeId}
          onField={(next) => {
            setField(next);
            setAssigneeId('');
          }}
          onAssignee={setAssigneeId}
          ownerId={request.ownerId}
        />
      )}
      {reasonRequired && (
        <div className="field">
          <label htmlFor="action-reason">사유 (필수)</label>
          <textarea
            id="action-reason"
            className="input"
            required
            rows={3}
            maxLength={2000}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </div>
      )}
      {(error || localError) && <Notice tone="danger">{error || localError}</Notice>}
      <div className="dlg-actions">
        <button type="button" className="btn" onClick={onClose} disabled={pending}>
          되돌아가기
        </button>
        <button
          className={`btn ${action === 'CLOSE' || action === 'WITHDRAW' ? 'btn-danger' : 'btn-primary'}`}
          disabled={pending}
        >
          {pending
            ? '처리 중…'
            : action === 'RETURN'
              ? `${targetStage}단계로 반환`
              : ACTION_LABELS[action]}
        </button>
      </div>
    </form>
  );
}

function AssigneeSelector({
  field,
  assigneeId,
  onField,
  onAssignee,
  ownerId,
}: {
  field: ReviewField;
  assigneeId: string;
  onField: (value: ReviewField) => void;
  onAssignee: (value: string) => void;
  ownerId: string;
}) {
  const query = useMembers();
  const pools = useReviewerPools();
  const eligible = new Set(
    (pools.data ?? []).filter((p) => p.field === field && p.eligible).map((p) => p.memberUsername),
  );
  return (
    <>
      <div className="field">
        <label htmlFor="assignment-field">분야</label>
        <select
          id="assignment-field"
          className="input"
          value={field}
          onChange={(event) => {
            onField(event.target.value as ReviewField);
            onAssignee('');
          }}
        >
          <option value="INFRA">ICT인프라</option>
          <option value="SECURITY">정보보안</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="assignment-person">새 담당자</label>
        <select
          id="assignment-person"
          className="input"
          required
          value={assigneeId}
          onChange={(event) => onAssignee(event.target.value)}
        >
          <option value="">담당자를 선택해 주세요</option>
          {query.data
            ?.filter(
              (member) =>
                member.role === field &&
                member.active &&
                member.id !== ownerId &&
                eligible.has(member.username),
            )
            .map((member) => (
              <option key={member.id} value={member.id}>
                {member.displayName} · {member.username}
              </option>
            ))}
        </select>
      </div>
      {query.error && <ErrorState error={query.error} />}
      {pools.error && (
        <ErrorState
          error={pools.error}
          onRetry={() => {
            void pools.refetch();
          }}
        />
      )}
      <p className="help">
        해당 분야에 등록된 활성 담당자만 선택할 수 있습니다.{' '}
        <Link href="/members">담당자 등록·기본 지정 관리</Link>
      </p>
    </>
  );
}

function TerminalReason({ requestId, status }: { requestId: string; status: string }) {
  const audit = useAudit(requestId, {
    action: status === 'CLOSED' ? 'REQUEST_CLOSED' : 'REQUEST_WITHDRAWN',
    size: 1,
  });
  const event = audit.data?.find(
    (item) =>
      item.targetId === requestId &&
      [
        status === 'CLOSED' ? 'REQUEST_CLOSED' : 'REQUEST_WITHDRAWN',
        status === 'CLOSED' ? 'CLOSE' : 'WITHDRAW',
      ].includes(item.action),
  );
  return event ? (
    <p>
      사유: {event.reason} · {event.actorName} · {formatTime(event.createdAt)}
    </p>
  ) : audit.error ? (
    <p>처리 사유를 불러오지 못했습니다. 처리 이력에서 다시 확인해 주세요.</p>
  ) : null;
}

function RequestHistory({ requestId }: { requestId: string }) {
  const [page, setPage] = useState(0);
  const [throughId, setThroughId] = useState<number>();
  const audit = useAudit(requestId, { page, size: 12, throughId });
  const events = (audit.data ?? []).filter((event) => event.targetId === requestId);
  return (
    <section className="card" id="request-history" aria-labelledby="d-hist">
      <h2 className="h-panel" id="d-hist">
        처리 이력
      </h2>
      {audit.isPending ? (
        <LoadingState />
      ) : audit.error ? (
        <ErrorState
          error={audit.error}
          onRetry={() => {
            void audit.refetch();
          }}
        />
      ) : events.length ? (
        <ol className="hist">
          {events
            .slice()
            .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
            .map((event) => (
              <li key={event.id}>
                <time dateTime={event.createdAt}>{formatTime(event.createdAt)}</time>
                <span>
                  {event.actorName}: {event.summary || auditActionLabel(event.action)}
                  {event.reason && <span className="help">사유: {event.reason}</span>}
                </span>
              </li>
            ))}
        </ol>
      ) : (
        <p className="help">이 신청의 처리 이력이 아직 없습니다.</p>
      )}
      {audit.pagination && (
        <ListPager
          page={page}
          size={12}
          total={audit.pagination.totalElements}
          onChange={(next) => {
            setThroughId(audit.throughId);
            setPage(next);
          }}
          label="처리 이력 페이지"
        />
      )}
    </section>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeZone: 'Asia/Seoul',
  }).format(new Date(value));
}
function formatTime(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Asia/Seoul',
  }).format(new Date(value));
}

/** 담당자 전체 목록 대신 이 신청에 허용된 배정·협의 이력만 보여 준다. */
function InfraReviewNotice({ request }: { request: SecurityRequest }) {
  const audit = useAudit(request.id, { action: 'REVIEW_REQUESTED', size: 1 });
  const assignment = request.assignments.find((item) => item.active && item.field === 'INFRA');
  const review = request.reviews.find((item) => item.field === 'INFRA');
  const requested = audit.data?.find(
    (event) =>
      event.targetId === request.id &&
      ['REVIEW_REQUESTED', 'REQUEST_REVIEW'].includes(event.action),
  );
  const deadline = request.deadlines.find(
    (item) => item.field === 'INFRA' && item.kind === 'CONSULTATION' && item.active,
  );
  return (
    <>
      <p>
        ICT인프라의 협의 단계가 끝나지 않았습니다. 아래 담당자의 협의 완료 후 다시 진행해 주세요.
      </p>
      <dl className="infra-review-info">
        <div>
          <dt>사업명</dt>
          <dd>{request.caseTitle}</dd>
        </div>
        <div>
          <dt>신청 서류</dt>
          <dd>
            {DOCUMENT_LABELS[request.docType]} · #{request.id}
          </dd>
        </div>
        <div>
          <dt>배정된 ICT인프라 담당자</dt>
          <dd>
            {assignment
              ? assignment.assigneeName === assignment.assigneeId
                ? assignment.assigneeName
                : assignment.assigneeName + ' (' + assignment.assigneeId + ')'
              : '미배정 — 기관 관리자에게 배정을 요청해 주세요.'}
          </dd>
        </div>
        {assignment?.reassignmentReason && (
          <div>
            <dt>배정 상태</dt>
            <dd>{reassignmentLabel(assignment.reassignmentReason)}</dd>
          </div>
        )}
        <div>
          <dt>담당자 배정 일시</dt>
          <dd>{assignment ? formatTime(assignment.assignedAt) : '미배정'}</dd>
        </div>
        <div>
          <dt>협의 단계 진입 · 요청 일시</dt>
          <dd>
            {requested
              ? formatTime(requested.createdAt)
              : audit.isPending
                ? '조회 중…'
                : audit.error
                  ? '이력을 불러오지 못했습니다.'
                  : '협의 요청 이력을 확인할 수 없습니다.'}
          </dd>
        </div>
        <div>
          <dt>ICT인프라 협의 상태</dt>
          <dd>
            {review
              ? review.status === 'ALLOCATED'
                ? '협의 중'
                : REVIEW_STATUS_LABELS[review.status]
              : '검토 대기'}
          </dd>
        </div>
        {deadline && (
          <div>
            <dt>ICT인프라 협의 기한</dt>
            <dd>{formatTime(deadline.dueAt)}</dd>
          </div>
        )}
      </dl>
    </>
  );
}
