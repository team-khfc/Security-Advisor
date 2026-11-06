package kr.securityadvisor;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.ObjectMapper;

/** 필수 전송 정보 누락을 서버 장애와 구별한다. */
class ApiInputIntegrationTest extends IntegrationTestSupport {
  @Autowired
  ApiInputIntegrationTest(MockMvc mvc, ObjectMapper mapper) {
    super(mvc, mapper);
  }

  @Test
  @DisplayName("제출 식별자 누락은 내부 오류가 아닌 입력 오류로 반환한다")
  void rejectMissingIdempotencyHeader() throws Exception {
    mvc.perform(
            post("/api/security-requests/{id}/submit", UUID.randomUUID())
                .session(login("applicant.demo"))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"expectedRevision\":0}"))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("INVALID_INPUT"));
  }

  @Test
  @DisplayName("분석 입력의 기준 버전 누락은 요청 오류로 반환한다")
  void rejectMissingMultipartVersion() throws Exception {
    mvc.perform(
            multipart("/api/security-requests/{id}/analysis", UUID.randomUUID())
                .session(login("applicant.demo"))
                .with(csrf())
                .param("text", "합성 입력"))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("INVALID_INPUT"));
  }
}
