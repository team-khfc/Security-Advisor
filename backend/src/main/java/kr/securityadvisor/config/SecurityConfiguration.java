package kr.securityadvisor.config;

import kr.securityadvisor.auth.service.AuthService;
import kr.securityadvisor.auth.service.LoginAttemptLimiter;
import kr.securityadvisor.auth.service.SessionService;
import kr.securityadvisor.common.error.ProblemWriter;
import kr.securityadvisor.common.security.Actor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.intercept.AuthorizationFilter;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import tools.jackson.databind.ObjectMapper;

/** 화면 역할 선택과 분리된 서버 세션 인증·CSRF 보호를 구성한다. */
@Configuration
public class SecurityConfiguration {
  /** 각 암호에 솔트를 생성하며 원문을 저장하지 않는다. */
  @Bean
  public PasswordEncoder passwordEncoder() {
    return new BCryptPasswordEncoder(12);
  }

  /** 허용된 공개 경로 외의 모든 업무 접근은 실제 인증을 요구한다. */
  @Bean
  public SecurityFilterChain securityFilterChain(
      HttpSecurity http,
      AuthService auth,
      SessionService sessions,
      LoginAttemptLimiter limiter,
      ProblemWriter problems,
      ObjectMapper mapper)
      throws Exception {
    http.authenticationProvider(new DatabaseAuthenticationProvider(auth))
        .csrf(Customizer.withDefaults())
        .authorizeHttpRequests(
            rules ->
                rules
                    .requestMatchers(
                        "/api/auth/csrf",
                        "/api/auth/login",
                        "/api/health",
                        "/error",
                        "/swagger-ui.html",
                        "/swagger-ui/**",
                        "/v3/api-docs/**")
                    .permitAll()
                    .requestMatchers("/api/**")
                    .authenticated()
                    .anyRequest()
                    .denyAll())
        .requestCache(cache -> cache.disable())
        .formLogin(
            form ->
                form.loginProcessingUrl("/api/auth/login")
                    .successHandler(
                        (request, response, authentication) -> {
                          response.setContentType("application/json");
                          response.setCharacterEncoding("UTF-8");
                          mapper.writeValue(
                              response.getOutputStream(),
                              sessions.describe(
                                  (Actor) authentication.getPrincipal(),
                                  request.getSession(false)));
                        })
                    .failureHandler(
                        (request, response, error) ->
                            problems.write(
                                request,
                                response,
                                401,
                                "INVALID_CREDENTIALS",
                                "아이디와 비밀번호를 확인해 주세요.")))
        .logout(
            logout ->
                logout
                    .logoutUrl("/api/auth/logout")
                    .invalidateHttpSession(true)
                    .deleteCookies("SECURITYADVISOR_SESSION", "BOAN_SESSION")
                    .logoutSuccessHandler(
                        (request, response, authentication) -> response.setStatus(204)))
        .exceptionHandling(
            errors ->
                errors
                    .authenticationEntryPoint(
                        (request, response, error) ->
                            problems.write(
                                request, response, 401, "LOGIN_REQUIRED", "로그인 후 이용해 주세요."))
                    .accessDeniedHandler(
                        (request, response, error) ->
                            problems.write(
                                request,
                                response,
                                403,
                                "ACCESS_DENIED",
                                "권한 또는 요청 검증 정보를 확인해 주세요.")))
        .headers(
            headers ->
                headers.contentSecurityPolicy(
                    csp ->
                        csp.policyDirectives(
                            "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'")))
        .addFilterBefore(
            new LoginLimitFilter(limiter, problems), UsernamePasswordAuthenticationFilter.class)
        .addFilterBefore(new CurrentAccountFilter(auth, problems), AuthorizationFilter.class);
    return http.build();
  }
}
