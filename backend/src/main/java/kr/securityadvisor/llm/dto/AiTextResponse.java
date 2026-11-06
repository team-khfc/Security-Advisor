package kr.securityadvisor.llm.dto;

import java.util.List;
import java.util.UUID;

/** 신청·구성 버전과 원문 근거를 연결한 미확정 발췌 응답이다. */
public record AiTextResponse(
    UUID id,
    UUID requestId,
    long inputRevision,
    long revision,
    long modelConfigurationRevision,
    String status,
    String mode,
    String provider,
    String model,
    String answer,
    String source,
    boolean confirmed,
    boolean stale,
    List<Evidence> evidence,
    List<Evidence> publicReferences,
    List<Evidence> institutionFacts) {
  public AiTextResponse {
    evidence = List.copyOf(evidence);
    publicReferences = List.copyOf(publicReferences);
    institutionFacts = List.copyOf(institutionFacts);
  }

  public record Evidence(
      String kind, String title, String version, String section, String url, String excerpt) {}
}
