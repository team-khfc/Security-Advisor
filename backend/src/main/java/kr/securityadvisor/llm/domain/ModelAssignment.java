package kr.securityadvisor.llm.domain;

import kr.securityadvisor.common.model.ModelConnection;

/** 용도별 모델 연결이며 API 비밀은 환경변수 참조만 갖는다. */
public record ModelAssignment(String purpose, ModelConnection connection) {}
