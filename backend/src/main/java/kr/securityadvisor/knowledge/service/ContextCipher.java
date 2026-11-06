package kr.securityadvisor.knowledge.service;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.UUID;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import kr.securityadvisor.common.error.DomainException;
import kr.securityadvisor.knowledge.domain.ContextPayload;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

/** 기관과 자료 식별자를 인증 데이터로 결합하여 암호문 바꿔치기도 거절한다. */
@Component
public class ContextCipher {
  private static final byte FORMAT_VERSION = 1;
  private static final int NONCE_LENGTH = 12;
  private final SecretKeySpec key;
  private final ObjectMapper mapper;
  private final SecureRandom random = new SecureRandom();

  public ContextCipher(
      @Value("${securityadvisor.context-key}") String encodedKey, ObjectMapper mapper) {
    byte[] decoded;
    try {
      decoded = Base64.getDecoder().decode(encodedKey);
    } catch (IllegalArgumentException exception) {
      throw new IllegalStateException("기관 참고 자료 암호화 키 형식을 확인해 주세요.");
    }
    if (decoded.length != 32) {
      throw new IllegalStateException("기관 참고 자료 암호화에는 256비트 키가 필요합니다.");
    }
    key = new SecretKeySpec(decoded, "AES");
    this.mapper = mapper;
  }

  /**
   * 제목·분류·본문을 매번 다른 난수 nonce로 암호화한다.
   *
   * @throws DomainException 암호화가 실패했을 때
   */
  public byte[] encrypt(UUID institutionId, UUID contextId, ContextPayload payload) {
    byte[] nonce = new byte[NONCE_LENGTH];
    random.nextBytes(nonce);
    try {
      Cipher cipher = createCipher(Cipher.ENCRYPT_MODE, nonce, institutionId, contextId);
      byte[] ciphertext = cipher.doFinal(mapper.writeValueAsBytes(payload));
      return ByteBuffer.allocate(1 + nonce.length + ciphertext.length)
          .put(FORMAT_VERSION)
          .put(nonce)
          .put(ciphertext)
          .array();
    } catch (GeneralSecurityException | JacksonException exception) {
      throw unavailable();
    }
  }

  /**
   * 다른 기관·자료로 옮겨진 암호문이나 손상된 값을 복호화하지 않는다.
   *
   * @throws DomainException 인증 태그·형식·키 검증이 실패했을 때
   */
  public ContextPayload decrypt(UUID institutionId, UUID contextId, byte[] payload) {
    if (payload == null || payload.length < 1 + NONCE_LENGTH + 16) {
      throw unavailable();
    }
    ByteBuffer bytes = ByteBuffer.wrap(payload);
    if (bytes.get() != FORMAT_VERSION) {
      throw unavailable();
    }
    byte[] nonce = new byte[NONCE_LENGTH];
    bytes.get(nonce);
    byte[] ciphertext = new byte[bytes.remaining()];
    bytes.get(ciphertext);
    try {
      Cipher cipher = createCipher(Cipher.DECRYPT_MODE, nonce, institutionId, contextId);
      return mapper.readValue(cipher.doFinal(ciphertext), ContextPayload.class);
    } catch (GeneralSecurityException | JacksonException exception) {
      throw unavailable();
    }
  }

  private Cipher createCipher(int mode, byte[] nonce, UUID institutionId, UUID contextId)
      throws GeneralSecurityException {
    Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
    cipher.init(mode, key, new GCMParameterSpec(128, nonce));
    cipher.updateAAD((institutionId + ":" + contextId).getBytes(StandardCharsets.UTF_8));
    return cipher;
  }

  private DomainException unavailable() {
    return new DomainException(
        500, "CONTEXT_CRYPTO_FAILED", "기관 참고 자료를 처리하지 못했습니다. 관리자에게 문의해 주세요.");
  }
}
