package kr.securityadvisor.knowledge.repository;

import java.util.List;
import java.util.UUID;
import kr.securityadvisor.knowledge.domain.PrivateContext;
import org.springframework.data.jpa.repository.JpaRepository;

/** 기관 조건을 조회 문장에 포함하여 다른 기관의 암호문을 가져오지 않는다. */
public interface PrivateContextRepository extends JpaRepository<PrivateContext, UUID> {
  List<PrivateContext> findTop100ByInstitutionIdOrderByCreatedAtDesc(UUID institutionId);
}
