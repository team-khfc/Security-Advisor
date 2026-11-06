package kr.securityadvisor.request.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import kr.securityadvisor.common.error.DomainException;
import kr.securityadvisor.common.model.ModelConnection;
import kr.securityadvisor.common.model.OrganizationPolicy;
import kr.securityadvisor.common.security.Actor;
import kr.securityadvisor.common.security.Role;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

class SecurityRequestWorkflowTest {
  private static final Instant NOW = Instant.parse("2026-11-06T00:00:00Z");
  private final UUID institution = UUID.randomUUID();
  private final Actor applicant = actor(Role.APPLICANT);
  private final Actor infra = actor(Role.INFRA);
  private final Actor security = actor(Role.SECURITY);

  @ParameterizedTest
  @EnumSource(DocumentType.class)
  void allocationAllowsSecurityBeforeInfraConsultationButCannotReplaceBothReviews(
      DocumentType type) {
    SecurityRequest request = collaborating(type);
    assertThatThrownBy(() -> complete(request, security, false))
        .isInstanceOf(DomainException.class)
        .extracting("code")
        .isEqualTo("ALLOCATION_REQUIRED");
    request.allocate(infra, "합성 자원 범위를 확인했습니다.", event(infra, "ALLOCATION_COMPLETED"));
    assertThat(WorkflowRules.currentReview(request, Role.INFRA)).isFalse();
    fill(request, security);
    complete(request, security, false);
    assertThat(request.getStage()).isEqualTo(2);
    assertThat(WorkflowRules.submissionBlockers(request))
        .anyMatch(value -> value.contains("ICT인프라 협의"));
    assertThatThrownBy(() -> request.submit(applicant, request.getData()))
        .isInstanceOf(DomainException.class)
        .extracting("code")
        .isEqualTo("SUBMISSION_BLOCKED");
    complete(request, infra, false);
    assertThat(request.getStage()).isEqualTo(3);
    assertThat(request.getStatus()).isEqualTo(SecurityRequestStatus.FINAL_REVIEW);
  }

  @Test
  void securityFieldReturnPreservesUnrelatedInfraApprovalAllocationAndOriginalEvidence() {
    SecurityRequest request = ready(DocumentType.SECURITY_REVIEW);
    SecurityRequestData old = request.getData();
    String originalAccessControl =
        old.answers().stream()
            .filter(answer -> answer.key().equals("accessControl"))
            .findFirst()
            .orElseThrow()
            .value();
    RequestWorkflow.Allocation allocation = request.getWorkflow().allocation();
    request.returnTo(
        applicant, 2, "접근 통제 설명 보완", List.of("accessControl"), event(applicant, "RETURNED"));
    assertThat(request.getData().answers()).isEqualTo(old.answers());
    assertThat(request.getData().rules()).isEqualTo(old.rules());
    assertThat(request.getData().timeline()).containsAll(old.timeline());
    assertThat(request.getWorkflow().allocation()).isEqualTo(allocation);
    assertThat(WorkflowRules.currentReview(request, Role.INFRA)).isTrue();
    assertThat(WorkflowRules.currentReview(request, Role.SECURITY)).isFalse();
    assertThat(request.getWorkflow().returnItems())
        .singleElement()
        .satisfies(
            item -> {
              assertThat(item.fieldKey()).isEqualTo("accessControl");
              assertThat(item.status()).isEqualTo("OPEN");
              assertThat(item.affected()).isFalse();
              assertThat(item.previousValue()).isEqualTo(originalAccessControl);
            });
    editOne(request, security, "accessControl", "합성 접근 권한을 상세히 확인했습니다.");
    complete(request, security, false);
    assertThat(request.getStage()).isEqualTo(3);
    assertThat(request.getWorkflow().returnItems())
        .allMatch(item -> item.status().equals("RESOLVED"));
    assertThat(request.getWorkflow().returnItems())
        .singleElement()
        .satisfies(item -> assertThat(item.previousValue()).isEqualTo(originalAccessControl));
    assertThat(WorkflowRules.currentReview(request, Role.INFRA)).isTrue();
  }

