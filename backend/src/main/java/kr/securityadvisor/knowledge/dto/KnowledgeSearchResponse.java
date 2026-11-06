package kr.securityadvisor.knowledge.dto;

import java.util.List;

/** 실제 색인된 공식 공개 게시물 요약만 반환한다. PDF 전문 검색을 주장하지 않는다. */
public record KnowledgeSearchResponse(
    String embeddingMethod,
    String scope,
    String corpusVersion,
    boolean fullDocumentsIndexed,
    List<Match> results) {
  public record Match(
      String sourceId,
      String title,
      String version,
      String section,
      String url,
      String excerpt,
      double score) {}
}
