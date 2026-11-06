package kr.securityadvisor.review.dto;

import java.util.List;
import java.util.UUID;
import kr.securityadvisor.common.security.Role;

/** 요청 컨텍스트가 검토에 필요한 불변 사실만 전달하며 엔티티는 노출하지 않는다. */
public record ReviewWork(
    UUID requestId,
    int stage,
    boolean allocationComplete,
    long revision,
    List<Field> fields,
    boolean networkRequired,
    boolean networkConfirmed,
    boolean unresolvedSupplements,
    List<Mark> marks) {
  public ReviewWork {
    fields = List.copyOf(fields);
    marks = List.copyOf(marks);
  }

  /** 검토 책임과 사람 확인 여부만 전달하고 원문은 요청 컨텍스트에 둔다. */
  public record Field(
      String key, String label, Role ownerRole, boolean required, boolean confirmed) {}

  /** 분야별 기존 진행 상태는 다음 검토 결정을 계산하는 데만 사용한다. */
  public record Mark(Role role, String status) {}
}
