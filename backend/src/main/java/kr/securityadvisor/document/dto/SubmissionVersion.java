package kr.securityadvisor.document.dto;

import java.time.Instant;

/** 이전 차수도 조회 가능한 제출본 목록의 공개 메타데이터이다. */
public record SubmissionVersion(int version, long revision, Instant submittedAt) {}
