package kr.securityadvisor.knowledge.dto;

import java.time.Instant;
import java.util.UUID;
import kr.securityadvisor.knowledge.domain.ContextPayload;
import kr.securityadvisor.knowledge.domain.PrivateContext;

/** 권한 검사와 복호화가 끝난 참고 자료만 응답한다. */
public record ContextResponse(
    UUID id, String title, String category, String content, Instant createdAt, String createdBy) {
  /** 암호문과 암호화 키는 응답 형태에 포함하지 않는다. */
  public static ContextResponse from(PrivateContext context, ContextPayload payload) {
    return new ContextResponse(
        context.getId(),
        payload.title(),
        payload.category(),
        payload.content(),
        context.getCreatedAt(),
        context.getCreatedBy());
  }
}
