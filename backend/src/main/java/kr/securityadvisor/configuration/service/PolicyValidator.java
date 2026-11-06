package kr.securityadvisor.configuration.service;

import kr.securityadvisor.common.model.OrganizationPolicy;
import kr.securityadvisor.configuration.domain.PolicyRules;
import org.springframework.stereotype.Component;

/** 도메인 정책 규칙과 모델 허용목록을 함께 검사한다. */
@Component
public class PolicyValidator {
  private final ModelConfigurationValidator models;

  public PolicyValidator(ModelConfigurationValidator models) {
    this.models = models;
  }

  public void validate(OrganizationPolicy policy) {
    PolicyRules.validate(policy);
    models.validate(policy.model());
  }
}
