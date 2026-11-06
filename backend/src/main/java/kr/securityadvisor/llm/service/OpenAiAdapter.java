package kr.securityadvisor.llm.service;

import java.util.List;
import kr.securityadvisor.common.model.ModelConnection;
import kr.securityadvisor.common.model.Suggestion;
import org.springframework.stereotype.Component;

/** 상용 OpenAI 요청을 공통 계약 뒤의 실제 Spring AI ChatClient로 처리한다. */
@Component
public class OpenAiAdapter implements LanguageModelAdapter {
  private final SpringAiModelClient client;
  private final ModelPrompt prompt;

  public OpenAiAdapter(SpringAiModelClient client, ModelPrompt prompt) {
    this.client = client;
    this.prompt = prompt;
  }

  @Override
  public String provider() {
    return "OPENAI";
  }

  @Override
  public List<Suggestion> analyze(String text, ModelConnection connection) {
    return prompt.parse(generate(prompt.instructions(), prompt.document(text), connection));
  }

  @Override
  public String generate(String instructions, String data, ModelConnection connection) {
    return client.generate(instructions, data, connection);
  }
}
