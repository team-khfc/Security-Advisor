package kr.securityadvisor.auth.controller;

import jakarta.servlet.http.HttpServletRequest;
import kr.securityadvisor.auth.dto.CsrfResponse;
import kr.securityadvisor.auth.dto.SessionResponse;
import kr.securityadvisor.auth.service.SessionService;
import kr.securityadvisor.common.security.Actor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 세션과 CSRF 교환만 담당하며 계정 판단은 서비스에 맡긴다. */
@RestController
@RequestMapping("/api/auth")
public class AuthController {
  private final SessionService sessions;

  public AuthController(SessionService sessions) {
    this.sessions = sessions;
  }

  /** 지연 생성된 토큰을 실제로 읽어 같은 세션에 결합한다. */
  @GetMapping("/csrf")
  public CsrfResponse csrf(CsrfToken token) {
    return new CsrfResponse(token.getToken(), token.getHeaderName());
  }

  /** 헤더나 화면 역할이 아닌 인증 주체를 사용한다. */
  @GetMapping("/session")
  public SessionResponse session(@AuthenticationPrincipal Actor actor, HttpServletRequest request) {
    return sessions.describe(actor, request.getSession(false));
  }

  /** 이 요청이 서버 세션에 도달한 뒤에만 연장 시각을 알린다. */
  @PostMapping("/extend")
  public SessionResponse extend(@AuthenticationPrincipal Actor actor, HttpServletRequest request) {
    request.getSession(false).setAttribute("lastExplicitExtension", java.time.Instant.now());
    return sessions.describe(actor, request.getSession(false));
  }
}
