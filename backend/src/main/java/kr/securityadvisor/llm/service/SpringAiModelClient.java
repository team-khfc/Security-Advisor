package kr.securityadvisor.llm.service;

import com.openai.client.OpenAIClientImpl;
import com.openai.core.ClientOptions;
import com.openai.core.LogLevel;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import kr.securityadvisor.common.error.DomainException;
import kr.securityadvisor.common.model.ModelConnection;
import kr.securityadvisor.configuration.service.ModelConfigurationValidator;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.openai.OpenAiChatModel;
import org.springframework.ai.openai.OpenAiChatOptions;
import org.springframework.stereotype.Component;

/** 검증된 DB 구성별 Spring AI 클라이언트만 캐시하며 업무 계층에는 SDK 타입을 노출하지 않는다. */
@Component
public class SpringAiModelClient {
  private final BoundedModelHttpClient transport;
  private final ProviderSecretResolver secrets;
  private final ModelConfigurationValidator validator;
  private final Map<ModelConnection, ChatClient> clients = new LinkedHashMap<>(16, 0.75f, true);

  public SpringAiModelClient(
      BoundedModelHttpClient transport,
      ProviderSecretResolver secrets,
      ModelConfigurationValidator validator) {
    this.transport = transport;
    this.secrets = secrets;
    this.validator = validator;
  }

  /** 구조 검증 전 응답은 확정 사실로 반환하지 않으며 외부 실패를 예시 결과로 대체하지 않는다. */
  public String generate(String instructions, String data, ModelConnection connection) {
    validator.validate(connection);
    secrets.resolve(connection);
    if (instructions.length() + data.length() > 100000) {
      throw new DomainException(422, "MODEL_INPUT_TOO_LARGE", "분석 입력의 크기를 줄여 주세요.");
    }
    try {
      ChatResponse response =
          client(connection).prompt().system(instructions).user(data).call().chatResponse();
      if (response == null
          || response.getResults().size() != 1
          || !"STOP".equalsIgnoreCase(response.getResult().getMetadata().getFinishReason())
          || response.getResult().getOutput() == null
          || response.getResult().getOutput().getText() == null
          || response.getResult().getOutput().getText().isBlank()) {
        throw new DomainException(502, "MODEL_INCOMPLETE_RESPONSE", "모델이 완전한 응답을 반환하지 않았습니다.");
      }
      return response.getResult().getOutput().getText();
    } catch (DomainException exception) {
      throw exception;
    } catch (RuntimeException exception) {
      // SDK 오류에는 외부 본문이나 인증 정보가 포함될 수 있으므로 원문·cause를 노출하지 않는다.
      for (Throwable cause = exception.getCause(); cause != null; cause = cause.getCause()) {
        if (cause instanceof DomainException domain) {
          throw domain;
        }
      }
      throw new DomainException(
          502, "MODEL_UPSTREAM_FAILURE", "모델 응답을 처리하지 못했습니다. 다시 시도하거나 직접 입력해 주세요.");
    }
  }

  private synchronized ChatClient client(ModelConnection connection) {
    ChatClient existing = clients.get(connection);
    if (existing != null) {
      return existing;
    }
    String baseUrl =
        connection
            .endpoint()
            .substring(0, connection.endpoint().length() - "/chat/completions".length());
    var sdk =
        new OpenAIClientImpl(
            ClientOptions.builder()
                .httpClient(new SdkBoundedHttpClient(connection, transport, secrets))
                .baseUrl(baseUrl)
                .apiKey("resolved-by-securityadvisor-transport")
                .timeout(Duration.ofSeconds(connection.timeoutSeconds()))
                .maxRetries(0)
                .logLevel(LogLevel.OFF)
                .build());
    var options =
        OpenAiChatOptions.builder()
            .model(connection.model())
            .temperature(connection.temperature())
            .maxCompletionTokens(connection.maxTokens())
            .store(false)
            .maxRetries(0)
            .responseFormat(
                OpenAiChatModel.ResponseFormat.builder()
                    .type(OpenAiChatModel.ResponseFormat.Type.JSON_OBJECT)
                    .build())
            .build();
    var model =
        OpenAiChatModel.builder()
            .openAiClient(sdk)
            .openAiClientAsync(sdk.async())
            .options(options)
            .build();
    ChatClient created = ChatClient.create(model);
    if (clients.size() >= 32) {
      clients.remove(clients.keySet().iterator().next());
    }
    clients.put(connection, created);
    return created;
  }
}
