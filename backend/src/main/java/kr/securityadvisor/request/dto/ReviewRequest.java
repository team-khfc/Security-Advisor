package kr.securityadvisor.request.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

/** 검토자는 세션으로 결정하고 의견과 확인한 버전만 받는다. */
public record ReviewRequest(
    @JsonProperty(required = true) @PositiveOrZero long expectedRevision,
    @NotNull @Size(max = 2000) String comment) {}
