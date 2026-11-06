package kr.securityadvisor.request.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import kr.securityadvisor.common.model.ModelConnection;
import kr.securityadvisor.common.model.OrganizationPolicy;
import kr.securityadvisor.common.security.Actor;
import kr.securityadvisor.common.security.Role;
import org.junit.jupiter.api.Test;

class WorkflowRulesTest {
  private static final Instant NOW = Instant.parse("2026-11-06T00:00:00Z");

  @Test
  void requiresBothOriginalSourceAndHumanConfirmationEvenWhenStatusLooksConfirmed() {
    SecurityRequestData.Answer answer =
        answer(
            "purpose",
            "설명",
            "CONSULT",
            Role.APPLICANT,
            SecurityRequestData.AnswerStatus.CONFIRMED,
            null,
            confirmation());
    assertThat(WorkflowRules.resolved(answer)).isFalse();
    assertThat(
            WorkflowRules.resolved(
                answer(
                    "purpose",
                    "설명",
                    "CONSULT",
                    Role.APPLICANT,
                    SecurityRequestData.AnswerStatus.CONFIRMED,
                    source(),
                    null)))
        .isFalse();
    assertThat(
            WorkflowRules.resolved(
                answer(
                    "purpose",
                    "설명",
                    "CONSULT",
                    Role.APPLICANT,
                    SecurityRequestData.AnswerStatus.PROPOSED,
                    source(),
                    confirmation())))
        .isFalse();
  }

  @Test
  void unknownExternalTransferIsNeverResolved() {
    assertThat(
            WorkflowRules.resolved(
                answer(
                    "externalTransfer",
                    "UNKNOWN",
                    "SUBMIT",
                    Role.APPLICANT,
                    SecurityRequestData.AnswerStatus.CONFIRMED,
                    source(),
                    confirmation())))
        .isFalse();
  }

  @Test
  void emptyOptionalIsAllowedButWrittenUnconfirmedOptionalBlocksSubmission() {
    SecurityRequest empty =
        collaborating(
            "PARALLEL",
            List.of(
                answer(
                    "optional",
                    "",
                    "OPTIONAL",
                    Role.SECURITY,
                    SecurityRequestData.AnswerStatus.EMPTY,
                    null,
                    null)),
            List.of(),
            List.of());
    assertThat(WorkflowRules.submissionBlockers(empty))
        .noneMatch(value -> value.contains("optional"));
    SecurityRequest proposed =
        collaborating(
            "PARALLEL",
            List.of(
                answer(
                    "optional",
                    "미확정 방안",
                    "OPTIONAL",
                    Role.SECURITY,
                    SecurityRequestData.AnswerStatus.PROPOSED,
                    source(),
                    null)),
            List.of(),
            List.of());
    assertThat(WorkflowRules.submissionBlockers(proposed))
        .anyMatch(value -> value.contains("optional"));
  }

  @Test
  void answeredSupplementStillRequiresTheRequestingSpecialistResolution() {
    SecurityRequestData.Supplement supplement =
        new SecurityRequestData.Supplement(
            UUID.randomUUID(), "확인 질문", "답변", Role.SECURITY, "합성 담당자", "ANSWERED", NOW, null);
    SecurityRequest procedure =
        collaborating("PARALLEL", List.of(), List.of(), List.of(supplement));
    assertThat(WorkflowRules.submissionBlockers(procedure)).anyMatch(value -> value.contains("보완"));
    assertThat(WorkflowRules.reviewBlockers(procedure, Role.SECURITY))
        .anyMatch(value -> value.contains("보완"));
  }

  @Test
  void fixedInfraAllocationMustPrecedeSecurityEvenForLegacySequentialPolicy() {
    SecurityRequest procedure = withRequiredReviews("SEQUENTIAL");
    assertThat(WorkflowRules.reviewBlockers(procedure, Role.SECURITY))
        .anyMatch(value -> value.contains("할당"));
    Actor infra =
        new Actor(
            UUID.randomUUID(),
            procedure.getInstitutionId(),
            "infra.synthetic",
            "합성 인프라",
            Role.INFRA);
    procedure.allocate(infra, "합성 자원 할당 확인", event());
    assertThat(WorkflowRules.reviewBlockers(procedure, Role.SECURITY)).isEmpty();
    assertThat(WorkflowRules.currentReview(procedure, Role.INFRA)).isFalse();
    assertThat(WorkflowRules.submissionBlockers(procedure))
        .anyMatch(value -> value.contains("ICT인프라 협의"));
  }

