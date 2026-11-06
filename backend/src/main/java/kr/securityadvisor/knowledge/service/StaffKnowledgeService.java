package kr.securityadvisor.knowledge.service;

import java.util.List;
import java.util.Locale;
import kr.securityadvisor.common.error.DomainException;
import kr.securityadvisor.common.security.Actor;
import kr.securityadvisor.common.security.Role;
import kr.securityadvisor.knowledge.dto.ContextResponse;
import org.springframework.stereotype.Service;

/** 담당자에게 허용된 기관 자료만 질의 시점에 선택하며 공개 벡터 저장소와 분리한다. */
@Service
public class StaffKnowledgeService {
  private final PrivateContextService contexts;

  public StaffKnowledgeService(PrivateContextService contexts) {
    this.contexts = contexts;
  }

  public List<ContextResponse> relevant(Actor actor, String question) {
    if (actor.role() != Role.INFRA && actor.role() != Role.SECURITY) {
      throw new DomainException(403, "STAFF_REQUIRED", "해당 기관의 전문 담당자만 신청 컨텍스트를 질의할 수 있습니다.");
    }
    List<String> terms =
        java.util.Arrays.stream(question.toLowerCase(Locale.ROOT).split("\\s+"))
            .filter(term -> term.length() >= 2)
            .toList();
    return contexts.getContexts(actor).stream()
        .filter(
            context ->
                terms.stream()
                    .anyMatch(
                        term ->
                            (context.title() + " " + context.content())
                                .toLowerCase(Locale.ROOT)
                                .contains(term)))
        .limit(3)
        .toList();
  }
}
