package kr.securityadvisor.llm.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record AiTextRequest(
    @com.fasterxml.jackson.annotation.JsonProperty(required = true) @Min(0) long expectedRevision,
    @NotBlank @Size(max = 1000) String question) {}
