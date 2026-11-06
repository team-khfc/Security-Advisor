package kr.securityadvisor.llm.controller;

import jakarta.validation.Valid;
import kr.securityadvisor.common.security.Actor;
import kr.securityadvisor.llm.dto.ModelsRequest;
import kr.securityadvisor.llm.dto.ModelsResponse;
import kr.securityadvisor.llm.service.ModelConfigurationService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/institution/models")
public class ModelConfigurationController {
  private final ModelConfigurationService service;

  public ModelConfigurationController(ModelConfigurationService service) {
    this.service = service;
  }

  @GetMapping
  public ModelsResponse get(@AuthenticationPrincipal Actor actor) {
    return service.get(actor);
  }

  @PutMapping
  public ModelsResponse update(
      @AuthenticationPrincipal Actor actor, @Valid @RequestBody ModelsRequest request) {
    return service.update(actor, request);
  }
}
