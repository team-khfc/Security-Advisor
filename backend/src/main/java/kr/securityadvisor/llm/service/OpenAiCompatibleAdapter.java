package kr.securityadvisor.llm.service;

import java.util.List;
import kr.securityadvisor.common.model.ModelConnection;
import kr.securityadvisor.common.model.Suggestion;
import org.springframework.stereotype.Component;

/** EXAONE·HyperCLOVA X 등 운영자가 허용한 OpenAI 호환 엔드포인트의 교체 어댑터다. */
@Component
public class OpenAiCompatibleAdapter implements LanguageModelAdapter {
  private final SpringAiModelClient client;
  private final ModelPrompt prompt;

  public OpenAiCompatibleAdapter(SpringAiModelClient client, ModelPrompt prompt) {
    this.client = client;
    this.prompt = prompt;
  }

  @Override
  public String provider() {
    return "OPENAI_COMPATIBLE";
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
