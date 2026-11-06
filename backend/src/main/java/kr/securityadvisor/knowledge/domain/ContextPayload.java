package kr.securityadvisor.knowledge.domain;

/** 세 민감 필드의 직렬화 형식을 명시하여 임의 객체 역직렬화를 피한다. */
public record ContextPayload(String title, String category, String content) {}
