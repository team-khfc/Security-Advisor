package kr.securityadvisor.llm.dto;

/** 분석에 실제로 사용한 공개 자료가 있을 때만 그 위치를 전달한다. */
public record ReferenceResponse(String title, String version, String section, String url) {}
