package kr.securityadvisor.document.dto;

import java.time.Instant;
import java.util.UUID;
import kr.securityadvisor.common.model.DocumentData;
import kr.securityadvisor.common.model.OrganizationPolicy;

/** 요청 컨텍스트가 공개 서비스에 전달하는 제출 시점의 불변 문서 자료이다. */
public record SubmissionDraft(
    UUID requestId,
    String title,
    String documentType,
    String department,
    String description,
    String ownerName,
    long revision,
    long policyVersion,
    OrganizationPolicy policy,
    DocumentData data,
    Instant submittedAt,
    int submissionVersion,
    DocumentData.FinalDraft finalDraft) {}
