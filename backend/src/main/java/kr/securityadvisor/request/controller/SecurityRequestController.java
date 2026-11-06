package kr.securityadvisor.request.controller;

import jakarta.validation.Valid;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;
import kr.securityadvisor.common.error.DomainException;
import kr.securityadvisor.common.security.Actor;
import kr.securityadvisor.document.dto.SubmissionVersion;
import kr.securityadvisor.request.dto.AnswerPatchRequest;
import kr.securityadvisor.request.dto.CreateSecurityRequestRequest;
import kr.securityadvisor.request.dto.DocumentDownloadResponse;
import kr.securityadvisor.request.dto.NetworkRequest;
import kr.securityadvisor.request.dto.ReturnRequest;
import kr.securityadvisor.request.dto.ReviewRequest;
import kr.securityadvisor.request.dto.RevisionRequest;
import kr.securityadvisor.request.dto.SecurityRequestResponse;
import kr.securityadvisor.request.dto.SupplementAnswerRequest;
import kr.securityadvisor.request.dto.SupplementQuestionRequest;
import kr.securityadvisor.request.dto.TerminalRequest;
import kr.securityadvisor.request.service.SecurityRequestService;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** 세션에서 확인한 신원과 검증한 DTO만 신청 업무 서비스에 전달한다. */
@RestController
@RequestMapping("/api/security-requests")
public class SecurityRequestController {
  private final SecurityRequestService service;

  /** 신청 업무 서비스만 생성자로 주입한다. */
  public SecurityRequestController(SecurityRequestService service) {
    this.service = service;
  }

  /**
   * 현재 역할이 열람할 수 있는 신청 목록을 반환한다.
   *
   * @throws DomainException 업무 조회 권한이 없는 경우
   */
  @GetMapping
  public List<SecurityRequestResponse> list(@AuthenticationPrincipal Actor actor) {
    return service.list(actor);
  }

  /**
   * 게시 정책의 복사본을 적용한 신청을 새로 만든다.
   *
   * @throws DomainException 신청 권한 또는 기본 입력이 올바르지 않은 경우
   */
  @PostMapping
  public ResponseEntity<SecurityRequestResponse> create(
      @AuthenticationPrincipal Actor actor,
      @Valid @RequestBody CreateSecurityRequestRequest input) {
    SecurityRequestResponse created = service.create(actor, input);
    return ResponseEntity.created(URI.create("/api/security-requests/" + created.id()))
        .body(created);
  }

  /**
   * 기관과 작성자 또는 담당자 공개 범위를 확인하고 신청을 반환한다.
   *
   * @throws DomainException 해당 신청을 열람할 수 없는 경우
   */
  @GetMapping("/{id}")
  public SecurityRequestResponse get(@AuthenticationPrincipal Actor actor, @PathVariable UUID id) {
    return service.get(actor, id);
  }

  /**
   * 본인 담당 질문의 값과 사람 확인 여부를 저장한다.
   *
   * @throws DomainException 담당 역할·버전·입력값 검사가 실패한 경우
   */
  @PatchMapping("/{id}/answers")
  public SecurityRequestResponse updateAnswers(
      @AuthenticationPrincipal Actor actor,
      @PathVariable UUID id,
      @Valid @RequestBody AnswerPatchRequest input) {
    return service.updateAnswers(actor, id, input);
  }

  /**
   * 인프라 담당자의 통신 규칙을 검증하여 저장한다.
   *
   * @throws DomainException 권한·버전·통신 범위가 올바르지 않은 경우
   */
  @PutMapping("/{id}/network")
  public SecurityRequestResponse updateNetwork(
      @AuthenticationPrincipal Actor actor,
      @PathVariable UUID id,
      @Valid @RequestBody NetworkRequest input) {
    return service.updateNetwork(actor, id, input);
  }

