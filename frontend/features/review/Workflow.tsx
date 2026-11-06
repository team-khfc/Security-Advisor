'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import type { SecurityRequest } from '@/features/request';
import { useRequestMutation, AnswerEditor } from '@/features/request';
import { useMemoryDraft, useSession } from '@/features/auth';
import { Badge, ErrorNotice, Icon, Modal, Notice } from '@/components/ui';
import { ROLE_LABELS, type Role } from '@/lib/sharedTypes';
import { formatDate } from '@/lib/format';

/** 서버가 반환한 할당·협의·최종 확인을 서로 독립된 상태로 표시한다. */
export function ReviewProgress({ procedure }: { procedure: SecurityRequest }) {
  const reviews = procedure.stage === 4 ? procedure.finalReviews : procedure.reviews;
  return (
    <div className="review-progress">
      <div>
        <span>ICT인프라 할당</span>
        <Badge tone={procedure.allocation.status === 'COMPLETE' ? 'blue' : 'amber'}>
          {procedure.allocation.status === 'COMPLETE'
            ? '할당 완료'
            : procedure.allocation.status === 'INVALIDATED'
              ? '재확인 필요'
              : '할당 대기'}
        </Badge>
      </div>
      {reviews.map((review) => (
        <div key={review.role}>
          <span>
            {ROLE_LABELS[review.role]} {procedure.stage === 4 ? '최종 확인' : '협의'}
          </span>
          <Badge
            tone={
              review.status === 'COMPLETE' && review.revision === procedure.revision
                ? 'green'
                : review.status === 'INVALIDATED'
                  ? 'amber'
                  : review.status === 'IN_PROGRESS'
                    ? 'blue'
                    : 'gray'
            }
          >
            {review.status === 'COMPLETE' && review.revision === procedure.revision
              ? '완료'
              : review.status === 'IN_PROGRESS'
                ? '검토 중'
                : review.status === 'INVALIDATED'
                  ? '재확인 필요'
                  : '대기'}
          </Badge>
        </div>
      ))}
    </div>
  );
}
/** 반환 이전 값은 유지하며 직접 지정·연관된 보완 항목과 사유를 함께 표시한다. */
export function ReturnNotice({ procedure }: { procedure: SecurityRequest }) {
  const items = procedure.returnItems.filter((item) => item.status === 'OPEN');
  if (!items.length) return null;
  return (
    <section className="return-notice" aria-labelledby="return-title">
      <Icon name="back" />
      <div>
        <h2 id="return-title">
          이전 단계로 반환되었습니다{' '}
          <Badge tone="amber">
            {items[0].fromStage} → {items[0].toStage}단계
          </Badge>
        </h2>
        <p>
          기존 입력값과 이력은 보존되었습니다. 아래에 표시된 항목의 사유를 확인하고 보완해 주세요.
        </p>
        <ul>
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={`/requests/${procedure.id}/${item.fieldKey === 'network' ? 'infra#field-network' : `questions#document-${encodeURIComponent(item.fieldKey)}`}`}
                prefetch={false}
                onClick={(event) => {
                  const target =
                    document.getElementById(`answer-${item.fieldKey}`) ??
                    document.getElementById(`evidence-${item.fieldKey}`) ??
                    document.getElementById(`document-${item.fieldKey}`) ??
                    document.getElementById(`field-${item.fieldKey}`);
                  if (target) {
                    event.preventDefault();
                    target.scrollIntoView({ block: 'center' });
                    target.focus({ preventScroll: true });
                  }
                }}
              >
                {item.label} 확인
              </Link>
              {item.affected && <span className="dependent-label">연관 항목</span>}
              <span>{item.reason}</span>
              {item.fieldKey === 'network' && item.previousValue != null && (
                <details className="previous-value">
                  <summary>반환 전 통신 규칙 보기</summary>
                  <p className="readonly-value">{item.previousValue || '등록된 통신 규칙 없음'}</p>
                </details>
              )}
            </li>
          ))}
        </ul>
        <small>
          {items[0].requestedBy} · {formatDate(items[0].createdAt, true)}
        </small>
      </div>
    </section>
  );
}
/** 종료된 신청은 종결·철회 사유와 읽기전용 상태를 분명히 전달한다. */
export function TerminalNotice({ procedure }: { procedure: SecurityRequest }) {
  if (!['CLOSED', 'WITHDRAWN'].includes(procedure.status)) return null;
  const event = [...procedure.timeline]
    .reverse()
    .find((item) => ['CLOSED', 'WITHDRAWN', 'CLOSE', 'WITHDRAW'].includes(item.action));
  return (
    <section className="terminal-notice">
      <Icon name="lock" />
      <div>
        <h2>{procedure.status === 'CLOSED' ? '종결(반려)된 신청' : '철회된 신청'}</h2>
        <p>{procedure.terminalReason || '기록된 사유를 이력에서 확인해 주세요.'}</p>
        {event && (
          <p className="source-meta">
            {event.actorName} · {formatDate(event.at, true)}
          </p>
        )}
        <small>기존 값·출처·변경 이력은 보관되며 업무 내용을 수정할 수 없습니다.</small>
      </div>
    </section>
  );
}
const ACTIONS = {
  ALLOCATE: ['인프라 할당 완료', '/allocation'],
  START_REVIEW: ['검토 시작', '/review/start'],
  REVIEW: ['담당 분야 협의 완료', '/review'],
  FINAL_REVIEW: ['제출본 최종 검토 완료', '/final-review'],
  CONFIRM: ['서류 확정', '/confirm'],
  RETURN: ['이전 단계로 반환', '/return'],
  CLOSE: ['종결(반려)', '/close'],
  WITHDRAW: ['신청 철회', '/withdraw'],
  SUPPLEMENT: ['보완 질문 등록', '/supplements'],
} as const;
type Action = keyof typeof ACTIONS;
/** 사유·대상·현재 수정본을 서버에 보내며 실패 시 모달과 미저장 입력을 유지한다. */
export function WorkflowActions({ procedure }: { procedure: SecurityRequest }) {
  const { user } = useSession();
  const mutation = useRequestMutation(procedure.id);
  const [action, setAction] = useState<Action>();
  const [feedback, setFeedback] = useState('');
  const [validation, setValidation] = useState('');
  const validationRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useMemoryDraft(`workflow:${procedure.id}`, {
    reason: '',
    comment: '',
    question: '',
    targetStage: procedure.stage === 4 ? 3 : procedure.stage === 3 ? 2 : 1,
    fieldKeys: [] as string[],
  });
  const allows = (candidate: Action) => procedure.allowedActions.includes(candidate);
  const requiresReason = action === 'RETURN' || action === 'CLOSE' || action === 'WITHDRAW';
  const primary: Action | undefined =
    procedure.stage === 2
      ? allows('ALLOCATE')
        ? 'ALLOCATE'
        : allows('REVIEW')
          ? 'REVIEW'
          : allows('START_REVIEW')
            ? 'START_REVIEW'
            : undefined
      : procedure.stage === 4
        ? allows('CONFIRM')
          ? 'CONFIRM'
          : allows('FINAL_REVIEW')
            ? 'FINAL_REVIEW'
            : undefined
        : undefined;
  const openAction = (candidate: Action) => {
    setAction(candidate);
    setFeedback('');
    setValidation('');
    setDraft((current) => ({
      ...current,
      targetStage: procedure.stage === 4 ? 3 : procedure.stage === 3 ? 2 : 1,
    }));
  };
  async function apply() {
    if (!action) return;
    const invalid =
      requiresReason && !draft.reason.trim()
        ? '처리 사유를 입력해 주세요. 기존 내용은 그대로 유지됩니다.'
        : action === 'RETURN' && !draft.fieldKeys.length
          ? '보완이 필요한 항목을 1개 이상 선택해 주세요.'
          : action === 'SUPPLEMENT' && !draft.question.trim()
            ? '담당자가 확인할 질문을 입력해 주세요.'
            : '';
    if (invalid) {
      setValidation(invalid);
      requestAnimationFrame(() => validationRef.current?.focus());
      return;
    }
    setValidation('');
    const body = {
      expectedRevision: procedure.revision,
      ...(requiresReason ? { reason: draft.reason } : {}),
      ...(['ALLOCATE', 'REVIEW', 'FINAL_REVIEW'].includes(action)
        ? { comment: draft.comment }
        : {}),
      ...(action === 'RETURN'
        ? { targetStage: draft.targetStage, fieldKeys: draft.fieldKeys }
        : {}),
      ...(action === 'SUPPLEMENT' ? { question: draft.question } : {}),
    };
    try {
      await mutation.mutateAsync({ endpoint: ACTIONS[action][1], body });
      setFeedback(`${ACTIONS[action][0]}를 기록했습니다.`);
      setAction(undefined);
      setDraft({ ...draft, reason: '', question: '', fieldKeys: [] });
    } catch {
      /* 실패한 입력과 모달을 그대로 유지한다. */
    }
  }
  return (
    <div className="workflow-actions">
      {['CLOSED', 'WITHDRAWN'].includes(procedure.status) ? (
        <Notice>종료된 신청은 읽기 전용입니다. 사유와 기존 내용을 확인할 수 있습니다.</Notice>
      ) : (
        <>
          <ErrorNotice error={!action ? mutation.error : undefined} />
          {procedure.stage === 2 && (
            <p className="workflow-rule">
              <Icon name="info" width={18} />
              할당 완료는 정보보안 검토를 여는 조건입니다. 양측 협의 완료가 별도로 필요합니다.
            </p>
          )}
          {primary && (
            <button
              className="button primary full"
              type="button"
              disabled={mutation.isPending}
              onClick={() => openAction(primary)}
            >
              {ACTIONS[primary][0]}
              <Icon name="arrow" width={18} />
            </button>
          )}
          {(['SUPPLEMENT', 'RETURN', 'CLOSE', 'WITHDRAW'] as Action[])
            .filter(allows)
            .map((candidate) => (
              <button
                className={`button full ${candidate === 'CLOSE' || candidate === 'WITHDRAW' ? 'danger' : ''}`}
                key={candidate}
                type="button"
                onClick={() => openAction(candidate)}
                disabled={mutation.isPending}
              >
                {candidate === 'RETURN' && <Icon name="back" width={18} />} {ACTIONS[candidate][0]}
              </button>
            ))}
          {feedback && (
            <p className="action-feedback" role="status">
              {feedback}
            </p>
          )}
          <Modal
            open={Boolean(action)}
            title={action ? ACTIONS[action][0] : ''}
            onClose={() => setAction(undefined)}
          >
            {validation && (
              <div className="sf-notice error" role="alert" tabIndex={-1} ref={validationRef}>
                {validation}
              </div>
            )}
            <ErrorNotice error={mutation.error} />
            <p>
              <strong>{procedure.title}</strong> · 수정본 v{procedure.revision}
            </p>
            {action === 'RETURN' ? (
              <>
                <Notice>
                  기존 값과 이력을 보존하고 선택한 항목을 보완 대상으로 표시합니다. 담당자 확인이
                  필요한 연관 항목도 서버가 함께 표시할 수 있습니다.
                </Notice>
                <div className="sf-field">
                  <label htmlFor="return-stage">
                    돌아갈 단계 <span className="required">필수</span>
                  </label>
                  <select
                    id="return-stage"
                    value={draft.targetStage}
                    onChange={(event) =>
                      setDraft({ ...draft, targetStage: Number(event.target.value) })
                    }
                  >
                    {(procedure.stage === 3 ? [2, 1] : procedure.stage === 4 ? [3] : [1]).map(
                      (stage) => (
                        <option key={stage} value={stage}>
                          {stage}단계 ·{' '}
                          {stage === 1 ? '작성' : stage === 2 ? '담당자 협의' : '사용자 최종 검토'}
                        </option>
                      ),
                    )}
                  </select>
                </div>
                <fieldset className="return-fields">
                  <legend>
                    보완 필요 항목 <span className="required">1개 이상 필수</span>
                  </legend>
                  {[
                    ...procedure.answers.map((answer) => ({
                      key: answer.key,
                      label: answer.label,
                    })),
                    ...(procedure.documentType === 'FIREWALL'
                      ? [{ key: 'network', label: '통신 규칙 · 서버/IP/포트' }]
                      : []),
                  ].map((field) => (
                    <label className="check-label" key={field.key}>
                      <input
                        type="checkbox"
                        checked={draft.fieldKeys.includes(field.key)}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            fieldKeys: event.target.checked
                              ? [...draft.fieldKeys, field.key]
                              : draft.fieldKeys.filter((key) => key !== field.key),
                          })
                        }
                      />
                      {field.label}
                    </label>
                  ))}
                </fieldset>
              </>
            ) : null}
            {requiresReason ? (
              <div className="sf-field">
                <label htmlFor="workflow-reason">
                  {action === 'RETURN' ? '반환' : action === 'CLOSE' ? '종결' : '철회'} 사유{' '}
                  <span className="required">필수</span>
                </label>
                <textarea
                  id="workflow-reason"
                  rows={4}
                  maxLength={2000}
                  required
                  aria-invalid={Boolean(validation && !draft.reason.trim())}
                  value={draft.reason}
                  onChange={(event) => setDraft({ ...draft, reason: event.target.value })}
                  placeholder="필요한 보완 내용과 판단 근거를 구체적으로 작성해 주세요."
                />
              </div>
            ) : action === 'SUPPLEMENT' ? (
              <div className="sf-field">
                <label htmlFor="workflow-question">
                  확인할 질문 <span className="required">필수</span>
                </label>
                <textarea
                  id="workflow-question"
                  rows={4}
                  maxLength={2000}
                  value={draft.question}
                  onChange={(event) => setDraft({ ...draft, question: event.target.value })}
                />
              </div>
            ) : action === 'CONFIRM' ? (
              <Notice>
                정보보안·ICT인프라 양측이 현재 제출본을 최종 확인한 뒤 서류를 확정합니다. 방화벽
                장비에는 적용하지 않습니다.
              </Notice>
            ) : action === 'START_REVIEW' ? (
              <Notice>현재 수정본의 {ROLE_LABELS[user.role]} 검토 시작을 기록합니다.</Notice>
            ) : (
              <>
                <Notice>
                  {action === 'ALLOCATE'
                    ? '서버·IP·포트 등의 할당 정보를 확인했습니다. 정보보안 검토가 가능해지며 협의 완료는 별도로 기록합니다.'
                    : '현재 수정본의 담당 분야 확인을 기록합니다. 이후 내용이 바뀌면 다시 확인해야 합니다.'}
                </Notice>
                <div className="sf-field">
                  <label htmlFor="workflow-comment">확인 의견</label>
                  <textarea
                    id="workflow-comment"
                    maxLength={2000}
                    rows={3}
                    value={draft.comment}
                    onChange={(event) => setDraft({ ...draft, comment: event.target.value })}
                  />
                </div>
              </>
            )}
            {(action === 'CLOSE' || action === 'WITHDRAW') && (
              <Notice>
                이 신청은 종료 후 읽기전용으로 보관됩니다. 사유와 기존 값·이력을 유지합니다.
              </Notice>
            )}
            <div className="dialog-actions">
              <button className="button" type="button" onClick={() => setAction(undefined)}>
                돌아가기
              </button>
              <button
                className={`button ${action === 'CLOSE' || action === 'WITHDRAW' ? 'danger' : 'primary'}`}
                type="button"
                disabled={mutation.isPending}
                onClick={() => void apply()}
              >
                {mutation.isPending
                  ? '서버 확인 중…'
                  : action === 'RETURN'
                    ? `${draft.targetStage}단계로 반환`
                    : action
                      ? ACTIONS[action][0]
                      : '확인'}
              </button>
            </div>
          </Modal>
        </>
      )}
    </div>
  );
}
/** 자기 분야의 질문 편집과 협의 동작을 같은 패널에서 제공한다. */
export function ReviewPanel({
  procedure,
  role,
}: {
  procedure: SecurityRequest;
  role: 'SECURITY' | 'INFRA';
}) {
  const { user } = useSession();
  return (
    <section className="sf-panel review-panel">
      <div className="review-title">
        <Icon name={role === 'INFRA' ? 'server' : 'shield'} width={28} />
        <div>
          <h2>{ROLE_LABELS[role]} 검토</h2>
          <p>{procedure.stage === 4 ? '제출본 최종 확인' : '2단계 · 담당자 협의'}</p>
        </div>
      </div>
      <ReviewProgress procedure={procedure} />
      {user.role === role ? (
        <>
          {procedure.stage === 2 && <AnswerEditor procedure={procedure} compact />}
          <WorkflowActions procedure={procedure} />
        </>
      ) : (
        <Notice>{ROLE_LABELS[role]} 역할에서 담당 분야를 작성할 수 있습니다.</Notice>
      )}
    </section>
  );
}
/** 신청자가 확인한 경우에만 제출을 요청하고 재시도에 같은 멱등 키를 사용한다. */
export function SubmitPanel({ procedure }: { procedure: SecurityRequest }) {
  const mutation = useRequestMutation(procedure.id);
  const [confirmed, setConfirmed] = useState(false);
  const [open, setOpen] = useState(false);
  const key = useRef<string | undefined>(undefined);
  async function submit() {
    key.current ??= crypto.randomUUID();
    try {
      await mutation.mutateAsync({
        endpoint: '/submit',
        body: { expectedRevision: procedure.revision },
        idempotencyKey: key.current,
      });
      key.current = undefined;
      setOpen(false);
    } catch {
      /* 입력과 멱등 키를 보존한다. */
    }
  }
  return (
    <section className="sf-panel review-panel">
      <div className="review-title">
        <Icon name="check" />
        <div>
          <h2>
            {procedure.stage === 3
              ? '사용자 최종 검토'
              : procedure.stage === 4
                ? '확정·관리'
                : '담당자 협의 현황'}
          </h2>
          <p>
            {procedure.stage === 3
              ? 'AI 최종 초안도 아직 미확정입니다.'
              : '현재 수정본에 대한 서버 확인 상태'}
          </p>
        </div>
      </div>
      <ReviewProgress procedure={procedure} />
      <ErrorNotice error={!open ? mutation.error : undefined} />
      {procedure.blockers.length > 0 && (
        <Notice>
          <strong>다음 단계 전 확인할 내용</strong>
          <ul className="notes-list">
            {procedure.blockers.map((blocker, index) => (
              <li key={`${index}-${blocker}`}>{blocker}</li>
            ))}
          </ul>
        </Notice>
      )}
      {procedure.stage === 3 && (
        <>
          <label className="check-label">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={!procedure.allowedActions.includes('SUBMIT')}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            AI 보완 내용·출처·통신 정보를 직접 검토했으며 제출본으로 확정합니다.
          </label>
          <button
            className="button primary full"
            type="button"
            disabled={
              !confirmed || !procedure.allowedActions.includes('SUBMIT') || mutation.isPending
            }
            onClick={() => setOpen(true)}
          >
            최종 확인 후 제출
            <Icon name="arrow" />
          </button>
        </>
      )}
      <WorkflowActions procedure={procedure} />
      <p className="role-caption">서류 확정과 실제 방화벽 적용은 별도입니다.</p>
      <Modal open={open} title="제출본 확정 확인" onClose={() => setOpen(false)}>
        <ErrorNotice error={mutation.error} />
        <p>
          {procedure.title} · 수정본 v{procedure.revision}
        </p>
        <Notice>
          제출 시점의 값·출처를 보관하고 4단계에서 정보보안·ICT인프라 양측이 최종 확인합니다.
          반환되면 기존 제출본을 보존한 채 보완합니다.
        </Notice>
        <div className="dialog-actions">
          <button className="button" type="button" onClick={() => setOpen(false)}>
            다시 검토
          </button>
          <button
            className="button primary"
            type="button"
            disabled={mutation.isPending}
            onClick={() => void submit()}
          >
            {mutation.isPending ? '제출 확인 중…' : '확인한 내용 제출'}
          </button>
        </div>
      </Modal>
    </section>
  );
}
/** 합성 시안에서는 같은 업무 상태를 보여 주되 서버 쓰기 동작을 제공하지 않는다. */
export function PreviewReview({ procedure, role }: { procedure: SecurityRequest; role: Role }) {
  return (
    <section className="sf-panel review-panel">
      <div className="review-title">
        <Icon name={role === 'INFRA' ? 'server' : role === 'APPLICANT' ? 'check' : 'shield'} />
        <div>
          <h2>
            {procedure.stage === 3
              ? '사용자 최종 검토'
              : procedure.stage === 4
                ? '확정·관리'
                : `${ROLE_LABELS[role]} 검토`}
          </h2>
          <p>합성 데이터 · 읽기전용</p>
        </div>
      </div>
      <ReviewProgress procedure={procedure} />
      <Notice>
        {procedure.stage === 3
          ? 'AI가 보완한 최종 초안도 미확정입니다. 내용과 근거를 사람이 확인한 뒤 제출합니다.'
          : procedure.stage === 4
            ? '양측의 최종 검토 후 서류를 확정합니다. 장비 적용은 별도입니다.'
            : 'ICT인프라가 먼저 서버·IP·포트를 할당합니다. 할당 완료와 협의 완료는 별도입니다.'}
      </Notice>
      <label htmlFor="preview-comment">검토 의견</label>
      <textarea
        id="preview-comment"
        rows={4}
        readOnly
        value="공개 자료와 합성 서비스 범위를 검토합니다. 기관 내부 사실은 담당자가 확인해 주세요."
      />
      <button className="button primary full" disabled>
        {procedure.stage === 3
          ? '최종 확인 후 제출'
          : procedure.stage === 4
            ? '서류 확정'
            : '담당 분야 협의 완료'}
      </button>
      <button className="button full" disabled>
        이전 단계로 반환
      </button>
      <p className="role-caption">업무 변경은 로그인한 계정에서만 가능합니다.</p>
    </section>
  );
}
