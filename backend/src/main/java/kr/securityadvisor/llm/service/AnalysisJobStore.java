package kr.securityadvisor.llm.service;

import java.util.List;
import java.util.UUID;
import kr.securityadvisor.common.model.ModelConnection;
import kr.securityadvisor.common.security.Actor;
import kr.securityadvisor.llm.domain.AnalysisJob;
import kr.securityadvisor.llm.domain.AnalysisSuggestion;
import kr.securityadvisor.llm.repository.AnalysisJobRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** 네트워크 호출 밖에서 짧은 독립 트랜잭션으로 분석 진행·종료 이력을 남긴다. */
@Service
@Transactional(readOnly = true)
public class AnalysisJobStore {
  private final AnalysisJobRepository jobs;

  public AnalysisJobStore(AnalysisJobRepository jobs) {
    this.jobs = jobs;
  }

  /** 모델 호출 전에 진행 상태와 입력 버전을 확실히 저장한다. */
  @Transactional(propagation = Propagation.REQUIRES_NEW)
  public AnalysisJob start(
      Actor actor, UUID procedureId, long revision, ModelConnection model, List<String> objects) {
    return start(
        actor,
        procedureId,
        revision,
        new ModelConfigurationService.CurrentModel(1, "DOCUMENT_ANALYSIS", model),
        objects);
  }

  /** 모델 버전도 입력 버전과 함께 저장하여 설정 교체 중의 결과를 식별한다. */
  @Transactional(propagation = Propagation.REQUIRES_NEW)
  public AnalysisJob start(
      Actor actor,
      UUID requestId,
      long revision,
      ModelConfigurationService.CurrentModel selected,
      List<String> objects) {
    ModelConnection model = selected.connection();
    AnalysisJob job =
        new AnalysisJob(
            requestId,
            actor.institutionId(),
            actor.userId(),
            revision,
            model.provider(),
            model.model(),
            model.timeoutSeconds(),
            objects);
    job.identifyConfiguration(selected.revision(), selected.purpose());
    return jobs.saveAndFlush(job);
  }

  @Transactional(propagation = Propagation.REQUIRES_NEW)
  public AnalysisJob succeedText(UUID id, UUID institutionId, String text) {
    AnalysisJob job = jobs.lockByIdAndInstitutionId(id, institutionId).orElseThrow();
    job.succeedText(text);
    jobs.flush();
    return job;
  }

  /** 실행이 끝나면 검증한 제안만 저장한다. */
  @Transactional(propagation = Propagation.REQUIRES_NEW)
  public AnalysisJob succeed(UUID id, UUID institutionId, List<AnalysisSuggestion> suggestions) {
    AnalysisJob job = jobs.lockByIdAndInstitutionId(id, institutionId).orElseThrow();
    if ("RUNNING".equals(job.getStatus())) {
      job.succeed(suggestions);
      jobs.flush();
    }
    return job;
  }

  /** 오류 본문 대신 서비스가 정한 안전한 실패 설명을 저장한다. */
  @Transactional(propagation = Propagation.REQUIRES_NEW)
  public void fail(UUID id, UUID institutionId, String message) {
    AnalysisJob job = jobs.lockByIdAndInstitutionId(id, institutionId).orElseThrow();
    if ("RUNNING".equals(job.getStatus())) {
      job.fail(message);
      jobs.flush();
    }
  }
}
