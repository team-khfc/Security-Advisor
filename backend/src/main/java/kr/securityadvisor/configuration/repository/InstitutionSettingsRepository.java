package kr.securityadvisor.configuration.repository;

import jakarta.persistence.LockModeType;
import java.util.Optional;
import java.util.UUID;
import kr.securityadvisor.configuration.domain.InstitutionSettings;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** 설정의 최초 생성과 수정 경쟁을 PostgreSQL 제약·행 잠금으로 직렬화한다. */
public interface InstitutionSettingsRepository extends JpaRepository<InstitutionSettings, UUID> {
  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("select s from InstitutionSettings s where s.institutionId = :institutionId")
  Optional<InstitutionSettings> lockByInstitutionId(@Param("institutionId") UUID institutionId);

  @Modifying
  @Query(
      value =
          """
          INSERT INTO institution_settings
            (institution_id, revision, lock_version, published_version,
             draft_policy, published_policy, created_at, updated_at)
          VALUES (:institutionId, 1, 0, 1, CAST(:policy AS jsonb), CAST(:policy AS jsonb),
                  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT (institution_id) DO NOTHING
          """,
      nativeQuery = true)
  int insertIfAbsent(@Param("institutionId") UUID institutionId, @Param("policy") String policy);
}
