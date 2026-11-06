package kr.securityadvisor.request;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import kr.securityadvisor.IntegrationTestSupport;
import kr.securityadvisor.common.model.OrganizationPolicy;
import kr.securityadvisor.configuration.dto.PublishRequest;
import kr.securityadvisor.configuration.dto.SettingsRequest;
import kr.securityadvisor.configuration.dto.SettingsResponse;
import kr.securityadvisor.request.dto.AnswerPatchRequest;
import kr.securityadvisor.request.dto.CreateSecurityRequestRequest;
import kr.securityadvisor.request.dto.NetworkRequest;
import kr.securityadvisor.request.dto.ReturnRequest;
import kr.securityadvisor.request.dto.ReviewRequest;
import kr.securityadvisor.request.dto.RevisionRequest;
import kr.securityadvisor.request.dto.SecurityRequestResponse;
import kr.securityadvisor.request.dto.SupplementAnswerRequest;
import kr.securityadvisor.request.dto.SupplementQuestionRequest;
import kr.securityadvisor.request.dto.TerminalRequest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataAccessException;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import tools.jackson.databind.ObjectMapper;

class SecurityRequestIntegrationTest extends IntegrationTestSupport {
  private final JdbcTemplate jdbc;

  @Autowired
  SecurityRequestIntegrationTest(MockMvc mvc, ObjectMapper mapper, JdbcTemplate jdbc) {
    super(mvc, mapper);
    this.jdbc = jdbc;
  }

