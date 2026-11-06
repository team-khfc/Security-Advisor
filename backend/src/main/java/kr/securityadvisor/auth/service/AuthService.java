package kr.securityadvisor.auth.service;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import kr.securityadvisor.auth.domain.UserAccount;
import kr.securityadvisor.auth.repository.UserAccountRepository;
import kr.securityadvisor.common.error.DomainException;
import kr.securityadvisor.common.security.Actor;
import kr.securityadvisor.common.security.Role;
import org.springframework.core.env.Environment;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 인증과 현재 계정 상태의 판단을 DB 트랜잭션 경계 안에 둔다. */
@Service
@Transactional(readOnly = true)
public class AuthService {
  private final UserAccountRepository accounts;
  private final PasswordEncoder passwords;
  private final Environment environment;
  private final String absentHash;

  public AuthService(
      UserAccountRepository accounts, PasswordEncoder passwords, Environment environment) {
    this.accounts = accounts;
    this.passwords = passwords;
    this.environment = environment;
    absentHash = passwords.encode(UUID.randomUUID().toString());
  }

  /**
   * 존재하지 않는 계정에도 해시 검사를 수행한다.
   *
   * @throws BadCredentialsException 계정이 없거나 비활성·암호 불일치인 경우
   */
  public Actor authenticate(String username, String password) {
    UserAccount user = accounts.findByUsername(username).orElse(null);
    boolean matches =
        passwords.matches(password, user == null ? absentHash : user.getPasswordHash());
    if (user == null || !user.isActive() || !matches)
      throw new BadCredentialsException("인증에 실패했습니다.");
    return user.toActor();
  }

  /**
   * 이미 발급한 세션이라도 현재 계정 상태와 역할을 다시 확인한다.
   *
   * @throws DomainException 계정이 사라지거나 중지된 경우
   */
  public Actor current(UUID userId) {
    UserAccount user =
        accounts
            .findById(userId)
            .orElseThrow(() -> new DomainException(401, "SESSION_EXPIRED", "다시 로그인해 주세요."));
    if (!user.isActive()) throw new DomainException(401, "ACCOUNT_INACTIVE", "사용할 수 없는 계정입니다.");
    return user.toActor();
  }

  /** 합성 시연 계정은 환경변수 암호를 해시한 최초 레코드만 생성한다. */
  @Transactional
  public List<Actor> initializeDemoAccounts() {
    List<Actor> result = new ArrayList<>();
    UUID institution = UUID.fromString("10000000-0000-0000-0000-000000000001");
    Role[] roles = {Role.APPLICANT, Role.SECURITY, Role.INFRA, Role.ADMIN};
    String[] names = {"가상 사업 담당자", "가상 보안 담당자", "가상 인프라 담당자", "가상 기관 관리자"};
    for (int i = 0; i < roles.length; i++) {
      Role role = roles[i];
      result.add(
          seed(
              UUID.fromString("30000000-0000-0000-0000-00000000000" + (i + 1)),
              institution,
              role.name().toLowerCase(java.util.Locale.ROOT) + ".demo",
              names[i],
              role));
    }
    seed(
        UUID.fromString("30000000-0000-0000-0000-000000000005"),
        institution,
        "second.demo",
        "다른 가상 신청자",
        Role.APPLICANT);
    seed(
        UUID.fromString("30000000-0000-0000-0000-000000000006"),
        UUID.fromString("20000000-0000-0000-0000-000000000002"),
        "outside.demo",
        "다른 기관 가상 신청자",
        Role.APPLICANT);
    return List.copyOf(result);
  }

  private Actor seed(UUID id, UUID institution, String username, String name, Role role) {
    var existing = accounts.findByUsername(username);
    if (existing.isPresent()) return existing.get().toActor();
    String secret = environment.getProperty("SECURITYADVISOR_DEMO_" + role.name() + "_PASSWORD");
    if (secret == null)
      secret = environment.getRequiredProperty("BOAN_DEMO_" + role.name() + "_PASSWORD");
    if (secret.length() < 16
        || secret.getBytes(StandardCharsets.UTF_8).length > 72
        || secret.chars().noneMatch(Character::isUpperCase)
        || secret.chars().noneMatch(Character::isLowerCase)
        || secret.chars().noneMatch(Character::isDigit)) {
      throw new IllegalStateException("시연 암호는 영문 대소문자·숫자를 포함하고 16자 이상, UTF-8 72바이트 이하여야 합니다.");
    }
    return accounts
        .save(new UserAccount(id, institution, username, name, passwords.encode(secret), role))
        .toActor();
  }
}
