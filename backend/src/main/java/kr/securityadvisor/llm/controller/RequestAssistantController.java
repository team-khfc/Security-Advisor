package kr.securityadvisor.llm.controller;

import jakarta.validation.Valid;
import java.util.UUID;
import kr.securityadvisor.common.security.Actor;
import kr.securityadvisor.llm.dto.AiTextRequest;
import kr.securityadvisor.llm.dto.AiTextResponse;
import kr.securityadvisor.llm.dto.ApplyAnalysisRequest;
import kr.securityadvisor.llm.service.RequestAssistantService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/security-requests/{requestId}")
public class RequestAssistantController {
  private final RequestAssistantService service;

  public RequestAssistantController(RequestAssistantService service) {
    this.service = service;
  }

  @PostMapping("/assistant")
  public AiTextResponse ask(
      @AuthenticationPrincipal Actor actor,
      @PathVariable UUID requestId,
      @Valid @RequestBody AiTextRequest request) {
    return service.ask(actor, requestId, request.expectedRevision(), request.question());
  }

  @PostMapping("/final-draft")
  public AiTextResponse finalDraft(
      @AuthenticationPrincipal Actor actor,
      @PathVariable UUID requestId,
      @Valid @RequestBody ApplyAnalysisRequest request) {
    return service.finalDraft(actor, requestId, request.expectedRevision());
  }
}
