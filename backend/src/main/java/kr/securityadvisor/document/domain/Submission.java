package kr.securityadvisor.document.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;
import kr.securityadvisor.common.entity.BaseTimeEntity;
import org.hibernate.annotations.Immutable;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/** DB 트리거와 불변 엔티티로 제출본의 변경·삭제를 함께 차단한다. */
@Entity
@Immutable
@Table(name = "procedure_submissions")
public class Submission extends BaseTimeEntity {
  @Id private UUID id;

  @Column(name = "procedure_id", nullable = false, updatable = false)
  private UUID procedureId;

  @Column(name = "institution_id", nullable = false, updatable = false)
  private UUID institutionId;

  @Column(name = "owner_id", nullable = false, updatable = false)
  private UUID ownerId;

  @Column(name = "idempotency_key", nullable = false, updatable = false, length = 100)
  private String idempotencyKey;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(nullable = false, updatable = false, columnDefinition = "jsonb")
  private SubmissionSnapshot snapshot;

  @Column(name = "document_html", nullable = false, updatable = false, columnDefinition = "text")
  private String documentHtml;

  @Column(name = "submission_version", nullable = false, updatable = false)
  private int submissionVersion;

  @Column(name = "request_revision", updatable = false)
  private Long requestRevision;

  protected Submission() {}

  /** 렌더러가 변경되어도 이미 제출한 문서의 바이트가 달라지지 않도록 함께 보관한다. */
  public Submission(
      UUID procedureId,
      UUID institutionId,
      UUID ownerId,
      String idempotencyKey,
      SubmissionSnapshot snapshot,
      String documentHtml,
      int submissionVersion,
      long requestRevision) {
    this.id = UUID.randomUUID();
    this.procedureId = procedureId;
    this.institutionId = institutionId;
    this.ownerId = ownerId;
    this.idempotencyKey = idempotencyKey;
    this.snapshot = snapshot;
    this.documentHtml = documentHtml;
    this.submissionVersion = submissionVersion;
    this.requestRevision = requestRevision;
  }

  public UUID getOwnerId() {
    return ownerId;
  }

  public int getSubmissionVersion() {
    return submissionVersion;
  }

  public long getRequestRevision() {
    return requestRevision == null ? snapshot.revision() : requestRevision;
  }

  public UUID getProcedureId() {
    return procedureId;
  }

  public SubmissionSnapshot getSnapshot() {
    return snapshot;
  }

  public String getDocumentHtml() {
    return documentHtml;
  }
}
