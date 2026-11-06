package kr.securityadvisor.configuration.dto;

import java.util.List;
import kr.securityadvisor.common.model.OrganizationPolicy;
import kr.securityadvisor.configuration.domain.InstitutionSettings;
import kr.securityadvisor.configuration.domain.PolicyPublication;

/** 초안과 게시본을 다른 필드로 전달하여 적용 범위를 명확히 한다. */
public record SettingsResponse(
    long revision,
    long publishedVersion,
    OrganizationPolicy draft,
    OrganizationPolicy published,
    List<PublicationResponse> history) {
  public SettingsResponse {
    history = List.copyOf(history);
  }

  /** 엔티티의 내부 변경 기능을 API에 노출하지 않는다. */
  public static SettingsResponse from(
      InstitutionSettings settings, List<PolicyPublication> publications) {
    return new SettingsResponse(
        settings.getRevision(),
        settings.getPublishedVersion(),
        settings.getDraft(),
        settings.getPublished(),
        publications.stream().map(PublicationResponse::from).toList());
  }
}
