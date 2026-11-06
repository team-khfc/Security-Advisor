package kr.securityadvisor.request.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import kr.securityadvisor.common.error.DomainException;
import kr.securityadvisor.common.model.ModelConnection;
import kr.securityadvisor.common.model.OrganizationPolicy;
import kr.securityadvisor.common.model.PolicyProvider;
import kr.securityadvisor.common.model.PolicySnapshot;
import kr.securityadvisor.common.model.Suggestion;
import kr.securityadvisor.common.security.Actor;
import kr.securityadvisor.common.security.Role;
import kr.securityadvisor.document.repository.SubmissionRepository;
import kr.securityadvisor.document.service.DocumentRenderer;
import kr.securityadvisor.document.service.DocumentService;
import kr.securityadvisor.request.domain.SecurityRequest;
import kr.securityadvisor.request.dto.AnswerPatchRequest;
import kr.securityadvisor.request.dto.CreateSecurityRequestRequest;
import kr.securityadvisor.request.dto.SecurityRequestResponse;
import kr.securityadvisor.request.repository.SecurityRequestRepository;
import kr.securityadvisor.review.service.ReviewService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

class SecurityRequestServiceTest {
  private final UUID institutionId = UUID.randomUUID();
  private final Actor applicant = actor(Role.APPLICANT);
  private final Actor security = actor(Role.SECURITY);
  private final Map<UUID, SecurityRequest> saved = new HashMap<>();
  private SecurityRequestService service;

  @BeforeEach
  void setUp() {
    SecurityRequestRepository procedures = mock(SecurityRequestRepository.class);
    SubmissionRepository submissions = mock(SubmissionRepository.class);
    PolicyProvider policies = mock(PolicyProvider.class);
    when(policies.current(any()))
        .thenReturn(
            new PolicySnapshot(
                1,
                new OrganizationPolicy(
                    "가상 기관",
                    "PARALLEL",
                    true,
                    true,
                    List.of(),
                    "합성 자료",
                    new ModelConnection("EXAMPLE", "", "extractive-demo", "", 0.2, 1000, 30))));
    when(procedures.saveAndFlush(any()))
        .thenAnswer(
            call -> {
              SecurityRequest procedure = call.getArgument(0);
              saved.put(procedure.getId(), procedure);
              return procedure;
            });
    when(procedures.findByIdAndInstitutionId(any(), any()))
        .thenAnswer(
            call -> {
              SecurityRequest procedure = saved.get(call.getArgument(0));
              return procedure == null || !procedure.getInstitutionId().equals(call.getArgument(1))
                  ? Optional.empty()
                  : Optional.of(procedure);
            });
    when(procedures.lockByIdAndInstitutionId(any(), any()))
        .thenAnswer(
            call -> {
              SecurityRequest procedure = saved.get(call.getArgument(0));
              return procedure == null || !procedure.getInstitutionId().equals(call.getArgument(1))
                  ? Optional.empty()
                  : Optional.of(procedure);
            });
    service =
        new SecurityRequestService(
            procedures,
            policies,
            new DocumentService(submissions, new DocumentRenderer()),
            new ReviewService(),
            JsonMapper.builder().findAndAddModules().build());
  }

  @Test
  void humanConfirmationPreservesAiOriginAndEvidence() {
    SecurityRequestResponse procedure = create();
    procedure =
        service.propose(
            applicant,
            procedure.id(),
            procedure.revision(),
            List.of(new Suggestion("purpose", "공개 안내를 돕는 합성 서비스", "합성 개요의 목적 문장을 참조")));
    SecurityRequestResponse.AnswerResponse proposed = answer(procedure, "purpose");
    assertThat(proposed.status()).isEqualTo("PROPOSED");
    assertThat(proposed.confirmation()).isNull();
    procedure =
        service.updateAnswers(
            applicant,
            procedure.id(),
            patch(procedure.revision(), "purpose", proposed.value(), true, false));
    SecurityRequestResponse.AnswerResponse confirmed = answer(procedure, "purpose");
    assertThat(confirmed.status()).isEqualTo("CONFIRMED");
    assertThat(confirmed.source()).isEqualTo(proposed.source());
    assertThat(confirmed.source().kind()).isEqualTo("AI_INFERRED");
    assertThat(confirmed.confirmation().actorName()).isEqualTo(applicant.displayName());
    assertThat(confirmed.confirmation().role()).isEqualTo("APPLICANT");
  }

  @Test
  void editingAiValueChangesOriginToThePersonWhoChangedIt() {
    SecurityRequestResponse procedure = create();
    procedure =
        service.propose(
            applicant,
            procedure.id(),
            procedure.revision(),
            List.of(new Suggestion("purpose", "AI 후보", "합성 개요 문장")));
    procedure =
        service.updateAnswers(
            applicant,
            procedure.id(),
            patch(procedure.revision(), "purpose", "사용자가 수정한 목적", true, false));
    assertThat(answer(procedure, "purpose").source().kind()).isEqualTo("USER_ANSWER");
  }

