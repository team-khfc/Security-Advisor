package kr.securityadvisor.knowledge.controller;

import java.util.List;
import kr.securityadvisor.knowledge.dto.KnowledgeResponse;
import kr.securityadvisor.knowledge.service.KnowledgeService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 로그인한 이용자에게 공식 공개 자료의 출처 목록을 제공한다. */
@RestController
@RequestMapping("/api/knowledge")
public class KnowledgeController {
  private final KnowledgeService service;

  public KnowledgeController(KnowledgeService service) {
    this.service = service;
  }

  /** 참고용 목록과 실제 분석 근거를 혼동하지 않도록 자료 범위를 함께 응답한다. */
  @GetMapping
  public List<KnowledgeResponse> list() {
    return service.list();
  }
}
