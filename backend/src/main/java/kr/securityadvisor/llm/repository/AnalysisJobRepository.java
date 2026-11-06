package kr.securityadvisor.llm.repository;

import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import kr.securityadvisor.llm.domain.AnalysisJob;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** 신청과 기관을 함께 검사하여 분석 이력을 찾는다. */
public interface AnalysisJobRepository extends JpaRepository<AnalysisJob, UUID> {
  List<AnalysisJob> findTop20ByProcedureIdAndInstitutionIdOrderByCreatedAtDesc(
      UUID procedureId, UUID institutionId);

  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("select a from AnalysisJob a where a.id = :id and a.institutionId = :institutionId")
  Optional<AnalysisJob> lockByIdAndInstitutionId(
      @Param("id") UUID id, @Param("institutionId") UUID institutionId);
}
