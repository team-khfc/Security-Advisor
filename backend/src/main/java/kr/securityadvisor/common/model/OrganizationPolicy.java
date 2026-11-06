package kr.securityadvisor.common.model;

import java.util.List;

/** 신청이 시작될 때 고정할 질문·검토·서식·모델 정책이다. */
public record OrganizationPolicy(
    String institutionName,
    String reviewMode,
    boolean requireSecurity,
    boolean requireInfra,
    List<ExtraQuestion> questions,
    String documentFooter,
    ModelConnection model) {
  public OrganizationPolicy {
    questions = questions == null ? List.of() : List.copyOf(questions);
  }
}