  @Test
  void batchProposalCannotPartiallyOverwriteConfirmedValues() {
    SecurityRequestResponse procedure = create();
    procedure =
        service.updateAnswers(
            applicant,
            procedure.id(),
            patch(procedure.revision(), "purpose", "사람 확인 값", true, false));
    UUID id = procedure.id();
    long revision = procedure.revision();
    assertThatThrownBy(
            () ->
                service.propose(
                    applicant,
                    id,
                    revision,
                    List.of(
                        new Suggestion("audience", "미확정 후보", "근거"),
                        new Suggestion("purpose", "덮어쓸 후보", "근거"))))
        .isInstanceOf(DomainException.class)
        .extracting("code")
        .isEqualTo("CONFIRMED_VALUE_PROTECTED");
    SecurityRequestResponse current = service.get(applicant, id);
    assertThat(current.revision()).isEqualTo(revision);
    assertThat(answer(current, "audience").value()).isEmpty();
    assertThat(answer(current, "purpose").value()).isEqualTo("사람 확인 값");
  }

  @Test
  void unknownCannotBecomeConfirmedAndRequiredCannotBecomeNotApplicable() {
    SecurityRequestResponse procedure = create();
    procedure =
        service.updateAnswers(
            applicant,
            procedure.id(),
            patch(procedure.revision(), "externalTransfer", "UNKNOWN", true, false));
    assertThat(answer(procedure, "externalTransfer").status()).isEqualTo("PROPOSED");
    assertThat(answer(procedure, "externalTransfer").confirmation()).isNull();
    UUID id = procedure.id();
    long revision = procedure.revision();
    assertThatThrownBy(
            () ->
                service.updateAnswers(
                    applicant, id, patch(revision, "purpose", "해당 없음", true, true)))
        .isInstanceOf(DomainException.class)
        .extracting("code")
        .isEqualTo("NOT_APPLICABLE_REASON_REQUIRED");
  }

  @Test
  void serverRejectsFieldOwnershipAndStaleExpectedRevision() {
    SecurityRequestResponse procedure = create();
    UUID id = procedure.id();
    assertThatThrownBy(
            () ->
                service.updateAnswers(
                    applicant, id, patch(0, "accessControl", "신청자 임의 확인", true, false)))
        .isInstanceOf(DomainException.class)
        .extracting("status")
        .isEqualTo(403);
    procedure = service.updateAnswers(applicant, id, patch(0, "purpose", "합성 목적", true, false));
    assertThatThrownBy(
            () ->
                service.updateAnswers(
                    applicant, id, patch(0, "audience", "다른 창의 낡은 입력", true, false)))
        .isInstanceOf(DomainException.class)
        .satisfies(
            exception -> {
              assertThat(((DomainException) exception).getStatus()).isEqualTo(409);
              assertThat(((DomainException) exception).getLatestRevision()).isEqualTo(1L);
            });
    assertThat(procedure.revision()).isEqualTo(1L);
    assertThat(answer(service.get(applicant, id), "audience").value()).isEmpty();
  }

  @Test
  void draftsArePrivateToOwnerAndAdminsCannotReadBusinessRecords() {
    SecurityRequestResponse procedure = create();
    assertThatThrownBy(() -> service.get(actor(Role.APPLICANT), procedure.id()))
        .isInstanceOf(DomainException.class)
        .extracting("status")
        .isEqualTo(404);
    assertThatThrownBy(() -> service.get(security, procedure.id()))
        .isInstanceOf(DomainException.class)
        .extracting("status")
        .isEqualTo(404);
    assertThatThrownBy(() -> service.get(actor(Role.ADMIN), procedure.id()))
        .isInstanceOf(DomainException.class)
        .extracting("status")
        .isEqualTo(403);
    Actor outside =
        new Actor(
            UUID.randomUUID(),
            UUID.randomUUID(),
            "outside.synthetic",
            "기관 밖 합성 작성자",
            Role.APPLICANT);
    assertThatThrownBy(() -> service.get(outside, procedure.id()))
        .isInstanceOf(DomainException.class)
        .extracting("status")
        .isEqualTo(404);
  }

  private SecurityRequestResponse create() {
    return service.create(
        applicant,
        new CreateSecurityRequestRequest("합성 검증 신청", "SECURITY_REVIEW", "가상 부서", "합성 개요"));
  }

  private Actor actor(Role role) {
    return new Actor(
        UUID.randomUUID(),
        institutionId,
        role.name().toLowerCase() + ".synthetic",
        "합성 " + role.name(),
        role);
  }

  private AnswerPatchRequest patch(
      long revision, String key, String value, boolean confirmed, boolean notApplicable) {
    return new AnswerPatchRequest(
        revision,
        List.of(new AnswerPatchRequest.AnswerInput(key, value, confirmed, notApplicable)));
  }

  private SecurityRequestResponse.AnswerResponse answer(
      SecurityRequestResponse response, String key) {
    return response.answers().stream()
        .filter(answer -> answer.key().equals(key))
        .findFirst()
        .orElseThrow();
  }
}
