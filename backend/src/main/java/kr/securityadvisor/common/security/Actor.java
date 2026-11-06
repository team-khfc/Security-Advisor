package kr.securityadvisor.common.security;

import java.security.Principal;
import java.util.UUID;

/** 서버가 DB에서 확인한 신원이며 클라이언트 입력으로 만들지 않는다. */
public record Actor(UUID userId, UUID institutionId, String username, String displayName, Role role)
    implements Principal {
  @Override
  public String getName() {
    return username;
  }
}
