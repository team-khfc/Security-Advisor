package kr.securityadvisor.common.error;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ProblemDetail;

/** 내부 예외 내용 대신 요청 번호를 포함한 안전한 오류 계약을 만든다. */
public final class ProblemFactory {
  private ProblemFactory() {}

  /** 요청 상관관계와 사용자가 조치할 설명만 노출한다. */
  public static ProblemDetail create(
      HttpServletRequest request, int status, String code, String detail) {
    ProblemDetail problem =
        ProblemDetail.forStatusAndDetail(HttpStatusCode.valueOf(status), detail);
    problem.setTitle("요청을 완료하지 못했습니다.");
    problem.setProperty("code", code);
    problem.setProperty("requestId", String.valueOf(request.getAttribute("requestId")));
    return problem;
  }
}
