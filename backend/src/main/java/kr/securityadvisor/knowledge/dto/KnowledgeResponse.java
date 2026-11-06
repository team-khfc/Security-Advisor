package kr.securityadvisor.knowledge.dto;

/** 공개 원문으로 연결하는 자료 목록이며 본문 검색 결과로 표시하지 않는다. */
public record KnowledgeResponse(
    String title, String version, String section, String url, String summary) {}
