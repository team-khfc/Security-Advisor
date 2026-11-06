package kr.securityadvisor.request.repository;

import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import kr.securityadvisor.request.domain.SecurityRequest;
import kr.securityadvisor.request.domain.SecurityRequestStatus;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** 조회와 잠금 모두 기관 조건을 포함하여 다른 기관의 행을 먼저 가져오지 않는다. */
public interface SecurityRequestRepository extends JpaRepository<SecurityRequest, UUID> {
  List<SecurityRequest> findByInstitutionIdOrderByUpdatedAtDesc(
      UUID institutionId, Pageable pageable);

  List<SecurityRequest> findByInstitutionIdAndOwnerIdOrderByUpdatedAtDesc(
      UUID institutionId, UUID ownerId, Pageable pageable);

  List<SecurityRequest> findByInstitutionIdAndStatusNotOrderByUpdatedAtDesc(
      UUID institutionId, SecurityRequestStatus status, Pageable pageable);

  Optional<SecurityRequest> findByIdAndInstitutionId(UUID id, UUID institutionId);

  boolean existsByInstitutionIdAndOwnerId(UUID institutionId, UUID ownerId);

  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("select p from SecurityRequest p where p.id = :id and p.institutionId = :institutionId")
  Optional<SecurityRequest> lockByIdAndInstitutionId(
      @Param("id") UUID id, @Param("institutionId") UUID institutionId);
}
