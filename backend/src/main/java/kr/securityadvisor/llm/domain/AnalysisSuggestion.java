package kr.securityadvisor.llm.domain;

/** 후보 값과 원문 근거를 저장하며 확인 여부는 신청 필드에 따로 기록한다. */
public record AnalysisSuggestion(String key, String label, String value, String evidence) {}
