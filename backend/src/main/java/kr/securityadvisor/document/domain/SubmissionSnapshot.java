package kr.securityadvisor.document.domain;

import java.time.Instant;
import java.util.UUID;
import kr.securityadvisor.common.model.DocumentData;
import kr.securityadvisor.common.model.OrganizationPolicy;

/** 제출 당시 자료와 정책을 보존하여 현재 신청 이력의 변경과 분리한다. */
public record SubmissionSnapshot(
    UUID procedureId,
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
