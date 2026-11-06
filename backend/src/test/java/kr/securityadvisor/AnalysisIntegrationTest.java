package kr.securityadvisor;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.util.List;
import kr.securityadvisor.llm.dto.AnalysisResponse;
import kr.securityadvisor.llm.dto.ApplyAnalysisRequest;
import kr.securityadvisor.request.dto.AnswerPatchRequest;
import kr.securityadvisor.request.dto.CreateSecurityRequestRequest;
import kr.securityadvisor.request.dto.SecurityRequestResponse;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.ObjectMapper;

class AnalysisIntegrationTest extends IntegrationTestSupport {
  @Autowired
  AnalysisIntegrationTest(MockMvc mvc, ObjectMapper mapper) {
    super(mvc, mapper);
  }

  @Test
  @DisplayName("명시적 분석·저장 후보 반영·사람 확인을 분리하고 원 AI 출처를 유지한다")
  void separateAnalysisApplicationAndConfirmation() throws Exception {
    var applicant = login("applicant.demo");
    SecurityRequestResponse procedure = create(applicant);
    String text = "사업 목적: 합성 안내 서비스\n이용 대상: 합성 이용자\n외부 전송: UNKNOWN";
    AnalysisResponse result = analyze(applicant, procedure, text);
    assertThat(result.mode()).isEqualTo("EXAMPLE");
    assertThat(result.status()).isEqualTo("SUCCEEDED");
    assertThat(result.references()).isEmpty();
    assertThat(result.suggestions()).hasSize(3);
    for (String invalid : List.of("{}", "{\"expectedRevision\":null}")) {
      mvc.perform(
              post("/api/security-requests/"
                      + procedure.id()
                      + "/analysis/"
                      + result.id()
                      + "/apply")
                  .session(applicant)
                  .with(csrf())
                  .contentType(MediaType.APPLICATION_JSON)
                  .content(invalid))
          .andExpect(status().isBadRequest());
    }
    SecurityRequestResponse beforeApply = current(applicant, procedure);
    assertThat(beforeApply.revision()).isEqualTo(procedure.revision());
    assertThat(beforeApply.answers()).allMatch(answer -> "EMPTY".equals(answer.status()));
    SecurityRequestResponse applied =
        mapper.readValue(
            mvc.perform(
                    post("/api/security-requests/"
                            + procedure.id()
                            + "/analysis/"
                            + result.id()
                            + "/apply")
                        .session(applicant)
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(
                            mapper.writeValueAsBytes(
                                new ApplyAnalysisRequest(procedure.revision()))))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsByteArray(),
            SecurityRequestResponse.class);
    assertThat(applied.revision()).isEqualTo(procedure.revision() + 1);
    var proposed =
        applied.answers().stream()
            .filter(answer -> answer.key().equals("purpose"))
            .findFirst()
            .orElseThrow();
    assertThat(proposed.status()).isEqualTo("PROPOSED");
    assertThat(proposed.source().kind()).isEqualTo("AI_INFERRED");
    assertThat(proposed.confirmation()).isNull();
    SecurityRequestResponse confirmed =
        patchAnswers(
            applicant,
            applied,
            new AnswerPatchRequest.AnswerInput("purpose", proposed.value(), true, false));
    var confirmedPurpose =
        confirmed.answers().stream()
            .filter(answer -> answer.key().equals("purpose"))
            .findFirst()
            .orElseThrow();
    assertThat(confirmedPurpose.status()).isEqualTo("CONFIRMED");
    assertThat(confirmedPurpose.source().kind()).isEqualTo("AI_INFERRED");
    assertThat(confirmedPurpose.confirmation().role()).isEqualTo("APPLICANT");
    AnalysisResponse afterConfirmation = analyze(applicant, confirmed, text);
    assertThat(afterConfirmation.suggestions()).noneMatch(item -> item.key().equals("purpose"));
    mvc.perform(
            post("/api/security-requests/" + procedure.id() + "/analysis/" + result.id() + "/apply")
                .session(applicant)
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsBytes(new ApplyAnalysisRequest(confirmed.revision()))))
        .andExpect(status().isConflict());
  }

  @Test
  @DisplayName("분석 후 바뀐 입력의 후보는 적용할 수 없고 다른 신청자·기관의 조회도 거절한다")
  void rejectStaleAnalysisAndOtherOwners() throws Exception {
    var applicant = login("applicant.demo");
    var other = login("second.demo");
    var outside = login("outside.demo");
    SecurityRequestResponse procedure = create(applicant);
    AnalysisResponse result = analyze(applicant, procedure, "사업 목적: 합성 사업 설명");
    SecurityRequestResponse changed =
        patchAnswers(
            applicant,
            procedure,
            new AnswerPatchRequest.AnswerInput("audience", "사용자가 새로 입력한 합성 대상", true, false));
    mvc.perform(
            post("/api/security-requests/" + procedure.id() + "/analysis/" + result.id() + "/apply")
                .session(applicant)
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsBytes(new ApplyAnalysisRequest(changed.revision()))))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("STALE_ANALYSIS"));
    mvc.perform(get("/api/security-requests/" + procedure.id() + "/analysis").session(applicant))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$[0].status").value("STALE"));
    mvc.perform(get("/api/security-requests/" + procedure.id() + "/analysis").session(other))
        .andExpect(status().isNotFound());
    mvc.perform(get("/api/security-requests/" + procedure.id() + "/analysis").session(outside))
        .andExpect(status().isNotFound());
  }

  @Test
  @DisplayName("검증 실패를 2xx 성공으로 숨기지 않고 실패 실행 이력을 별도 트랜잭션으로 남긴다")
  void persistFailedRunWithoutSuccessFallback() throws Exception {
    var applicant = login("applicant.demo");
    SecurityRequestResponse procedure = create(applicant);
    mvc.perform(
            multipart("/api/security-requests/" + procedure.id() + "/analysis")
                .session(applicant)
                .with(csrf())
                .param("expectedRevision", Long.toString(procedure.revision()))
                .param("text", "데이터 흐름: 192.0.2.15"))
        .andExpect(status().isBadGateway())
        .andExpect(jsonPath("$.code").value("MODEL_OUTPUT_REJECTED"));
    mvc.perform(get("/api/security-requests/" + procedure.id() + "/analysis").session(applicant))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$[0].status").value("FAILED"))
        .andExpect(jsonPath("$[0].suggestions").isEmpty());
    assertThat(current(applicant, procedure).revision()).isEqualTo(procedure.revision());
  }

  @Test
  @DisplayName("텍스트 파일을 명시적으로 제출한 분석만 실행하며 실행 파일은 거절한다")
  void explicitMultipartUpload() throws Exception {
    var applicant = login("applicant.demo");
    SecurityRequestResponse procedure = create(applicant);
    MockMultipartFile file =
        new MockMultipartFile(
            "file",
            "합성-사업개요.md",
            "text/markdown",
            "사업 목적: 합성 안내 서비스".getBytes(StandardCharsets.UTF_8));
    mvc.perform(
            multipart("/api/security-requests/" + procedure.id() + "/analysis")
                .file(file)
                .session(applicant)
                .with(csrf())
                .param("expectedRevision", Long.toString(procedure.revision())))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.suggestions[0].value").value("합성 안내 서비스"));
    MockMultipartFile unsupported =
        new MockMultipartFile("file", "합성.exe", "application/octet-stream", new byte[] {65});
    mvc.perform(
            multipart("/api/security-requests/" + procedure.id() + "/analysis")
                .file(unsupported)
                .session(applicant)
                .with(csrf())
                .param("expectedRevision", Long.toString(procedure.revision())))
        .andExpect(status().isUnprocessableEntity());
  }

  private SecurityRequestResponse create(MockHttpSession applicant) throws Exception {
    return mapper.readValue(
        mvc.perform(
                post("/api/security-requests")
                    .session(applicant)
                    .with(csrf())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(
                        mapper.writeValueAsBytes(
                            new CreateSecurityRequestRequest(
                                "합성 분석 검사 신청", "FIREWALL", "시연 부서", "후보 확인 절차 검사"))))
            .andExpect(status().isCreated())
            .andReturn()
            .getResponse()
            .getContentAsByteArray(),
        SecurityRequestResponse.class);
  }

  private AnalysisResponse analyze(
      MockHttpSession applicant, SecurityRequestResponse procedure, String text) throws Exception {
    return mapper.readValue(
        mvc.perform(
                multipart("/api/security-requests/" + procedure.id() + "/analysis")
                    .session(applicant)
                    .with(csrf())
                    .param("expectedRevision", Long.toString(procedure.revision()))
                    .param("text", text))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsByteArray(),
        AnalysisResponse.class);
  }

  private SecurityRequestResponse current(
      MockHttpSession applicant, SecurityRequestResponse procedure) throws Exception {
    return mapper.readValue(
        mvc.perform(get("/api/security-requests/" + procedure.id()).session(applicant))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsByteArray(),
        SecurityRequestResponse.class);
  }

  private SecurityRequestResponse patchAnswers(
      MockHttpSession applicant,
      SecurityRequestResponse procedure,
      AnswerPatchRequest.AnswerInput input)
      throws Exception {
    return mapper.readValue(
        mvc.perform(
                patch("/api/security-requests/" + procedure.id() + "/answers")
                    .session(applicant)
                    .with(csrf())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(
                        mapper.writeValueAsBytes(
                            new AnswerPatchRequest(procedure.revision(), List.of(input)))))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsByteArray(),
        SecurityRequestResponse.class);
  }
}
