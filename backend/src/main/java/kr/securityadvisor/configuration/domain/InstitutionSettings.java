package kr.securityadvisor.configuration.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.util.UUID;
import kr.securityadvisor.common.entity.BaseTimeEntity;
import kr.securityadvisor.common.model.OrganizationPolicy;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/** 게시된 설정과 편집 중인 설정을 분리하여 기존 신청의 기준이 바뀌지 않게 한다. */
@Entity
@Table(name = "institution_settings")
public class InstitutionSettings extends BaseTimeEntity {
  @Id
  @Column(name = "institution_id", nullable = false)
  private UUID institutionId;

  @Column(nullable = false)
  private long revision;

  @Version
  @Column(name = "lock_version", nullable = false)
  private long lockVersion;

  @Column(name = "published_version", nullable = false)
  private long publishedVersion;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(name = "draft_policy", nullable = false, columnDefinition = "jsonb")
  private OrganizationPolicy draft;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(name = "published_policy", nullable = false, columnDefinition = "jsonb")
  private OrganizationPolicy published;

  protected InstitutionSettings() {}

  /** 새 초안은 게시본에 영향을 주지 않으며 자료 버전만 증가한다. */
  public void revise(OrganizationPolicy policy) {
    PolicyRules.validate(policy);
    draft = policy;
    revision++;
  }

  /** 게시 버전은 새 신청의 정책 스냅샷을 식별한다. */
  public void publish() {
    PolicyRules.validate(draft);
    published = draft;
    publishedVersion++;
    revision++;
  }

  public UUID getInstitutionId() {
    return institutionId;
  }

  public long getRevision() {
    return revision;
  }

  public long getPublishedVersion() {
    return publishedVersion;
  }

  public OrganizationPolicy getDraft() {
    return draft;
  }

  public OrganizationPolicy getPublished() {
    return published;
  }
}
