package kr.securityadvisor.llm.controller;

import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import kr.securityadvisor.common.security.Actor;
import kr.securityadvisor.llm.dto.AnalysisResponse;
import kr.securityadvisor.llm.dto.ApplyAnalysisRequest;
import kr.securityadvisor.llm.service.AnalysisService;
import kr.securityadvisor.request.dto.SecurityRequestResponse;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/** 명시적 업로드 분석과 저장된 결과 적용 요청을 서로 다른 API로 제공한다. */
@RestController
@RequestMapping("/api/security-requests/{procedureId}/analysis")
public class AnalysisController {
  private final AnalysisService service;

  public AnalysisController(AnalysisService service) {
    this.service = service;
  }

  /** 파일 선택만으로는 호출되지 않는 명시적 분석 실행이다. */
  @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  public AnalysisResponse analyze(
      @AuthenticationPrincipal Actor actor,
      @PathVariable UUID procedureId,
      @RequestParam long expectedRevision,
      @RequestParam(required = false) String text,
      @RequestParam(required = false) MultipartFile file) {
    return service.analyze(actor, procedureId, expectedRevision, text, file);
  }

  /** 현재 신원으로 열람할 수 있는 신청의 실제 실행 이력이다. */
  @GetMapping
  public List<AnalysisResponse> list(
      @AuthenticationPrincipal Actor actor, @PathVariable UUID procedureId) {
    return service.list(actor, procedureId);
  }

  /** 분석 결과에 저장되지 않은 클라이언트 값은 요청 형식에 포함하지 않는다. */
  @PostMapping("/{analysisId}/apply")
  public SecurityRequestResponse apply(
      @AuthenticationPrincipal Actor actor,
      @PathVariable UUID procedureId,
      @PathVariable UUID analysisId,
      @Valid @RequestBody ApplyAnalysisRequest request) {
    return service.apply(actor, procedureId, analysisId, request.expectedRevision());
  }
}
