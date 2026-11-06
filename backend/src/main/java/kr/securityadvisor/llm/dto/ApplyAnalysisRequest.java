package kr.securityadvisor.llm.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.Min;

/** 후보 본문을 클라이언트에서 다시 받지 않고 저장된 분석 식별자만 적용한다. */
public record ApplyAnalysisRequest(@JsonProperty(required = true) @Min(0) long expectedRevision) {}
