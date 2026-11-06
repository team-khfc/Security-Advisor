package kr.securityadvisor.llm.service;

import java.util.List;
import kr.securityadvisor.common.model.ModelConnection;
import kr.securityadvisor.common.model.Suggestion;

/** 공급자별 전송 규약을 교체하더라도 후보 검증과 사람 확인 절차는 유지한다. */
public interface LanguageModelAdapter {
  /** 연결 설정의 공급자 식별자를 반환한다. */
  String provider();

  /**
   * 기관 비공개 컨텍스트 없이 명시적으로 제공한 사업 설명에서 후보만 구한다.
   *
   * @throws kr.securityadvisor.common.error.DomainException 호출 또는 응답 해석이 실패했을 때
   */
  List<Suggestion> analyze(String text, ModelConnection connection);

  /** 공급자와 무관한 구조화 응답 경로이며 자동 확정 기능을 제공하지 않는다. */
  default String generate(String instructions, String data, ModelConnection connection) {
    throw new kr.securityadvisor.common.error.DomainException(
        503, "LIVE_MODEL_REQUIRED", "현재는 외부 LLM을 호출하지 않는 예시 모드입니다.");
  }
}
