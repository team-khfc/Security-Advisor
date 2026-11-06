package kr.securityadvisor.request.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/** 주소·포트·기간의 의미 검증은 네트워크 업무 규칙에서 수행한다. */
public record NetworkRequest(
    @JsonProperty(required = true) @PositiveOrZero long expectedRevision,
    @NotNull @Size(max = 50) List<@Valid RuleInput> rules) {
  /** 새 행의 식별자는 서버가 생성한다. */
  public record RuleInput(
      UUID id,
      @NotBlank @Size(max = 100) String sourceName,
      @NotBlank @Size(max = 64) String sourceIp,
      @NotBlank @Size(max = 100) String destinationName,
      @NotBlank @Size(max = 64) String destinationIp,
      @NotNull @Size(max = 20) String port,
      @NotBlank @Pattern(regexp = "TCP|UDP|ICMP") String protocol,
      @NotBlank @Pattern(regexp = "ONE_WAY|BIDIRECTIONAL") String direction,
      @NotNull LocalDate startsOn,
      @NotNull LocalDate endsOn,
      @NotBlank @Size(max = 1000) String purpose) {}
}
