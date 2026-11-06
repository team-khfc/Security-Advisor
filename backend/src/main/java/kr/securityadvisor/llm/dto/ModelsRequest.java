package kr.securityadvisor.llm.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import java.util.List;
import kr.securityadvisor.llm.domain.ModelAssignment;

public record ModelsRequest(
    @Min(1) long expectedRevision, @NotNull List<ModelAssignment> connections) {}
