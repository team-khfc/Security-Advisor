package kr.securityadvisor.knowledge.service;

import java.util.List;
import java.util.UUID;
import kr.securityadvisor.common.error.DomainException;
import kr.securityadvisor.common.security.Actor;
import kr.securityadvisor.common.security.Role;
import kr.securityadvisor.knowledge.domain.ContextPayload;
import kr.securityadvisor.knowledge.domain.PrivateContext;
import kr.securityadvisor.knowledge.dto.ContextRequest;
import kr.securityadvisor.knowledge.dto.ContextResponse;
import kr.securityadvisor.knowledge.repository.PrivateContextRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 비공개 자료는 기관·역할 검사 후 담당자에게만 제공하며 공개 자료 색인과 분리한다. */
@Service
@Transactional(readOnly = true)
public class PrivateContextService {
  private final PrivateContextRepository contexts;
  private final ContextCipher cipher;

  public PrivateContextService(PrivateContextRepository contexts, ContextCipher cipher) {
    this.contexts = contexts;
    this.cipher = cipher;
  }

  /**
   * 기관 범위와 허용된 역할을 검사한 뒤 자료를 복호화한다.
   *
   * @throws DomainException 신청자가 비공개 자료를 요청했을 때
   */
  public List<ContextResponse> getContexts(Actor actor) {
    if (actor.role() == Role.APPLICANT) {
      throw new DomainException(403, "PRIVATE_CONTEXT_FORBIDDEN", "전문 담당자와 관리자만 참고 자료를 볼 수 있습니다.");
    }
    return contexts.findTop100ByInstitutionIdOrderByCreatedAtDesc(actor.institutionId()).stream()
        .map(
            context ->
                ContextResponse.from(
                    context,
                    cipher.decrypt(
                        actor.institutionId(), context.getId(), context.getEncryptedPayload())))
        .toList();
  }

  /**
   * 관리자가 등록한 자료의 민감 필드를 암호화한 뒤 보관한다.
   *
   * @throws DomainException 관리자 권한 또는 암호화 검증이 실패했을 때
   */
  @Transactional
  public ContextResponse createContext(Actor actor, ContextRequest request) {
    if (actor.role() != Role.ADMIN) {
      throw new DomainException(403, "INSTITUTION_ADMIN_REQUIRED", "기관 관리자만 참고 자료를 등록할 수 있습니다.");
    }
    UUID id = UUID.randomUUID();
    ContextPayload payload =
        new ContextPayload(
            request.title().strip(), request.category().strip(), request.content().strip());
    PrivateContext context =
        contexts.saveAndFlush(
            new PrivateContext(
                id,
                actor.institutionId(),
                cipher.encrypt(actor.institutionId(), id, payload),
                actor.displayName()));
    return ContextResponse.from(context, payload);
  }
}
