package kr.securityadvisor.knowledge.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.UUID;
import kr.securityadvisor.common.error.DomainException;
import kr.securityadvisor.knowledge.domain.ContextPayload;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

class ContextCipherTest {
  @Test
  @DisplayName("제목·분류·본문을 암호화하고 같은 입력에도 다른 암호문을 만든다")
  void encryptEverySensitiveFieldWithFreshNonce() {
    ContextCipher cipher = new ContextCipher(key(), JsonMapper.builder().build());
    UUID institution = UUID.randomUUID();
    UUID id = UUID.randomUUID();
    ContextPayload payload = new ContextPayload("합성 참고 제목", "합성 분류", "시연 전용 내용");
    byte[] first = cipher.encrypt(institution, id, payload);
    byte[] second = cipher.encrypt(institution, id, payload);
    assertThat(first).isNotEqualTo(second);
    assertThat(new String(first, StandardCharsets.UTF_8))
        .doesNotContain(payload.title(), payload.category(), payload.content());
    assertThat(cipher.decrypt(institution, id, first)).isEqualTo(payload);
  }

  @Test
  @DisplayName("기관·자료 ID 변경과 암호문 변조를 인증 태그 검증으로 거절한다")
  void preventCiphertextSwappingAndTampering() {
    ContextCipher cipher = new ContextCipher(key(), JsonMapper.builder().build());
    UUID institution = UUID.randomUUID();
    UUID id = UUID.randomUUID();
    byte[] encrypted = cipher.encrypt(institution, id, new ContextPayload("합성 제목", "예시", "합성 본문"));
    assertThatThrownBy(() -> cipher.decrypt(UUID.randomUUID(), id, encrypted))
        .isInstanceOf(DomainException.class);
    assertThatThrownBy(() -> cipher.decrypt(institution, UUID.randomUUID(), encrypted))
        .isInstanceOf(DomainException.class);
    assertThatThrownBy(
            () ->
                new ContextCipher(key(), JsonMapper.builder().build())
                    .decrypt(institution, id, encrypted))
        .isInstanceOf(DomainException.class);
    encrypted[encrypted.length - 1] ^= 1;
    assertThatThrownBy(() -> cipher.decrypt(institution, id, encrypted))
        .isInstanceOf(DomainException.class);
  }

  @Test
  @DisplayName("짧거나 잘못된 암호화 키로 서비스를 시작하지 않는다")
  void rejectInvalidKey() {
    assertThatThrownBy(
            () ->
                new ContextCipher(
                    Base64.getEncoder().encodeToString(new byte[16]), JsonMapper.builder().build()))
        .isInstanceOf(IllegalStateException.class);
    assertThatThrownBy(() -> new ContextCipher("invalid-format", JsonMapper.builder().build()))
        .isInstanceOf(IllegalStateException.class);
  }

  private String key() {
    byte[] key = new byte[32];
    new SecureRandom().nextBytes(key);
    return Base64.getEncoder().encodeToString(key);
  }
}
