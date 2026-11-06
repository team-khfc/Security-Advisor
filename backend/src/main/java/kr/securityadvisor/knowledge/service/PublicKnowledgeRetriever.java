package kr.securityadvisor.knowledge.service;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import kr.securityadvisor.common.error.DomainException;
import kr.securityadvisor.knowledge.dto.KnowledgeSearchResponse;
import kr.securityadvisor.knowledge.dto.KnowledgeSearchResponse.Match;
import org.springframework.ai.document.Document;
import org.springframework.ai.vectorstore.SearchRequest;
import org.springframework.ai.vectorstore.VectorStore;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;

/** 검증한 공개 웹페이지의 짧은 편집 요약을 PGVector에 저장하고 실제 검색 결과만 근거로 반환한다. */
@Service
public class PublicKnowledgeRetriever {
  private static final String VERSION = "2026-11-06-public-summaries-v1";
  private final VectorStore vectors;
  private volatile boolean ready;

  public PublicKnowledgeRetriever(VectorStore publicKnowledgeVectorStore) {
    this.vectors = publicKnowledgeVectorStore;
  }

  @EventListener(ApplicationReadyEvent.class)
  public void indexPublicSummaries() {
    // 이 코드에 등록된 공개 자료만 허용한다. 기관 업로드·비공개 컨텍스트 입력 경로가 없다.
    vectors.add(
        List.of(
            document(
                "kisa-development-2021",
                "소프트웨어 개발 보안 가이드",
                "2021.12.29 첨부본",
                "공식 게시물의 자료명·첨부파일 안내",
                "https://www.kisa.kr/2060204/form?lang_type=KO&page=1&postSeq=5",
                "KISA는 소프트웨어 개발 보안 가이드를 공개하고 2021년 12월 29일 판본의 HWPX와 PDF를 제공한다. 보안성검토의 개발 보안 참고"
                    + " 자료이며 구체적인 기관 적용 여부는 담당자가 원문을 확인해야 한다. 이 색인은 공개 게시물 안내의 편집 요약이며 첨부 PDF 본문은"
                    + " 포함하지 않는다."),
            document(
                "nist-firewall-2009",
                "Guidelines on Firewalls and Firewall Policy",
                "NIST SP 800-41 Rev.1, 2009-09",
                "공식 공개 페이지 Abstract의 편집 요약",
                "https://csrc.nist.gov/pubs/sp/800/41/r1/final",
                "방화벽은 보안 수준이 다른 네트워크 또는 호스트 사이의 트래픽 흐름을 통제한다. NIST 가이드는 방화벽 기술과 정책 수립, 솔루션"
                    + " 선택·구성·시험·배포·관리의 권고를 다룬다. 신청 서류 확정과 실제 방화벽 배포는 별도 작업이며 기관 담당자의 검토가 필요하다.")));
    ready = true;
  }

  public KnowledgeSearchResponse search(String query) {
    if (query == null || query.isBlank() || query.length() > 500) {
      throw new DomainException(422, "INVALID_KNOWLEDGE_QUERY", "검색어를 1~500자로 입력해 주세요.");
    }
    if (!ready) {
      throw new DomainException(503, "KNOWLEDGE_INDEX_NOT_READY", "공개 자료 색인이 아직 준비되지 않았습니다.");
    }
    List<Document> found =
        vectors.similaritySearch(
            SearchRequest.builder().query(query).topK(3).similarityThreshold(0.15).build());
    List<Match> results =
        found == null
            ? List.of()
            : found.stream()
                .map(
                    item ->
                        new Match(
                            item.getId(),
                            field(item, "title"),
                            field(item, "version"),
                            field(item, "section"),
                            field(item, "url"),
                            item.getText(),
                            item.getScore() == null ? 0 : item.getScore()))
                .toList();
    return new KnowledgeSearchResponse(
        "LOCAL_FEATURE_HASH_256", "OFFICIAL_PUBLIC_PAGE_SUMMARIES", VERSION, false, results);
  }

  private Document document(
      String id, String title, String version, String section, String url, String summary) {
    return Document.builder()
        .id(sourceId(id))
        .text(summary)
        .metadata(
            Map.of(
                "title",
                title,
                "version",
                version,
                "section",
                section,
                "url",
                url,
                "corpusVersion",
                VERSION,
                "visibility",
                "PUBLIC",
                "contentType",
                "EDITORIAL_SUMMARY"))
        .build();
  }

  private String sourceId(String id) {
    try {
      byte[] digest =
          java.security.MessageDigest.getInstance("SHA-256")
              .digest((VERSION + id).getBytes(StandardCharsets.UTF_8));
      var bytes = java.nio.ByteBuffer.wrap(digest);
      return new UUID(bytes.getLong(), bytes.getLong()).toString();
    } catch (java.security.NoSuchAlgorithmException exception) {
      throw new IllegalStateException("Required SHA-256 provider unavailable");
    }
  }

  private String field(Document document, String key) {
    return String.valueOf(document.getMetadata().get(key));
  }
}
