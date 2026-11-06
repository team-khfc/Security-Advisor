package kr.securityadvisor.auth.dto;

import java.time.Instant;

/** 실제 서버 세션의 만료 기준을 화면에 전달한다. */
public record SessionResponse(UserResponse user, String institutionName, Instant expiresAt) {}
