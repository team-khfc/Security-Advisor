package kr.securityadvisor.request.dto;

/** 다운로드 파일 이름과 이스케이프된 본문만 컨트롤러에 전달한다. */
public record DocumentDownloadResponse(String filename, String content) {}
