package kr.securityadvisor.request.domain;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import kr.securityadvisor.common.error.DomainException;
import kr.securityadvisor.common.model.ExtraQuestion;
import kr.securityadvisor.common.model.OrganizationPolicy;
import kr.securityadvisor.common.security.Role;

/** 표시용 단계와 실제 업무 전이의 선행 조건을 서버에서 일관되게 계산한다. */
public final class WorkflowRules {
  private WorkflowRules() {}

  /** 기본 질문과 게시된 기관 추가 질문을 신청 시점에 고정한다. */
  public static List<SecurityRequestData.Answer> initialAnswers(
      DocumentType documentType, OrganizationPolicy policy) {
    List<SecurityRequestData.Answer> answers = new ArrayList<>();
    answers.add(
        question(
            "purpose",
            "서비스 목적",
            "어떤 업무를 돕는지 알아야 필요한 보안 항목을 정할 수 있습니다.",
            Role.APPLICANT,
            "CONSULT"));
    answers.add(
        question("audience", "이용 대상", "외부 이용자와 내부 직원은 접근 범위가 다릅니다.", Role.APPLICANT, "CONSULT"));
    answers.add(
        question(
            "dataTypes", "처리하는 정보", "개인정보·업무자료 여부를 담당자가 판단하는 근거가 됩니다.", Role.APPLICANT, "SUBMIT"));
    answers.add(
        question(
            "externalTransfer",
            "외부 전송 여부",
            "기관 밖으로 정보를 보내는지 직접 확인해야 합니다.",
            Role.APPLICANT,
            "SUBMIT"));
    answers.add(question("period", "운영 기간", "신청 목적에 필요한 적용 기간을 정합니다.", Role.APPLICANT, "SUBMIT"));
    answers.add(
        question(
            "dataFlow",
            "정보가 이동하는 흐름",
            "사용자부터 처리·보관 위치까지 담당자가 통신 경로를 확인합니다.",
            Role.APPLICANT,
            "SUBMIT"));
    answers.add(
        question(
            "operatingEnvironment",
            "운영 환경",
            "기관의 서버·서비스 구성은 인프라 담당자가 직접 확인합니다.",
            Role.INFRA,
            "SUBMIT"));
    answers.add(
        question(
            "accessControl",
            "접근 통제 방안",
            "누가 어떤 권한으로 접근하는지 보안 담당자가 확인합니다.",
            Role.SECURITY,
            "SUBMIT"));
    String securityRequired = documentType == DocumentType.SECURITY_REVIEW ? "SUBMIT" : "OPTIONAL";
    answers.add(
        question(
            "retention",
            "보관·파기 방안",
            "정보를 언제까지 보관하고 어떻게 파기할지 확인합니다.",
            Role.SECURITY,
            securityRequired));
    answers.add(
        question(
            "logging", "접속 기록 관리", "접근과 변경을 추적할 수 있는지 확인합니다.", Role.SECURITY, securityRequired));
    Set<String> keys =
        new HashSet<>(answers.stream().map(SecurityRequestData.Answer::key).toList());
    for (ExtraQuestion extra : policy.questions()) {
      if (!keys.add(extra.key()) || extra.ownerRole().equals("ADMIN")) {
        throw new DomainException(422, "INVALID_QUESTION_POLICY", "기관 질문의 식별자와 담당 역할을 확인해 주세요.");
      }
      answers.add(
          question(
              extra.key(),
              extra.label(),
              extra.reason(),
              Role.valueOf(extra.ownerRole()),
              extra.required() ? "SUBMIT" : "OPTIONAL"));
    }
    return List.copyOf(answers);
  }

  /** AI 제안이나 출처·사람 확인이 빠진 값은 해결된 것으로 취급하지 않는다. */
  public static boolean resolved(SecurityRequestData.Answer answer) {
    return (answer.status() == SecurityRequestData.AnswerStatus.CONFIRMED
            || answer.status() == SecurityRequestData.AnswerStatus.NOT_APPLICABLE)
        && answer.source() != null
        && answer.confirmation() != null
        && !answer.value().isBlank()
        && !(answer.key().equals("externalTransfer") && answer.value().equals("UNKNOWN"));
  }

  /** 협의를 시작하는 데 필요한 최소한의 사업 설명을 확인한다. */
  public static List<String> consultationBlockers(SecurityRequest procedure) {
    return procedure.getData().answers().stream()
        .filter(answer -> answer.requiredAt().equals("CONSULT") && !resolved(answer))
        .map(answer -> answer.label() + ": 신청자의 확인이 필요합니다.")
        .toList();
  }

