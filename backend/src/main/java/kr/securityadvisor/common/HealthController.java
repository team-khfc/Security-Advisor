package kr.securityadvisor.common;

import org.springframework.boot.availability.ApplicationAvailability;
import org.springframework.boot.availability.ReadinessState;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** 합성 계정·데모 자료 초기화가 끝나기 전에 준비 완료를 보고하지 않는다. */
@RestController
public class HealthController {
  public record HealthResponse(String status) {}

  private final ApplicationAvailability availability;

  public HealthController(ApplicationAvailability availability) {
    this.availability = availability;
  }

  /** 초기화와 종료 동안 트래픽 유입을 대기시킨다. */
  @GetMapping("/api/health")
  public ResponseEntity<HealthResponse> health() {
    boolean ready = availability.getReadinessState() == ReadinessState.ACCEPTING_TRAFFIC;
    return ResponseEntity.status(ready ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE)
        .body(new HealthResponse(ready ? "UP" : "STARTING"));
  }
}