  /**
   * 신청자가 확인한 기본 설명을 전문 담당자에게 공개한다.
   *
   * @throws DomainException 협의의 선행 조건을 만족하지 않은 경우
   */
  @PostMapping("/{id}/consult")
  public SecurityRequestResponse consult(
      @AuthenticationPrincipal Actor actor,
      @PathVariable UUID id,
      @Valid @RequestBody RevisionRequest input) {
    return service.consult(actor, id, input.expectedRevision());
  }

  /**
   * 담당 분야의 현재 자료 버전에 대한 검토를 기록한다.
   *
   * @throws DomainException 필수 확인·보완·선행 검토 조건이 충족되지 않은 경우
   */
  @PostMapping("/{id}/review")
  public SecurityRequestResponse review(
      @AuthenticationPrincipal Actor actor,
      @PathVariable UUID id,
      @Valid @RequestBody ReviewRequest input) {
    return service.review(actor, id, input);
  }

  /** INFRA 자원 할당 완료를 분야 협의와 독립적으로 기록한다. */
  @PostMapping("/{id}/allocation")
  public SecurityRequestResponse allocation(
      @AuthenticationPrincipal Actor actor,
      @PathVariable UUID id,
      @Valid @RequestBody ReviewRequest input) {
    return service.allocate(actor, id, input);
  }

  /** 선행 자원 할당과 서버 역할을 확인하고 검토를 시작한다. */
  @PostMapping("/{id}/review/start")
  public SecurityRequestResponse startReview(
      @AuthenticationPrincipal Actor actor,
      @PathVariable UUID id,
      @Valid @RequestBody RevisionRequest input) {
    return service.startReview(actor, id, input.expectedRevision());
  }

  /** 제출된 현재 차수의 서류를 담당 분야에서 최종 검토한다. */
  @PostMapping("/{id}/final-review")
  public SecurityRequestResponse finalReview(
      @AuthenticationPrincipal Actor actor,
      @PathVariable UUID id,
      @Valid @RequestBody ReviewRequest input) {
    return service.finalReview(actor, id, input);
  }

  /** 양 분야의 최종 검토 후 문서를 확정하며 실제 장비 적용으로 취급하지 않는다. */
  @PostMapping("/{id}/confirm")
  public SecurityRequestResponse confirm(
      @AuthenticationPrincipal Actor actor,
      @PathVariable UUID id,
      @Valid @RequestBody RevisionRequest input) {
    return service.confirm(actor, id, input.expectedRevision());
  }

  /** 사유 및 지정 항목과 함께 차수를 반환하고 이전 값을 유지한다. */
  @PostMapping("/{id}/return")
  public SecurityRequestResponse returnRequest(
      @AuthenticationPrincipal Actor actor,
      @PathVariable UUID id,
      @Valid @RequestBody ReturnRequest input) {
    return service.returnRequest(actor, id, input);
  }

  /** 전문 담당자가 사유를 남겨 신청을 종결한다. */
  @PostMapping("/{id}/close")
  public SecurityRequestResponse close(
      @AuthenticationPrincipal Actor actor,
      @PathVariable UUID id,
      @Valid @RequestBody TerminalRequest input) {
    return service.terminate(actor, id, input, false);
  }

  /** 작성자가 사유를 남겨 본인 신청을 철회한다. */
  @PostMapping("/{id}/withdraw")
  public SecurityRequestResponse withdraw(
      @AuthenticationPrincipal Actor actor,
      @PathVariable UUID id,
      @Valid @RequestBody TerminalRequest input) {
    return service.terminate(actor, id, input, true);
  }

  /** 현재 AI 최종 초안의 보완분을 신청자가 확인한다. */
  @PostMapping("/{id}/final-draft/{analysisId}/confirm")
  public SecurityRequestResponse confirmFinalDraft(
      @AuthenticationPrincipal Actor actor,
      @PathVariable UUID id,
      @PathVariable UUID analysisId,
      @Valid @RequestBody RevisionRequest input) {
    return service.confirmFinalDraft(actor, id, input.expectedRevision(), analysisId);
  }

