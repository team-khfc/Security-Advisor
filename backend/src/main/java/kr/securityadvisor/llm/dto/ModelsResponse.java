package kr.securityadvisor.llm.dto;

import java.time.Instant;
import java.util.List;
import kr.securityadvisor.llm.domain.ModelAssignment;

/** mode는 외부 호출 설정 여부이며 실제 공급자 연결 성공을 의미하지 않는다. */
public record ModelsResponse(
    long revision, String mode, List<ModelAssignment> connections, List<Change> history) {
  public ModelsResponse {
    connections = List.copyOf(connections);
    history = List.copyOf(history);
  }

  public record Change(
      long revision, String author, Instant createdAt, List<ModelAssignment> connections) {}
}
