package kr.securityadvisor.request.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

/** 보완 답변은 담당자의 해결 확인과 구분하여 저장한다. */
public record SupplementAnswerRequest(
    @JsonProperty(required = true) @PositiveOrZero long expectedRevision,
    @NotBlank @Size(max = 4000) String answer) {}
