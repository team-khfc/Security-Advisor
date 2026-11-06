package kr.securityadvisor.auth.service;

import java.time.Clock;
import java.util.HashMap;
import java.util.Map;
import org.springframework.stereotype.Service;

/** 단일 인스턴스 시연에서 계정과 접속원별 무제한 대입을 제한한다. */
@Service
public class LoginAttemptLimiter {
  private record Window(long started, int count) {}

  private final Map<String, Window> windows = new HashMap<>();
  private final Clock clock;

  public LoginAttemptLimiter() {
    this(Clock.systemUTC());
  }

  LoginAttemptLimiter(Clock clock) {
    this.clock = clock;
  }

  /** 한 분에 계정 10회, 접속원 50회까지만 인증 계산을 허용한다. */
  public synchronized boolean allow(String address, String username) {
    long now = clock.millis();
    windows.entrySet().removeIf(entry -> now - entry.getValue().started() >= 60_000);
    if (windows.size() >= 10_000) return false;
    return increment("address:" + address, 50, now)
        && increment("account:" + address + ":" + username, 10, now);
  }

  private boolean increment(String key, int limit, long now) {
    Window previous = windows.get(key);
    Window next =
        previous == null
            ? new Window(now, 1)
            : new Window(previous.started(), previous.count() + 1);
    windows.put(key, next);
    return next.count() <= limit;
  }
}
