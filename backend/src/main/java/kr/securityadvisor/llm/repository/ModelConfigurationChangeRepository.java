package kr.securityadvisor.llm.repository;

import java.util.List;
import java.util.UUID;
import kr.securityadvisor.llm.domain.ModelConfigurationChange;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ModelConfigurationChangeRepository
    extends JpaRepository<ModelConfigurationChange, UUID> {
  List<ModelConfigurationChange> findTop50ByInstitutionIdOrderByRevisionDesc(UUID institutionId);
}
