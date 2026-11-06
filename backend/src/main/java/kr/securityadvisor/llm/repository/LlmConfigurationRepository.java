package kr.securityadvisor.llm.repository;

import jakarta.persistence.LockModeType;
import java.util.Optional;
import java.util.UUID;
import kr.securityadvisor.llm.domain.LlmConfiguration;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface LlmConfigurationRepository extends JpaRepository<LlmConfiguration, UUID> {
  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("select c from LlmConfiguration c where c.institutionId = :institutionId")
  Optional<LlmConfiguration> lockByInstitutionId(@Param("institutionId") UUID institutionId);

  @Modifying
  @Query(
      value =
          """
          INSERT INTO llm_configurations (institution_id, revision, lock_version, connections, created_at, updated_at)
          VALUES (:institutionId, 1, 0, CAST(:connections AS jsonb), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT (institution_id) DO NOTHING
          """,
      nativeQuery = true)
  int insertIfAbsent(
      @Param("institutionId") UUID institutionId, @Param("connections") String connections);
}
