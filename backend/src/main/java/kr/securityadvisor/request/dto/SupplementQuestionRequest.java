package kr.securityadvisor.request.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

/** 보완 사유와 질문을 남겨 신청자가 무엇을 확인해야 하는지 알 수 있게 한다. */
public record SupplementQuestionRequest(
    @JsonProperty(required = true) @PositiveOrZero long expectedRevision,
    @NotBlank @Size(max = 2000) String question) {}
