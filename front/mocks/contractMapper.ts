import type { Actor, Session } from '@/lib/types';
import { REVIEW_STATUS_LABELS, STATUS_LABELS } from '@/features/request/types';
import type {
  Answer,
  BusinessCase,
  SecurityRequest,
  AuditEvent,
  CaseAnalysis,
} from '@/features/request/types';

/** 모의 도메인의 식별자를 실제 API와 같은 숫자 식별자로 직렬화한다. */
export class ContractMapper {
  private identifiers = new Map<string, number>();
  id(value: string): number {
    let id = this.identifiers.get(value);
    if (id === undefined) {
      id = this.identifiers.size + 1;
      this.identifiers.set(value, id);
    }
    return id;
  }
  original(value: string): string {
    return [...this.identifiers].find(([, id]) => String(id) === value)?.[0] ?? value;
  }
  constructor(private members: () => Actor[]) {}
  username(value: string | null) {
    return this.members().find((m) => m.id === value)?.username ?? value;
  }
  member(m: Actor) {
    return {
      username: m.username,
      displayName: m.displayName,
      department: m.department,
      email: null,
      role: m.role,
      active: m.active,
    };
  }
  session(s: Session) {
    return { ...this.member(s.member), expiresAt: s.expiresAt, mock: true };
  }
  answer(a: Answer, owner: string, revision: number) {
    return {
      answerId: this.id(`${owner}:${a.key}`),
      fieldKey: a.key,
      scope: a.scope,
      value: a.value,
      notApplicable: a.notApplicable,
      valueSource: a.source,
      evidence: a.evidence,
      confirmed: a.confirmed,
      confirmedBy:
        a.source === 'USER_ANSWER' ? null : this.username(a.confirmation?.actorId ?? null),
      confirmedAt: a.source === 'USER_ANSWER' ? null : (a.confirmation?.at ?? null),
      needsReview: a.needsReview ?? false,
      revision: a.revision ?? revision,
    };
  }
  businessCase(c: BusinessCase, requests: SecurityRequest[]) {
    return {
      businessCaseId: this.id(c.id),
      applicantUsername: this.username(c.ownerId),
      title: c.title,
      summary: c.description,
      department: c.department,
      publicationId: c.publicationVersion,
      knowledgePublicationId: c.knowledgePublicationId ?? 1,
      revision: c.revision,
      caseAnswers: c.answers.map((a) => this.answer(a, c.id, c.revision)),
      requests: requests.filter((r) => r.caseId === c.id).map((r) => this.summary(r)),
      progressSummary: '',
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    };
  }
  summary(r: SecurityRequest) {
    return {
      securityRequestId: this.id(r.id),
      businessCaseId: this.id(r.caseId),
      docType: r.docType,
      stage: r.stage,
      status:
        (
          { DRAFT: 'DRAFTING', CONSULTING: 'IN_REVIEW', FINALIZED: 'CONFIRMED' } as Record<
            string,
            string
          >
        )[r.status] ?? r.status,
      statusLabel: STATUS_LABELS[r.status],
      revision: r.revision,
      updatedAt: r.updatedAt,
    };
  }
  request(r: SecurityRequest) {
    return {
      ...this.summary(r),
      answers: r.answers.map((a) => this.answer(a, r.id, r.revision)),
      createdAt: r.createdAt,
    };
  }
  list(r: SecurityRequest) {
    return {
      ...this.summary(r),
      caseTitle: r.caseTitle,
      department: r.department,
      applicantUsername: this.username(r.ownerId),
    };
  }
  reviews(r: SecurityRequest) {
    return r.reviews.map((v) => ({
      reviewId: this.id(v.id),
      securityRequestId: this.id(r.id),
      field: v.field,
      status:
        (
          { PENDING: 'WAITING', IN_REVIEW: 'IN_PROGRESS', COMPLETE: 'COMPLETED' } as Record<
            string,
            string
          >
        )[v.status] ?? v.status,
      statusLabel: REVIEW_STATUS_LABELS[v.status],
      allocated: v.allocationCompleted,
      opinion: v.comment,
      completedBy: this.username(v.completedBy),
      completedAt: v.completedAt,
      revision: v.revision ?? r.revision,
      checklist: v.checklist ?? {},
    }));
  }
  assignments(r: SecurityRequest) {
    return r.assignments.map((v) => ({
      reassignmentReason: v.reassignmentReason ?? null,
      assignmentId: this.id(v.id),
      securityRequestId: this.id(r.id),
      field: v.field,
      assigneeUsername: this.username(v.assigneeId),
      active: v.active,
      reason: v.reason,
      assignedAt: v.assignedAt,
    }));
  }
  supplements(r: SecurityRequest) {
    return r.supplements.map((v) => ({
      supplementId: this.id(v.id),
      reviewId: this.id(r.reviews.find((review) => review.field === v.field)?.id ?? ''),
      securityRequestId: this.id(r.id),
      field: v.field,
      fieldKeys: v.fieldKeys,
      reason: v.reason,
      status: v.status,
      requestedBy: this.username(v.requestedBy),
      requestedAt: v.createdAt,
      answerNote: v.answer,
      answeredAt: v.answer ? v.createdAt : null,
      resolvedAt: v.resolvedAt,
      revision: v.revision ?? r.revision,
    }));
  }
  returns(r: SecurityRequest) {
    return r.returns.map((v) => ({
      stageReturnId: this.id(v.id),
      securityRequestId: this.id(r.id),
      fromStage: v.fromStage,
      toStage: v.targetStage,
      reason: v.reason,
      fieldKeys: v.fieldKeys,
      fieldReasons: v.fieldReasons ?? Object.fromEntries(v.fieldKeys.map((k) => [k, v.reason])),
      returnedBy: v.actorName,
      returnedAt: v.createdAt,
    }));
  }
  deadlines(r: SecurityRequest) {
    return r.deadlines.map((v) => ({
      deadlineId: this.id(v.id),
      securityRequestId: this.id(r.id),
      field: v.field,
      kind: (
        {
          CONSULTATION: 'REVIEW',
          SUPPLEMENT: 'SUPPLEMENT_RESPONSE',
          FINALIZATION: 'FINAL_CONFIRMATION',
        } as const
      )[v.kind],
      dueDate: v.dueAt.slice(0, 10),
      active: v.active,
      endedAt: v.closedAt,
      status: (
        { WITHIN: 'ON_TRACK', DUE_SOON: 'IMMINENT', OVERDUE: 'OVERDUE', CLOSED: 'ENDED' } as const
      )[v.timing],
      paused: false,
    }));
  }
  submissions(r: SecurityRequest) {
    return r.submissions.map((v) => ({
      submissionId: this.id(v.id),
      securityRequestId: this.id(r.id),
      publicationId: v.publicationVersion,
      sequenceNo: v.number,
      latest: v.id === r.currentSubmissionId,
      submittedBy: this.username(r.ownerId),
      submittedAt: v.createdAt,
      snapshot: {
        infrastructurePlan: (v.snapshot as { infrastructurePlan?: unknown } | undefined)
          ?.infrastructurePlan,
        ...(v.snapshot && typeof v.snapshot === 'object' ? v.snapshot : {}),
        answers: [
          ...v.commonAnswers.map((a) => this.answer(a, r.caseId, v.caseRevision)),
          ...v.answers.map((a) => this.answer(a, r.id, v.requestRevision)),
        ],
      },
    }));
  }
  confirmations(r: SecurityRequest) {
    return r.finalConfirmations.map((v) => ({
      finalConfirmationId: this.id(v.id),
      submissionId: this.id(v.submissionId),
      securityRequestId: this.id(r.id),
      field: v.field,
      confirmedBy: v.actorName,
      confirmedAt: v.confirmedAt,
    }));
  }
  audit(v: AuditEvent) {
    return {
      auditEventId: this.id(v.id),
      actorUsername: this.username(v.actorId),
      actorRole: v.actorRole,
      targetType:
        (
          { SecurityRequest: 'SECURITY_REQUEST', BusinessCase: 'BUSINESS_CASE' } as Record<
            string,
            string
          >
        )[v.targetType] ?? v.targetType,
      targetId: String(this.id(v.targetId)),
      targetRevision: v.targetRevision,
      action:
        (
          {
            CREATE_CASE: 'BUSINESS_CASE_CREATED',
            SAVE_CASE_ANSWERS: 'ANSWER_UPDATED',
            SAVE_ANSWERS: 'ANSWER_UPDATED',
            REQUEST_REVIEW: 'REVIEW_REQUESTED',
            COMPLETE_ALLOCATION: 'ALLOCATION_COMPLETED',
            COMPLETE_REVIEW: 'REVIEW_COMPLETED',
            REQUEST_SUPPLEMENT: 'SUPPLEMENT_REQUESTED',
            ANSWER_SUPPLEMENT: 'SUPPLEMENT_ANSWERED',
            RESOLVE_SUPPLEMENT: 'SUPPLEMENT_RESOLVED',
            RETURN: 'STAGE_RETURNED',
            SUBMIT: 'SUBMITTED',
            FINAL_CONFIRM: 'FINAL_CONFIRMED',
            FINALIZE: 'REQUEST_CONFIRMED',
            CLOSE: 'REQUEST_CLOSED',
            WITHDRAW: 'REQUEST_WITHDRAWN',
            REASSIGN: 'REASSIGNED',
          } as Record<string, string>
        )[v.action] ?? v.action,
      reason: v.reason,
      summary: v.fieldKeys.join(', '),
      requestId: v.requestId,
      occurredAt: v.createdAt,
    };
  }
  analysis(v: CaseAnalysis) {
    return {
      analysisJobId: this.id(v.id),
      businessCaseId: this.id(v.caseId),
      uploadedFileId: 0,
      status:
        v.status === 'SUCCEEDED' ? 'NEEDS_REVIEW' : v.status === 'FAILED' ? 'FAILED' : 'RUNNING',
      summary: v.suggestions.map((s) => s.value).join('\n'),
      modelReference: v.model,
      errorMessage: v.error,
    };
  }
  publication(cases: BusinessCase[], requests: SecurityRequest[], version = 1) {
    const fields = new Map<string, unknown>();
    for (const c of cases)
      for (const a of c.answers)
        fields.set(a.key, {
          key: a.key,
          label: a.label,
          type: a.inputType,
          hint: a.hint,
          scope: a.scope,
          docTypes: [],
          required: a.required,
          askRole: a.ownerRole,
        });
    for (const r of requests)
      for (const a of r.answers)
        fields.set(a.key, {
          key: a.key,
          label: a.label,
          scope: a.scope,
          docTypes: [],
          required: a.required,
          askRole: a.ownerRole,
        });
    return { publicationId: version, version, fieldSchema: { fields: [...fields.values()] } };
  }
}
