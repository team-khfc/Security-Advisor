package kr.securityadvisor.request.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import kr.securityadvisor.common.entity.BaseTimeEntity;
import kr.securityadvisor.common.error.DomainException;
import kr.securityadvisor.common.model.OrganizationPolicy;
import kr.securityadvisor.common.security.Actor;
import kr.securityadvisor.common.security.Role;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/** 행 잠금과 자료 버전을 함께 사용하여 동시에 확인한 문서가 섞이지 않도록 한다. */
@Entity
@Table(name = "procedures")
public class SecurityRequest extends BaseTimeEntity {
  @Id private UUID id;

  @Column(name = "institution_id", nullable = false, updatable = false)
  private UUID institutionId;

  @Column(name = "owner_id", nullable = false, updatable = false)
  private UUID ownerId;

  @Column(name = "owner_name", nullable = false, length = 100, updatable = false)
  private String ownerName;

  @Column(nullable = false, length = 160)
  private String title;

  @Enumerated(EnumType.STRING)
  @Column(name = "document_type", nullable = false, length = 32)
  private DocumentType documentType;

  @Column(nullable = false, length = 100)
  private String department;

  @Column(nullable = false, columnDefinition = "text")
  private String description;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false, length = 32)
  private SecurityRequestStatus status;

  @Column(nullable = false)
  private long revision;

  @Version
  @Column(name = "lock_version", nullable = false)
  private long lockVersion;

  @Column(name = "policy_version", nullable = false, updatable = false)
  private long policyVersion;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(nullable = false, columnDefinition = "jsonb", updatable = false)
  private OrganizationPolicy policy;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(nullable = false, columnDefinition = "jsonb")
  private SecurityRequestData data;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(nullable = false, columnDefinition = "jsonb")
  private RequestWorkflow workflow = RequestWorkflow.initial();

  protected SecurityRequest() {}

  /** 새 신청은 게시된 정책의 복사본과 작성자 소유권을 함께 갖는다. */
  public SecurityRequest(
      UUID id,
      UUID institutionId,
      UUID ownerId,
      String ownerName,
      String title,
      DocumentType documentType,
      String department,
      String description,
      long policyVersion,
      OrganizationPolicy policy,
      SecurityRequestData data) {
    this.id = id;
    this.institutionId = institutionId;
    this.ownerId = ownerId;
    this.ownerName = ownerName;
    this.title = title;
    this.documentType = documentType;
    this.department = department;
    this.description = description;
    this.policyVersion = policyVersion;
    this.policy = policy;
    this.data = data;
    this.status = SecurityRequestStatus.DRAFT;
  }

  /** 중요한 내용 변경은 별도 자료 버전을 증가시킨다. */
  private void replaceContent(SecurityRequestData nextData) {
    requireContentMutable();
    data = nextData;
    revision++;
  }

  /** 검토·접수 이력은 검토 대상의 내용 버전을 변경하지 않는다. */
  private void recordProgress(SecurityRequestData nextData) {
    requireActive();
    data = nextData;
    revision++;
  }

  /** 작성 단계에서 필수 설명의 사람 확인을 마친 뒤에만 협의를 시작한다. */
  public void openConsultation(Actor actor, SecurityRequestData nextData) {
    checkActor(actor);
    requireRole(actor, Role.APPLICANT);
    requireStage(1);
    reject(WorkflowRules.consultationBlockers(this), "CONSULTATION_BLOCKED");
    status = SecurityRequestStatus.COLLABORATING;
    changeWorkflow(
        2,
        workflow.allocation(),
        workflow.finalReviews(),
        workflow.returnItems(),
        workflow.assignments(),
        null,
        workflow.submissionVersion());
    replaceContent(nextData);
  }

  /** 양 분야 협의와 최종 사람 확인을 모두 통과한 새 제출 차수를 만든다. */
  public void submit(Actor actor, SecurityRequestData nextData) {
    checkActor(actor);
    requireRole(actor, Role.APPLICANT);
    requireActive();
    reject(WorkflowRules.submissionBlockers(this), "SUBMISSION_BLOCKED");
    requireStage(3);
    status = SecurityRequestStatus.SUBMITTED;
    data = nextData;
    revision++;
    changeWorkflow(
        4,
        workflow.allocation(),
        RequestWorkflow.pendingReviews(),
        workflow.returnItems(),
        workflow.assignments(),
        null,
        workflow.submissionVersion() + 1);
  }

  /** 두 담당 분야가 제출본을 최종 검토한 뒤에만 서류 확정을 기록한다. */
  public void confirmDocument(Actor actor, SecurityRequestData nextData) {
    checkActor(actor);
    if (actor.role() != Role.INFRA && actor.role() != Role.SECURITY) {
      throw new DomainException(403, "SPECIALIST_REQUIRED", "전문 담당자가 문서를 확정해야 합니다.");
    }
    requireStage(4);
    if ((status != SecurityRequestStatus.SUBMITTED && status != SecurityRequestStatus.RECEIVED)
        || !complete(workflow.finalReviews(), Role.INFRA)
        || !complete(workflow.finalReviews(), Role.SECURITY)) {
      throw conflict("FINAL_REVIEWS_REQUIRED", "양 분야의 최종 검토 후 서류를 확정할 수 있습니다.");
    }
    status = SecurityRequestStatus.CONFIRMED;
    data = nextData;
    revision++;
  }

  /** 서버 세션의 기관·소유자·분야 배정을 모든 쓰기 전에 확인한다. */
  public void checkActor(Actor actor) {
    if (actor == null
        || !institutionId.equals(actor.institutionId())
        || actor.role() == Role.ADMIN
        || (actor.role() == Role.APPLICANT && !ownerId.equals(actor.userId()))) {
      throw new DomainException(404, "REQUEST_NOT_FOUND", "열람할 수 있는 신청을 찾지 못했습니다.");
    }
    if (actor.role() != Role.APPLICANT) {
      if (getStage() == 1
          && data.timeline().stream()
              .noneMatch(item -> item.action().equals("CONSULTATION_REQUESTED"))) {
        throw new DomainException(404, "REQUEST_NOT_FOUND", "열람할 수 있는 신청을 찾지 못했습니다.");
      }
      if (workflow.assignments().stream()
          .anyMatch(
              item -> item.role() == actor.role() && !item.actorId().equals(actor.userId()))) {
        throw new DomainException(404, "REQUEST_NOT_FOUND", "배정 범위에 없는 신청입니다.");
      }
    }
  }

  /** 종결·철회 뒤에는 멱등 재호출을 포함한 모든 쓰기를 거절한다. */
  public void requireActive() {
    if (status == SecurityRequestStatus.CLOSED || status == SecurityRequestStatus.WITHDRAWN) {
      throw conflict("REQUEST_TERMINATED", "종결·철회된 신청은 조회만 가능합니다.");
    }
  }

  /** 최신 자료 버전을 확인하지 않은 요청은 기존 입력을 보존하고 거절한다. */
  public void checkRevision(long expectedRevision) {
    if (revision != expectedRevision) {
      throw conflict("REVISION_CONFLICT", "다른 작업에서 내용이 바뀌었습니다. 최신 내용과 비교해 주세요.");
    }
  }

  /** 질문 입력은 현재 차수와 역할 및 INFRA 선행 할당 조건을 따른다. */
  public void checkContentActor(Actor actor) {
    checkActor(actor);
    requireContentMutable();
    if ((getStage() == 1 || getStage() == 3) && actor.role() != Role.APPLICANT) {
      throw conflict("APPLICANT_STAGE", "이 단계의 내용은 신청자가 검토하며 기술정보는 협의 단계에서 수정합니다.");
    }
    if (getStage() == 2
        && actor.role() == Role.SECURITY
        && !workflow.allocation().status().equals("COMPLETE")) {
      throw conflict("ALLOCATION_REQUIRED", "INFRA 자원 할당 완료 후 정보보안 검토를 진행할 수 있습니다.");
    }
  }

  /** 첫 담당 업무 수행자를 분야별로 서버에서 배정한다. */
  public void assign(Actor actor) {
    checkActor(actor);
    requireActive();
    if (actor.role() == Role.APPLICANT
        || workflow.assignments().stream().anyMatch(item -> item.role() == actor.role())) return;
    List<RequestWorkflow.Assignment> assigned = new ArrayList<>(workflow.assignments());
    assigned.add(new RequestWorkflow.Assignment(actor.role(), actor.userId(), actor.displayName()));
    changeWorkflow(
        getStage(),
        workflow.allocation(),
        workflow.finalReviews(),
        workflow.returnItems(),
        assigned,
        workflow.terminalReason(),
        workflow.submissionVersion());
  }

  /** 기존 답변·출처를 유지하면서 해당 내용에 의존하는 검토만 무효화한다. */
  public void edit(Actor actor, SecurityRequestData nextData, Set<String> changedFields) {
    checkContentActor(actor);
    Set<String> semanticChanges = new LinkedHashSet<>();
    if (nextData.answers().size() != data.answers().size()) {
      throw new DomainException(422, "INVALID_ANSWER_SET", "신청 시점에 고정된 질문을 보존해야 합니다.");
    }
    for (SecurityRequestData.Answer answer : nextData.answers()) {
      SecurityRequestData.Answer old =
          data.answers().stream()
              .filter(item -> item.key().equals(answer.key()))
              .findFirst()
              .orElseThrow(() -> new DomainException(422, "UNKNOWN_QUESTION", "이 신청에 없는 질문입니다."));
      if (!answer.equals(old) || changedFields.contains(answer.key())) {
        if (old.ownerRole() != actor.role() || answer.ownerRole() != old.ownerRole()) {
          throw new DomainException(403, "FIELD_OWNER_REQUIRED", "담당 역할의 질문만 입력·확인할 수 있습니다.");
        }
        if (!answer.value().equals(old.value())) semanticChanges.add(answer.key());
      }
    }
    if (!nextData.rules().equals(data.rules())) {
      requireRole(actor, Role.INFRA);
      // 행 내용이 같고 확인 메타데이터만 갱신된 경우 기존 협의는 유지한다.
      if (!sameNetworkValues(nextData.rules(), data.rules())) semanticChanges.add("network");
    }
    assign(actor);
    Set<Role> affectedRoles =
        new LinkedHashSet<>(WorkflowRules.affectedRoles(this, semanticChanges));
    for (SecurityRequestData.Supplement supplement : nextData.supplements()) {
      if (changedFields.contains("supplement:" + supplement.id())) {
        affectedRoles.add(supplement.requestedByRole());
      }
    }
    List<SecurityRequestData.Review> reviews =
        WorkflowRules.invalidateReviews(data.reviews(), affectedRoles);
    RequestWorkflow.Allocation allocation = workflow.allocation();
    if (WorkflowRules.affectsAllocation(this, semanticChanges)) {
      allocation = invalidateAllocation(allocation);
    }
    List<RequestWorkflow.ReturnItem> returned =
        workflow.returnItems().stream()
            .map(
                item ->
                    item.status().equals("OPEN")
                            && changedFields.contains(item.fieldKey())
                            && fieldResolved(nextData, item.fieldKey())
                        ? item.resolve(Instant.now())
                        : item)
            .toList();
    changeWorkflow(
        getStage(),
        allocation,
        workflow.finalReviews(),
        returned,
        workflow.assignments(),
        null,
        workflow.submissionVersion());
    invalidateFinalDraft();
    replaceContent(
        new SecurityRequestData(
            nextData.answers(),
            nextData.rules(),
            reviews,
            nextData.supplements(),
            nextData.timeline()));
  }

  /** 자원 할당만 완료하고 INFRA 협의 완료는 별도로 남겨 둔다. */
  public void allocate(Actor actor, String comment, SecurityRequestData.Event event) {
    checkActor(actor);
    requireStage(2);
    requireRole(actor, Role.INFRA);
    reject(WorkflowRules.allocationBlockers(this), "ALLOCATION_BLOCKED");
    requireComment(comment);
    assign(actor);
    changeWorkflow(
        2,
        new RequestWorkflow.Allocation(
            "COMPLETE", revision + 1, comment.strip(), actor.displayName(), Instant.now()),
        workflow.finalReviews(),
        workflow.returnItems(),
        workflow.assignments(),
        null,
        workflow.submissionVersion());
    recordProgress(withEvent(event));
  }

  /** 검토 컨텍스트의 불변 결정을 반영하며 차수·선행 할당 조건은 다시 확인한다. */
  public void acceptReview(
      Actor actor,
      SecurityRequestData.Review decision,
      boolean finalReview,
      SecurityRequestData.Event event) {
    checkActor(actor);
    requireStage(finalReview ? 4 : 2);
    if (actor.role() != Role.INFRA && actor.role() != Role.SECURITY) {
      throw new DomainException(403, "SPECIALIST_REQUIRED", "담당 분야만 검토할 수 있습니다.");
    }
    if (decision.role() != actor.role()) {
      throw new DomainException(403, "REVIEW_ROLE_MISMATCH", "세션의 담당 분야와 검토 분야가 다릅니다.");
    }
    if (!Set.of("IN_PROGRESS", "COMPLETE").contains(decision.status())) {
      throw new DomainException(422, "INVALID_REVIEW_DECISION", "허용되지 않은 검토 결정입니다.");
    }
    if (decision.status().equals("COMPLETE")) requireComment(decision.comment());
    List<SecurityRequestData.Review> existing =
        finalReview ? workflow.finalReviews() : data.reviews();
    if (existing.stream()
        .anyMatch(item -> item.role() == actor.role() && item.status().equals("COMPLETE"))) {
      throw conflict("REVIEW_ALREADY_COMPLETE", "이미 완료한 분야 검토입니다. 반환 후 재검토할 수 있습니다.");
    }
    if (status == SecurityRequestStatus.CONFIRMED) {
      throw conflict("DOCUMENT_CONFIRMED", "확정된 서류는 반환 절차를 거쳐 재검토해야 합니다.");
    }
    if (!finalReview
        && actor.role() == Role.SECURITY
        && !workflow.allocation().status().equals("COMPLETE")) {
      throw conflict("ALLOCATION_REQUIRED", "INFRA 할당 완료 후 정보보안 검토가 가능합니다.");
    }
    if (!finalReview && decision.status().equals("COMPLETE")) {
      reject(WorkflowRules.reviewBlockers(this, actor.role()), "REVIEW_BLOCKED");
    }
    assign(actor);
    if (finalReview) {
      List<SecurityRequestData.Review> changed = replaceReview(workflow.finalReviews(), decision);
      changeWorkflow(
          4,
          workflow.allocation(),
          changed,
          workflow.returnItems(),
          workflow.assignments(),
          null,
          workflow.submissionVersion());
      recordProgress(withEvent(event));
    } else {
      List<SecurityRequestData.Review> changed = replaceReview(data.reviews(), decision);
      SecurityRequestData next = withEvent(event);
      recordProgress(
          new SecurityRequestData(
              next.answers(), next.rules(), changed, next.supplements(), next.timeline()));
      if (complete(changed, Role.INFRA) && complete(changed, Role.SECURITY)) {
        status = SecurityRequestStatus.FINAL_REVIEW;
        changeWorkflow(
            3,
            workflow.allocation(),
            workflow.finalReviews(),
            workflow.returnItems(),
            workflow.assignments(),
            null,
            workflow.submissionVersion());
      }
    }
  }

  /** 허용된 네 경로로만 반환하며 지정 값과 모든 원본 이력을 그대로 보존한다. */
  public void returnTo(
      Actor actor,
      int targetStage,
      String reason,
      List<String> fieldKeys,
      SecurityRequestData.Event event) {
    checkActor(actor);
    requireActive();
    int from = getStage();
    boolean valid =
        (from == 2 && targetStage == 1)
            || (from == 3 && (targetStage == 1 || targetStage == 2))
            || (from == 4 && targetStage == 3);
    if (!valid) throw conflict("INVALID_RETURN_PATH", "허용된 차수 반환 경로가 아닙니다.");
    if ((from == 3) != (actor.role() == Role.APPLICANT)) {
      throw new DomainException(403, "RETURN_ROLE_REQUIRED", "현재 단계의 담당 주체만 반환할 수 있습니다.");
    }
    requireComment(reason);
    if (fieldKeys == null
        || fieldKeys.isEmpty()
        || fieldKeys.size() > 100
        || new LinkedHashSet<>(fieldKeys).size() != fieldKeys.size()) {
      throw new DomainException(422, "RETURN_FIELDS_REQUIRED", "보완할 항목을 중복 없이 선택해 주세요.");
    }
    Set<String> known =
        new LinkedHashSet<>(data.answers().stream().map(SecurityRequestData.Answer::key).toList());
    if (documentType == DocumentType.FIREWALL) known.add("network");
    if (!known.containsAll(fieldKeys)) {
      throw new DomainException(422, "UNKNOWN_RETURN_FIELD", "이 신청에 없는 항목은 반환할 수 없습니다.");
    }
    Set<String> affected = WorkflowRules.affectedFields(this, Set.copyOf(fieldKeys));
    List<RequestWorkflow.ReturnItem> returned = new ArrayList<>(workflow.returnItems());
    if (returned.size() + affected.size() > 1000) {
      throw new DomainException(422, "RETURN_LIMIT", "반환 이력 한도에 도달했습니다.");
    }
    Instant now = Instant.now();
    for (String key : affected) {
      returned.add(
          new RequestWorkflow.ReturnItem(
              UUID.randomUUID(),
              key,
              key.equals("network")
                  ? "통신 규칙"
                  : data.answers().stream()
                      .filter(answer -> answer.key().equals(key))
                      .findFirst()
                      .orElseThrow()
                      .label(),
              reason.strip(),
              from,
              targetStage,
              "OPEN",
              actor.role(),
              actor.displayName(),
              now,
              null,
              !fieldKeys.contains(key),
              previousValue(key)));
    }
    Set<Role> roles = WorkflowRules.affectedRoles(this, affected);
    RequestWorkflow.Allocation allocation = workflow.allocation();
    if (targetStage <= 2 && WorkflowRules.affectsAllocation(this, affected)) {
      allocation = invalidateAllocation(allocation);
    }
    List<SecurityRequestData.Review> reviews =
        targetStage <= 2 ? WorkflowRules.invalidateReviews(data.reviews(), roles) : data.reviews();
    List<SecurityRequestData.Review> finalReviews =
        from == 4
            ? WorkflowRules.invalidateReviews(workflow.finalReviews(), roles)
            : workflow.finalReviews();
    assign(actor);
    changeWorkflow(
        targetStage,
        allocation,
        finalReviews,
        returned,
        workflow.assignments(),
        null,
        workflow.submissionVersion());
    invalidateFinalDraft();
    status =
        targetStage == 1
            ? SecurityRequestStatus.DRAFT
            : targetStage == 2
                ? SecurityRequestStatus.COLLABORATING
                : SecurityRequestStatus.FINAL_REVIEW;
    SecurityRequestData next = withEvent(event);
    data =
        new SecurityRequestData(
            next.answers(), next.rules(), reviews, next.supplements(), next.timeline());
    revision++;
  }

  /** 종결·철회 사유를 남기고 이후 모든 상태 변경과 AI 적용을 차단한다. */
  public void terminate(
      Actor actor, boolean withdraw, String reason, SecurityRequestData.Event event) {
    checkActor(actor);
    requireActive();
    if (withdraw != (actor.role() == Role.APPLICANT)) {
      throw new DomainException(403, "TERMINATION_ROLE_REQUIRED", "종결·철회 담당 역할이 아닙니다.");
    }
    requireComment(reason);
    assign(actor);
    changeWorkflow(
        getStage(),
        workflow.allocation(),
        workflow.finalReviews(),
        workflow.returnItems(),
        workflow.assignments(),
        reason.strip(),
        workflow.submissionVersion());
    data = withEvent(event);
    status = withdraw ? SecurityRequestStatus.WITHDRAWN : SecurityRequestStatus.CLOSED;
    revision++;
  }

  /** 최종 AI 초안도 새로 생성될 때마다 미확정 상태로 저장한다. */
  public void registerFinalDraft(
      Actor actor,
      UUID analysisId,
      String summary,
      String evidence,
      SecurityRequestData.Event event) {
    checkActor(actor);
    requireStage(3);
    requireRole(actor, Role.APPLICANT);
    if (analysisId == null
        || summary == null
        || summary.isBlank()
        || summary.length() > 20000
        || evidence == null
        || evidence.isBlank()
        || evidence.length() > 12000) {
      throw new DomainException(422, "FINAL_DRAFT_EVIDENCE_REQUIRED", "최종 초안과 생성 근거가 필요합니다.");
    }
    workflow =
        new RequestWorkflow(
            getStage(),
            workflow.allocation(),
            workflow.finalReviews(),
            workflow.returnItems(),
            workflow.assignments(),
            null,
            workflow.submissionVersion(),
            new RequestWorkflow.FinalDraft(
                analysisId, summary, evidence, "AI_INFERRED", false, null));
    recordProgress(withEvent(event));
  }

  /** 현재 생성본을 신청자가 확인해야 AI 보완분의 제출 제한을 해제한다. */
  public void confirmFinalDraft(Actor actor, UUID analysisId, SecurityRequestData.Event event) {
    checkActor(actor);
    requireStage(3);
    requireRole(actor, Role.APPLICANT);
    RequestWorkflow.FinalDraft draft = workflow.finalDraft();
    if (draft == null || !draft.analysisId().equals(analysisId)) {
      throw conflict("FINAL_DRAFT_CHANGED", "현재 최종 초안을 다시 확인해 주세요.");
    }
    workflow =
        new RequestWorkflow(
            getStage(),
            workflow.allocation(),
            workflow.finalReviews(),
            workflow.returnItems(),
            workflow.assignments(),
            null,
            workflow.submissionVersion(),
            new RequestWorkflow.FinalDraft(
                draft.analysisId(),
                draft.summary(),
                draft.evidence(),
                draft.source(),
                true,
                new SecurityRequestData.Confirmation(
                    actor.displayName(), actor.role(), Instant.now())));
    recordProgress(withEvent(event));
  }

  /** 현재 답변은 유지하며 감사 이벤트 한 건을 불변 목록에 추가한다. */
  public SecurityRequestData withEvent(SecurityRequestData.Event event) {
    if (data.timeline().size() >= 1000) {
      throw new DomainException(422, "HISTORY_LIMIT", "신청 이력 한도에 도달했습니다.");
    }
    List<SecurityRequestData.Event> events = new ArrayList<>(data.timeline());
    events.add(event);
    return new SecurityRequestData(
        data.answers(), data.rules(), data.reviews(), data.supplements(), events);
  }

  public int getStage() {
    return workflow.stage();
  }

  public RequestWorkflow getWorkflow() {
    return workflow;
  }

  private void requireContentMutable() {
    requireActive();
    if (getStage() == 4) {
      throw conflict("SUBMISSION_LOCKED", "제출한 내용은 반환 절차를 거쳐 수정할 수 있습니다.");
    }
  }

  private void requireStage(int stage) {
    requireActive();
    if (getStage() != stage) throw conflict("INVALID_STAGE", "현재 차수에서 수행할 수 없는 작업입니다.");
  }

  private static void requireRole(Actor actor, Role role) {
    if (actor.role() != role) {
      throw new DomainException(403, "ROLE_REQUIRED", "해당 분야의 담당 역할이 필요합니다.");
    }
  }

  private static void requireComment(String comment) {
    if (comment == null || comment.isBlank() || comment.length() > 2000) {
      throw new DomainException(422, "REASON_REQUIRED", "사유 또는 검토 의견을 1~2000자로 입력해 주세요.");
    }
  }

  private static boolean complete(List<SecurityRequestData.Review> reviews, Role role) {
    return reviews.stream()
        .anyMatch(
            review ->
                review.role() == role
                    && review.status().equals("COMPLETE")
                    && review.revision() != null);
  }

  private static List<SecurityRequestData.Review> replaceReview(
      List<SecurityRequestData.Review> reviews, SecurityRequestData.Review decision) {
    List<SecurityRequestData.Review> changed =
        new ArrayList<>(
            reviews.stream().filter(review -> review.role() != decision.role()).toList());
    changed.add(decision);
    return List.copyOf(changed);
  }

  private String previousValue(String key) {
    if (!key.equals("network")) {
      return data.answers().stream()
          .filter(answer -> answer.key().equals(key))
          .findFirst()
          .orElseThrow()
          .value();
    }
    return String.join(
        "\n",
        data.rules().stream()
            .map(
                rule ->
                    rule.sourceName()
                        + " ("
                        + rule.sourceIp()
                        + ") → "
                        + rule.destinationName()
                        + " ("
                        + rule.destinationIp()
                        + "), "
                        + rule.protocol()
                        + "/"
                        + rule.port()
                        + ", "
                        + rule.direction()
                        + ", "
                        + rule.startsOn()
                        + " ~ "
                        + rule.endsOn()
                        + ", "
                        + rule.purpose())
            .toList());
  }

  private static boolean fieldResolved(SecurityRequestData next, String key) {
    if (key.equals("network"))
      return !next.rules().isEmpty()
          && next.rules().stream()
              .allMatch(rule -> rule.source() != null && rule.confirmation() != null);
    return next.answers().stream()
        .filter(answer -> answer.key().equals(key))
        .anyMatch(WorkflowRules::resolved);
  }

  private static boolean sameNetworkValues(
      List<SecurityRequestData.NetworkRule> left, List<SecurityRequestData.NetworkRule> right) {
    if (left.size() != right.size()) return false;
    for (int index = 0; index < left.size(); index++) {
      SecurityRequestData.NetworkRule a = left.get(index);
      SecurityRequestData.NetworkRule b = right.get(index);
      if (!a.id().equals(b.id())
          || !a.sourceName().equals(b.sourceName())
          || !a.sourceIp().equals(b.sourceIp())
          || !a.destinationName().equals(b.destinationName())
          || !a.destinationIp().equals(b.destinationIp())
          || !a.port().equals(b.port())
          || !a.protocol().equals(b.protocol())
          || !a.direction().equals(b.direction())
          || !a.startsOn().equals(b.startsOn())
          || !a.endsOn().equals(b.endsOn())
          || !a.purpose().equals(b.purpose())) return false;
    }
    return true;
  }

  private static RequestWorkflow.Allocation invalidateAllocation(RequestWorkflow.Allocation value) {
    return value.status().equals("PENDING")
        ? value
        : new RequestWorkflow.Allocation(
            "INVALIDATED", value.revision(), value.comment(), value.actorName(), value.at());
  }

  private void changeWorkflow(
      int stage,
      RequestWorkflow.Allocation allocation,
      List<SecurityRequestData.Review> finalReviews,
      List<RequestWorkflow.ReturnItem> returns,
      List<RequestWorkflow.Assignment> assignments,
      String terminalReason,
      int submissionVersion) {
    workflow =
        new RequestWorkflow(
            stage,
            allocation,
            finalReviews,
            returns,
            assignments,
            terminalReason,
            submissionVersion,
            workflow.finalDraft());
  }

  private void invalidateFinalDraft() {
    RequestWorkflow.FinalDraft draft = workflow.finalDraft();
    if (draft != null && draft.confirmed()) {
      workflow =
          new RequestWorkflow(
              getStage(),
              workflow.allocation(),
              workflow.finalReviews(),
              workflow.returnItems(),
              workflow.assignments(),
              workflow.terminalReason(),
              workflow.submissionVersion(),
              new RequestWorkflow.FinalDraft(
                  draft.analysisId(),
                  draft.summary(),
                  draft.evidence(),
                  draft.source(),
                  false,
                  null));
    }
  }

  private DomainException conflict(String code, String detail) {
    return new DomainException(409, code, detail, revision);
  }

  private static void reject(List<String> blockers, String code) {
    if (!blockers.isEmpty()) throw new DomainException(422, code, String.join(" ", blockers));
  }

  public UUID getId() {
    return id;
  }

  public UUID getInstitutionId() {
    return institutionId;
  }

  public UUID getOwnerId() {
    return ownerId;
  }

  public String getOwnerName() {
    return ownerName;
  }

  public String getTitle() {
    return title;
  }

  public DocumentType getDocumentType() {
    return documentType;
  }

  public String getDepartment() {
    return department;
  }

  public String getDescription() {
    return description;
  }

  public SecurityRequestStatus getStatus() {
    return status;
  }

  public long getRevision() {
    return revision;
  }

  public long getPolicyVersion() {
    return policyVersion;
  }

  public OrganizationPolicy getPolicy() {
    return policy;
  }

  public SecurityRequestData getData() {
    return data;
  }
}
