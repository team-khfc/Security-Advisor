package kr.securityadvisor.llm.service;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Semaphore;
import kr.securityadvisor.common.error.DomainException;
import kr.securityadvisor.common.model.ModelConnection;
import kr.securityadvisor.common.model.Suggestion;
import kr.securityadvisor.common.security.Actor;
import kr.securityadvisor.common.security.Role;
import kr.securityadvisor.configuration.service.ModelConfigurationValidator;
import kr.securityadvisor.llm.domain.AnalysisJob;
import kr.securityadvisor.llm.domain.AnalysisSuggestion;
import kr.securityadvisor.llm.dto.AnalysisResponse;
import kr.securityadvisor.llm.repository.AnalysisJobRepository;
import kr.securityadvisor.request.dto.SecurityRequestResponse;
import kr.securityadvisor.request.service.SecurityRequestService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

/** 분석·사람 확인 사이에 저장된 후보와 입력 버전 경계를 둔다. */
@Service
@Transactional(readOnly = true)
public class AnalysisService {
  private final SecurityRequestService procedures;
  private final AnalysisJobRepository jobs;
  private final AnalysisJobStore jobStore;
  private final UploadStorage storage;
  private final CandidateValidator candidates;
  private final ModelConfigurationValidator configurations;
  private final ModelConfigurationService models;
  private final List<LanguageModelAdapter> adapters;
  private final Semaphore slots = new Semaphore(4);

  public AnalysisService(
      SecurityRequestService procedures,
      AnalysisJobRepository jobs,
      AnalysisJobStore jobStore,
      UploadStorage storage,
      CandidateValidator candidates,
      ModelConfigurationValidator configurations,
      ModelConfigurationService models,
      List<LanguageModelAdapter> adapters) {
    this.procedures = procedures;
    this.jobs = jobs;
    this.jobStore = jobStore;
    this.storage = storage;
    this.candidates = candidates;
    this.configurations = configurations;
    this.models = models;
    this.adapters = List.copyOf(adapters);
  }

  /**
   * 사용자가 누른 분석 요청만 저장·전송하며 실패는 비정상 HTTP 응답과 실패 이력으로 남긴다.
   *
   * @throws DomainException 권한·입력·버전·연결·모델 출력 검증이 실패했을 때
   */
  @Transactional(propagation = Propagation.NOT_SUPPORTED)
  public AnalysisResponse analyze(
      Actor actor, UUID procedureId, long expectedRevision, String text, MultipartFile file) {
    SecurityRequestResponse procedure = procedures.get(actor, procedureId);
    requireEditable(actor, procedure, expectedRevision);
    ModelConfigurationService.CurrentModel selected =
        models.current(actor.institutionId(), "DOCUMENT_ANALYSIS");
    ModelConnection connection = selected.connection();
    configurations.validate(connection);
    LanguageModelAdapter adapter =
        adapters.stream()
            .filter(item -> item.provider().equals(connection.provider()))
            .findFirst()
            .orElseThrow(
                () -> new DomainException(503, "MODEL_NOT_AVAILABLE", "선택한 모델 어댑터를 사용할 수 없습니다."));
    if (!slots.tryAcquire()) {
      throw new DomainException(429, "ANALYSIS_BUSY", "현재 분석 요청이 많습니다. 잠시 후 다시 시도해 주세요.");
    }
    try {
      StoredInput input = storage.store(text, file);
      AnalysisJob job =
          jobStore.start(actor, procedureId, expectedRevision, selected, input.objectNames());
      try {
        List<Suggestion> proposed =
            candidates.validate(input.text(), adapter.analyze(input.text(), connection));
        List<AnalysisSuggestion> available =
            proposed.stream()
                .flatMap(
                    suggestion ->
                        procedure.answers().stream()
                            .filter(answer -> answer.key().equals(suggestion.key()))
                            .filter(
                                answer ->
                                    !"CONFIRMED".equals(answer.status())
                                        && !"NOT_APPLICABLE".equals(answer.status()))
                            .map(
                                answer ->
                                    new AnalysisSuggestion(
                                        suggestion.key(),
                                        answer.label(),
                                        suggestion.value(),
                                        suggestion.evidence())))
                .toList();
        AnalysisJob finished = jobStore.succeed(job.getId(), actor.institutionId(), available);
        if (!"SUCCEEDED".equals(finished.getStatus())) {
          throw new DomainException(
              409, "ANALYSIS_INTERRUPTED", "분석 실행이 중단되었습니다. 최신 입력으로 다시 분석해 주세요.");
        }
        return AnalysisResponse.from(finished, procedures.get(actor, procedureId).revision());
      } catch (DomainException exception) {
        jobStore.fail(job.getId(), actor.institutionId(), exception.getMessage());
        throw exception;
      } catch (RuntimeException exception) {
        String message = "분석을 완료하지 못했습니다. 다시 시도하거나 직접 입력해 주세요.";
        jobStore.fail(job.getId(), actor.institutionId(), message);
        throw new DomainException(502, "ANALYSIS_FAILED", message);
      }
    } finally {
      slots.release();
    }
  }

