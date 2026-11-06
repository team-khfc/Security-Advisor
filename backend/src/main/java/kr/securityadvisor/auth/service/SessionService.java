package kr.securityadvisor.auth.service;

import jakarta.servlet.http.HttpSession;
import java.time.Instant;
import kr.securityadvisor.auth.dto.SessionResponse;
import kr.securityadvisor.auth.dto.UserResponse;
import kr.securityadvisor.common.model.PolicyProvider;
import kr.securityadvisor.common.security.Actor;
import org.springframework.stereotype.Service;

/** 매번 서버 기준 만료 시각과 현재 기관 표시를 함께 반환한다. */
@Service
public class SessionService {
  private final PolicyProvider policies;

  public SessionService(PolicyProvider policies) {
    this.policies = policies;
  }

  /** 컨테이너의 idle timeout 정책을 화면이 임의 연장하지 못하게 한다. */
  public SessionResponse describe(Actor actor, HttpSession session) {
    return new SessionResponse(
        UserResponse.from(actor),
        policies.current(actor.institutionId()).policy().institutionName(),
        Instant.now().plusSeconds(session.getMaxInactiveInterval()));
  }
}
