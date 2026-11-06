package kr.securityadvisor.common;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.availability.ApplicationAvailability;
import org.springframework.boot.availability.ReadinessState;

class HealthControllerTest {
  @Test
  @DisplayName("초기 계정과 시연 자료 준비 전에는 503을 반환한다")
  void waitForAllStartupTasks() {
    var availability = mock(ApplicationAvailability.class);
    when(availability.getReadinessState()).thenReturn(ReadinessState.REFUSING_TRAFFIC);
    assertThat(new HealthController(availability).health().getStatusCode().value()).isEqualTo(503);
  }

  @Test
  @DisplayName("시작 작업 완료 후에만 준비 완료를 반환한다")
  void acceptAfterReady() {
    var availability = mock(ApplicationAvailability.class);
    when(availability.getReadinessState()).thenReturn(ReadinessState.ACCEPTING_TRAFFIC);
    assertThat(new HealthController(availability).health().getStatusCode().value()).isEqualTo(200);
  }
}
