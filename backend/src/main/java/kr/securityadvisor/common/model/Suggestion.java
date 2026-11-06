package kr.securityadvisor.common.model;

/** 분석 기능은 원문 근거가 있는 후보만 업무 기능에 전달한다. */
public record Suggestion(String key, String value, String evidence) {}