  /** 필수 정보와 선택 입력 및 두 분야 협의·할당·반환 해결을 모두 검사한다. */
  public static List<String> submissionBlockers(SecurityRequest procedure) {
    if (procedure.getStatus() == SecurityRequestStatus.CLOSED
        || procedure.getStatus() == SecurityRequestStatus.WITHDRAWN) {
      return List.of("종결·철회된 신청은 조회만 가능합니다.");
    }
    if (procedure.getStage() == 4) return List.of();
    List<String> blockers = new ArrayList<>();
    if (procedure.getStage() != 3) blockers.add("양 분야 협의를 마친 뒤 사용자 최종 검토가 필요합니다.");
    for (SecurityRequestData.Answer answer : procedure.getData().answers()) {
      if (needsResolution(answer) && !resolved(answer)) {
        blockers.add(answer.label() + ": 값과 출처를 사람이 확인해야 합니다.");
      }
    }
    if (procedure.getDocumentType() == DocumentType.FIREWALL
        && procedure.getData().rules().isEmpty()) blockers.add("인프라 담당자의 통신 규칙이 필요합니다.");
    if (procedure.getData().rules().stream()
        .anyMatch(rule -> rule.source() == null || rule.confirmation() == null)) {
      blockers.add("통신 규칙의 출처 또는 사람 확인이 없습니다.");
    }
    if (procedure.getData().supplements().stream()
        .anyMatch(item -> !item.status().equals("RESOLVED"))) {
      blockers.add("담당자가 해결 확인하지 않은 보완 요청이 있습니다.");
    }
    if (!procedure.getWorkflow().allocation().status().equals("COMPLETE")) {
      blockers.add("ICT인프라의 자원 할당 완료가 필요합니다.");
    }
    if (!currentReview(procedure, Role.INFRA)) blockers.add("ICT인프라 협의 완료가 필요합니다.");
    if (!currentReview(procedure, Role.SECURITY)) blockers.add("정보보안 협의 완료가 필요합니다.");
    if (procedure.getWorkflow().returnItems().stream()
        .anyMatch(item -> item.status().equals("OPEN"))) {
      blockers.add("반환된 보완 필요 항목을 수정하거나 다시 확인해 주세요.");
    }
    if (procedure.getWorkflow().finalDraft() != null
        && (!procedure.getWorkflow().finalDraft().confirmed()
            || procedure.getWorkflow().finalDraft().confirmation() == null)) {
      blockers.add("AI 최종 초안의 보완분을 신청자가 확인해야 합니다.");
    }
    return List.copyOf(blockers);
  }

  /** 분야 협의와 독립적인 자원 할당 완료의 필수 조건을 계산한다. */
  public static List<String> allocationBlockers(SecurityRequest procedure) {
    List<String> blockers = new ArrayList<>();
    if (procedure.getStage() != 2) blockers.add("담당자 협의 단계에서 자원을 할당할 수 있습니다.");
    for (SecurityRequestData.Answer answer : procedure.getData().answers()) {
      if (answer.ownerRole() == Role.INFRA && needsResolution(answer) && !resolved(answer)) {
        blockers.add(answer.label() + ": 인프라 담당자의 입력·확인이 필요합니다.");
      }
    }
    if (procedure.getDocumentType() == DocumentType.FIREWALL
        && procedure.getData().rules().isEmpty()) blockers.add("통신 규칙을 먼저 입력해 주세요.");
    if (procedure.getData().rules().stream()
        .anyMatch(rule -> rule.source() == null || rule.confirmation() == null))
      blockers.add("통신 규칙의 출처와 사람 확인이 필요합니다.");
    return List.copyOf(blockers);
  }

  /** 기관의 과거 설정과 관계없이 INFRA 할당 뒤 SECURITY가 협의하도록 고정한다. */
  public static List<String> reviewBlockers(SecurityRequest procedure, Role role) {
    List<String> blockers = new ArrayList<>();
    if (procedure.getStage() != 2) blockers.add("담당자 협의 단계에서 검토할 수 있습니다.");
    if (role != Role.INFRA && role != Role.SECURITY) blockers.add("전문 담당 역할이 필요합니다.");
    if (!procedure.getWorkflow().allocation().status().equals("COMPLETE")) {
      blockers.add("INFRA 자원 할당 완료 후 분야 협의를 완료해 주세요.");
    }
    for (SecurityRequestData.Answer answer : procedure.getData().answers()) {
      if ((answer.ownerRole() == role || answer.ownerRole() == Role.APPLICANT)
          && needsResolution(answer)
          && !resolved(answer)) {
        blockers.add(answer.label() + ": 확인이 필요합니다.");
      }
    }
    if (procedure.getData().supplements().stream()
        .anyMatch(item -> !item.status().equals("RESOLVED"))) {
      blockers.add("보완 요청의 답변과 담당자 해결 확인을 마쳐 주세요.");
    }
    if (procedure.getWorkflow().returnItems().stream()
        .anyMatch(
            item ->
                item.status().equals("OPEN")
                    && (item.fieldKey().equals("network")
                        || procedure.getData().answers().stream()
                            .anyMatch(
                                answer ->
                                    answer.key().equals(item.fieldKey())
                                        && (answer.ownerRole() == role
                                            || answer.ownerRole() == Role.APPLICANT))))) {
      blockers.add("해당 분야의 반환 항목을 수정하거나 다시 확인해 주세요.");
    }
    return List.copyOf(blockers);
  }

