package kr.securityadvisor.llm.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import kr.securityadvisor.common.error.DomainException;
import kr.securityadvisor.common.model.ModelConnection;
import kr.securityadvisor.common.model.Suggestion;
import kr.securityadvisor.configuration.service.ModelConfigurationValidator;
import kr.securityadvisor.llm.dto.ModelProtocol;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.mock.env.MockEnvironment;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

/** 실제 Spring AI와 OpenAI SDK를 통과하며 최하위 HTTP만 합성 대역이다. LIVE 공급자 구동 증거가 아니다. */
class ModelAdapterProtocolTest {
  private final ObjectMapper mapper = JsonMapper.builder().build();
  private final BoundedModelHttpClient transport = mock(BoundedModelHttpClient.class);
  private final String credential = UUID.randomUUID().toString();
  private final ProviderSecretResolver secrets =
      new ProviderSecretResolver(
          new MockEnvironment()
              .withProperty("SECURITYADVISOR_OPENAI_API_KEY", credential)
              .withProperty("SECURITYADVISOR_OPENAI_COMPATIBLE_API_KEY", credential));
  private final ModelPrompt prompt = new ModelPrompt(mapper);
  private final SpringAiModelClient client =
      new SpringAiModelClient(
          transport,
          secrets,
          new ModelConfigurationValidator(
              "https://api.openai.com/v1/chat/completions,https://llm.example.com/v1/chat/completions"));
  private final Suggestion suggestion = new Suggestion("purpose", "합성 안내 서비스", "사업 목적: 합성 안내 서비스");

  @Test
  @DisplayName("상용 OpenAI 계약은 실제 Spring AI ChatClient·SDK 직렬화와 안전 전송 경계를 통과한다")
  void openAiContractWithStubbedTransport() {
    verifyContract(new OpenAiAdapter(client, prompt), openAi());
  }

  @Test
  @DisplayName("두 번째 OpenAI 호환 공급자도 동일 SDK·추출 계약을 통과하며 Google 전용 규약을 사용하지 않는다")
  void compatibleContractWithStubbedTransport() {
    verifyContract(new OpenAiCompatibleAdapter(client, prompt), compatible());
  }

  private void verifyContract(LanguageModelAdapter adapter, ModelConnection connection) {
    when(transport.post(eq(connection), eq(credential), any(byte[].class)))
        .thenReturn(upstream("stop"));
    assertThat(adapter.analyze(suggestion.evidence(), connection)).containsExactly(suggestion);
    ArgumentCaptor<byte[]> sent = ArgumentCaptor.forClass(byte[].class);
    verify(transport).post(eq(connection), eq(credential), sent.capture());
    var request = mapper.readTree(sent.getValue());
    assertThat(request.get("model").asText()).isEqualTo(connection.model());
    assertThat(request.get("max_completion_tokens").asInt()).isEqualTo(1200);
    assertThat(request.get("response_format").get("type").asText()).isEqualTo("json_object");
    assertThat(request.get("store").asBoolean()).isFalse();
    assertThat(request.get("messages").get(0).get("role").asText()).isEqualTo("system");
    assertThat(request.get("messages").get(1).get("role").asText()).isEqualTo("user");
    assertThat(new String(sent.getValue(), StandardCharsets.UTF_8))
        .contains("document", suggestion.evidence())
        .doesNotContain(credential);
  }

  @Test
  @DisplayName("외부 시간 초과를 예시 성공으로 바꾸지 않고 잘못된 JSON도 거절한다")
  void neverFallbackToExampleOnExternalFailure() {
    ModelConnection connection = openAi();
    when(transport.post(eq(connection), eq(credential), any(byte[].class)))
        .thenThrow(new DomainException(504, "MODEL_TIMEOUT", "합성 시간 초과"));
    assertThatThrownBy(
            () -> new OpenAiAdapter(client, prompt).analyze(suggestion.evidence(), connection))
        .isInstanceOf(DomainException.class)
        .hasMessage("합성 시간 초과");
    assertThatThrownBy(() -> prompt.parse("{\"suggestions\":[],\"approved\":true}"))
        .isInstanceOf(DomainException.class);
    assertThatThrownBy(() -> prompt.parse("{\"suggestions\":[]} {\"suggestions\":[]}"))
        .isInstanceOf(DomainException.class);
    assertThatThrownBy(() -> prompt.parse("```json\n{\"suggestions\":[]}\n```"))
        .isInstanceOf(DomainException.class);
  }

  @Test
  @DisplayName("토큰 상한으로 잘린 JSON은 구문이 맞더라도 완성된 모델 응답으로 사용하지 않는다")
  void rejectIncompleteCompletion() {
    when(transport.post(eq(openAi()), eq(credential), any(byte[].class)))
        .thenReturn(upstream("length"));
    assertThatThrownBy(
            () -> new OpenAiAdapter(client, prompt).analyze(suggestion.evidence(), openAi()))
        .isInstanceOf(DomainException.class)
        .hasMessageContaining("완전한 응답");
  }

  @Test
  @DisplayName("운영 키가 없거나 허용되지 않은 환경변수 참조이면 외부 전송을 시작하지 않는다")
  void rejectMissingAndUnapprovedSecrets() {
    assertThatThrownBy(() -> new ProviderSecretResolver(new MockEnvironment()).resolve(openAi()))
        .isInstanceOf(DomainException.class);
    ModelConnection invalid =
        new ModelConnection(
            "OPENAI", openAi().endpoint(), openAi().model(), "UNRELATED_SECRET", 0.2, 1200, 30);
    assertThatThrownBy(() -> secrets.resolve(invalid)).isInstanceOf(DomainException.class);
  }

  private byte[] upstream(String finishReason) {
    String output = mapper.writeValueAsString(new ModelProtocol.Proposals(List.of(suggestion)));
    return mapper.writeValueAsBytes(
        Map.of(
            "id",
            "synthetic-contract-response",
            "object",
            "chat.completion",
            "created",
            1793923200,
            "model",
            "synthetic-contract-model",
            "choices",
            List.of(
                Map.of(
                    "index",
                    0,
                    "message",
                    Map.of("role", "assistant", "content", output),
                    "finish_reason",
                    finishReason))));
  }

  private ModelConnection openAi() {
    return new ModelConnection(
        "OPENAI",
        "https://api.openai.com/v1/chat/completions",
        "gpt-4.1-mini",
        "SECURITYADVISOR_OPENAI_API_KEY",
        0.2,
        1200,
        30);
  }

  private ModelConnection compatible() {
    return new ModelConnection(
        "OPENAI_COMPATIBLE",
        "https://llm.example.com/v1/chat/completions",
        "synthetic-compatible-model",
        "SECURITYADVISOR_OPENAI_COMPATIBLE_API_KEY",
        0.2,
        1200,
        30);
  }
}
