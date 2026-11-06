package kr.securityadvisor.review.domain;

import java.util.List;
import kr.securityadvisor.common.error.DomainException;
import kr.securityadvisor.common.security.Role;

/** 할당과 분야 협의를 분리하고 고정 선행 순서 및 책임 정보의 확인을 강제한다. */
public final class ReviewCycle {
  private final int stage;
  private final boolean allocationComplete;
  private final List<Field> fields;
  private final boolean networkRequired;
  private final boolean networkConfirmed;
  private final boolean unresolvedSupplements;

  public ReviewCycle(
      int stage,
      boolean allocationComplete,
      List<Field> fields,
      boolean networkRequired,
      boolean networkConfirmed,
      boolean unresolvedSupplements) {
    this.stage = stage;
    this.allocationComplete = allocationComplete;
    this.fields = List.copyOf(fields);
    this.networkRequired = networkRequired;
    this.networkConfirmed = networkConfirmed;
    this.unresolvedSupplements = unresolvedSupplements;
  }

  /** 검토 시작은 INFRA 할당만을 선행 조건으로 삼으며 INFRA 협의 완료를 요구하지 않는다. */
  public String start(Role role, boolean finalPhase) {
    checkStageAndRole(role, finalPhase);
    return "IN_PROGRESS";
  }

  /** 분야 책임 정보와 보완 및 의견을 확인한 경우에만 협의 완료를 결정한다. */
  public String complete(Role role, String comment, boolean finalPhase) {
    checkStageAndRole(role, finalPhase);
    if (comment == null || comment.isBlank() || comment.length() > 2000) {
      throw new DomainException(422, "REVIEW_COMMENT_REQUIRED", "담당자 검토 의견을 입력해 주세요.");
    }
    if (unresolvedSupplements) {
      throw new DomainException(422, "REVIEW_BLOCKED", "미해결 보완 요청을 먼저 확인해 주세요.");
    }
    for (Field field : fields) {
      if (field.required()
          && !field.confirmed()
          && (finalPhase || field.ownerRole() == role || field.ownerRole() == Role.APPLICANT)) {
        throw new DomainException(422, "REVIEW_BLOCKED", field.label() + ": 사람 확인이 필요합니다.");
      }
    }
    if ((role == Role.INFRA || finalPhase) && networkRequired && !networkConfirmed) {
      throw new DomainException(422, "REVIEW_BLOCKED", "통신 규칙의 담당자 확인이 필요합니다.");
    }
    if (!allocationComplete) {
      throw new DomainException(422, "ALLOCATION_REQUIRED", "INFRA 자원 할당 완료가 필요합니다.");
    }
    return "COMPLETE";
  }

  private void checkStageAndRole(Role role, boolean finalPhase) {
    if (role != Role.INFRA && role != Role.SECURITY) {
      throw new DomainException(403, "SPECIALIST_REQUIRED", "전문 담당자만 검토할 수 있습니다.");
    }
    if (stage != (finalPhase ? 4 : 2)) {
      throw new DomainException(409, "INVALID_REVIEW_STAGE", "검토할 수 있는 단계가 아닙니다.");
    }
    if (role == Role.SECURITY && !allocationComplete) {
      throw new DomainException(409, "ALLOCATION_REQUIRED", "INFRA 자원 할당 완료 후 보안 검토가 가능합니다.");
    }
  }

  /** 검토 도메인이 판단하는 최소한의 책임 항목이다. */
  public record Field(String label, Role ownerRole, boolean required, boolean confirmed) {}
}