  /** 과거 검토의 의견·담당자·시각은 보존하고 유효 상태만 변경한다. */
  public static List<SecurityRequestData.Review> invalidateReviews(
      List<SecurityRequestData.Review> reviews) {
    return invalidateReviews(reviews, Set.of(Role.INFRA, Role.SECURITY));
  }

  /** 변경된 값에 의존하는 담당 분야만 재검토 대상으로 표시한다. */
  public static List<SecurityRequestData.Review> invalidateReviews(
      List<SecurityRequestData.Review> reviews, Set<Role> roles) {
    return reviews.stream()
        .map(
            review ->
                roles.contains(review.role())
                        && (review.status().equals("COMPLETE")
                            || review.status().equals("IN_PROGRESS"))
                    ? new SecurityRequestData.Review(
                        review.role(),
                        "INVALIDATED",
                        review.revision(),
                        review.comment(),
                        review.actorName(),
                        review.at())
                    : review)
        .toList();
  }

  /** 완료한 내용 버전은 증거로 보존하며 변경 영향이 있을 때만 명시적으로 무효화한다. */
  public static boolean currentReview(SecurityRequest procedure, Role role) {
    return procedure.getData().reviews().stream()
        .anyMatch(
            review ->
                review.role() == role
                    && review.status().equals("COMPLETE")
                    && review.revision() != null);
  }

  /** 직접 지정한 필드와 실제 통신·보안 의존 관계만 반환 강조 대상에 포함한다. */
  public static Set<String> affectedFields(SecurityRequest procedure, Set<String> fields) {
    Set<String> result = new LinkedHashSet<>(fields);
    boolean firewall = procedure.getDocumentType() == DocumentType.FIREWALL;
    for (String field : fields) {
      if (Set.of("dataFlow", "operatingEnvironment", "period").contains(field) && firewall) {
        result.add("network");
      }
      if (Set.of("network", "operatingEnvironment", "dataFlow", "externalTransfer", "dataTypes")
          .contains(field)) result.add("accessControl");
      if (field.equals("dataTypes") && !firewall) result.add("retention");
    }
    Set<String> known =
        new HashSet<>(
            procedure.getData().answers().stream().map(SecurityRequestData.Answer::key).toList());
    if (firewall) known.add("network");
    result.retainAll(known);
    return Set.copyOf(result);
  }

  /** 인프라 자료 변경은 후행 보안 검토에 영향을 주지만 보안 의견은 인프라를 무효화하지 않는다. */
  public static Set<Role> affectedRoles(SecurityRequest procedure, Set<String> fields) {
    Set<Role> roles = new HashSet<>();
    if (fields.contains("network")) roles.addAll(Set.of(Role.INFRA, Role.SECURITY));
    for (SecurityRequestData.Answer answer : procedure.getData().answers()) {
      if (!fields.contains(answer.key())) continue;
      if (answer.ownerRole() == Role.SECURITY) roles.add(Role.SECURITY);
      else roles.addAll(Set.of(Role.INFRA, Role.SECURITY));
    }
    for (SecurityRequestData.Supplement item : procedure.getData().supplements()) {
      if (fields.contains("supplement:" + item.id())) roles.add(item.requestedByRole());
    }
    return Set.copyOf(roles);
  }

  /** 할당 자원 자체가 달라지는 필드만 기존 할당의 재확인을 요구한다. */
  public static boolean affectsAllocation(SecurityRequest procedure, Set<String> fields) {
    return fields.contains("network")
        || fields.contains("operatingEnvironment")
        || procedure.getData().answers().stream()
            .anyMatch(answer -> answer.ownerRole() == Role.INFRA && fields.contains(answer.key()));
  }

  private static boolean needsResolution(SecurityRequestData.Answer answer) {
    return !answer.requiredAt().equals("OPTIONAL")
        || !answer.value().isBlank()
        || answer.status() != SecurityRequestData.AnswerStatus.EMPTY;
  }

  private static SecurityRequestData.Answer question(
      String key, String label, String reason, Role role, String requiredAt) {
    return new SecurityRequestData.Answer(
        key,
        label,
        reason,
        role,
        requiredAt,
        "",
        SecurityRequestData.AnswerStatus.EMPTY,
        null,
        null);
  }
}
