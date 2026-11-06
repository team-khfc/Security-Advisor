package kr.securityadvisor.request.domain;

/** 접수는 서류 수신 기록이며 실제 장비 적용 상태가 아니다. */
public enum SecurityRequestStatus {
  DRAFT,
  COLLABORATING,
  FINAL_REVIEW,
  SUBMITTED,
  CONFIRMED,
  CLOSED,
  WITHDRAWN,
  /** 이전 자료의 접수 상태는 조회 호환용으로만 유지한다. */
  RECEIVED
}
