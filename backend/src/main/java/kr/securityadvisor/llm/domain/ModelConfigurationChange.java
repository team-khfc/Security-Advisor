package kr.securityadvisor.llm.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.List;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/** 누가 어느 기관의 실행 구성을 바꾸었는지 보존하는 추가 전용 이력이다. */
@Entity
@Table(name = "llm_configuration_changes")
public class ModelConfigurationChange extends kr.securityadvisor.common.entity.BaseTimeEntity {
  @Id private UUID id;

  @Column(name = "institution_id", nullable = false)
  private UUID institutionId;

  @Column(nullable = false)
  private long revision;

  @Column(name = "changed_by", nullable = false)
  private UUID changedBy;

  @Column(nullable = false, length = 100)
  private String author;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(nullable = false, columnDefinition = "jsonb")
  private List<ModelAssignment> connections;

  protected ModelConfigurationChange() {}

  public ModelConfigurationChange(
      UUID institutionId,
      long revision,
      UUID changedBy,
      String author,
      List<ModelAssignment> connections) {
    this.id = UUID.randomUUID();
    this.institutionId = institutionId;
    this.revision = revision;
    this.changedBy = changedBy;
    this.author = author;
    this.connections = List.copyOf(connections);
  }

  public long getRevision() {
    return revision;
  }

  public String getAuthor() {
    return author;
  }

  public List<ModelAssignment> getConnections() {
    return List.copyOf(connections);
  }
}
