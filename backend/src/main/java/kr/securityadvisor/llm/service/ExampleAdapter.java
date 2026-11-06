package kr.securityadvisor.llm.service;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import kr.securityadvisor.common.model.ModelConnection;
import kr.securityadvisor.common.model.Suggestion;
import org.springframework.stereotype.Component;

/** 외부 LLM을 호출하지 않는 명시적 예시 모드로, 이름 붙인 원문 행만 발췌한다. */
@Component
public class ExampleAdapter implements LanguageModelAdapter {
  private static final List<LabelledField> FIELDS =
      List.of(
          new LabelledField("사업 목적", "purpose"),
          new LabelledField("이용 대상", "audience"),
          new LabelledField("처리 정보", "dataTypes"),
          new LabelledField("외부 전송", "externalTransfer"),
          new LabelledField("운영 기간", "period"),
          new LabelledField("데이터 흐름", "dataFlow"));

  @Override
  public String provider() {
    return "EXAMPLE";
  }

  /** 자유 문장을 이해했다고 표시하지 않고, 찾지 못한 항목은 빈 상태로 둔다. */
  @Override
  public List<Suggestion> analyze(String text, ModelConnection connection) {
    List<Suggestion> result = new ArrayList<>();
    for (LabelledField field : FIELDS) {
      text.lines()
          .filter(line -> line.stripLeading().startsWith(field.label() + ":"))
          .findFirst()
          .ifPresent(
              line -> {
                String value = line.substring(line.indexOf(':') + 1).strip();
                if (!value.isEmpty()
                    && (!field.key().equals("externalTransfer")
                        || Set.of("YES", "NO", "UNKNOWN").contains(value))) {
                  result.add(new Suggestion(field.key(), value, line));
                }
              });
    }
    return List.copyOf(result);
  }

  private record LabelledField(String label, String key) {}
}
