package kr.securityadvisor.auth.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class LoginAttemptLimiterTest {
  @Test
  @DisplayName("같은 계정의 반복 인증을 열 번째 이후 제한한다")
  void limitRepeatedAccount() {
    var limiter = new LoginAttemptLimiter(Clock.fixed(Instant.EPOCH, ZoneOffset.UTC));
    for (int i = 0; i < 10; i++)
      assertThat(limiter.allow("synthetic-client", "applicant.demo")).isTrue();
    assertThat(limiter.allow("synthetic-client", "applicant.demo")).isFalse();
  }

  @Test
  @DisplayName("계정을 바꾸어 대입해도 접속원 상한을 넘지 못한다")
  void limitAccountRotation() {
    var limiter = new LoginAttemptLimiter(Clock.fixed(Instant.EPOCH, ZoneOffset.UTC));
    for (int i = 0; i < 50; i++)
      assertThat(limiter.allow("synthetic-client", "synthetic-" + i)).isTrue();
    assertThat(limiter.allow("synthetic-client", "another")).isFalse();
  }
}
