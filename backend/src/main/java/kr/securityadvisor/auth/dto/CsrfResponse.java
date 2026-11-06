package kr.securityadvisor.auth.dto;

/** CSRF 토큰을 쿠키나 영구 저장소 대신 요청 수명 안에서 사용하게 한다. */
public record CsrfResponse(String token, String headerName) {}
