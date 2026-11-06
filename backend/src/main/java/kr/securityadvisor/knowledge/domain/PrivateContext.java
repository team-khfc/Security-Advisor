package kr.securityadvisor.knowledge.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;
import kr.securityadvisor.common.entity.BaseTimeEntity;

/** 제목·분류·본문을 하나의 암호문으로 보관하는 기관 참고 자료다. */
@Entity
@Table(name = "private_contexts")
public class PrivateContext extends BaseTimeEntity {
  @Id private UUID id;

  @Column(name = "institution_id", nullable = false)
  private UUID institutionId;

  @Column(name = "encrypted_payload", nullable = false, columnDefinition = "bytea")
  private byte[] encryptedPayload;

  @Column(name = "created_by", nullable = false, length = 100)
  private String createdBy;

  protected PrivateContext() {}

  /** 암호문을 방어적으로 복사하여 저장 이후 외부 배열의 변경을 막는다. */
  public PrivateContext(UUID id, UUID institutionId, byte[] encryptedPayload, String createdBy) {
    this.id = id;
    this.institutionId = institutionId;
    this.encryptedPayload = encryptedPayload.clone();
    this.createdBy = createdBy;
  }

  public UUID getId() {
    return id;
  }

  public UUID getInstitutionId() {
    return institutionId;
  }

  public byte[] getEncryptedPayload() {
    return encryptedPayload.clone();
  }

  public String getCreatedBy() {
    return createdBy;
  }
}