  @Test
  void returnAddsOnlyConcreteDependentFieldsAndRetainsNetworkValues() {
    SecurityRequest request = ready(DocumentType.FIREWALL);
    var values = request.getData().answers();
    var rules = request.getData().rules();
    request.returnTo(
        applicant, 2, "정보 흐름과 연결 범위 보완", List.of("dataFlow"), event(applicant, "RETURNED"));
    assertThat(request.getWorkflow().returnItems())
        .extracting(RequestWorkflow.ReturnItem::fieldKey)
        .containsExactlyInAnyOrder("dataFlow", "network", "accessControl");
    assertThat(request.getWorkflow().returnItems())
        .filteredOn(item -> !item.affected())
        .extracting(RequestWorkflow.ReturnItem::fieldKey)
        .containsExactly("dataFlow");
    assertThat(request.getData().answers()).isEqualTo(values);
    assertThat(request.getData().rules()).isEqualTo(rules);
    assertThat(request.getWorkflow().allocation().status()).isEqualTo("INVALIDATED");
    assertThat(request.getWorkflow().returnItems())
        .filteredOn(item -> item.fieldKey().equals("network"))
        .singleElement()
        .satisfies(
            item -> {
              var rule = rules.getFirst();
              assertThat(item.previousValue())
                  .contains(
                      rule.sourceName(),
                      rule.sourceIp(),
                      rule.destinationName(),
                      rule.destinationIp(),
                      rule.protocol(),
                      rule.port(),
                      rule.startsOn().toString(),
                      rule.endsOn().toString(),
                      rule.purpose());
            });
  }

  @ParameterizedTest
  @EnumSource(DocumentType.class)
  void fourSupportedReturnPathsPreserveAllPriorValuesAndAdvanceNewSubmissionVersion(
      DocumentType type) {
    SecurityRequest secondToFirst = collaborating(type);
    var original = secondToFirst.getData();
    secondToFirst.returnTo(infra, 1, "목적 보완", List.of("purpose"), event(infra, "RETURNED"));
    assertThat(secondToFirst.getStage()).isEqualTo(1);
    assertThat(secondToFirst.getData().answers()).isEqualTo(original.answers());
    assertThat(secondToFirst.getData().rules()).isEqualTo(original.rules());
    secondToFirst.checkActor(infra);

    SecurityRequest thirdToFirst = ready(type);
    thirdToFirst.returnTo(
        applicant, 1, "사업 목적 재확인", List.of("purpose"), event(applicant, "RETURNED"));
    assertThat(thirdToFirst.getStage()).isEqualTo(1);

    SecurityRequest thirdToSecond = ready(type);
    thirdToSecond.returnTo(
        applicant, 2, "검토 설명 보완", List.of("accessControl"), event(applicant, "RETURNED"));
    assertThat(thirdToSecond.getStage()).isEqualTo(2);

    SecurityRequest fourthToThird = ready(type);
    fourthToThird.submit(applicant, fourthToThird.withEvent(event(applicant, "SUBMITTED")));
    var firstSnapshot = fourthToThird.getData();
    assertThat(fourthToThird.getWorkflow().submissionVersion()).isEqualTo(1);
    fourthToThird.returnTo(infra, 3, "신청 목적 명확화", List.of("purpose"), event(infra, "RETURNED"));
    assertThat(fourthToThird.getData().answers()).isEqualTo(firstSnapshot.answers());
    editOne(fourthToThird, applicant, "purpose", "보완하여 사람이 확인한 합성 목적");
    fourthToThird.returnTo(
        applicant, 2, "변경 목적 재협의", List.of("purpose"), event(applicant, "RETURNED"));
    editOne(fourthToThird, applicant, "purpose", "보완하여 사람이 확인한 합성 목적");
    complete(fourthToThird, infra, false);
    complete(fourthToThird, security, false);
    fourthToThird.submit(applicant, fourthToThird.withEvent(event(applicant, "SUBMITTED")));
    assertThat(fourthToThird.getWorkflow().submissionVersion()).isEqualTo(2);
    assertThat(firstSnapshot.answers())
        .noneMatch(item -> item.value().equals("보완하여 사람이 확인한 합성 목적"));
  }

