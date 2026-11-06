package kr.securityadvisor.configuration.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.Min;

/** 게시할 초안의 버전을 특정한다. */
public record PublishRequest(@JsonProperty(required = true) @Min(1) long expectedRevision) {}
