package kr.securityadvisor.request.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** 신청의 기본 설명만 받고 작성자·기관·업무 상태는 서버에서 결정한다. */
public record CreateSecurityRequestRequest(
    @NotBlank @Size(max = 160) String title,
    @NotBlank @Pattern(regexp = "FIREWALL|SECURITY_REVIEW") String documentType,
    @NotBlank @Size(max = 100) String department,
    @NotNull @Size(max = 20000) String description) {}
