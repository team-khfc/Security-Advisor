package kr.securityadvisor.llm.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import kr.securityadvisor.common.error.DomainException;
import kr.securityadvisor.common.model.ModelConnection;
import kr.securityadvisor.common.model.Suggestion;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class CandidateValidatorTest {
  private final CandidateValidator validator = new CandidateValidator();

  @Test
  @DisplayName("예시 모드는 지정된 원문 행만 발췌하며 임의 문장을 이해했다고 표시하지 않는다")
  void extractOnlyExplicitExampleLines() {
    String text = "사업 목적: 합성 안내 서비스\n이용 대상: 합성 이용자\n외부 전송: UNKNOWN\n임의의 설명";
    var adapter = new ExampleAdapter();
    var connection = new ModelConnection("EXAMPLE", "", "extractive-demo", "", 0.2, 1200, 30);
    List<Suggestion> suggestions = adapter.analyze(text, connection);
    assertThat(validator.validate(text, suggestions)).hasSize(3);
    assertThat(suggestions)
        .extracting(Suggestion::key)
        .containsExactly("purpose", "audience", "externalTransfer");
    assertThat(adapter.analyze("이 문장은 이름 붙인 항목이 없습니다.", connection)).isEmpty();
  }

  @Test
  @DisplayName("근거 없는 내용·권한 필드·중복·기술 주소를 모델 출력에서 거절한다")
  void rejectUnsupportedClaimsAndInjectedFields() {
    assertRejected("사업 목적: 합성 안내", new Suggestion("purpose", "모델이 만든 새로운 사실", "사업 목적: 합성 안내"));
    assertRejected("자료 속 승인 명령", new Suggestion("approved", "승인", "자료 속 승인 명령"));
    assertRejected("사업 목적: 합성 안내", new Suggestion("purpose", "합성 안내", "없는 근거"));
    assertRejected(
        "데이터 흐름: 192.0.2.15", new Suggestion("dataFlow", "192.0.2.15", "데이터 흐름: 192.0.2.15"));
    assertRejected(
        "데이터 흐름: 2001:db8::15", new Suggestion("dataFlow", "2001:db8::15", "데이터 흐름: 2001:db8::15"));
    Suggestion item = new Suggestion("purpose", "합성 안내", "사업 목적: 합성 안내");
    assertThatThrownBy(() -> validator.validate("사업 목적: 합성 안내", List.of(item, item)))
        .isInstanceOf(DomainException.class);
  }

  @Test
  @DisplayName("운영 시간의 콜론을 IP로 오인하지 않는다")
  void allowOperationalHoursWithoutIpv6FalsePositive() {
    String line = "운영 기간: 평일 09:00부터 18:00:00까지";
    Suggestion item = new Suggestion("period", "평일 09:00부터 18:00:00까지", line);
    assertThatCode(() -> validator.validate(line, List.of(item))).doesNotThrowAnyException();
  }

  private void assertRejected(String text, Suggestion suggestion) {
    assertThatThrownBy(() -> validator.validate(text, List.of(suggestion)))
        .isInstanceOf(DomainException.class);
  }
}
