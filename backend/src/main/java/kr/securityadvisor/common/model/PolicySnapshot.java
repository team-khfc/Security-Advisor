package kr.securityadvisor.common.model;

/** 진행 중 신청이 이후 게시 변경의 영향을 받지 않게 버전을 묶는다. */
public record PolicySnapshot(long version, OrganizationPolicy policy) {}
