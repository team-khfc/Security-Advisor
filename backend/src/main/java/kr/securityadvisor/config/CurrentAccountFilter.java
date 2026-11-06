package kr.securityadvisor.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.time.Instant;
import java.util.List;
import kr.securityadvisor.auth.service.AuthService;
import kr.securityadvisor.common.error.DomainException;
import kr.securityadvisor.common.error.ProblemWriter;
import kr.securityadvisor.common.security.Actor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

/** 기존 세션의 역할·기관도 매 요청 DB에서 다시 확인한다. */
public class CurrentAccountFilter extends OncePerRequestFilter {
  private final AuthService auth;
  private final ProblemWriter problems;

  public CurrentAccountFilter(AuthService auth, ProblemWriter problems) {
    this.auth = auth;
    this.problems = problems;
  }

  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain chain)
      throws ServletException, IOException {
    var authentication = SecurityContextHolder.getContext().getAuthentication();
    if (authentication != null && authentication.getPrincipal() instanceof Actor previous) {
      try {
        Actor current = auth.current(previous.userId());
        SecurityContextHolder.getContext()
            .setAuthentication(
                UsernamePasswordAuthenticationToken.authenticated(
                    current,
                    null,
                    List.of(new SimpleGrantedAuthority("ROLE_" + current.role().name()))));
        var session = request.getSession(false);
        if (session != null)
          response.setHeader(
              "X-Session-Expires-At",
              Instant.now().plusSeconds(session.getMaxInactiveInterval()).toString());
      } catch (DomainException error) {
        SecurityContextHolder.clearContext();
        if (request.getSession(false) != null) request.getSession(false).invalidate();
        problems.write(request, response, 401, error.getCode(), error.getMessage());
        return;
      }
    }
    chain.doFilter(request, response);
  }
}
