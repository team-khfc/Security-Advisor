package kr.securityadvisor.common.entity;

import jakarta.persistence.Column;
import jakarta.persistence.MappedSuperclass;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import java.time.Instant;
import java.time.temporal.ChronoUnit;

/** 원본 생성 시각을 유지하면서 서버의 변경 시각을 기록한다. */
@MappedSuperclass
public abstract class BaseTimeEntity {
  @Column(name = "created_at", nullable = false, updatable = false)
  private Instant createdAt;

  @Column(name = "updated_at", nullable = false)
  private Instant updatedAt;

  protected BaseTimeEntity() {}

  @PrePersist
  protected void recordCreation() {
    // PostgreSQL timestamptz 정밀도와 맞춰 최초 응답과 재조회·멱등 응답을 일치시킨다.
    Instant now = Instant.now().truncatedTo(ChronoUnit.MICROS);
    createdAt = now;
    updatedAt = now;
  }

  @PreUpdate
  protected void recordChange() {
    updatedAt = Instant.now().truncatedTo(ChronoUnit.MICROS);
  }

  /** 저장된 최초 생성 시각을 반환한다. */
  public Instant getCreatedAt() {
    return createdAt;
  }

  /** 서버가 마지막으로 변경을 저장한 시각을 반환한다. */
  public Instant getUpdatedAt() {
    return updatedAt;
  }
}
