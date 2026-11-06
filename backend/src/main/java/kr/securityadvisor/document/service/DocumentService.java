package kr.securityadvisor.document.service;

import java.util.List;
import java.util.UUID;
import kr.securityadvisor.common.error.DomainException;
import kr.securityadvisor.common.security.Actor;
import kr.securityadvisor.common.security.Role;
import kr.securityadvisor.document.domain.Submission;
import kr.securityadvisor.document.domain.SubmissionSnapshot;
import kr.securityadvisor.document.dto.SubmissionDraft;
import kr.securityadvisor.document.dto.SubmissionVersion;
import kr.securityadvisor.document.repository.SubmissionRepository;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 제출본 생성·멱등성·차수별 보존은 요청 엔티티를 참조하지 않고 문서 컨텍스트가 담당한다. */
@Service
@Transactional(readOnly = true)
public class DocumentService {
  private final SubmissionRepository submissions;
  private final DocumentRenderer renderer;

  public DocumentService(SubmissionRepository submissions, DocumentRenderer renderer) {
    this.submissions = submissions;
    this.renderer = renderer;
  }

  /** 같은 기관·작성자의 요청 키가 같은 요청 버전에만 재사용되도록 검사한다. */
  public boolean isRepeated(Actor actor, UUID requestId, long requestRevision, String key) {
    if (key == null || !key.matches("[A-Za-z0-9._:-]{8,100}")) {
      throw new DomainException(400, "INVALID_IDEMPOTENCY_KEY", "제출 요청 식별자를 다시 생성해 주세요.");
    }
    var previous =
        submissions.findByInstitutionIdAndOwnerIdAndIdempotencyKey(
            actor.institutionId(), actor.userId(), key);
    if (previous.isEmpty()) return false;
    Submission old = previous.get();
    if (!old.getProcedureId().equals(requestId) || old.getRequestRevision() != requestRevision) {
      throw new DomainException(409, "IDEMPOTENCY_KEY_REUSED", "같은 요청 식별자를 다른 제출 내용에 사용할 수 없습니다.");
    }
    return true;
  }

  /** 새 제출은 새 차수의 행과 HTML을 추가하며 이전 행에는 어떤 쓰기도 하지 않는다. */
  @Transactional
  public void preserve(Actor actor, long requestRevision, String key, SubmissionDraft draft) {
    if (actor.role() != Role.APPLICANT) {
      throw new DomainException(403, "APPLICANT_REQUIRED", "신청자가 최종 제출해야 합니다.");
    }
    SubmissionSnapshot snapshot = snapshot(draft);
    try {
      submissions.saveAndFlush(
          new Submission(
              draft.requestId(),
              actor.institutionId(),
              actor.userId(),
              key,
              snapshot,
              renderer.render(snapshot, true),
              draft.submissionVersion(),
              requestRevision));
    } catch (DataIntegrityViolationException exception) {
      throw new DomainException(409, "SUBMISSION_CONFLICT", "동시에 처리된 제출 요청이 있습니다. 최신 상태를 확인해 주세요.");
    }
  }

  /** 아직 확정되지 않은 값도 숨기지 않고 출처·사람 확인 상태와 함께 렌더링한다. */
  public String renderDraft(SubmissionDraft draft) {
    return renderer.render(snapshot(draft), false);
  }

  /** 신청 조회 권한을 통과한 호출의 기관·작성자 범위를 다시 검사한다. */
  public String download(Actor actor, UUID requestId, Integer version) {
    Submission found =
        (version == null
                ? submissions.findFirstByProcedureIdAndInstitutionIdOrderBySubmissionVersionDesc(
                    requestId, actor.institutionId())
                : submissions.findByProcedureIdAndInstitutionIdAndSubmissionVersion(
                    requestId, actor.institutionId(), version))
            .orElseThrow(
                () -> new DomainException(404, "SUBMISSION_NOT_FOUND", "해당 차수의 제출본을 찾지 못했습니다."));
    checkOwner(actor, found);
    return found.getDocumentHtml();
  }

  /** 반환·종결 뒤에도 이전 제출본의 차수와 시각을 변경 없이 조회한다. */
  public List<SubmissionVersion> versions(Actor actor, UUID requestId) {
    return submissions
        .findByProcedureIdAndInstitutionIdOrderBySubmissionVersionDesc(
            requestId, actor.institutionId())
        .stream()
        .map(
            item -> {
              checkOwner(actor, item);
              return new SubmissionVersion(
                  item.getSubmissionVersion(),
                  item.getSnapshot().revision(),
                  item.getSnapshot().submittedAt());
            })
        .toList();
  }

  private static void checkOwner(Actor actor, Submission item) {
    if (actor.role() == Role.ADMIN
        || (actor.role() == Role.APPLICANT && !actor.userId().equals(item.getOwnerId()))) {
      throw new DomainException(404, "SUBMISSION_NOT_FOUND", "열람할 수 있는 제출본을 찾지 못했습니다.");
    }
  }

  private static SubmissionSnapshot snapshot(SubmissionDraft draft) {
    return new SubmissionSnapshot(
        draft.requestId(),
        draft.title(),
        draft.documentType(),
        draft.department(),
        draft.description(),
        draft.ownerName(),
        draft.revision(),
        draft.policyVersion(),
        draft.policy(),
        draft.data(),
        draft.submittedAt(),
        draft.submissionVersion(),
        draft.finalDraft());
  }
}
