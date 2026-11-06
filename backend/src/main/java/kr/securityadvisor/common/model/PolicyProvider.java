package kr.securityadvisor.common.model;

import java.util.UUID;

/** 업무 기능이 기관 저장소 구현을 직접 참조하지 않게 한다. */
public interface PolicyProvider {
  /** 새 신청에 적용할 해당 기관의 게시본을 반환한다. */
  PolicySnapshot current(UUID institutionId);
}
