package kr.securityadvisor.config;

import kr.securityadvisor.auth.service.AuthService;
import kr.securityadvisor.common.security.Actor;
import org.springframework.security.authentication.AuthenticationProvider;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

/** Spring Security 표준 로그인·세션 고정 방어를 DB 인증에 연결한다. */
public class DatabaseAuthenticationProvider implements AuthenticationProvider {
  private final AuthService auth;

  public DatabaseAuthenticationProvider(AuthService auth) {
    this.auth = auth;
  }

  @Override
  public Authentication authenticate(Authentication request) {
    String username = request.getName();
    String password = String.valueOf(request.getCredentials());
    if (username.length() > 80 || password.length() > 128)
      throw new BadCredentialsException("인증에 실패했습니다.");
    Actor actor = auth.authenticate(username, password);
    return UsernamePasswordAuthenticationToken.authenticated(
        actor, null, java.util.List.of(new SimpleGrantedAuthority("ROLE_" + actor.role().name())));
  }

  @Override
  public boolean supports(Class<?> type) {
    return UsernamePasswordAuthenticationToken.class.isAssignableFrom(type);
  }
}
