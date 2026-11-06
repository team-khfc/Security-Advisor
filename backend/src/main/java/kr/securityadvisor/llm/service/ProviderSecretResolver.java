package kr.securityadvisor.llm.service;

import kr.securityadvisor.common.error.DomainException;
import kr.securityadvisor.common.model.ModelConnection;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

/** DB에는 참조명만 두고 실제 비밀은 호출 직전에 허용된 환경변수에서 읽는다. */
@Component
public class ProviderSecretResolver {
  private final Environment environment;

  public ProviderSecretResolver(Environment environment) {
    this.environment = environment;
  }

  /**
   * 공급자와 참조명을 함께 확인하며 다른 환경변수를 읽을 수 없게 한다.
   *
   * @throws DomainException 허용된 참조가 아니거나 운영 키가 없을 때
   */
  public String resolve(ModelConnection connection) {
    String expected =
        switch (connection.provider()) {
          case "OPENAI" -> "SECURITYADVISOR_OPENAI_API_KEY";
          case "OPENAI_COMPATIBLE" -> "SECURITYADVISOR_OPENAI_COMPATIBLE_API_KEY";
          default -> "";
        };
    if (expected.isEmpty() || !expected.equals(connection.keyReference())) {
      throw unavailable();
    }
    String value = environment.getProperty(expected);
    if (value == null
        || value.isBlank()
        || value.length() > 512
        || value.chars().anyMatch(character -> character <= 32 || character > 126)) {
      throw unavailable();
    }
    return value;
  }

  private DomainException unavailable() {
    return new DomainException(
        503, "MODEL_KEY_UNAVAILABLE", "선택한 모델의 운영 키가 준비되지 않았습니다. 기관 관리자에게 연결 설정을 요청해 주세요.");
  }
}
