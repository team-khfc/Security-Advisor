package kr.securityadvisor.review.dto;

import java.time.Instant;
import java.util.UUID;
import kr.securityadvisor.common.security.Role;

/** 검토 컨텍스트가 승인한 한 분야의 불변 업무 결정이다. */
public record ReviewDecision(
    UUID requestId,
    Role role,
    String status,
    long revision,
    String comment,
    String actorName,
    Instant at) {}