  /** 모든 제출 차수의 불변 메타데이터를 신청 조회 범위에서 반환한다. */
  @GetMapping("/{id}/submissions")
  public List<SubmissionVersion> submissions(
      @AuthenticationPrincipal Actor actor, @PathVariable UUID id) {
    return service.submissionVersions(actor, id);
  }

  /**
   * 전문 담당자가 보완 질문을 등록한다.
   *
   * @throws DomainException 역할·상태·버전 조건이 맞지 않는 경우
   */
  @PostMapping("/{id}/supplements")
  public SecurityRequestResponse supplement(
      @AuthenticationPrincipal Actor actor,
      @PathVariable UUID id,
      @Valid @RequestBody SupplementQuestionRequest input) {
    return service.requestSupplement(actor, id, input);
  }

  /**
   * 작성자가 보완 질문에 답하고 담당자 재확인을 기다린다.
   *
   * @throws DomainException 작성자·보완 상태·버전 조건이 맞지 않는 경우
   */
  @PostMapping("/{id}/supplements/{supplementId}/answer")
  public SecurityRequestResponse answerSupplement(
      @AuthenticationPrincipal Actor actor,
      @PathVariable UUID id,
      @PathVariable UUID supplementId,
      @Valid @RequestBody SupplementAnswerRequest input) {
    return service.answerSupplement(actor, id, supplementId, input);
  }

  /**
   * 요청 담당 분야가 보완 답변의 해결 여부를 확정한다.
   *
   * @throws DomainException 요청 담당 분야·답변 상태·버전이 맞지 않는 경우
   */
  @PostMapping("/{id}/supplements/{supplementId}/resolve")
  public SecurityRequestResponse resolveSupplement(
      @AuthenticationPrincipal Actor actor,
      @PathVariable UUID id,
      @PathVariable UUID supplementId,
      @Valid @RequestBody RevisionRequest input) {
    return service.resolveSupplement(actor, id, supplementId, input.expectedRevision());
  }

  /**
   * 현재 자료 버전의 최종 제출본을 멱등하게 보존한다.
   *
   * @throws DomainException 제출 조건·버전·멱등 요청 식별자 검사가 실패한 경우
   */
  @PostMapping("/{id}/submit")
  public SecurityRequestResponse submit(
      @AuthenticationPrincipal Actor actor,
      @PathVariable UUID id,
      @RequestHeader("Idempotency-Key") String idempotencyKey,
      @Valid @RequestBody RevisionRequest input) {
    return service.submit(actor, id, input.expectedRevision(), idempotencyKey);
  }

  /**
   * 정보보안 담당자가 제출본의 문서 접수 사실을 기록한다.
   *
   * @throws DomainException 접수 역할·제출 상태·버전이 맞지 않는 경우
   */
  @PostMapping("/{id}/receive")
  public SecurityRequestResponse receive(
      @AuthenticationPrincipal Actor actor,
      @PathVariable UUID id,
      @Valid @RequestBody RevisionRequest input) {
    return service.receive(actor, id, input.expectedRevision());
  }

  /**
   * 모든 자유 입력을 이스케이프한 초안 또는 보존된 제출본을 첨부 파일로 제공한다.
   *
   * @throws DomainException 해당 신청의 문서를 열람할 수 없는 경우
   */
  @GetMapping("/{id}/document")
  public ResponseEntity<byte[]> document(
      @AuthenticationPrincipal Actor actor,
      @PathVariable UUID id,
      @RequestParam(required = false) Integer version) {
    DocumentDownloadResponse document = service.download(actor, id, version);
    return ResponseEntity.ok()
        .contentType(new MediaType("text", "html", StandardCharsets.UTF_8))
        .header(
            HttpHeaders.CONTENT_DISPOSITION,
            ContentDisposition.attachment().filename(document.filename()).build().toString())
        .header(HttpHeaders.CACHE_CONTROL, "no-store")
        .body(document.content().getBytes(StandardCharsets.UTF_8));
  }
}
