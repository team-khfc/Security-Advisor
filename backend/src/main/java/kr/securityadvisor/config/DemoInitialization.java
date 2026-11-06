package kr.securityadvisor.config;

import java.util.List;
import kr.securityadvisor.auth.service.AuthService;
import kr.securityadvisor.common.security.Actor;
import kr.securityadvisor.common.security.Role;
import kr.securityadvisor.request.service.SecurityRequestService;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

/** 시연 초기화는 실제 서비스 규칙을 거치며 운영 환경에서는 켜지 않는다. */
@Component
@ConditionalOnProperty(name = "securityadvisor.demo.enabled", havingValue = "true")
public class DemoInitialization implements ApplicationRunner {
  private final AuthService auth;
  private final SecurityRequestService procedures;
  private final Environment environment;

  public DemoInitialization(
      AuthService auth, SecurityRequestService procedures, Environment environment) {
    this.auth = auth;
    this.procedures = procedures;
    this.environment = environment;
  }

  /** 계정과 자료 초기화가 끝나야 ApplicationReady 상태가 된다. */
  @Override
  public void run(ApplicationArguments args) {
    List<Actor> actors = auth.initializeDemoAccounts();
    if (environment.getProperty("securityadvisor.demo.scenarios", Boolean.class, false)) {
      procedures.seedDemo(
          actor(actors, Role.APPLICANT), actor(actors, Role.INFRA), actor(actors, Role.SECURITY));
    }
  }

  private Actor actor(List<Actor> actors, Role role) {
    return actors.stream().filter(actor -> actor.role() == role).findFirst().orElseThrow();
  }
}