  @Test
  void legacyParallelPolicyCannotBypassFixedInfraAllocationOrder() {
    SecurityRequest procedure = withRequiredReviews("PARALLEL");
    assertThat(WorkflowRules.reviewBlockers(procedure, Role.SECURITY))
        .anyMatch(value -> value.contains("할당"));
    Actor infra =
        new Actor(
            UUID.randomUUID(),
            procedure.getInstitutionId(),
            "infra.synthetic",
            "합성 인프라",
            Role.INFRA);
    procedure.allocate(infra, "합성 자원 할당 확인", event());
    assertThat(WorkflowRules.reviewBlockers(procedure, Role.INFRA)).isEmpty();
    assertThat(WorkflowRules.reviewBlockers(procedure, Role.SECURITY)).isEmpty();
  }

  private SecurityRequestData.Event event() {
    return new SecurityRequestData.Event(
        UUID.randomUUID(), "ALLOCATION_COMPLETED", "합성 할당 확인", "합성 인프라", NOW);
  }

  @Test
  void contentChangePreservesOldReviewEvidenceButInvalidatesItsApproval() {
    List<SecurityRequestData.Review> invalidated =
        WorkflowRules.invalidateReviews(
            List.of(
                new SecurityRequestData.Review(
                    Role.INFRA, "COMPLETE", 3L, "이전 확인", "합성 담당자", NOW)));
    assertThat(invalidated.getFirst().status()).isEqualTo("INVALIDATED");
    assertThat(invalidated.getFirst().revision()).isEqualTo(3L);
    assertThat(invalidated.getFirst().comment()).isEqualTo("이전 확인");
    assertThat(invalidated.getFirst().at()).isEqualTo(NOW);
  }

  private SecurityRequest withRequiredReviews(String mode) {
    OrganizationPolicy policy =
        new OrganizationPolicy(
            "가상기관",
            mode,
            true,
            true,
            List.of(),
            "합성 문서",
            new ModelConnection("EXAMPLE", "", "extractive-demo", "", 0.2, 1000, 30));
    SecurityRequest procedure =
        new SecurityRequest(
            UUID.randomUUID(),
            UUID.randomUUID(),
            UUID.randomUUID(),
            "합성 작성자",
            "합성 신청",
            DocumentType.SECURITY_REVIEW,
            "가상 부서",
            "합성 개요",
            1,
            policy,
            new SecurityRequestData(List.of(), List.of(), List.of(), List.of(), List.of()));
    procedure.openConsultation(
        new Actor(
            procedure.getOwnerId(),
            procedure.getInstitutionId(),
            "applicant.synthetic",
            "합성 작성자",
            Role.APPLICANT),
        procedure.getData());
    return procedure;
  }

  private SecurityRequest collaborating(
      String mode,
      List<SecurityRequestData.Answer> answers,
      List<SecurityRequestData.Review> reviews,
      List<SecurityRequestData.Supplement> supplements) {
    OrganizationPolicy policy =
        new OrganizationPolicy(
            "가상기관",
            mode,
            false,
            false,
            List.of(),
            "합성 문서",
            new ModelConnection("EXAMPLE", "", "extractive-demo", "", 0.2, 1000, 30));
    SecurityRequest procedure =
        new SecurityRequest(
            UUID.randomUUID(),
            UUID.randomUUID(),
            UUID.randomUUID(),
            "합성 작성자",
            "합성 신청",
            DocumentType.SECURITY_REVIEW,
            "가상 부서",
            "합성 개요",
            1,
            policy,
            new SecurityRequestData(answers, List.of(), reviews, supplements, List.of()));
    procedure.openConsultation(
        new Actor(
            procedure.getOwnerId(),
            procedure.getInstitutionId(),
            "applicant.synthetic",
            "합성 작성자",
            Role.APPLICANT),
        procedure.getData());
    return procedure;
  }

  private SecurityRequestData.Answer answer(
      String key,
      String value,
      String required,
      Role role,
      SecurityRequestData.AnswerStatus status,
      SecurityRequestData.Source source,
      SecurityRequestData.Confirmation confirmation) {
    return new SecurityRequestData.Answer(
        key, key, "합성 질문의 이유", role, required, value, status, source, confirmation);
  }

  private SecurityRequestData.Source source() {
    return new SecurityRequestData.Source(
        SecurityRequestData.SourceKind.AI_INFERRED, "합성 문서 근거", "AI 제안", NOW);
  }

  private SecurityRequestData.Confirmation confirmation() {
    return new SecurityRequestData.Confirmation("합성 작성자", Role.APPLICANT, NOW);
  }
}
