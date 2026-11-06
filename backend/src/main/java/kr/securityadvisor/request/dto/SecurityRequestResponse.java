package kr.securityadvisor.request.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import kr.securityadvisor.common.model.OrganizationPolicy;
import kr.securityadvisor.request.domain.RequestWorkflow;
import kr.securityadvisor.request.domain.SecurityRequest;
import kr.securityadvisor.request.domain.SecurityRequestData;
import kr.securityadvisor.request.domain.SecurityRequestStatus;

/** 서버의 업무 판단 결과와 원출처를 함께 전달하며 엔티티를 API로 노출하지 않는다. */
public record SecurityRequestResponse(
    UUID id,
    String title,
    String documentType,
    String department,
    String description,
    String ownerName,
    String status,
    long revision,
    long policyVersion,
    Instant createdAt,
    Instant updatedAt,
    List<AnswerResponse> answers,
    List<NetworkResponse> rules,
    List<ReviewResponse> reviews,
    List<SupplementResponse> supplements,
    List<EventResponse> timeline,
    List<String> blockers,
    List<String> allowedActions,
    OrganizationPolicy policy,
    int stage,
    AllocationResponse allocation,
    List<ReviewResponse> finalReviews,
    List<ReturnItemResponse> returnItems,
    String terminalReason,
    int submissionVersion,
    FinalDraftResponse finalDraft) {
  public SecurityRequestResponse {
    answers = List.copyOf(answers);
    rules = List.copyOf(rules);
    reviews = List.copyOf(reviews);
    supplements = List.copyOf(supplements);
    timeline = List.copyOf(timeline);
    blockers = List.copyOf(blockers);
    allowedActions = List.copyOf(allowedActions);
    finalReviews = List.copyOf(finalReviews);
    returnItems = List.copyOf(returnItems);
  }

  /** 허용 행동과 제출 방해 사유는 호출자의 권한으로 계산한 결과만 사용한다. */
  public static SecurityRequestResponse from(
      SecurityRequest procedure, List<String> blockers, List<String> allowedActions) {
    SecurityRequestData data = procedure.getData();
    return new SecurityRequestResponse(
        procedure.getId(),
        procedure.getTitle(),
        procedure.getDocumentType().name(),
        procedure.getDepartment(),
        procedure.getDescription(),
        procedure.getOwnerName(),
        procedure.getStatus() == SecurityRequestStatus.RECEIVED
            ? "SUBMITTED"
            : procedure.getStatus().name(),
        procedure.getRevision(),
        procedure.getPolicyVersion(),
        procedure.getCreatedAt(),
        procedure.getUpdatedAt(),
        data.answers().stream().map(AnswerResponse::from).toList(),
        data.rules().stream().map(NetworkResponse::from).toList(),
        data.reviews().stream().map(ReviewResponse::from).toList(),
        data.supplements().stream().map(SupplementResponse::from).toList(),
        data.timeline().stream().map(EventResponse::from).toList(),
        blockers,
        allowedActions,
        procedure.getPolicy(),
        procedure.getStage(),
        AllocationResponse.from(procedure.getWorkflow().allocation()),
        procedure.getWorkflow().finalReviews().stream().map(ReviewResponse::from).toList(),
        procedure.getWorkflow().returnItems().stream().map(ReturnItemResponse::from).toList(),
        procedure.getWorkflow().terminalReason(),
        procedure.getWorkflow().submissionVersion(),
        FinalDraftResponse.from(procedure.getWorkflow().finalDraft()));
  }

  /** 자원 할당과 INFRA 분야 협의를 서로 다른 상태로 제공한다. */
  public record AllocationResponse(
      String status, Long revision, String comment, String actorName, Instant at) {
    static AllocationResponse from(RequestWorkflow.Allocation allocation) {
      return new AllocationResponse(
          allocation.status(),
          allocation.revision(),
          allocation.comment(),
          allocation.actorName(),
          allocation.at());
    }
  }

  /** 기존 값을 유지한 반환 항목의 이유와 직접 지정 여부를 전달한다. */
  public record ReturnItemResponse(
      UUID id,
      String fieldKey,
      String label,
      String reason,
      int fromStage,
      int toStage,
      String status,
      String requestedByRole,
      String requestedBy,
      Instant createdAt,
      Instant resolvedAt,
      boolean affected,
      String previousValue) {
    static ReturnItemResponse from(RequestWorkflow.ReturnItem item) {
      return new ReturnItemResponse(
          item.id(),
          item.fieldKey(),
          item.label(),
          item.reason(),
          item.fromStage(),
          item.toStage(),
          item.status(),
          item.requestedByRole().name(),
          item.requestedBy(),
          item.createdAt(),
          item.resolvedAt(),
          item.affected(),
          item.previousValue());
    }
  }

  /** 최종 AI 보완분도 사용자 확인 전에는 미확정임을 명시한다. */
  public record FinalDraftResponse(
      UUID analysisId,
      String summary,
      String evidence,
      String source,
      boolean confirmed,
      ConfirmationResponse confirmation) {
    static FinalDraftResponse from(RequestWorkflow.FinalDraft draft) {
      return draft == null
          ? null
          : new FinalDraftResponse(
              draft.analysisId(),
              draft.summary(),
              draft.evidence(),
              draft.source(),
              draft.confirmed(),
              ConfirmationResponse.from(draft.confirmation()));
    }
  }

  /** 출처가 없는 값은 null을 유지해 화면에서 담당자 확인 필요로 표현한다. */
  public record SourceResponse(String kind, String evidence, String actorName, Instant at) {
    public static SourceResponse from(SecurityRequestData.Source source) {
      return source == null
          ? null
          : new SourceResponse(
              source.kind().name(), source.evidence(), source.actorName(), source.at());
    }
  }

  /** AI 원출처를 유지하면서 실제 확인한 사람과 역할을 별도로 표시한다. */
  public record ConfirmationResponse(String actorName, String role, Instant at) {
    public static ConfirmationResponse from(SecurityRequestData.Confirmation confirmation) {
      return confirmation == null
          ? null
          : new ConfirmationResponse(
              confirmation.actorName(), confirmation.role().name(), confirmation.at());
    }
  }

  /** 질문 이유·책임·필수 시점을 값과 함께 전달한다. */
  public record AnswerResponse(
      String key,
      String label,
      String reason,
      String ownerRole,
      String requiredAt,
      String value,
      String status,
      SourceResponse source,
      ConfirmationResponse confirmation) {
    public static AnswerResponse from(SecurityRequestData.Answer answer) {
      return new AnswerResponse(
          answer.key(),
          answer.label(),
          answer.reason(),
          answer.ownerRole().name(),
          answer.requiredAt(),
          answer.value(),
          answer.status().name(),
          SourceResponse.from(answer.source()),
          ConfirmationResponse.from(answer.confirmation()));
    }
  }

  /** 모든 통신 행에 인프라 담당자의 출처와 확인 기록을 표시한다. */
  public record NetworkResponse(
      UUID id,
      String sourceName,
      String sourceIp,
      String destinationName,
      String destinationIp,
      String port,
      String protocol,
      String direction,
      LocalDate startsOn,
      LocalDate endsOn,
      String purpose,
      SourceResponse source,
      ConfirmationResponse confirmation) {
    public static NetworkResponse from(SecurityRequestData.NetworkRule rule) {
      return new NetworkResponse(
          rule.id(),
          rule.sourceName(),
          rule.sourceIp(),
          rule.destinationName(),
          rule.destinationIp(),
          rule.port(),
          rule.protocol(),
          rule.direction(),
          rule.startsOn(),
          rule.endsOn(),
          rule.purpose(),
          SourceResponse.from(rule.source()),
          ConfirmationResponse.from(rule.confirmation()));
    }
  }

  /** 검토 상태와 실제 검토한 내용 버전을 구분하여 제공한다. */
  public record ReviewResponse(
      String role, String status, Long revision, String comment, String actorName, Instant at) {
    public static ReviewResponse from(SecurityRequestData.Review review) {
      return new ReviewResponse(
          review.role().name(),
          review.status(),
          review.revision(),
          review.comment(),
          review.actorName(),
          review.at());
    }
  }

  /** 신청자의 답변과 담당자의 해결 확인을 서로 다른 상태로 표시한다. */
  public record SupplementResponse(
      UUID id,
      String question,
      String answer,
      String requestedByRole,
      String requestedBy,
      String status,
      Instant createdAt,
      Instant resolvedAt) {
    public static SupplementResponse from(SecurityRequestData.Supplement supplement) {
      return new SupplementResponse(
          supplement.id(),
          supplement.question(),
          supplement.answer(),
          supplement.requestedByRole().name(),
          supplement.requestedBy(),
          supplement.status(),
          supplement.createdAt(),
          supplement.resolvedAt());
    }
  }

  /** 업무 이력에는 행동과 주체만 포함하고 인증 자료는 포함하지 않는다. */
  public record EventResponse(
      UUID id, String action, String description, String actorName, Instant at) {
    public static EventResponse from(SecurityRequestData.Event event) {
      return new EventResponse(
          event.id(), event.action(), event.description(), event.actorName(), event.at());
    }
  }
}
