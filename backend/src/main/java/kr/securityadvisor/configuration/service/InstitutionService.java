package kr.securityadvisor.configuration.service;

import java.util.List;
import java.util.UUID;
import kr.securityadvisor.common.error.DomainException;
import kr.securityadvisor.common.model.ModelConnection;
import kr.securityadvisor.common.model.OrganizationPolicy;
import kr.securityadvisor.common.model.PolicyProvider;
import kr.securityadvisor.common.model.PolicySnapshot;
import kr.securityadvisor.common.security.Actor;
import kr.securityadvisor.common.security.Role;
import kr.securityadvisor.configuration.domain.InstitutionSettings;
import kr.securityadvisor.configuration.domain.PolicyPublication;
import kr.securityadvisor.configuration.dto.SettingsRequest;
import kr.securityadvisor.configuration.dto.SettingsResponse;
import kr.securityadvisor.configuration.repository.InstitutionSettingsRepository;
import kr.securityadvisor.configuration.repository.PolicyPublicationRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

/** 기관별 편집·게시·적용 스냅샷을 하나의 트랜잭션 경계로 관리한다. */
@Service
@Transactional(readOnly = true)
public class InstitutionService implements PolicyProvider {
  private final InstitutionSettingsRepository settings;
  private final PolicyPublicationRepository publications;
  private final PolicyValidator validator;
  private final ObjectMapper mapper;

  public InstitutionService(
      InstitutionSettingsRepository settings,
      PolicyPublicationRepository publications,
      PolicyValidator validator,
      ObjectMapper mapper) {
    this.settings = settings;
    this.publications = publications;
    this.validator = validator;
    this.mapper = mapper;
  }

  /**
   * 관리자는 자기 기관의 초안과 게시본만 조회한다.
   *
   * @throws DomainException 관리자가 아닐 때
   */
  @Transactional
  public SettingsResponse getSettings(Actor actor) {
    requireAdmin(actor);
    ensureExists(actor.institutionId());
    return response(get(actor.institutionId()));
  }

  /**
   * 게시본을 유지한 채 초안만 수정한다.
   *
   * @throws DomainException 권한·입력·버전이 유효하지 않을 때
   */
  @Transactional
  public SettingsResponse updateSettings(Actor actor, SettingsRequest request) {
    requireAdmin(actor);
    validator.validate(request.policy());
    InstitutionSettings current = lock(actor.institutionId());
    requireRevision(current, request.expectedRevision());
    current.revise(request.policy());
    settings.flush();
    return response(current);
  }

  /**
   * 같은 요청의 재전송은 게시본을 중복 생성하지 않는다.
   *
   * @throws DomainException 권한·버전·멱등 키·설정 검증이 실패했을 때
   */
  @Transactional
  public SettingsResponse publish(Actor actor, long expectedRevision, String requestKey) {
    requireAdmin(actor);
    if (requestKey == null || !requestKey.matches("[A-Za-z0-9_-]{16,80}")) {
      throw new DomainException(400, "INVALID_IDEMPOTENCY_KEY", "게시 요청 식별자를 확인해 주세요.");
    }
    InstitutionSettings current = lock(actor.institutionId());
    var previous = publications.findByInstitutionIdAndRequestKey(actor.institutionId(), requestKey);
    if (previous.isPresent()) {
      if (previous.get().getBaseRevision() != expectedRevision) {
        throw new DomainException(409, "IDEMPOTENCY_CONFLICT", "다른 게시 요청에 사용한 식별자입니다.");
      }
      return response(current);
    }
    requireRevision(current, expectedRevision);
    validator.validate(current.getDraft());
    current.publish();
    publications.saveAndFlush(
        new PolicyPublication(
            actor.institutionId(),
            current.getPublishedVersion(),
            expectedRevision,
            requestKey,
            actor.displayName(),
            current.getPublished()));
    return response(current);
  }

  /** 새 신청이 생성되는 순간의 게시본만 가져온다. */
  @Override
  @Transactional
  public PolicySnapshot current(UUID institutionId) {
    ensureExists(institutionId);
    InstitutionSettings current = get(institutionId);
    return new PolicySnapshot(current.getPublishedVersion(), current.getPublished());
  }

  private void ensureExists(UUID institutionId) {
    OrganizationPolicy initial =
        new OrganizationPolicy(
            "디지털혁신기관(가상)",
            "INFRA_FIRST",
            true,
            true,
            List.of(),
            "합성 데이터로 작성한 시연용 서류입니다. 검토 완료는 실제 장비 적용을 뜻하지 않습니다.",
            new ModelConnection("EXAMPLE", "", "extractive-demo", "", 0.2, 1200, 30));
    if (settings.insertIfAbsent(institutionId, mapper.writeValueAsString(initial)) == 1) {
      publications.save(new PolicyPublication(institutionId, 1, 0, "initial", "시스템 기본값", initial));
    }
  }

  private InstitutionSettings lock(UUID institutionId) {
    ensureExists(institutionId);
    return settings.lockByInstitutionId(institutionId).orElseThrow();
  }

  private InstitutionSettings get(UUID institutionId) {
    return settings.findById(institutionId).orElseThrow();
  }

  private SettingsResponse response(InstitutionSettings current) {
    return SettingsResponse.from(
        current,
        publications.findTop50ByInstitutionIdOrderByVersionDesc(current.getInstitutionId()));
  }

  private void requireAdmin(Actor actor) {
    if (actor.role() != Role.ADMIN) {
      throw new DomainException(403, "INSTITUTION_ADMIN_REQUIRED", "기관 관리자만 설정을 관리할 수 있습니다.");
    }
  }

  private void requireRevision(InstitutionSettings current, long expectedRevision) {
    if (expectedRevision != current.getRevision()) {
      throw new DomainException(
          409, "STALE_SETTINGS", "다른 변경이 저장되었습니다. 최신 설정과 비교해 주세요.", current.getRevision());
    }
  }
}
