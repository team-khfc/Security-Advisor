package kr.securityadvisor.common.model;

/** 기관이 게시한 추가 질문의 책임과 필요성을 함께 보존한다. */
public record ExtraQuestion(
    String key, String label, String reason, String ownerRole, boolean required) {}