  @Test
  void returnRequiresReasonFieldsValidPathAndCurrentStageOwner() {
    SecurityRequest request = ready(DocumentType.SECURITY_REVIEW);
    long revision = request.getRevision();
    assertThatThrownBy(
            () ->
                request.returnTo(
                    applicant, 2, "", List.of("purpose"), event(applicant, "RETURNED")))
        .isInstanceOf(DomainException.class)
        .extracting("code")
        .isEqualTo("REASON_REQUIRED");
    assertThatThrownBy(
            () -> request.returnTo(applicant, 2, "보완", List.of(), event(applicant, "RETURNED")))
        .isInstanceOf(DomainException.class)
        .extracting("code")
        .isEqualTo("RETURN_FIELDS_REQUIRED");
    assertThatThrownBy(
            () ->
                request.returnTo(
                    applicant, 2, "보완", List.of("invented"), event(applicant, "RETURNED")))
        .isInstanceOf(DomainException.class)
        .extracting("code")
        .isEqualTo("UNKNOWN_RETURN_FIELD");
    assertThatThrownBy(
            () ->
                request.returnTo(
                    applicant, 3, "보완", List.of("purpose"), event(applicant, "RETURNED")))
        .isInstanceOf(DomainException.class)
        .extracting("code")
        .isEqualTo("INVALID_RETURN_PATH");
    assertThatThrownBy(
            () ->
                request.returnTo(
                    security, 2, "보완", List.of("purpose"), event(security, "RETURNED")))
        .isInstanceOf(DomainException.class)
        .extracting("status")
        .isEqualTo(403);
    assertThat(request.getRevision()).isEqualTo(revision);
    assertThat(request.getWorkflow().returnItems()).isEmpty();
  }

  @Test
  void aiFinalDraftRequiresHumanConfirmationAndNewContentInvalidatesThatConfirmation() {
    SecurityRequest request = ready(DocumentType.SECURITY_REVIEW);
    UUID analysisId = UUID.randomUUID();
    request.registerFinalDraft(
        applicant,
        analysisId,
        "합성 최종 요약",
        "합성 신청 답변의 목적 항목",
        event(applicant, "FINAL_DRAFT_PROPOSED"));
    assertThat(request.getWorkflow().finalDraft().source()).isEqualTo("AI_INFERRED");
    assertThat(request.getWorkflow().finalDraft().confirmed()).isFalse();
    assertThatThrownBy(() -> request.submit(applicant, request.getData()))
        .isInstanceOf(DomainException.class)
        .extracting("code")
        .isEqualTo("SUBMISSION_BLOCKED");
    request.confirmFinalDraft(applicant, analysisId, event(applicant, "FINAL_DRAFT_CONFIRMED"));
    assertThat(WorkflowRules.submissionBlockers(request)).isEmpty();
    editOne(request, applicant, "purpose", "최종 검토 중 보완한 합성 목적");
    assertThat(request.getWorkflow().finalDraft().confirmed()).isFalse();
    assertThat(request.getWorkflow().finalDraft().evidence()).isEqualTo("합성 신청 답변의 목적 항목");
    assertThatThrownBy(
            () ->
                request.confirmFinalDraft(
                    applicant, UUID.randomUUID(), event(applicant, "FINAL_DRAFT_CONFIRMED")))
        .isInstanceOf(DomainException.class)
        .extracting("code")
        .isEqualTo("FINAL_DRAFT_CHANGED");
  }

  @Test
  void finalDocumentRequiresTwoIndependentFinalReviewsAndDoesNotChangeOriginalSubmissionValues() {
    SecurityRequest request = ready(DocumentType.FIREWALL);
    request.submit(applicant, request.withEvent(event(applicant, "SUBMITTED")));
    var submittedAnswers = request.getData().answers();
    complete(request, security, true);
    assertThatThrownBy(() -> request.confirmDocument(security, request.getData()))
        .isInstanceOf(DomainException.class)
        .extracting("code")
        .isEqualTo("FINAL_REVIEWS_REQUIRED");
    complete(request, infra, true);
    request.confirmDocument(security, request.withEvent(event(security, "DOCUMENT_CONFIRMED")));
    assertThat(request.getStatus()).isEqualTo(SecurityRequestStatus.CONFIRMED);
    assertThat(request.getData().answers()).isEqualTo(submittedAnswers);
    assertThatThrownBy(() -> editOne(request, infra, "operatingEnvironment", "확정 후 변경"))
        .isInstanceOf(DomainException.class)
        .extracting("code")
        .isEqualTo("SUBMISSION_LOCKED");
  }

