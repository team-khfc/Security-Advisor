package kr.securityadvisor.review.service;

import java.time.Instant;
import kr.securityadvisor.common.security.Actor;
import kr.securityadvisor.review.domain.ReviewCycle;
import kr.securityadvisor.review.dto.ReviewDecision;
import kr.securityadvisor.review.dto.ReviewWork;
import org.springframework.stereotype.Service;

/** 요청 엔티티 대신 공개 DTO를 받아 검토 애그리거트의 업무 결정을 반환한다. */
@Service
public class ReviewService {
  /** 동일한 검토 규칙으로 시작·협의 완료·최종 검토를 구분해 결정한다. */
  public ReviewDecision decide(
      Actor actor, ReviewWork work, String comment, boolean finalPhase, boolean complete) {
    ReviewCycle cycle =
        new ReviewCycle(
            work.stage(),
            work.allocationComplete(),
            work.fields().stream()
                .map(
                    field ->
                        new ReviewCycle.Field(
                            field.label(), field.ownerRole(), field.required(), field.confirmed()))
                .toList(),
            work.networkRequired(),
            work.networkConfirmed(),
            work.unresolvedSupplements());
    String status =
        complete
            ? cycle.complete(actor.role(), comment, finalPhase)
            : cycle.start(actor.role(), finalPhase);
    return new ReviewDecision(
        work.requestId(),
        actor.role(),
        status,
        work.revision() + 1,
        comment == null ? "" : comment.strip(),
        actor.displayName(),
        Instant.now());
  }
}
