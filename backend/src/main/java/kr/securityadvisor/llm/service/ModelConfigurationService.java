package kr.securityadvisor.llm.service;

import java.util.List;
import java.util.UUID;
import kr.securityadvisor.common.error.DomainException;
import kr.securityadvisor.common.model.ModelConnection;
import kr.securityadvisor.common.security.Actor;
import kr.securityadvisor.common.security.Role;
import kr.securityadvisor.configuration.service.ModelConfigurationValidator;
import kr.securityadvisor.llm.domain.LlmConfiguration;
import kr.securityadvisor.llm.domain.ModelAssignment;
import kr.securityadvisor.llm.domain.ModelConfigurationChange;
import kr.securityadvisor.llm.dto.ModelsRequest;
import kr.securityadvisor.llm.dto.ModelsResponse;
import kr.securityadvisor.llm.repository.LlmConfigurationRepository;
import kr.securityadvisor.llm.repository.ModelConfigurationChangeRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

@Service
@Transactional(readOnly = true)
public class ModelConfigurationService {
  private final LlmConfigurationRepository configurations;
  private final ModelConfigurationChangeRepository changes;
  private final ModelConfigurationValidator validator;
  private final ObjectMapper mapper;

  public ModelConfigurationService(
      LlmConfigurationRepository configurations,
      ModelConfigurationChangeRepository changes,
      ModelConfigurationValidator validator,
      ObjectMapper mapper) {
    this.configurations = configurations;
    this.changes = changes;
    this.validator = validator;
    this.mapper = mapper;
  }

  @Transactional
  public ModelsResponse get(Actor actor) {
    requireAdmin(actor);
    ensure(actor.institutionId());
    return response(configurations.findById(actor.institutionId()).orElseThrow());
  }

  @Transactional
  public ModelsResponse update(Actor actor, ModelsRequest request) {
    requireAdmin(actor);
    LlmConfiguration.validatePurposes(request.connections());
    request.connections().forEach(item -> validator.validate(item.connection()));
    ensure(actor.institutionId());
    LlmConfiguration current =
        configurations.lockByInstitutionId(actor.institutionId()).orElseThrow();
    current.replace(request.expectedRevision(), request.connections());
    changes.saveAndFlush(
        new ModelConfigurationChange(
            actor.institutionId(),
            current.getRevision(),
            actor.userId(),
            actor.displayName(),
            current.getConnections()));
    configurations.flush();
    return response(current);
  }

  /** 외부 호출 직전 최신 실행 구성을 읽되 진행 중인 호출의 스냅샷은 바꾸지 않는다. */
  @Transactional
  public CurrentModel current(UUID institutionId, String purpose) {
    ensure(institutionId);
    LlmConfiguration current = configurations.findById(institutionId).orElseThrow();
    ModelConnection connection = current.forPurpose(purpose);
    validator.validate(connection);
    return new CurrentModel(current.getRevision(), purpose, connection);
  }

  private void ensure(UUID institutionId) {
    ModelConnection example =
        new ModelConnection("EXAMPLE", "", "extractive-demo", "", 0.2, 1200, 30);
    List<ModelAssignment> initial =
        List.of(
            new ModelAssignment("DOCUMENT_ANALYSIS", example),
            new ModelAssignment("STAFF_ASSISTANT", example),
            new ModelAssignment("FINAL_DRAFT", example));
    configurations.insertIfAbsent(institutionId, mapper.writeValueAsString(initial));
  }

  private ModelsResponse response(LlmConfiguration configuration) {
    String mode =
        configuration.getConnections().stream()
                .allMatch(item -> "EXAMPLE".equals(item.connection().provider()))
            ? "SYNTHETIC"
            : "LIVE";
    return new ModelsResponse(
        configuration.getRevision(),
        mode,
        configuration.getConnections(),
        changes
            .findTop50ByInstitutionIdOrderByRevisionDesc(configuration.getInstitutionId())
            .stream()
            .map(
                change ->
                    new ModelsResponse.Change(
                        change.getRevision(),
                        change.getAuthor(),
                        change.getCreatedAt(),
                        change.getConnections()))
            .toList());
  }

  private void requireAdmin(Actor actor) {
    if (actor.role() != Role.ADMIN) {
      throw new DomainException(403, "INSTITUTION_ADMIN_REQUIRED", "기관 관리자만 모델 구성을 관리할 수 있습니다.");
    }
  }

  public record CurrentModel(long revision, String purpose, ModelConnection connection) {}
}
