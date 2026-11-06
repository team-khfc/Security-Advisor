package kr.securityadvisor.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import kr.securityadvisor.auth.service.LoginAttemptLimiter;
import kr.securityadvisor.common.error.ProblemWriter;
import org.springframework.web.filter.OncePerRequestFilter;

/** 위조 가능한 전달 헤더 대신 서버가 관찰한 접속원을 제한한다. */
public class LoginLimitFilter extends OncePerRequestFilter {
  private final LoginAttemptLimiter limiter;
  private final ProblemWriter problems;

  public LoginLimitFilter(LoginAttemptLimiter limiter, ProblemWriter problems) {
    this.limiter = limiter;
    this.problems = problems;
  }

  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain chain)
      throws ServletException, IOException {
    if ("POST".equals(request.getMethod()) && "/api/auth/login".equals(request.getServletPath())) {
      String username = request.getParameter("username");
      if (username == null
          || username.length() > 80
          || !limiter.allow(request.getRemoteAddr(), username)) {
        response.setHeader("Retry-After", "60");
        problems.write(request, response, 429, "LOGIN_LIMIT", "로그인 시도가 많습니다. 잠시 후 다시 시도해 주세요.");
        return;
      }
    }
    chain.doFilter(request, response);
  }
}
