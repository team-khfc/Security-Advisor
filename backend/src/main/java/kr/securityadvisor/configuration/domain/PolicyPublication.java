package kr.securityadvisor.configuration.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;
import kr.securityadvisor.common.entity.BaseTimeEntity;
import kr.securityadvisor.common.model.OrganizationPolicy;
import org.hibernate.annotations.Immutable;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/** 게시 시점의 설정과 멱등 요청 정보를 변경 불가능한 이력으로 남긴다. */
@Entity
@Immutable
@Table(name = "policy_publications")
public class PolicyPublication extends BaseTimeEntity {
  @Id private UUID id;

  @Column(name = "institution_id", nullable = false)
  private UUID institutionId;

  @Column(nullable = false)
  private long version;

  @Column(name = "base_revision", nullable = false)
  private long baseRevision;

  @Column(name = "request_key", nullable = false, length = 80)
  private String requestKey;

  @Column(name = "published_by", nullable = false, length = 100)
  private String publishedBy;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(nullable = false, columnDefinition = "jsonb")
  private OrganizationPolicy policy;

  protected PolicyPublication() {}

  /** 한 게시 요청이 만든 정책을 원본 그대로 보존한다. */
  public PolicyPublication(
      UUID institutionId,
      long version,
      long baseRevision,
      String requestKey,
      String publishedBy,
      OrganizationPolicy policy) {
    id = UUID.randomUUID();
    this.institutionId = institutionId;
    this.version = version;
    this.baseRevision = baseRevision;
    this.requestKey = requestKey;
    this.publishedBy = publishedBy;
    this.policy = policy;
  }

  public long getVersion() {
    return version;
  }

  public long getBaseRevision() {
    return baseRevision;
  }

  public String getPublishedBy() {
    return publishedBy;
  }
}