  @Test
  void fixedInfraAllocationPrecedesSecurityAndOnlyAffectedReviewIsRepeated() throws Exception {
    MockHttpSession applicant = login("applicant.demo");
    MockHttpSession security = login("security.demo");
    MockHttpSession infra = login("infra.demo");
    SecurityRequestResponse current = create(applicant, "SECURITY_REVIEW", "합성 순차 검토 검증");
    assertThat(current.policy().reviewMode()).isEqualTo("INFRA_FIRST");
    current = fillAnswers(applicant, current, "APPLICANT");
    current =
        exchange(
            post(path(current, "/consult")), applicant, new RevisionRequest(current.revision()));
    mvc.perform(
            post(path(current, "/review/start"))
                .session(security)
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsBytes(new RevisionRequest(current.revision()))))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("ALLOCATION_REQUIRED"));
    current = fillAnswers(infra, current, "INFRA");
    current = allocate(infra, current);
    assertThat(current.reviews()).allMatch(review -> review.status().equals("PENDING"));
    current = fillAnswers(security, current, "SECURITY");
    current = review(security, current);
    assertThat(current.stage()).isEqualTo(2);
    assertThat(fetch(applicant, current.id()).allowedActions()).doesNotContain("SUBMIT");
    current = review(infra, current);
    assertThat(current.stage()).isEqualTo(3);
    String priorAccessControl =
        current.answers().stream()
            .filter(answer -> answer.key().equals("accessControl"))
            .findFirst()
            .orElseThrow()
            .value();
    current =
        exchange(
            post(path(current, "/return")),
            applicant,
            new ReturnRequest(current.revision(), 2, "합성 접근 통제 설명 보완", List.of("accessControl")));
    assertThat(current.reviews())
        .filteredOn(review -> review.role().equals("INFRA"))
        .allMatch(review -> review.status().equals("COMPLETE"));
    assertThat(current.reviews())
        .filteredOn(review -> review.role().equals("SECURITY"))
        .allMatch(review -> review.status().equals("INVALIDATED"));
    assertThat(current.allocation().status()).isEqualTo("COMPLETE");
    assertThat(current.returnItems())
        .singleElement()
        .satisfies(item -> assertThat(item.previousValue()).isEqualTo(priorAccessControl));
    current =
        exchange(
            patch(path(current, "/answers")),
            security,
            new AnswerPatchRequest(
                current.revision(),
                List.of(
                    new AnswerPatchRequest.AnswerInput(
                        "accessControl", "합성 접근 통제 방안을 수정하여 재확인했습니다.", true, false))));
    current = review(security, current);
    assertThat(current.stage()).isEqualTo(3);
    SecurityRequestResponse persisted = fetch(applicant, current.id());
    assertThat(persisted.blockers()).isEmpty();
    assertThat(persisted.returnItems())
        .singleElement()
        .satisfies(
            item -> {
              assertThat(item.status()).isEqualTo("RESOLVED");
              assertThat(item.previousValue()).isEqualTo(priorAccessControl);
            });
  }

  @Test
  void requiresExplicitNonNullExpectedRevisionEvenForInitialDraft() throws Exception {
    MockHttpSession applicant = login("applicant.demo");
    SecurityRequestResponse procedure = create(applicant, "SECURITY_REVIEW", "합성 버전 필수 검증");
    List<String> invalidBodies =
        List.of(
            """
        {"answers":[{"key":"purpose","value":"버전 없는 변경","confirmed":true,"notApplicable":false}]}
        """,
            """
        {"expectedRevision":null,"answers":[{"key":"purpose","value":"null 버전 변경","confirmed":true,"notApplicable":false}]}
        """);
    for (String body : invalidBodies) {
      mvc.perform(
              patch(path(procedure, "/answers"))
                  .session(applicant)
                  .with(csrf())
                  .contentType(MediaType.APPLICATION_JSON)
                  .content(body))
          .andExpect(status().isBadRequest());
    }
    assertThat(fetch(applicant, procedure.id()).revision()).isZero();
  }

  @Test
  void validatesFullWorkflowAndPreservesSubmittedDocumentThroughReceipt() throws Exception {
    MockHttpSession applicant = login("applicant.demo");
    MockHttpSession infra = login("infra.demo");
    MockHttpSession security = login("security.demo");
    SecurityRequestResponse current =
        create(applicant, "FIREWALL", "합성 개요 <script>alert('synthetic')</script>");
    current = fillAnswers(applicant, current, "APPLICANT");
    current =
        exchange(
            post(path(current, "/consult")), applicant, new RevisionRequest(current.revision()));
    current = fillAnswers(infra, current, "INFRA");
    current =
        exchange(
            put(path(current, "/network")),
            infra,
            new NetworkRequest(
                current.revision(),
                List.of(
                    new NetworkRequest.RuleInput(
                        null,
                        "합성 안내 화면",
                        "192.0.2.10",
                        "합성 안내 API",
                        "198.51.100.20",
                        "443",
                        "TCP",
                        "ONE_WAY",
                        LocalDate.of(2026, 11, 10),
                        LocalDate.of(2026, 11, 30),
                        "합성 통신 범위 검증"))));
    assertThat(current.rules().getFirst().source().kind()).isEqualTo("STAFF_INPUT");
    assertThat(current.rules().getFirst().confirmation().role()).isEqualTo("INFRA");
    current = allocate(infra, current);
    current = fillAnswers(security, current, "SECURITY");
    current = review(infra, current);
    current = review(security, current);
    assertThat(fetch(applicant, current.id()).allowedActions()).contains("SUBMIT");

    current =
        exchange(
            patch(path(current, "/answers")),
            applicant,
            new AnswerPatchRequest(
                current.revision(),
                List.of(
                    new AnswerPatchRequest.AnswerInput(
                        "purpose", "최종 확인 전 신청자가 수정한 합성 서비스 목적", true, false))));
    assertThat(current.reviews()).allMatch(item -> item.status().equals("INVALIDATED"));
    mvc.perform(
            post(path(current, "/submit"))
                .session(applicant)
                .with(csrf())
                .header("Idempotency-Key", UUID.randomUUID().toString())
                .contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsBytes(new RevisionRequest(current.revision()))))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.code").value("SUBMISSION_BLOCKED"));

    current =
        exchange(
            post(path(current, "/return")),
            applicant,
            new ReturnRequest(current.revision(), 2, "변경한 목적에 대한 재협의", List.of("purpose")));
    current =
        exchange(
            patch(path(current, "/answers")),
            applicant,
            new AnswerPatchRequest(
                current.revision(),
                List.of(
                    new AnswerPatchRequest.AnswerInput(
                        "purpose", "최종 확인 전 신청자가 수정한 합성 서비스 목적", true, false))));
    current =
        exchange(
            post(path(current, "/supplements")),
            security,
            new SupplementQuestionRequest(current.revision(), "합성 공개 자료만 처리하는지 재확인해 주세요."));
    UUID supplementId = current.supplements().getFirst().id();
    current =
        exchange(
            post(path(current, "/supplements/" + supplementId + "/answer")),
            applicant,
            new SupplementAnswerRequest(current.revision(), "합성 공개 자료만 처리합니다."));
    assertThat(current.supplements().getFirst().status()).isEqualTo("ANSWERED");
    assertThat(current.blockers()).anyMatch(item -> item.contains("보완"));
    mvc.perform(
            post(path(current, "/supplements/" + supplementId + "/resolve"))
                .session(infra)
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsBytes(new RevisionRequest(current.revision()))))
        .andExpect(status().isForbidden());
    current =
        exchange(
            post(path(current, "/supplements/" + supplementId + "/resolve")),
            security,
            new RevisionRequest(current.revision()));
    assertThat(current.supplements().getFirst().status()).isEqualTo("RESOLVED");
    current = review(infra, current);
    current = review(security, current);
    current = fetch(applicant, current.id());
    assertThat(current.blockers()).isEmpty();
    long submittedRevision = current.revision();
    String requestKey = UUID.randomUUID().toString();
    current =
        exchange(
            post(path(current, "/submit")).header("Idempotency-Key", requestKey),
            applicant,
            new RevisionRequest(submittedRevision));
    assertThat(current.status()).isEqualTo("SUBMITTED");
    assertThat(current.revision()).isEqualTo(submittedRevision + 1);
    assertThat(current.allowedActions()).doesNotContain("EDIT", "ANALYZE", "SUBMIT");
    SecurityRequestResponse repeated =
        exchange(
            post(path(current, "/submit")).header("Idempotency-Key", requestKey),
            applicant,
            new RevisionRequest(submittedRevision));
    assertThat(repeated.status()).isEqualTo("SUBMITTED");
    assertThat(
            jdbc.queryForObject(
                "select count(*) from procedure_submissions where procedure_id = ?",
                Integer.class,
                current.id()))
        .isEqualTo(1);

    String beforeReceipt = document(applicant, current.id());
    assertThat(beforeReceipt)
        .contains("제출본", "&lt;script&gt;", "실제 시스템 처리 완료")
        .doesNotContain("<script>");
    String snapshotBefore =
        jdbc.queryForObject(
            "select snapshot::text from procedure_submissions where procedure_id = ?",
            String.class,
            current.id());
    mvc.perform(
            patch(path(current, "/answers"))
                .session(applicant)
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    mapper.writeValueAsBytes(
                        new AnswerPatchRequest(
                            current.revision(),
                            List.of(
                                new AnswerPatchRequest.AnswerInput(
                                    "purpose", "제출 후 변경 시도", true, false))))))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("SUBMISSION_LOCKED"));
    current =
        exchange(
            post(path(current, "/receive")), security, new RevisionRequest(current.revision()));
    assertThat(current.status()).isEqualTo("SUBMITTED");
    mvc.perform(
            post(path(current, "/confirm"))
                .session(security)
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsBytes(new RevisionRequest(current.revision()))))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("FINAL_REVIEWS_REQUIRED"));
    current =
        exchange(
            post(path(current, "/final-review")),
            infra,
            new ReviewRequest(current.revision(), "합성 제출본 인프라 최종 검토"));
    current =
        exchange(
            post(path(current, "/confirm")), security, new RevisionRequest(current.revision()));
    assertThat(current.status()).isEqualTo("CONFIRMED");
    assertThat(document(applicant, current.id())).isEqualTo(beforeReceipt);
    assertThat(
            jdbc.queryForObject(
                "select snapshot::text from procedure_submissions where procedure_id = ?",
                String.class,
                current.id()))
        .isEqualTo(snapshotBefore);
    UUID id = current.id();
    assertThatThrownBy(
            () ->
                jdbc.update(
                    "update procedure_submissions set document_html = ? where procedure_id = ?",
                    "변경 시도",
                    id))
        .isInstanceOf(DataAccessException.class);
    assertThatThrownBy(
            () -> jdbc.update("delete from procedure_submissions where procedure_id = ?", id))
        .isInstanceOf(DataAccessException.class);
    assertThat(document(applicant, id)).isEqualTo(beforeReceipt);
  }

  @Test
  void appliesOwnerTenantAndRoleIsolationToRecordsDocumentsAndMutations() throws Exception {
    MockHttpSession applicant = login("applicant.demo");
    MockHttpSession second = login("second.demo");
    MockHttpSession outside = login("outside.demo");
    MockHttpSession security = login("security.demo");
    MockHttpSession admin = login("admin.demo");
    SecurityRequestResponse procedure = create(applicant, "SECURITY_REVIEW", "합성 조회 경계 검증");
    for (MockHttpSession blocked : List.of(second, outside, security)) {
      mvc.perform(get(path(procedure, "")).session(blocked)).andExpect(status().isNotFound());
      mvc.perform(get(path(procedure, "/document")).session(blocked))
          .andExpect(status().isNotFound());
    }
    mvc.perform(get(path(procedure, "")).session(admin)).andExpect(status().isForbidden());
    mvc.perform(get("/api/security-requests").session(admin)).andExpect(status().isForbidden());
    mvc.perform(
            patch(path(procedure, "/answers"))
                .session(applicant)
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    mapper.writeValueAsBytes(
                        new AnswerPatchRequest(
                            procedure.revision(),
                            List.of(
                                new AnswerPatchRequest.AnswerInput(
                                    "accessControl", "권한 위조 확인", true, false))))))
        .andExpect(status().isForbidden());
    mvc.perform(
            patch(path(procedure, "/answers"))
                .session(second)
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    mapper.writeValueAsBytes(
                        new AnswerPatchRequest(
                            procedure.revision(),
                            List.of(
                                new AnswerPatchRequest.AnswerInput(
                                    "purpose", "다른 작성자 변경", true, false))))))
        .andExpect(status().isNotFound());
    procedure = fillAnswers(applicant, procedure, "APPLICANT");
    procedure =
        exchange(
            post(path(procedure, "/consult")),
            applicant,
            new RevisionRequest(procedure.revision()));
    assertThat(fetch(security, procedure.id()).allowedActions())
        .doesNotContain("EDIT", "SUPPLEMENT", "REVIEW");
    mvc.perform(get(path(procedure, "")).session(second)).andExpect(status().isNotFound());
    mvc.perform(get(path(procedure, "")).session(outside)).andExpect(status().isNotFound());
    mvc.perform(get(path(procedure, "/document")).session(outside))
        .andExpect(status().isNotFound());
  }

  @Test
  void simultaneousEditsAtSameRevisionProduceOneConflictWithoutLostUpdate() throws Exception {
    MockHttpSession applicant = login("applicant.demo");
    SecurityRequestResponse procedure = create(applicant, "SECURITY_REVIEW", "합성 동시 변경 검증");
    CountDownLatch start = new CountDownLatch(1);
    try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
      var first =
          executor.submit(() -> editAtGate(start, applicant, procedure, "purpose", "첫 번째 창 입력"));
      var second =
          executor.submit(() -> editAtGate(start, applicant, procedure, "audience", "두 번째 창 입력"));
      start.countDown();
      assertThat(List.of(first.get(15, TimeUnit.SECONDS), second.get(15, TimeUnit.SECONDS)))
          .containsExactlyInAnyOrder(200, 409);
    }
    SecurityRequestResponse current = fetch(applicant, procedure.id());
    assertThat(current.revision()).isEqualTo(1);
    assertThat(current.answers().stream().filter(answer -> !answer.value().isBlank())).hasSize(1);
  }

  @Test
  void returningAndResubmittingKeepsEveryPriorSnapshotAndDocumentByte() throws Exception {
    MockHttpSession applicant = login("applicant.demo");
    MockHttpSession infra = login("infra.demo");
    MockHttpSession security = login("security.demo");
    SecurityRequestResponse current = readySecurityRequest(applicant, infra, security);
    long firstExpectedRevision = current.revision();
    String firstKey = UUID.randomUUID().toString();
    current =
        exchange(
            post(path(current, "/submit")).header("Idempotency-Key", firstKey),
            applicant,
            new RevisionRequest(current.revision()));
    String firstHtml = document(applicant, current.id());
    String firstSnapshot =
        jdbc.queryForObject(
            "select snapshot::text from procedure_submissions where procedure_id = ? and submission_version = 1",
            String.class,
            current.id());
    var beforeReturnAnswers = current.answers();
    current =
        exchange(
            post(path(current, "/return")),
            infra,
            new ReturnRequest(current.revision(), 3, "최종 목적 설명 보완", List.of("purpose")));
    assertThat(current.stage()).isEqualTo(3);
    assertThat(current.answers()).isEqualTo(beforeReturnAnswers);
    current =
        exchange(
            patch(path(current, "/answers")),
            applicant,
            new AnswerPatchRequest(
                current.revision(),
                List.of(
                    new AnswerPatchRequest.AnswerInput(
                        "purpose", "재제출용으로 사람이 보완한 합성 사업 목적", true, false))));
    assertThat(current.reviews()).allMatch(item -> item.status().equals("INVALIDATED"));
    assertThat(current.allowedActions()).doesNotContain("SUBMIT").contains("RETURN");
    current =
        exchange(
            post(path(current, "/return")),
            applicant,
            new ReturnRequest(current.revision(), 2, "수정한 목적의 분야별 재협의", List.of("purpose")));
    current =
        exchange(
            patch(path(current, "/answers")),
            applicant,
            new AnswerPatchRequest(
                current.revision(),
                List.of(
                    new AnswerPatchRequest.AnswerInput(
                        "purpose", "재제출용으로 사람이 보완한 합성 사업 목적", true, false))));
    current = review(infra, current);
    current = review(security, current);
    current =
        exchange(
            post(path(current, "/submit")).header("Idempotency-Key", UUID.randomUUID().toString()),
            applicant,
            new RevisionRequest(current.revision()));
    assertThat(current.submissionVersion()).isEqualTo(2);
    assertThat(document(applicant, current.id())).contains("재제출용으로 사람이 보완한 합성 사업 목적");
    assertThat(
            mvc.perform(get(path(current, "/document")).param("version", "1").session(applicant))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString(StandardCharsets.UTF_8))
        .isEqualTo(firstHtml);
    assertThat(
            jdbc.queryForObject(
                "select snapshot::text from procedure_submissions where procedure_id = ? and submission_version = 1",
                String.class,
                current.id()))
        .isEqualTo(firstSnapshot);
    mvc.perform(get(path(current, "/submissions")).session(applicant))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$[0].version").value(2))
        .andExpect(jsonPath("$[1].version").value(1));
    SecurityRequestResponse repeated =
        exchange(
            post(path(current, "/submit")).header("Idempotency-Key", firstKey),
            applicant,
            new RevisionRequest(firstExpectedRevision));
    assertThat(repeated.submissionVersion()).isEqualTo(2);
    assertThat(
            jdbc.queryForObject(
                "select count(*) from procedure_submissions where procedure_id = ?",
                Integer.class,
                current.id()))
        .isEqualTo(2);
  }

  @Test
  void closedAndWithdrawnRequestsKeepReadAccessButRejectAllBusinessMutations() throws Exception {
    MockHttpSession applicant = login("applicant.demo");
    MockHttpSession infra = login("infra.demo");
    MockHttpSession security = login("security.demo");
    for (boolean withdraw : List.of(false, true)) {
      SecurityRequestResponse current = readySecurityRequest(applicant, infra, security);
      var answers = current.answers();
      String terminalPath = withdraw ? "/withdraw" : "/close";
      MockHttpSession terminating = withdraw ? applicant : security;
      mvc.perform(
              post(path(current, terminalPath))
                  .session(terminating)
                  .with(csrf())
                  .contentType(MediaType.APPLICATION_JSON)
                  .content(mapper.writeValueAsBytes(new TerminalRequest(current.revision(), " "))))
          .andExpect(status().isBadRequest());
      current =
          exchange(
              post(path(current, terminalPath)),
              terminating,
              new TerminalRequest(current.revision(), "합성 종료 사유"));
      assertThat(current.status()).isEqualTo(withdraw ? "WITHDRAWN" : "CLOSED");
      assertThat(current.terminalReason()).isEqualTo("합성 종료 사유");
      assertThat(current.allowedActions()).isEmpty();
      assertThat(fetch(applicant, current.id()).answers()).isEqualTo(answers);
      assertThat(document(security, current.id())).contains("합성");
      for (String action : List.of("/consult", "/submit", "/return", "/withdraw")) {
        Object body =
            action.equals("/return")
                ? new ReturnRequest(current.revision(), 2, "종료 후 반환 시도", List.of("purpose"))
                : action.equals("/withdraw")
                    ? new TerminalRequest(current.revision(), "종료 후 재철회")
                    : new RevisionRequest(current.revision());
        mvc.perform(
                post(path(current, action))
                    .session(applicant)
                    .with(csrf())
                    .header("Idempotency-Key", UUID.randomUUID().toString())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(mapper.writeValueAsBytes(body)))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("REQUEST_TERMINATED"));
      }
      for (String action :
          List.of("/review", "/review/start", "/final-review", "/confirm", "/close")) {
        Object body =
            action.equals("/close")
                ? new TerminalRequest(current.revision(), "종료 후 재종결")
                : action.equals("/review") || action.equals("/final-review")
                    ? new ReviewRequest(current.revision(), "종료 후 검토 시도")
                    : new RevisionRequest(current.revision());
        mvc.perform(
                post(path(current, action))
                    .session(security)
                    .with(csrf())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(mapper.writeValueAsBytes(body)))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("REQUEST_TERMINATED"));
      }
      mvc.perform(
              patch(path(current, "/answers"))
                  .session(applicant)
                  .with(csrf())
                  .contentType(MediaType.APPLICATION_JSON)
                  .content(
                      mapper.writeValueAsBytes(
                          new AnswerPatchRequest(
                              current.revision(),
                              List.of(
                                  new AnswerPatchRequest.AnswerInput(
                                      "purpose", "종료 후 변경 시도", true, false))))))
          .andExpect(status().isConflict())
          .andExpect(jsonPath("$.code").value("REQUEST_TERMINATED"));
    }
  }

  private SecurityRequestResponse readySecurityRequest(
      MockHttpSession applicant, MockHttpSession infra, MockHttpSession security) throws Exception {
    SecurityRequestResponse request = create(applicant, "SECURITY_REVIEW", "합성 반환·종료 검증");
    request = fillAnswers(applicant, request, "APPLICANT");
    request =
        exchange(
            post(path(request, "/consult")), applicant, new RevisionRequest(request.revision()));
    request = fillAnswers(infra, request, "INFRA");
    request = allocate(infra, request);
    request = fillAnswers(security, request, "SECURITY");
    request = review(infra, request);
    return review(security, request);
  }

  private int editAtGate(
      CountDownLatch start,
      MockHttpSession session,
      SecurityRequestResponse procedure,
      String key,
      String value)
      throws Exception {
    if (!start.await(5, TimeUnit.SECONDS)) throw new IllegalStateException("테스트 시작 신호를 받지 못했습니다.");
    return mvc.perform(
            patch(path(procedure, "/answers"))
                .session(session)
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    mapper.writeValueAsBytes(
                        new AnswerPatchRequest(
                            procedure.revision(),
                            List.of(new AnswerPatchRequest.AnswerInput(key, value, true, false))))))
        .andReturn()
        .getResponse()
        .getStatus();
  }

  private SecurityRequestResponse create(MockHttpSession session, String type, String description)
      throws Exception {
    var result =
        mvc.perform(
                post("/api/security-requests")
                    .session(session)
                    .with(csrf())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(
                        mapper.writeValueAsBytes(
                            new CreateSecurityRequestRequest(
                                "합성 통합 검증 " + UUID.randomUUID(), type, "가상 부서", description))))
            .andExpect(status().isCreated())
            .andReturn();
    return mapper.readValue(
        result.getResponse().getContentAsByteArray(), SecurityRequestResponse.class);
  }

  private SecurityRequestResponse fillAnswers(
      MockHttpSession session, SecurityRequestResponse procedure, String role) throws Exception {
    List<AnswerPatchRequest.AnswerInput> answers =
        procedure.answers().stream()
            .filter(answer -> answer.ownerRole().equals(role))
            .map(
                answer ->
                    new AnswerPatchRequest.AnswerInput(
                        answer.key(),
                        answer.key().equals("externalTransfer")
                            ? "NO"
                            : "합성 자료 확인: " + answer.label(),
                        true,
                        false))
            .toList();
    return exchange(
        patch(path(procedure, "/answers")),
        session,
        new AnswerPatchRequest(procedure.revision(), answers));
  }

  private SecurityRequestResponse review(MockHttpSession session, SecurityRequestResponse procedure)
      throws Exception {
    return exchange(
        post(path(procedure, "/review")),
        session,
        new ReviewRequest(procedure.revision(), "현재 합성 자료를 확인했습니다."));
  }

  private SecurityRequestResponse allocate(MockHttpSession infra, SecurityRequestResponse request)
      throws Exception {
    return exchange(
        post(path(request, "/allocation")),
        infra,
        new ReviewRequest(request.revision(), "합성 자원 할당 범위를 확인했습니다."));
  }

  private SettingsResponse settings(MockHttpSession admin) throws Exception {
    var result =
        mvc.perform(get("/api/institution/settings").session(admin))
            .andExpect(status().isOk())
            .andReturn();
    return mapper.readValue(result.getResponse().getContentAsByteArray(), SettingsResponse.class);
  }

  private SettingsResponse savePolicy(MockHttpSession admin, OrganizationPolicy policy)
      throws Exception {
    SettingsResponse current = settings(admin);
    var result =
        mvc.perform(
                put("/api/institution/settings")
                    .session(admin)
                    .with(csrf())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(
                        mapper.writeValueAsBytes(new SettingsRequest(current.revision(), policy))))
            .andExpect(status().isOk())
            .andReturn();
    return mapper.readValue(result.getResponse().getContentAsByteArray(), SettingsResponse.class);
  }

  private void publishPolicy(MockHttpSession admin, OrganizationPolicy policy) throws Exception {
    SettingsResponse saved = savePolicy(admin, policy);
    mvc.perform(
            post("/api/institution/settings/publish")
                .session(admin)
                .with(csrf())
                .header("Idempotency-Key", UUID.randomUUID().toString())
                .contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsBytes(new PublishRequest(saved.revision()))))
        .andExpect(status().isOk());
  }

  private SecurityRequestResponse fetch(MockHttpSession session, UUID id) throws Exception {
    var result =
        mvc.perform(get("/api/security-requests/" + id).session(session))
            .andExpect(status().isOk())
            .andReturn();
    return mapper.readValue(
        result.getResponse().getContentAsByteArray(), SecurityRequestResponse.class);
  }

  private SecurityRequestResponse exchange(
      MockHttpServletRequestBuilder request, MockHttpSession session, Object body)
      throws Exception {
    var result =
        mvc.perform(
                request
                    .session(session)
                    .with(csrf())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(mapper.writeValueAsBytes(body)))
            .andExpect(status().isOk())
            .andReturn();
    return mapper.readValue(
        result.getResponse().getContentAsByteArray(), SecurityRequestResponse.class);
  }

  private String document(MockHttpSession session, UUID id) throws Exception {
    return mvc.perform(get("/api/security-requests/" + id + "/document").session(session))
        .andExpect(status().isOk())
        .andReturn()
        .getResponse()
        .getContentAsString(StandardCharsets.UTF_8);
  }

  private String path(SecurityRequestResponse procedure, String suffix) {
    return "/api/security-requests/" + procedure.id() + suffix;
  }
}
