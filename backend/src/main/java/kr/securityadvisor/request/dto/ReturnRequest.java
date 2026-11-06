package kr.securityadvisor.request.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import java.util.List;

/** 반환은 목적 차수와 보완할 항목 및 사유를 함께 받는다. */
public record ReturnRequest(
    @JsonProperty(required = true) @PositiveOrZero long expectedRevision,
    @Min(1) @Max(3) int targetStage,
    @NotBlank @Size(max = 2000) String reason,
    @NotEmpty @Size(max = 100) List<@NotBlank @Size(max = 100) String> fieldKeys) {}