  /**
   * 동일한 업무 조회 권한으로 이력을 읽고 중단된 실행은 재시도 가능한 실패로 표시한다.
   *
   * @throws DomainException 기관·신청 소유권을 확인하지 못했을 때
   */
  @Transactional
  public List<AnalysisResponse> list(Actor actor, UUID procedureId) {
    SecurityRequestResponse procedure = procedures.get(actor, procedureId);
    List<AnalysisJob> found =
        jobs
            .findTop20ByProcedureIdAndInstitutionIdOrderByCreatedAtDesc(
                procedureId, actor.institutionId())
            .stream()
            .filter(job -> "DOCUMENT_ANALYSIS".equals(job.getPurpose()))
            .toList();
    Instant now = Instant.now();
    for (AnalysisJob job : found) {
      if ("RUNNING".equals(job.getStatus())
          && job.getCreatedAt().plusSeconds(job.getTimeoutSeconds() + 30L).isBefore(now)) {
        job.fail("분석 실행이 중단되었습니다. 완료된 결과가 없으므로 다시 분석해 주세요.");
      }
    }
    return found.stream().map(job -> AnalysisResponse.from(job, procedure.revision())).toList();
  }

  /**
   * 클라이언트가 값을 바꾸어 보내지 못하게 분석 ID에 저장된 결과만 원자적으로 반영한다.
   *
   * @throws DomainException 권한·오래된 입력·재적용·확정 값 보호 조건이 맞지 않을 때
   */
  @Transactional
  public SecurityRequestResponse apply(
      Actor actor, UUID procedureId, UUID analysisId, long expectedRevision) {
    SecurityRequestResponse procedure = procedures.get(actor, procedureId);
    requireEditable(actor, procedure, expectedRevision);
    AnalysisJob job =
        jobs.lockByIdAndInstitutionId(analysisId, actor.institutionId())
            .filter(item -> item.getSecurityRequestId().equals(procedureId))
            .filter(item -> item.getRequestedBy().equals(actor.userId()))
            .orElseThrow(() -> new DomainException(404, "ANALYSIS_NOT_FOUND", "분석 결과를 찾을 수 없습니다."));
    if (!"DOCUMENT_ANALYSIS".equals(job.getPurpose())
        || !"SUCCEEDED".equals(job.getStatus())
        || job.getAppliedAt() != null
        || job.getInputRevision() != expectedRevision) {
      throw new DomainException(
          409, "STALE_ANALYSIS", "적용할 수 없는 분석입니다. 최신 입력으로 다시 분석해 주세요.", procedure.revision());
    }
    List<Suggestion> suggestions =
        job.getSuggestions().stream()
            .map(item -> new Suggestion(item.key(), item.value(), item.evidence()))
            .toList();
    SecurityRequestResponse updated =
        procedures.propose(actor, procedureId, expectedRevision, suggestions);
    job.markApplied();
    jobs.flush();
    return updated;
  }

  private void requireEditable(
      Actor actor, SecurityRequestResponse procedure, long expectedRevision) {
    if (java.util.Set.of("CLOSED", "WITHDRAWN").contains(procedure.status())) {
      throw new DomainException(409, "REQUEST_TERMINATED", "종결·철회된 신청은 변경할 수 없습니다.");
    }
    if (actor.role() != Role.APPLICANT || !procedure.allowedActions().contains("ANALYZE")) {
      throw new DomainException(403, "ANALYSIS_NOT_ALLOWED", "작성 중인 본인 신청만 분석할 수 있습니다.");
    }
    if (expectedRevision < 0 || procedure.revision() != expectedRevision) {
      throw new DomainException(
          409, "STALE_ANALYSIS_INPUT", "신청 내용이 변경되었습니다. 최신 내용으로 다시 분석해 주세요.", procedure.revision());
    }
  }
}
