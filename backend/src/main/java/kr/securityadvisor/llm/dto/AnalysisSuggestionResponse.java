package kr.securityadvisor.llm.dto;

import kr.securityadvisor.llm.domain.AnalysisSuggestion;

/** 원문 근거가 있는 미확정 후보만 화면에 전달한다. */
public record AnalysisSuggestionResponse(String key, String label, String value, String evidence) {
  /** 저장된 후보를 응답으로 변환한다. */
  public static AnalysisSuggestionResponse from(AnalysisSuggestion suggestion) {
    return new AnalysisSuggestionResponse(
        suggestion.key(), suggestion.label(), suggestion.value(), suggestion.evidence());
  }
}
