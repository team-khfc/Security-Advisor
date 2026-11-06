package kr.securityadvisor.configuration.service;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import kr.securityadvisor.common.error.DomainException;
import kr.securityadvisor.common.model.ExtraQuestion;
import kr.securityadvisor.common.model.ModelConnection;
import kr.securityadvisor.common.model.OrganizationPolicy;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class PolicyValidatorTest {
  private static final String OPENAI = "https://api.openai.com/v1/chat/completions";
  private static final String COMPATIBLE = "https://llm.example.com/v1/chat/completions";
  private final ModelConfigurationValidator models =
      new ModelConfigurationValidator(OPENAI + "," + COMPATIBLE);
  private final PolicyValidator policies = new PolicyValidator(models);

  @Test
  @DisplayName("두 공급자의 정확한 HTTPS 경로와 키 참조만 허용한다")
  void validateExactProviderContracts() {
    assertThatCode(
            () ->
                models.validate(
                    model("OPENAI", OPENAI, "gpt-4.1-mini", "SECURITYADVISOR_OPENAI_API_KEY")))
        .doesNotThrowAnyException();
    assertThatCode(
            () ->
                models.validate(
                    model(
                        "OPENAI_COMPATIBLE",
                        COMPATIBLE,
                        "synthetic-compatible-model",
                        "SECURITYADVISOR_OPENAI_COMPATIBLE_API_KEY")))
        .doesNotThrowAnyException();
    assertThatThrownBy(
            () ->
                models.validate(
                    model(
                        "OPENAI",
                        OPENAI + "?redirect=1",
                        "gpt-4.1-mini",
                        "SECURITYADVISOR_OPENAI_API_KEY")))
        .isInstanceOf(DomainException.class);
    assertThatThrownBy(
            () -> models.validate(model("OPENAI", OPENAI, "gpt-4.1-mini", "OTHER_ENVIRONMENT")))
        .isInstanceOf(DomainException.class);
    assertThatThrownBy(
            () ->
                models.validate(
                    model(
                        "OPENAI_COMPATIBLE",
                        COMPATIBLE + "/unapproved",
                        "synthetic-compatible-model",
                        "SECURITYADVISOR_OPENAI_COMPATIBLE_API_KEY")))
        .isInstanceOf(DomainException.class);
    assertThatThrownBy(
            () ->
                models.validate(
                    model(
                        "OPENAI",
                        "http://localhost/service",
                        "gpt-4.1-mini",
                        "SECURITYADVISOR_OPENAI_API_KEY")))
        .isInstanceOf(DomainException.class);
  }

  @Test
  @DisplayName("예시 연결에 외부 주소나 비밀 참조를 붙여 실제 호출처럼 꾸밀 수 없다")
  void distinguishExampleMode() {
    assertThatCode(() -> models.validate(example())).doesNotThrowAnyException();
    assertThatThrownBy(() -> models.validate(model("EXAMPLE", OPENAI, "extractive-demo", "")))
        .isInstanceOf(DomainException.class);
    assertThatThrownBy(
            () ->
                models.validate(
                    new ModelConnection(
                        "OPENAI",
                        OPENAI,
                        "gpt-4.1-mini",
                        "SECURITYADVISOR_OPENAI_API_KEY",
                        Double.NaN,
                        1200,
                        30)))
        .isInstanceOf(DomainException.class);
  }

  @Test
  @DisplayName("검토자 없는 절차와 중복·잘못된 책임 역할의 질문을 거절한다")
  void preserveReviewAndQuestionOwnership() {
    var question = new ExtraQuestion("custom_channel", "시연 질문", "합성 질문의 이유", "APPLICANT", true);
    assertThatCode(() -> policies.validate(policy(true, true, List.of(question))))
        .doesNotThrowAnyException();
    assertThatThrownBy(() -> policies.validate(policy(false, true, List.of())))
        .isInstanceOf(DomainException.class);
    assertThatThrownBy(() -> policies.validate(policy(true, false, List.of())))
        .isInstanceOf(DomainException.class);
    assertThatThrownBy(
            () ->
                policies.validate(
                    new OrganizationPolicy(
                        "합성 기관", "PARALLEL", true, true, List.of(), "합성 서류", example())))
        .isInstanceOf(DomainException.class);
    assertThatThrownBy(() -> policies.validate(policy(false, false, List.of())))
        .isInstanceOf(DomainException.class);
    assertThatThrownBy(() -> policies.validate(policy(true, true, List.of(question, question))))
        .isInstanceOf(DomainException.class);
    assertThatThrownBy(
            () ->
                policies.validate(
                    policy(
                        true,
                        true,
                        List.of(
                            new ExtraQuestion("purpose", "기존 질문 덮어쓰기", "합성 설명", "ADMIN", true)))))
        .isInstanceOf(DomainException.class);
  }

  private OrganizationPolicy policy(
      boolean security, boolean infra, List<ExtraQuestion> questions) {
    return new OrganizationPolicy(
        "합성 기관", "INFRA_FIRST", security, infra, questions, "시연 서류", example());
  }

  private ModelConnection example() {
    return model("EXAMPLE", "", "extractive-demo", "");
  }

  private ModelConnection model(String provider, String endpoint, String name, String reference) {
    return new ModelConnection(provider, endpoint, name, reference, 0.2, 1200, 30);
  }
}
