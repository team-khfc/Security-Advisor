package kr.securityadvisor.common.model;

/** 비밀값 대신 키 참조를 저장하는 모델 연결 설정이다. */
public record ModelConnection(
    String provider,
    String endpoint,
    String model,
    String keyReference,
    double temperature,
    int maxTokens,
    int timeoutSeconds) {}
