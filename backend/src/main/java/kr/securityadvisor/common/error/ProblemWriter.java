package kr.securityadvisor.common.error;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

/** MVC 이전 보안 필터의 실패에도 동일한 문제 응답을 사용한다. */
@Component
public class ProblemWriter {
  private final ObjectMapper mapper;

  public ProblemWriter(ObjectMapper mapper) {
    this.mapper = mapper;
  }

  /** 인증·CSRF 오류에 내부 구현 정보가 섞이지 않도록 직렬화한다. */
  public void write(
      HttpServletRequest request,
      HttpServletResponse response,
      int status,
      String code,
      String detail)
      throws IOException {
    response.setStatus(status);
    response.setContentType("application/problem+json");
    response.setCharacterEncoding("UTF-8");
    mapper.writeValue(
        response.getOutputStream(), ProblemFactory.create(request, status, code, detail));
  }
}