  @Test
  void terminatedRequestsKeepDataReadableAndRejectEveryDomainMutationIncludingAi() {
    for (boolean withdraw : List.of(false, true)) {
      SecurityRequest request = ready(DocumentType.SECURITY_REVIEW);
      var original = request.getData();
      Actor actor = withdraw ? applicant : security;
      assertThatThrownBy(() -> request.terminate(actor, withdraw, " ", event(actor, "TERMINATED")))
          .isInstanceOf(DomainException.class)
          .extracting("code")
          .isEqualTo("REASON_REQUIRED");
      request.terminate(actor, withdraw, "합성 종료 사유", event(actor, "TERMINATED"));
      request.checkActor(applicant);
      request.checkActor(security);
      assertThat(request.getData().answers()).isEqualTo(original.answers());
      assertThat(request.getData().timeline()).containsAll(original.timeline());
      assertThat(request.getWorkflow().terminalReason()).isEqualTo("합성 종료 사유");
      List<Runnable> changes =
          List.of(
              () -> editOne(request, applicant, "purpose", "종료 후 변경 시도"),
              () -> request.openConsultation(applicant, original),
              () -> request.submit(applicant, original),
              () -> request.confirmDocument(security, original),
              () -> request.allocate(infra, "확인", event(infra, "ALLOCATION_COMPLETED")),
              () -> complete(request, security, false),
              () ->
                  request.returnTo(
                      applicant, 2, "반환", List.of("purpose"), event(applicant, "RETURNED")),
              () ->
                  request.registerFinalDraft(
                      applicant,
                      UUID.randomUUID(),
                      "요약",
                      "근거",
                      event(applicant, "FINAL_DRAFT_PROPOSED")),
              () ->
                  request.confirmFinalDraft(
                      applicant, UUID.randomUUID(), event(applicant, "FINAL_DRAFT_CONFIRMED")),
              () -> request.terminate(actor, withdraw, "다시 종료", event(actor, "TERMINATED")));
      for (Runnable change : changes)
        assertThatThrownBy(change::run)
            .isInstanceOf(DomainException.class)
            .extracting("code")
            .isEqualTo("REQUEST_TERMINATED");
    }
  }

  @Test
  void serverAssignedSpecialistAndRevisionCannotBeReplacedByClientIntent() {
    SecurityRequest request = collaborating(DocumentType.SECURITY_REVIEW);
    assertThatThrownBy(() -> request.checkActor(actor(Role.INFRA)))
        .isInstanceOf(DomainException.class)
        .extracting("status")
        .isEqualTo(404);
    assertThatThrownBy(() -> request.checkRevision(request.getRevision() - 1))
        .isInstanceOf(DomainException.class)
        .extracting("code")
        .isEqualTo("REVISION_CONFLICT");
    Actor outside =
        new Actor(
            UUID.randomUUID(),
            UUID.randomUUID(),
            "outside.synthetic",
            "기관 밖 합성 담당자",
            Role.SECURITY);
    assertThatThrownBy(() -> request.checkActor(outside))
        .isInstanceOf(DomainException.class)
        .extracting("status")
        .isEqualTo(404);
  }

  private SecurityRequest ready(DocumentType type) {
    SecurityRequest request = collaborating(type);
    request.allocate(infra, "합성 자원 할당 확인", event(infra, "ALLOCATION_COMPLETED"));
    fill(request, security);
    complete(request, infra, false);
    complete(request, security, false);
    return request;
  }

