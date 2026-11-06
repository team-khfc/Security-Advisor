package kr.securityadvisor.llm.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import kr.securityadvisor.common.entity.BaseTimeEntity;
import kr.securityadvisor.common.error.DomainException;
import kr.securityadvisor.common.model.ModelConnection;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/** 신청 정책의 게시본과 독립적으로 기관의 최신 실행 구성을 관리하는 애그리거트다. */
@Entity
@Table(name = "llm_configurations")
public class LlmConfiguration extends BaseTimeEntity {
  public static final Set<String> PURPOSES =
      Set.of("DOCUMENT_ANALYSIS", "STAFF_ASSISTANT", "FINAL_DRAFT");

  @Id
  @Column(name = "institution_id", nullable = false)
  private UUID institutionId;

  @Column(nullable = false)
  private long revision;

  @Version
  @Column(name = "lock_version", nullable = false)
  private long lockVersion;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(nullable = false, columnDefinition = "jsonb")
  private List<ModelAssignment> connections;

  protected LlmConfiguration() {}

  /** 구성 전체의 용도가 중복·누락되지 않은 경우에만 새 버전으로 바꾼다. */
  public void replace(long expectedRevision, List<ModelAssignment> assignments) {
    if (revision != expectedRevision) {
      throw new DomainException(
          409, "STALE_MODEL_CONFIGURATION", "모델 구성이 변경되었습니다. 최신 설정을 다시 확인해 주세요.", revision);
    }
    validatePurposes(assignments);
    connections = List.copyOf(assignments);
    revision++;
  }

  public static void validatePurposes(List<ModelAssignment> assignments) {
    Set<String> found = new HashSet<>();
    if (assignments == null || assignments.size() != PURPOSES.size()) {
      throw invalid();
    }
    for (ModelAssignment assignment : assignments) {
      if (assignment == null
          || assignment.connection() == null
          || assignment.purpose() == null
          || !PURPOSES.contains(assignment.purpose())
          || !found.add(assignment.purpose())) {
        throw invalid();
      }
    }
  }

  public ModelConnection forPurpose(String purpose) {
    return connections.stream()
        .filter(item -> item.purpose().equals(purpose))
        .map(ModelAssignment::connection)
        .findFirst()
        .orElseThrow(LlmConfiguration::invalid);
  }

  public UUID getInstitutionId() {
    return institutionId;
  }

  public long getRevision() {
    return revision;
  }

  public List<ModelAssignment> getConnections() {
    return List.copyOf(connections);
  }

  private static DomainException invalid() {
    return new DomainException(
        422, "INVALID_MODEL_PURPOSES", "문서 분석·담당자 질의·최종 초안의 모델을 각각 지정해 주세요.");
  }
}
