package kr.securityadvisor.llm.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import kr.securityadvisor.llm.domain.AnalysisJob;

/** 예시 실행과 실제 모델 실행, 이전 입력의 결과를 명시적으로 구분한다. */
public record AnalysisResponse(
    UUID id,
    UUID procedureId,
    long revision,
    long modelConfigurationRevision,
    String purpose,
    String status,
    String mode,
    String provider,
    String model,
    Instant createdAt,
    String error,
    List<AnalysisSuggestionResponse> suggestions,
    List<ReferenceResponse> references) {
  public AnalysisResponse {
    suggestions = List.copyOf(suggestions);
    references = List.copyOf(references);
  }

  /** 오래된 후보가 최신 입력을 분석한 것처럼 보이지 않게 응답 상태를 조정한다. */
  public static AnalysisResponse from(AnalysisJob job, long currentRevision) {
    String status = job.getStatus();
    String error = job.getError();
    if ("SUCCEEDED".equals(status)
        && (job.getInputRevision() != currentRevision || job.getAppliedAt() != null)) {
      status = "STALE";
      error =
          job.getAppliedAt() != null
              ? "이미 반영한 후보입니다. 각 답변의 내용과 근거를 확인해 주세요."
              : "이전 입력 버전의 분석입니다. 최신 내용으로 다시 분석해 주세요.";
    }
    return new AnalysisResponse(
        job.getId(),
        job.getSecurityRequestId(),
        job.getInputRevision(),
        job.getModelConfigurationRevision(),
        job.getPurpose(),
        status,
        "EXAMPLE".equals(job.getProvider()) ? "EXAMPLE" : "LIVE",
        job.getProvider(),
        job.getModel(),
        job.getCreatedAt(),
        error,
        job.getSuggestions().stream().map(AnalysisSuggestionResponse::from).toList(),
        List.of());
  }
}
