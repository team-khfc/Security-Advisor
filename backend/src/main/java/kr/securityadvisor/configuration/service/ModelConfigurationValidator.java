package kr.securityadvisor.configuration.service;

import java.net.URI;
import java.util.Arrays;
import java.util.Set;
import java.util.stream.Collectors;
import kr.securityadvisor.common.error.DomainException;
import kr.securityadvisor.common.model.ModelConnection;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** 관리자가 설정한 연결도 서버 운영자가 허용한 공급자 주소 범위 안에서만 받는다. */
@Component
public class ModelConfigurationValidator {
  private final Set<String> allowedEndpoints;

  public ModelConfigurationValidator(
      @Value("${securityadvisor.allowed-llm-endpoints}") String allowedEndpoints) {
    this.allowedEndpoints =
        Arrays.stream(allowedEndpoints.split(","))
            .map(String::strip)
            .filter(value -> !value.isEmpty())
            .collect(Collectors.toUnmodifiableSet());
  }

  /**
   * 모델·주소·키 참조와 비용 관련 상한을 확인한다.
   *
   * @throws DomainException 허용하지 않은 공급자·주소·키 참조 또는 파라미터일 때
   */
  public void validate(ModelConnection connection) {
    if (connection == null
        || connection.provider() == null
        || connection.model() == null
        || !connection.model().matches("[A-Za-z0-9][A-Za-z0-9._:/-]{0,119}")
        || !Double.isFinite(connection.temperature())
        || connection.temperature() < 0
        || connection.temperature() > 1
        || connection.maxTokens() < 256
        || connection.maxTokens() > 4096
        || connection.timeoutSeconds() < 5
        || connection.timeoutSeconds() > 60) {
      throw invalid();
    }
    if ("EXAMPLE".equals(connection.provider())) {
      if (connection.endpoint() == null
          || connection.keyReference() == null
          || !connection.endpoint().isBlank()
          || !connection.keyReference().isBlank()) {
        throw invalid();
      }
      return;
    }
    String keyReference =
        switch (connection.provider()) {
          case "OPENAI" -> "SECURITYADVISOR_OPENAI_API_KEY";
          case "OPENAI_COMPATIBLE" -> "SECURITYADVISOR_OPENAI_COMPATIBLE_API_KEY";
          default -> throw invalid();
        };
    if (!keyReference.equals(connection.keyReference())
        || connection.endpoint() == null
        || !allowedEndpoints.contains(connection.endpoint())) {
      throw invalid();
    }
    URI endpoint;
    try {
      endpoint = URI.create(connection.endpoint());
    } catch (IllegalArgumentException exception) {
      throw invalid();
    }
    if (!"https".equals(endpoint.getScheme())
        || endpoint.getHost() == null
        || !endpoint.getHost().matches("(?i)(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.)+[a-z][a-z0-9-]*")
        || endpoint.getHost().equalsIgnoreCase("localhost")
        || endpoint.getHost().endsWith(".localhost")
        || endpoint.getHost().endsWith(".local")
        || endpoint.getUserInfo() != null
        || endpoint.getQuery() != null
        || endpoint.getFragment() != null
        || (endpoint.getPort() != -1 && endpoint.getPort() != 443)) {
      throw invalid();
    }
    boolean accepted =
        switch (connection.provider()) {
          case "OPENAI" ->
              "api.openai.com".equals(endpoint.getHost())
                  && "/v1/chat/completions".equals(endpoint.getPath());
          case "OPENAI_COMPATIBLE" ->
              !"api.openai.com".equals(endpoint.getHost())
                  && endpoint.getPath().endsWith("/chat/completions")
                  && !endpoint.getPath().contains("..")
                  && endpoint.getPath().equals(endpoint.getRawPath());
          default -> false;
        };
    if (!accepted) {
      throw invalid();
    }
  }

  private DomainException invalid() {
    return new DomainException(
        422, "INVALID_MODEL_CONFIGURATION", "허용된 모델 주소·키 참조·생성 파라미터를 확인해 주세요.");
  }
}
