package kr.securityadvisor.knowledge.controller;

import kr.securityadvisor.knowledge.dto.KnowledgeSearchResponse;
import kr.securityadvisor.knowledge.service.PublicKnowledgeRetriever;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/knowledge/search")
public class KnowledgeSearchController {
  private final PublicKnowledgeRetriever retriever;

  public KnowledgeSearchController(PublicKnowledgeRetriever retriever) {
    this.retriever = retriever;
  }

  @GetMapping
  public KnowledgeSearchResponse search(@RequestParam String q) {
    return retriever.search(q);
  }
}
