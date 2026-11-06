package kr.securityadvisor.configuration.controller;

import jakarta.validation.Valid;
import java.util.List;
import kr.securityadvisor.common.security.Actor;
import kr.securityadvisor.configuration.dto.PublishRequest;
import kr.securityadvisor.configuration.dto.SettingsRequest;
import kr.securityadvisor.configuration.dto.SettingsResponse;
import kr.securityadvisor.configuration.service.InstitutionService;
import kr.securityadvisor.knowledge.dto.ContextRequest;
import kr.securityadvisor.knowledge.dto.ContextResponse;
import kr.securityadvisor.knowledge.service.PrivateContextService;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** 기관 설정과 담당자 참고 자료의 HTTP 계약을 제공한다. */
@RestController
@RequestMapping("/api/institution")
public class InstitutionController {
  private final InstitutionService institutions;
  private final PrivateContextService contexts;

  public InstitutionController(InstitutionService institutions, PrivateContextService contexts) {
    this.institutions = institutions;
    this.contexts = contexts;
  }

  /** 현재 초안과 게시 이력을 반환한다. */
  @GetMapping("/settings")
  public SettingsResponse getSettings(@AuthenticationPrincipal Actor actor) {
    return institutions.getSettings(actor);
  }

  /** 확인한 자료 버전의 초안 저장 요청을 전달한다. */
  @PutMapping("/settings")
  public SettingsResponse updateSettings(
      @AuthenticationPrincipal Actor actor, @RequestBody @Valid SettingsRequest request) {
    return institutions.updateSettings(actor, request);
  }

  /** 게시 명령에는 재시도 식별자를 반드시 받는다. */
  @PostMapping("/settings/publish")
  public SettingsResponse publishSettings(
      @AuthenticationPrincipal Actor actor,
      @RequestBody @Valid PublishRequest request,
      @RequestHeader("Idempotency-Key") String requestKey) {
    return institutions.publish(actor, request.expectedRevision(), requestKey);
  }

  /** 허용된 역할에 한해 현재 기관의 참고 자료를 반환한다. */
  @GetMapping("/contexts")
  public List<ContextResponse> getContexts(@AuthenticationPrincipal Actor actor) {
    return contexts.getContexts(actor);
  }

  /** 비공개 원문의 보관 요청을 전달한다. */
  @PostMapping("/contexts")
  @ResponseStatus(HttpStatus.CREATED)
  public ContextResponse createContext(
      @AuthenticationPrincipal Actor actor, @RequestBody @Valid ContextRequest request) {
    return contexts.createContext(actor, request);
  }
}
