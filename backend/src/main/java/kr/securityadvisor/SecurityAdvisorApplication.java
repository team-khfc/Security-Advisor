package kr.securityadvisor;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/** 업무 데이터와 시안 화면을 실제 API로 연결하는 애플리케이션이다. */
@SpringBootApplication
public class SecurityAdvisorApplication {
  /** 시작 초기화가 끝난 뒤에만 준비 상태를 공개한다. */
  public static void main(String[] args) {
    SpringApplication.run(SecurityAdvisorApplication.class, args);
  }
}
