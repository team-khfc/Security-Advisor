package kr.securityadvisor.configuration.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import kr.securityadvisor.common.model.OrganizationPolicy;

/** 오래된 초안을 덮어쓰지 않도록 화면이 읽은 버전을 함께 받는다. */
public record SettingsRequest(
    @JsonProperty(required = true) @Min(1) long expectedRevision,
    @NotNull @Valid OrganizationPolicy policy) {}
