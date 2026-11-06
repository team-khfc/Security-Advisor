package kr.securityadvisor.request.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

/** 종결·철회 사유와 신청자가 확인한 버전을 받는다. */
public record TerminalRequest(
    @JsonProperty(required = true) @PositiveOrZero long expectedRevision,
    @NotBlank @Size(max = 2000) String reason) {}
