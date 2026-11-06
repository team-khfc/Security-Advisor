package kr.securityadvisor.configuration.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import kr.securityadvisor.configuration.domain.PolicyPublication;
import org.springframework.data.jpa.repository.JpaRepository;

/** 기관별 게시 이력과 중복 요청 키를 찾는다. */
public interface PolicyPublicationRepository extends JpaRepository<PolicyPublication, UUID> {
  Optional<PolicyPublication> findByInstitutionIdAndRequestKey(
      UUID institutionId, String requestKey);

  List<PolicyPublication> findTop50ByInstitutionIdOrderByVersionDesc(UUID institutionId);
}
