package kr.securityadvisor.knowledge.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** 참고 자료는 과도한 크기와 빈 본문을 저장하기 전에 거절한다. */
public record ContextRequest(
    @NotBlank @Size(max = 100) String title,
    @NotBlank @Size(max = 40) String category,
    @NotBlank @Size(max = 10000) String content) {}