  private SecurityRequest collaborating(DocumentType type) {
    OrganizationPolicy policy =
        new OrganizationPolicy(
            "합성 기관",
            "INFRA_FIRST",
            true,
            true,
            List.of(),
            "합성 문서",
            new ModelConnection("EXAMPLE", "", "extractive-demo", "", 0.2, 1000, 30));
    SecurityRequest request =
        new SecurityRequest(
            UUID.randomUUID(),
            institution,
            applicant.userId(),
            applicant.displayName(),
            "합성 신청",
            type,
            "가상 부서",
            "합성 설명",
            1,
            policy,
            new SecurityRequestData(
                WorkflowRules.initialAnswers(type, policy),
                List.of(),
                RequestWorkflow.pendingReviews(),
                List.of(),
                List.of()));
    fill(request, applicant);
    request.openConsultation(
        applicant, request.withEvent(event(applicant, "CONSULTATION_REQUESTED")));
    fill(request, infra);
    if (type == DocumentType.FIREWALL) {
      var rule =
          new SecurityRequestData.NetworkRule(
              UUID.randomUUID(),
              "합성 화면",
              "192.0.2.10",
              "합성 API",
              "198.51.100.20",
              "443",
              "TCP",
              "ONE_WAY",
              LocalDate.of(2026, 11, 10),
              LocalDate.of(2026, 11, 30),
              "합성 통신",
              source(infra),
              confirmation(infra));
      var old = request.getData();
      request.edit(
          infra,
          new SecurityRequestData(
              old.answers(), List.of(rule), old.reviews(), old.supplements(), old.timeline()),
          Set.of("network"));
    }
    return request;
  }

  private void fill(SecurityRequest request, Actor actor) {
    var old = request.getData();
    var answers =
        old.answers().stream()
            .map(
                answer ->
                    answer.ownerRole() != actor.role()
                        ? answer
                        : answered(
                            answer,
                            actor,
                            answer.key().equals("externalTransfer")
                                ? "NO"
                                : "합성 확인: " + answer.label()))
            .toList();
    request.edit(
        actor,
        new SecurityRequestData(
            answers, old.rules(), old.reviews(), old.supplements(), old.timeline()),
        Set.copyOf(
            answers.stream()
                .filter(answer -> answer.ownerRole() == actor.role())
                .map(SecurityRequestData.Answer::key)
                .toList()));
  }

  private void editOne(SecurityRequest request, Actor actor, String key, String value) {
    var old = request.getData();
    var answers =
        old.answers().stream()
            .map(answer -> answer.key().equals(key) ? answered(answer, actor, value) : answer)
            .toList();
    request.edit(
        actor,
        new SecurityRequestData(
            answers, old.rules(), old.reviews(), old.supplements(), old.timeline()),
        Set.of(key));
  }

  private SecurityRequestData.Answer answered(
      SecurityRequestData.Answer answer, Actor actor, String value) {
    return new SecurityRequestData.Answer(
        answer.key(),
        answer.label(),
        answer.reason(),
        answer.ownerRole(),
        answer.requiredAt(),
        value,
        SecurityRequestData.AnswerStatus.CONFIRMED,
        source(actor),
        confirmation(actor));
  }

  private void complete(SecurityRequest request, Actor actor, boolean finalPhase) {
    request.acceptReview(
        actor,
        new SecurityRequestData.Review(
            actor.role(),
            "COMPLETE",
            request.getRevision() + 1,
            "합성 자료를 담당 분야에서 확인했습니다.",
            actor.displayName(),
            NOW),
        finalPhase,
        event(actor, finalPhase ? "FINAL_REVIEW_COMPLETED" : "REVIEW_COMPLETED"));
  }

  private SecurityRequestData.Source source(Actor actor) {
    return new SecurityRequestData.Source(
        actor.role() == Role.APPLICANT
            ? SecurityRequestData.SourceKind.USER_ANSWER
            : SecurityRequestData.SourceKind.STAFF_INPUT,
        "합성 입력 근거",
        actor.displayName(),
        NOW);
  }

  private SecurityRequestData.Confirmation confirmation(Actor actor) {
    return new SecurityRequestData.Confirmation(actor.displayName(), actor.role(), NOW);
  }

  private SecurityRequestData.Event event(Actor actor, String action) {
    return new SecurityRequestData.Event(
        UUID.randomUUID(), action, "합성 업무 이력", actor.displayName(), NOW);
  }

  private Actor actor(Role role) {
    return new Actor(
        UUID.randomUUID(),
        institution,
        role.name().toLowerCase() + ".synthetic",
        "합성 " + role,
        role);
  }
}
