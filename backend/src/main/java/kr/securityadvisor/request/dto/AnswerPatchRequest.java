package kr.securityadvisor.request.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import java.util.List;

/** 확인 여부는 명시적 입력이며 서버가 필드 책임과 출처를 다시 검증한다. */
public record AnswerPatchRequest(
    @JsonProperty(required = true) @PositiveOrZero long expectedRevision,
    @NotEmpty @Size(max = 100) List<@Valid AnswerInput> answers) {
  /** 출처나 담당자 신원을 클라이언트로부터 받지 않는다. */
  public record AnswerInput(
      @NotBlank @Size(max = 80) String key,
      @NotNull @Size(max = 4000) String value,
      boolean confirmed,
      boolean notApplicable) {}
}
