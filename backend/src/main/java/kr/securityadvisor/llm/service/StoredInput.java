package kr.securityadvisor.llm.service;

import java.util.List;

/** 원문의 저장 식별자는 내부에서만 사용하고 외부 응답에 경로를 노출하지 않는다. */
public record StoredInput(String text, List<String> objectNames) {
  public StoredInput {
    objectNames = List.copyOf(objectNames);
  }
}
