package kr.securityadvisor.auth.dto;

import java.util.UUID;
import kr.securityadvisor.common.security.Actor;
import kr.securityadvisor.common.security.Role;

/** 인증 내부 토큰이나 비밀번호 해시를 노출하지 않는 사용자 응답이다. */
public record UserResponse(
    UUID userId, UUID institutionId, String username, String displayName, Role role) {
  public static UserResponse from(Actor actor) {
    return new UserResponse(
        actor.userId(), actor.institutionId(), actor.username(), actor.displayName(), actor.role());
  }
}
