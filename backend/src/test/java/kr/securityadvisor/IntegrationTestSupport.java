package kr.securityadvisor;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.security.SecureRandom;
import java.util.Base64;
import java.util.Locale;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.postgresql.PostgreSQLContainer;
import tools.jackson.databind.ObjectMapper;

/** 기본 Testcontainers와 명시적 외부 검증 DB 경로를 구분한다. */
@SpringBootTest
@AutoConfigureMockMvc
public abstract class IntegrationTestSupport {
  private static final SecureRandom RANDOM = new SecureRandom();
  private static final String PASSWORD = "Aa9" + randomValue(24);
  private static final String CONTEXT_KEY = randomValue(32);
  private static final PostgreSQLContainer POSTGRES = database();
  private static final java.util.concurrent.atomic.AtomicInteger CLIENTS =
      new java.util.concurrent.atomic.AtomicInteger();
  protected final MockMvc mvc;
  protected final ObjectMapper mapper;

  /** 테스트 의존성도 생성 시점에 전달받아 이후 교체하지 않는다. */
  protected IntegrationTestSupport(MockMvc mvc, ObjectMapper mapper) {
    this.mvc = mvc;
    this.mapper = mapper;
  }

  private static PostgreSQLContainer database() {
    if (testEnvironment("JDBC_URL", "BOAN_TEST_JDBC_URL") != null) return null;
    PostgreSQLContainer container =
        new PostgreSQLContainer(
            org.testcontainers.utility.DockerImageName.parse("pgvector/pgvector:0.8.0-pg17")
                .asCompatibleSubstituteFor("postgres"));
    container.start();
    return container;
  }

  private static String testEnvironment(String key, String legacy) {
    String value = System.getenv("SECURITYADVISOR_TEST_" + key);
    return value == null ? System.getenv(legacy) : value;
  }

  private static String randomValue(int bytes) {
    byte[] value = new byte[bytes];
    RANDOM.nextBytes(value);
    return Base64.getEncoder().encodeToString(value);
  }

  /** 검사 전용 암호는 실행마다 생성하고 코드·로그에 남기지 않는다. */
  @DynamicPropertySource
  static void configure(DynamicPropertyRegistry properties) {
    String url =
        POSTGRES == null
            ? testEnvironment("JDBC_URL", "BOAN_TEST_JDBC_URL")
            : POSTGRES.getJdbcUrl();
    String user =
        POSTGRES == null ? testEnvironment("DB_USER", "BOAN_TEST_DB_USER") : POSTGRES.getUsername();
    String password =
        POSTGRES == null
            ? testEnvironment("DB_PASSWORD", "BOAN_TEST_DB_PASSWORD")
            : POSTGRES.getPassword();
    properties.add("spring.datasource.url", () -> url);
    properties.add("spring.datasource.username", () -> user);
    properties.add("spring.datasource.password", () -> password);
    properties.add("spring.flyway.user", () -> user);
    properties.add("spring.flyway.password", () -> password);
    properties.add("securityadvisor.context-key", () -> CONTEXT_KEY);
    properties.add(
        "securityadvisor.upload-directory",
        () ->
            System.getProperty("java.io.tmpdir")
                + "/securityadvisor-test-"
                + ProcessHandle.current().pid());
    properties.add("securityadvisor.demo.enabled", () -> true);
    properties.add("securityadvisor.demo.scenarios", () -> false);
    properties.add("server.servlet.session.cookie.secure", () -> false);
    for (String role : new String[] {"APPLICANT", "SECURITY", "INFRA", "ADMIN"}) {
      properties.add("SECURITYADVISOR_DEMO_" + role + "_PASSWORD", () -> PASSWORD);
    }
  }

  /** 테스트도 보안 필터를 거치는 실제 계정 인증으로 세션을 만든다. */
  protected MockHttpSession login(String username) throws Exception {
    var result =
        mvc.perform(
                post("/api/auth/login")
                    .with(csrf())
                    .with(
                        request -> {
                          request.setRemoteAddr("192.0.2." + (CLIENTS.incrementAndGet() % 250 + 1));
                          return request;
                        })
                    .param("username", username.toLowerCase(Locale.ROOT))
                    .param("password", PASSWORD))
            .andExpect(status().isOk())
            .andReturn();
    return (MockHttpSession) result.getRequest().getSession(false);
  }
}
