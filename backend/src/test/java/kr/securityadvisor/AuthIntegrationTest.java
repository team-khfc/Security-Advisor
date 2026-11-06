package kr.securityadvisor;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.ObjectMapper;

class AuthIntegrationTest extends IntegrationTestSupport {
  @Autowired
  AuthIntegrationTest(MockMvc mvc, ObjectMapper mapper) {
    super(mvc, mapper);
  }

  @Test
  @DisplayName("인증 없는 업무 접근과 CSRF 없는 변경을 거절한다")
  void protectBusinessRequests() throws Exception {
    mvc.perform(get("/api/security-requests"))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.requestId").exists());
    var applicant = login("applicant.demo");
    mvc.perform(post("/api/auth/extend").session(applicant)).andExpect(status().isForbidden());
    mvc.perform(post("/api/auth/extend").session(applicant).with(csrf()))
        .andExpect(status().isOk());
  }

  @Test
  @DisplayName("역할 헤더를 위조해도 서버에 저장된 신원이 유지된다")
  void ignoreUntrustedRole() throws Exception {
    var applicant = login("applicant.demo");
    mvc.perform(get("/api/auth/session").session(applicant).header("X-Role", "ADMIN"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.user.role").value("APPLICANT"));
    mvc.perform(get("/api/institution/settings").session(applicant).header("X-Role", "ADMIN"))
        .andExpect(status().isForbidden());
  }

  @Test
  @DisplayName("로그아웃 후에는 이전 신원으로 업무를 조회할 수 없다")
  void endSession() throws Exception {
    var applicant = login("applicant.demo");
    mvc.perform(post("/api/auth/logout").session(applicant).with(csrf()))
        .andExpect(status().isNoContent());
    mvc.perform(get("/api/security-requests")).andExpect(status().isUnauthorized());
  }
}
