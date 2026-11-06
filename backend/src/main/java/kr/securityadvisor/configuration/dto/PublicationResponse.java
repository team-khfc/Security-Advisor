package kr.securityadvisor.configuration.dto;

import java.time.Instant;
import kr.securityadvisor.configuration.domain.PolicyPublication;

/** 게시본의 구분과 책임자를 화면에 전달한다. */
public record PublicationResponse(long version, Instant publishedAt, String publishedBy) {
  /** 영속 엔티티를 공개된 이력 항목으로 변환한다. */
  public static PublicationResponse from(PolicyPublication publication) {
    return new PublicationResponse(
        publication.getVersion(), publication.getCreatedAt(), publication.getPublishedBy());
  }
}
