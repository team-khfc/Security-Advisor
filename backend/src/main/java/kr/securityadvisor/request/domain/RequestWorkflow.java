package kr.securityadvisor.request.domain;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import kr.securityadvisor.common.security.Role;

/** 차수·할당·반환·분야 배정을 원래 답변 및 제출본과 독립적으로 보존한다. */
public record RequestWorkflow(
    int stage,
    Allocation allocation,
    List<SecurityRequestData.Review> finalReviews,
    List<ReturnItem> returnItems,
    List<Assignment> assignments,
    String terminalReason,
    int submissionVersion,
    FinalDraft finalDraft) {
  public RequestWorkflow {
    finalReviews = List.copyOf(finalReviews);
    returnItems = List.copyOf(returnItems);
    assignments = List.copyOf(assignments);
  }

  /** 신규 신청의 할당·분야별 최종 검토는 모두 대기로 시작한다. */
  public static RequestWorkflow initial() {
    return new RequestWorkflow(
        1,
        new Allocation("PENDING", null, "", null, null),
        pendingReviews(),
        List.of(),
        List.of(),
        null,
        0,
        null);
  }

  /** 제출 차수마다 양 분야가 해당 제출본을 다시 최종 검토한다. */
  public static List<SecurityRequestData.Review> pendingReviews() {
    return List.of(
        new SecurityRequestData.Review(Role.INFRA, "PENDING", null, "", null, null),
        new SecurityRequestData.Review(Role.SECURITY, "PENDING", null, "", null, null));
  }

  /** 자원 할당 완료는 분야 협의 완료와 다른 기록이다. */
  public record Allocation(
      String status, Long revision, String comment, String actorName, Instant at) {}

  /** 반환 시 값과 원출처를 지우지 않고 필요한 항목만 재확인 대상으로 표시한다. */
  public record ReturnItem(
      UUID id,
      String fieldKey,
      String label,
      String reason,
      int fromStage,
      int toStage,
      String status,
      Role requestedByRole,
      String requestedBy,
      Instant createdAt,
      Instant resolvedAt,
      boolean affected,
      String previousValue) {
    /** 수정 또는 명시적인 사람 재확인 이력을 남기며 강조 표시를 종료한다. */
    public ReturnItem resolve(Instant at) {
      return new ReturnItem(
          id,
          fieldKey,
          label,
          reason,
          fromStage,
          toStage,
          "RESOLVED",
          requestedByRole,
          requestedBy,
          createdAt,
          at,
          affected,
          previousValue);
    }
  }

  /** 같은 분야의 첫 업무 수행자를 서버가 배정하고 이후 다른 계정의 수정을 차단한다. */
  public record Assignment(Role role, UUID actorId, String actorName) {}

  /** AI 최종 초안의 원문·근거와 사용자의 후속 확인을 분리하여 보존한다. */
  public record FinalDraft(
      UUID analysisId,
      String summary,
      String evidence,
      String source,
      boolean confirmed,
      SecurityRequestData.Confirmation confirmation) {}
}
