package kr.securityadvisor;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import kr.securityadvisor.common.model.ModelConnection;
import kr.securityadvisor.llm.domain.ModelAssignment;
import kr.securityadvisor.llm.dto.AnalysisResponse;
import kr.securityadvisor.llm.dto.ModelsRequest;
import kr.securityadvisor.llm.dto.ModelsResponse;
import kr.securityadvisor.request.dto.CreateSecurityRequestRequest;
import kr.securityadvisor.request.dto.SecurityRequestResponse;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.ObjectMapper;

class LlmConfigurationIntegrationTest extends IntegrationTestSupport {
  @Autowired
  LlmConfigurationIntegrationTest(MockMvc mvc, ObjectMapper mapper) {
    super(mvc, mapper);
  }

  @Test
  @DisplayName("기관 모델 변경은 정책 게시와 독립적으로 즉시 적용되고 실행·관리자 이력에 구성 버전이 남는다")
  void applyLatestConfigurationWithoutMutatingRequestPolicy() throws Exception {
    var admin = login("admin.demo");
    var applicant = login("applicant.demo");
    var request =
        mapper.readValue(
            mvc.perform(
                    post("/api/security-requests")
                        .session(applicant)
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(
                            mapper.writeValueAsBytes(
                                new CreateSecurityRequestRequest(
                                    "합성 모델 교체 검사", "FIREWALL", "시연 부서", "모델 구성과 게시 정책 분리"))))
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse()
                .getContentAsByteArray(),
            SecurityRequestResponse.class);
    var original =
        mapper.readValue(
            mvc.perform(get("/api/institution/models").session(admin))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsByteArray(),
            ModelsResponse.class);
    var example = new ModelConnection("EXAMPLE", "", "extractive-version-check", "", 0.2, 1200, 30);
    var assignments =
        List.of(
            new ModelAssignment("DOCUMENT_ANALYSIS", example),
            new ModelAssignment("STAFF_ASSISTANT", example),
            new ModelAssignment("FINAL_DRAFT", example));
    var update = new ModelsRequest(original.revision(), assignments);
    var changed =
        mapper.readValue(
            mvc.perform(
                    put("/api/institution/models")
                        .session(admin)
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(mapper.writeValueAsBytes(update)))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsByteArray(),
            ModelsResponse.class);
    assertThat(changed.revision()).isEqualTo(original.revision() + 1);
    assertThat(changed.history().getFirst().revision()).isEqualTo(changed.revision());
    mvc.perform(
            put("/api/institution/models")
                .session(admin)
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsBytes(update)))
        .andExpect(status().isConflict());
    mvc.perform(get("/api/institution/models").session(applicant))
        .andExpect(status().isForbidden());
    var analyzed =
        mapper.readValue(
            mvc.perform(
                    multipart("/api/security-requests/" + request.id() + "/analysis")
                        .session(applicant)
                        .with(csrf())
                        .param("expectedRevision", Long.toString(request.revision()))
                        .param("text", "사업 목적: 합성 모델 전환 사업"))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsByteArray(),
            AnalysisResponse.class);
    assertThat(analyzed.modelConfigurationRevision()).isEqualTo(changed.revision());
    assertThat(analyzed.model()).isEqualTo("extractive-version-check");
    var unchanged =
        mapper.readValue(
            mvc.perform(get("/api/security-requests/" + request.id()).session(applicant))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsByteArray(),
            SecurityRequestResponse.class);
    assertThat(unchanged.policyVersion()).isEqualTo(request.policyVersion());
    assertThat(unchanged.policy()).isEqualTo(request.policy());
  }

  @Test
  @DisplayName("공개 자료 검색은 실제 PGVector 결과의 제목·판본·절을 반환하고 PDF 전문 색인으로 표시하지 않는다")
  void retrieveOnlyIndexedPublicSummaries() throws Exception {
    mvc.perform(
            get("/api/knowledge/search").param("q", "방화벽 정책 관리").session(login("applicant.demo")))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.embeddingMethod").value("LOCAL_FEATURE_HASH_256"))
        .andExpect(jsonPath("$.fullDocumentsIndexed").value(false))
        .andExpect(jsonPath("$.results[0].title").isNotEmpty())
        .andExpect(jsonPath("$.results[0].version").isNotEmpty())
        .andExpect(jsonPath("$.results[0].section").isNotEmpty())
        .andExpect(jsonPath("$.results[0].excerpt").isNotEmpty());
  }
}
