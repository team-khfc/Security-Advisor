package kr.securityadvisor.request.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.PositiveOrZero;

/** 사용자가 확인한 자료 버전을 업무 명령에 결합한다. */
public record RevisionRequest(
    @JsonProperty(required = true) @PositiveOrZero long expectedRevision) {}
