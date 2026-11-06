package kr.securityadvisor.document.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import kr.securityadvisor.document.domain.Submission;
import org.springframework.data.jpa.repository.JpaRepository;

/** 제출본과 멱등성 키는 기관·작성자 범위로 조회한다. */
public interface SubmissionRepository extends JpaRepository<Submission, UUID> {
  Optional<Submission> findFirstByProcedureIdAndInstitutionIdOrderBySubmissionVersionDesc(
      UUID procedureId, UUID institutionId);

  Optional<Submission> findByProcedureIdAndInstitutionIdAndSubmissionVersion(
      UUID procedureId, UUID institutionId, int submissionVersion);

  List<Submission> findByProcedureIdAndInstitutionIdOrderBySubmissionVersionDesc(
      UUID procedureId, UUID institutionId);

  Optional<Submission> findByInstitutionIdAndOwnerIdAndIdempotencyKey(
      UUID institutionId, UUID ownerId, String idempotencyKey);
}
