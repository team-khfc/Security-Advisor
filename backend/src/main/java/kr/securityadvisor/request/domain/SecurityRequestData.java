package kr.securityadvisor.request.domain;

import com.fasterxml.jackson.annotation.JsonCreator;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import kr.securityadvisor.common.security.Role;

/** 업무 자료 전체를 불변 값으로 교체하여 JSON 변경 추적과 제출 시점 보존을 명확히 한다. */
public record SecurityRequestData(
    List<Answer> answers,
    List<NetworkRule> rules,
    List<Review> reviews,
    List<Supplement> supplements,
    List<Event> timeline) {
  public SecurityRequestData {
    answers = List.copyOf(answers);
    rules = List.copyOf(rules);
    reviews = List.copyOf(reviews);
    supplements = List.copyOf(supplements);
    timeline = List.copyOf(timeline);
  }

  /** 사용자 입력과 AI 제안 및 사람의 확인 여부를 서로 다른 상태로 보존한다. */
  public enum AnswerStatus {
    EMPTY,
    PROPOSED,
    CONFIRMED,
    NOT_APPLICABLE
  }

  /** 원래 값의 출처를 사람의 후속 확인 기록으로 덮어쓰지 않는다. */
  public enum SourceKind {
    USER_ANSWER,
    AI_INFERRED,
    STAFF_INPUT,
    STAFF_CONFIRMED;

    /** 이전 게시본·제출본 JSON은 읽을 때만 정규화하고 원본 저장 행은 수정하지 않는다. */
    @JsonCreator
    public static SourceKind fromJson(String value) {
      return switch (value) {
        case "AI_INFERENCE" -> AI_INFERRED;
        case "SPECIALIST_INPUT" -> STAFF_INPUT;
        case "SPECIALIST_CONFIRMATION" -> STAFF_CONFIRMED;
        default -> valueOf(value);
      };
    }
  }

  /** 출처와 근거는 값에 종속되며 다른 신청의 값으로 재사용하지 않는다. */
  public record Source(SourceKind kind, String evidence, String actorName, Instant at) {}

  /** 사람 확인을 원출처와 별도로 기록한다. */
  public record Confirmation(String actorName, Role role, Instant at) {}

  /** 화면 질문의 책임과 필수 시점도 신청 당시 설정과 함께 고정한다. */
  public record Answer(
      String key,
      String label,
      String reason,
      Role ownerRole,
      String requiredAt,
      String value,
      AnswerStatus status,
      Source source,
      Confirmation confirmation) {}

  /** 통신 정보는 인프라 담당자가 직접 입력하고 확인한 범위만 저장한다. */
  public record NetworkRule(
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
      Source source,
      Confirmation confirmation) {}

  /** 검토 내용 버전을 별도로 유지하여 뒤늦은 입력 변경을 탐지한다. */
  public record Review(
      Role role, String status, Long revision, String comment, String actorName, Instant at) {}

  /** 답변 저장은 해결이 아니며 요청한 담당자의 재확인이 필요하다. */
  public record Supplement(
      UUID id,
      String question,
      String answer,
      Role requestedByRole,
      String requestedBy,
      String status,
      Instant createdAt,
      Instant resolvedAt) {}

  /** 원문 값이나 비밀값 대신 업무 행동의 의미를 감사 이력에 남긴다. */
  public record Event(UUID id, String action, String description, String actorName, Instant at) {}
}
