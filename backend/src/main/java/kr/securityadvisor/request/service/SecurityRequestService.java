package kr.securityadvisor.request.service;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import kr.securityadvisor.common.error.DomainException;
import kr.securityadvisor.common.model.DocumentData;
import kr.securityadvisor.common.model.PolicyProvider;
import kr.securityadvisor.common.model.PolicySnapshot;
import kr.securityadvisor.common.model.Suggestion;
import kr.securityadvisor.common.security.Actor;
import kr.securityadvisor.common.security.Role;
import kr.securityadvisor.document.dto.SubmissionDraft;
import kr.securityadvisor.document.dto.SubmissionVersion;
import kr.securityadvisor.document.service.DocumentService;
import kr.securityadvisor.request.domain.DocumentType;
import kr.securityadvisor.request.domain.NetworkPolicy;
import kr.securityadvisor.request.domain.SecurityRequest;
import kr.securityadvisor.request.domain.SecurityRequestData;
import kr.securityadvisor.request.domain.SecurityRequestStatus;
import kr.securityadvisor.request.domain.WorkflowRules;
import kr.securityadvisor.request.dto.AnswerPatchRequest;
import kr.securityadvisor.request.dto.CreateSecurityRequestRequest;
import kr.securityadvisor.request.dto.DocumentDownloadResponse;
import kr.securityadvisor.request.dto.NetworkRequest;
import kr.securityadvisor.request.dto.ReturnRequest;
import kr.securityadvisor.request.dto.ReviewRequest;
import kr.securityadvisor.request.dto.SecurityRequestResponse;
import kr.securityadvisor.request.dto.SupplementAnswerRequest;
import kr.securityadvisor.request.dto.SupplementQuestionRequest;
import kr.securityadvisor.request.dto.TerminalRequest;
import kr.securityadvisor.request.repository.SecurityRequestRepository;
import kr.securityadvisor.review.dto.ReviewDecision;
import kr.securityadvisor.review.dto.ReviewWork;
import kr.securityadvisor.review.service.ReviewService;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

/** 화면의 역할 값과 무관하게 기관·소유권·자료 버전·업무 전이를 최종 판단한다. */
@Service
@Transactional(readOnly = true)
public class SecurityRequestService {
  private static final Set<String> AI_KEYS =
      Set.of("purpose", "audience", "dataTypes", "externalTransfer", "period", "dataFlow");
  private final SecurityRequestRepository procedures;
  private final PolicyProvider policies;
  private final DocumentService documents;
  private final ReviewService reviews;
  private final ObjectMapper mapper;

  /** 공개 정책 조회 경계만 참조해 기관 기능과 순환 의존하지 않는다. */
  public SecurityRequestService(
      SecurityRequestRepository procedures,
      PolicyProvider policies,
      DocumentService documents,
      ReviewService reviews,
      ObjectMapper mapper) {
    this.procedures = procedures;
    this.policies = policies;
    this.documents = documents;
    this.reviews = reviews;
    this.mapper = mapper;
  }

  /**
   * 작성자는 본인 신청, 전문 담당자는 협의 이후 같은 기관 신청만 조회한다.
   *
   * @throws DomainException 기관 관리자에게 업무 조회 권한이 없는 경우
   */
  public List<SecurityRequestResponse> list(Actor actor) {
    requireBusinessActor(actor);
    List<SecurityRequest> found =
        actor.role() == Role.APPLICANT
            ? procedures.findByInstitutionIdAndOwnerIdOrderByUpdatedAtDesc(
                actor.institutionId(), actor.userId(), PageRequest.of(0, 100))
            : procedures.findByInstitutionIdOrderByUpdatedAtDesc(
                actor.institutionId(), PageRequest.of(0, 100));
    return found.stream()
        .filter(item -> canRead(item, actor))
        .map(item -> response(item, actor))
        .toList();
  }

  /**
   * 특정 신청과 연결된 분석·문서에도 같은 조회 경계를 적용한다.
   *
   * @throws DomainException 신청이 없거나 해당 신원으로 열람할 수 없는 경우
   */
  public SecurityRequestResponse get(Actor actor, UUID id) {
    return response(load(actor, id, false), actor);
  }

  /**
   * 게시된 기관 정책을 복사하여 새로운 설정이 진행 중인 신청을 바꾸지 않게 한다.
   *
   * @throws DomainException 신청자 역할이 아니거나 기본 입력이 잘못된 경우
   */
  @Transactional
  public SecurityRequestResponse create(Actor actor, CreateSecurityRequestRequest input) {
    requireRole(actor, Role.APPLICANT);
    String title = text(input.title(), 160, true);
    String department = text(input.department(), 100, true);
    String description = text(input.description(), 20000, false);
    DocumentType documentType;
    try {
      documentType = DocumentType.valueOf(input.documentType());
    } catch (IllegalArgumentException | NullPointerException exception) {
      throw new DomainException(422, "INVALID_DOCUMENT_TYPE", "방화벽 또는 보안성검토 서류를 선택해 주세요.");
    }
    PolicySnapshot snapshot = policies.current(actor.institutionId());
    SecurityRequestData initial =
        new SecurityRequestData(
            WorkflowRules.initialAnswers(documentType, snapshot.policy()),
            List.of(),
            List.of(
                new SecurityRequestData.Review(Role.INFRA, "PENDING", null, "", null, null),
                new SecurityRequestData.Review(Role.SECURITY, "PENDING", null, "", null, null)),
            List.of(),
            List.of(event(actor, "CREATED", "새 신청을 작성하기 시작했습니다.")));
    SecurityRequest procedure =
        new SecurityRequest(
            UUID.randomUUID(),
            actor.institutionId(),
            actor.userId(),
            actor.displayName(),
            title,
            documentType,
            department,
            description,
            snapshot.version(),
            snapshot.policy(),
            initial);
    return response(procedures.saveAndFlush(procedure), actor);
  }

  /**
   * 각 역할이 맡은 값만 변경하고 원출처와 사람 확인을 별도로 기록한다.
   *
   * @throws DomainException 역할 위반·오래된 버전·제출 후 편집·잘못된 확인 요청인 경우
   */
  @Transactional
  public SecurityRequestResponse updateAnswers(Actor actor, UUID id, AnswerPatchRequest input) {
    SecurityRequest procedure = editable(actor, id, input.expectedRevision());
    if (input.answers() == null || input.answers().isEmpty() || input.answers().size() > 100) {
      throw new DomainException(422, "INVALID_ANSWERS", "저장할 질문을 1~100개 선택해 주세요.");
    }
    Map<String, SecurityRequestData.Answer> existing = answerMap(procedure);
    Map<String, SecurityRequestData.Answer> replacements = new HashMap<>();
    for (AnswerPatchRequest.AnswerInput item : input.answers()) {
      if (item == null || replacements.containsKey(item.key())) {
        throw new DomainException(422, "DUPLICATE_ANSWER", "질문 식별자는 한 번만 보낼 수 있습니다.");
      }
      SecurityRequestData.Answer old = existing.get(item.key());
      if (old == null) {
        throw new DomainException(422, "UNKNOWN_QUESTION", "이 신청에 없는 질문은 저장할 수 없습니다.");
      }
      if (old.ownerRole() != actor.role()) {
        throw new DomainException(403, "FIELD_OWNER_REQUIRED", "해당 질문의 담당 역할만 값을 입력·확인할 수 있습니다.");
      }
      replacements.put(item.key(), updateAnswer(actor, old, item));
    }
    List<SecurityRequestData.Answer> answers =
        procedure.getData().answers().stream()
            .map(answer -> replacements.getOrDefault(answer.key(), answer))
            .toList();
    boolean reconfirmReturn =
        procedure.getWorkflow().returnItems().stream()
            .anyMatch(
                item -> item.status().equals("OPEN") && replacements.containsKey(item.fieldKey()));
    if (answers.equals(procedure.getData().answers()) && !reconfirmReturn)
      return response(procedure, actor);
    changeContent(
        procedure,
        actor,
        answers,
        procedure.getData().rules(),
        procedure.getData().supplements(),
        "ANSWERS_SAVED",
        "담당 질문 " + input.answers().size() + "개의 값과 확인 상태를 저장했습니다.",
        replacements.keySet());
    return save(procedure, actor);
  }

  /**
   * 저장된 AI 후보를 한 버전에서 일괄 적용하되 사람이 확인한 값은 덮어쓰지 않는다.
   *
   * @throws DomainException 신청자·버전·후보 필드·근거·미확정 조건이 맞지 않는 경우
   */
  @Transactional
  public SecurityRequestResponse propose(
      Actor actor, UUID id, long expectedRevision, List<Suggestion> suggestions) {
    requireRole(actor, Role.APPLICANT);
    SecurityRequest procedure = editable(actor, id, expectedRevision);
    if (procedure.getStage() != 1 && procedure.getStage() != 3) {
      throw new DomainException(409, "ANALYSIS_STAGE_REQUIRED", "작성·최종 검토 단계에서 AI 후보를 적용할 수 있습니다.");
    }
    if (suggestions == null || suggestions.isEmpty() || suggestions.size() > AI_KEYS.size()) {
      throw new DomainException(422, "INVALID_SUGGESTIONS", "적용할 분석 후보를 확인해 주세요.");
    }
    Map<String, SecurityRequestData.Answer> existing = answerMap(procedure);
    Map<String, SecurityRequestData.Answer> replacements = new HashMap<>();
    for (Suggestion suggestion : suggestions) {
      if (suggestion == null
          || !AI_KEYS.contains(suggestion.key())
          || replacements.containsKey(suggestion.key())) {
        throw new DomainException(
            422, "INVALID_SUGGESTION_FIELD", "AI는 허용된 현업 질문에만 후보를 제안할 수 있습니다.");
      }
      SecurityRequestData.Answer old = existing.get(suggestion.key());
      if (old == null || old.ownerRole() != Role.APPLICANT) {
        throw new DomainException(422, "INVALID_SUGGESTION_FIELD", "제안 대상 질문을 찾을 수 없습니다.");
      }
      if (old.status() == SecurityRequestData.AnswerStatus.CONFIRMED
          || old.status() == SecurityRequestData.AnswerStatus.NOT_APPLICABLE) {
        throw new DomainException(
            409,
            "CONFIRMED_VALUE_PROTECTED",
            "이미 사람이 확인한 값은 AI 후보로 덮어쓸 수 없습니다.",
            procedure.getRevision());
      }
      String value = text(suggestion.value(), 4000, true);
      validateExternalTransfer(old.key(), value);
      String evidence = text(suggestion.evidence(), 4000, true);
      replacements.put(
          old.key(),
          new SecurityRequestData.Answer(
              old.key(),
              old.label(),
              old.reason(),
              old.ownerRole(),
              old.requiredAt(),
              value,
              SecurityRequestData.AnswerStatus.PROPOSED,
              new SecurityRequestData.Source(
                  SecurityRequestData.SourceKind.AI_INFERRED, evidence, "AI 제안", Instant.now()),
              null));
    }
    List<SecurityRequestData.Answer> answers =
        procedure.getData().answers().stream()
            .map(answer -> replacements.getOrDefault(answer.key(), answer))
            .toList();
    changeContent(
        procedure,
        actor,
        answers,
        procedure.getData().rules(),
        procedure.getData().supplements(),
        "AI_PROPOSALS_APPLIED",
        "근거가 있는 후보를 미확정 답변으로 적용했습니다. 사람의 확인이 필요합니다.");
    return save(procedure, actor);
  }

  /**
   * 인프라 담당자가 검증한 주소·포트·기간으로 통신 규칙 전체를 갱신한다.
   *
   * @throws DomainException 인프라 역할·방화벽 서류·주소 범위·버전 조건이 맞지 않는 경우
   */
  @Transactional
  public SecurityRequestResponse updateNetwork(Actor actor, UUID id, NetworkRequest input) {
    requireRole(actor, Role.INFRA);
    SecurityRequest procedure = editable(actor, id, input.expectedRevision());
    if (procedure.getDocumentType() != DocumentType.FIREWALL) {
      throw new DomainException(422, "NETWORK_NOT_APPLICABLE", "방화벽 신청에서 통신 규칙을 입력할 수 있습니다.");
    }
    if (input.rules() == null || input.rules().size() > 50) {
      throw new DomainException(422, "INVALID_RULE_COUNT", "통신 규칙은 최대 50개까지 입력할 수 있습니다.");
    }
    Set<UUID> existingIds =
        new HashSet<>(
            procedure.getData().rules().stream().map(SecurityRequestData.NetworkRule::id).toList());
    Set<UUID> usedIds = new HashSet<>();
    Set<String> signatures = new HashSet<>();
    List<SecurityRequestData.NetworkRule> rules = new ArrayList<>();
    Instant now = Instant.now();
    for (NetworkRequest.RuleInput item : input.rules()) {
      if (item == null || (item.id() != null && !existingIds.contains(item.id()))) {
        throw new DomainException(422, "UNKNOWN_NETWORK_RULE", "이 신청의 통신 규칙 식별자를 확인해 주세요.");
      }
      UUID ruleId = item.id() == null ? UUID.randomUUID() : item.id();
      if (!usedIds.add(ruleId))
        throw new DomainException(422, "DUPLICATE_NETWORK_RULE", "같은 통신 행을 중복해서 저장할 수 없습니다.");
      SecurityRequestData.NetworkRule rule =
          new SecurityRequestData.NetworkRule(
              ruleId,
              text(item.sourceName(), 100, true),
              text(item.sourceIp(), 64, true),
              text(item.destinationName(), 100, true),
              text(item.destinationIp(), 64, true),
              text(item.port(), 20, false),
              text(item.protocol(), 10, true),
              text(item.direction(), 20, true),
              item.startsOn(),
              item.endsOn(),
              text(item.purpose(), 1000, true),
              new SecurityRequestData.Source(
                  SecurityRequestData.SourceKind.STAFF_INPUT,
                  "인프라 담당자가 입력한 통신 범위와 적용 기간",
                  actor.displayName(),
                  now),
              new SecurityRequestData.Confirmation(actor.displayName(), actor.role(), now));
      NetworkPolicy.validate(rule);
      String signature =
          rule.sourceIp()
              + "|"
              + rule.destinationIp()
              + "|"
              + rule.protocol()
              + "|"
              + rule.port()
              + "|"
              + rule.direction()
              + "|"
              + rule.startsOn()
              + "|"
              + rule.endsOn();
      if (!signatures.add(signature))
        throw new DomainException(422, "DUPLICATE_NETWORK_RULE", "동일한 통신 범위와 기간이 중복되었습니다.");
      rules.add(rule);
    }
    changeContent(
        procedure,
        actor,
        procedure.getData().answers(),
        rules,
        procedure.getData().supplements(),
        "NETWORK_CONFIRMED",
        "인프라 담당자가 통신 규칙 " + rules.size() + "개를 입력·확인했습니다.");
    return save(procedure, actor);
  }

  /**
   * 신청자가 기본 설명을 확인한 뒤에만 전문 담당자에게 공개한다.
   *
   * @throws DomainException 작성자·버전·필수 설명·현재 상태가 맞지 않는 경우
   */
  @Transactional
  public SecurityRequestResponse consult(Actor actor, UUID id, long expectedRevision) {
    requireRole(actor, Role.APPLICANT);
    SecurityRequest procedure = editable(actor, id, expectedRevision);
    if (procedure.getStatus() != SecurityRequestStatus.DRAFT) {
      throw new DomainException(
          409, "ALREADY_COLLABORATING", "이미 담당자 협의를 요청한 신청입니다.", procedure.getRevision());
    }
    rejectBlockers(WorkflowRules.consultationBlockers(procedure), "CONSULTATION_BLOCKED");
    SecurityRequestData old = procedure.getData();
    procedure.openConsultation(
        actor,
        new SecurityRequestData(
            old.answers(),
            old.rules(),
            old.reviews(),
            old.supplements(),
            appendEvent(
                old.timeline(), event(actor, "CONSULTATION_REQUESTED", "전문 담당자에게 협의를 요청했습니다."))));
    return save(procedure, actor);
  }

  /**
   * 해당 담당자의 현재 내용 버전 검토를 기록하고 순차 정책을 검사한다.
   *
   * @throws DomainException 전문 역할·보완 해결·선행 검토 조건이 맞지 않는 경우
   */
  @Transactional
  public SecurityRequestResponse review(Actor actor, UUID id, ReviewRequest input) {
    return decideReview(actor, id, input.expectedRevision(), input.comment(), false, true);
  }

  /** INFRA 할당 완료와 협의 완료를 분리하여 기록한다. */
  @Transactional
  public SecurityRequestResponse allocate(Actor actor, UUID id, ReviewRequest input) {
    requireRole(actor, Role.INFRA);
    SecurityRequest request = writable(actor, id, input.expectedRevision());
    request.allocate(
        actor,
        input.comment(),
        event(actor, "ALLOCATION_COMPLETED", "ICT인프라 자원 할당을 마쳤습니다. 분야 협의 완료는 별도입니다."));
    return save(request, actor);
  }

  /** SECURITY의 검토 시작도 INFRA 할당 완료 이후에만 허용한다. */
  @Transactional
  public SecurityRequestResponse startReview(Actor actor, UUID id, long expectedRevision) {
    return decideReview(actor, id, expectedRevision, "", false, false);
  }

  /** 제출된 해당 차수의 서류를 분야별로 최종 검토한다. */
  @Transactional
  public SecurityRequestResponse finalReview(Actor actor, UUID id, ReviewRequest input) {
    return decideReview(actor, id, input.expectedRevision(), input.comment(), true, true);
  }

  /** 검토 컨텍스트의 공개 API와 불변 DTO만 사용하고 엔티티를 넘기지 않는다. */
  private SecurityRequestResponse decideReview(
      Actor actor,
      UUID id,
      long expectedRevision,
      String comment,
      boolean finalPhase,
      boolean complete) {
    requireSpecialist(actor);
    SecurityRequest request = writable(actor, id, expectedRevision);
    ReviewDecision decision =
        reviews.decide(actor, reviewWork(request, finalPhase), comment, finalPhase, complete);
    request.acceptReview(
        actor,
        new SecurityRequestData.Review(
            decision.role(),
            decision.status(),
            decision.revision(),
            decision.comment(),
            decision.actorName(),
            decision.at()),
        finalPhase,
        event(
            actor,
            finalPhase
                ? "FINAL_REVIEW_COMPLETED"
                : complete ? "REVIEW_COMPLETED" : "REVIEW_STARTED",
            finalPhase
                ? "제출본의 담당 분야 최종 검토를 마쳤습니다. 장비 적용은 별도입니다."
                : complete ? "담당 분야 협의를 마쳤습니다. 실제 처리는 별도입니다." : "담당 분야 검토를 시작했습니다."));
    return save(request, actor);
  }

  /** 최종 두 분야 검토 후 문서 확정 사실만 기록한다. */
  @Transactional
  public SecurityRequestResponse confirm(Actor actor, UUID id, long expectedRevision) {
    requireSpecialist(actor);
    SecurityRequest request = writable(actor, id, expectedRevision);
    request.confirmDocument(
        actor,
        request.withEvent(
            event(
                actor, "DOCUMENT_CONFIRMED", "양 분야의 최종 검토 후 보안서류를 확정했습니다. 방화벽 실제 적용을 의미하지 않습니다.")));
    return save(request, actor);
  }

  /** 반환 사유와 지정 항목 및 영향 항목만 재검토 상태로 보존한다. */
  @Transactional
  public SecurityRequestResponse returnRequest(Actor actor, UUID id, ReturnRequest input) {
    SecurityRequest request = writable(actor, id, input.expectedRevision());
    request.returnTo(
        actor,
        input.targetStage(),
        input.reason(),
        input.fieldKeys(),
        event(
            actor,
            "RETURNED",
            request.getStage()
                + "단계에서 "
                + input.targetStage()
                + "단계로 반환했습니다. 사유: "
                + text(input.reason(), 2000, true)));
    return save(request, actor);
  }

  /** 담당자는 사유를 남겨 종결하고 신청자는 사유를 남겨 철회한다. */
  @Transactional
  public SecurityRequestResponse terminate(
      Actor actor, UUID id, TerminalRequest input, boolean withdraw) {
    SecurityRequest request = writable(actor, id, input.expectedRevision());
    request.terminate(
        actor,
        withdraw,
        input.reason(),
        event(
            actor,
            withdraw ? "WITHDRAWN" : "CLOSED",
            (withdraw ? "신청자가 철회했습니다. 사유: " : "담당자가 종결(반려)했습니다. 사유: ")
                + text(input.reason(), 2000, true)));
    return save(request, actor);
  }

  /** AI 최종 초안은 분석 당시 신청 버전과 일치할 때 미확정으로 등록한다. */
  @Transactional
  public SecurityRequestResponse registerFinalDraft(
      Actor actor,
      UUID id,
      long expectedRevision,
      UUID analysisId,
      String summary,
      String evidence) {
    SecurityRequest request = writable(actor, id, expectedRevision);
    request.registerFinalDraft(
        actor,
        analysisId,
        summary,
        evidence,
        event(actor, "FINAL_DRAFT_PROPOSED", "AI 최종 초안을 미확정으로 저장했습니다. 신청자 확인이 필요합니다."));
    return save(request, actor);
  }

  /** 현재 최종 초안을 직접 읽은 신청자의 확인을 별도로 보존한다. */
  @Transactional
  public SecurityRequestResponse confirmFinalDraft(
      Actor actor, UUID id, long expectedRevision, UUID analysisId) {
    SecurityRequest request = writable(actor, id, expectedRevision);
    request.confirmFinalDraft(
        actor, analysisId, event(actor, "FINAL_DRAFT_CONFIRMED", "신청자가 AI 최종 초안의 보완분을 확인했습니다."));
    return save(request, actor);
  }

  /**
   * 전문 담당자의 보완 질문은 새 검토가 필요한 업무 변경으로 기록한다.
   *
   * @throws DomainException 전문 역할·업무 상태·버전 조건이 맞지 않는 경우
   */
  @Transactional
  public SecurityRequestResponse requestSupplement(
      Actor actor, UUID id, SupplementQuestionRequest input) {
    requireSpecialist(actor);
    SecurityRequest procedure = editable(actor, id, input.expectedRevision());
    if (procedure.getData().supplements().size() >= 100) {
      throw new DomainException(422, "SUPPLEMENT_LIMIT", "한 신청에는 최대 100개의 보완 요청을 기록할 수 있습니다.");
    }
    List<SecurityRequestData.Supplement> supplements =
        new ArrayList<>(procedure.getData().supplements());
    supplements.add(
        new SecurityRequestData.Supplement(
            UUID.randomUUID(),
            text(input.question(), 2000, true),
            "",
            actor.role(),
            actor.displayName(),
            "OPEN",
            Instant.now(),
            null));
    changeContent(
        procedure,
        actor,
        procedure.getData().answers(),
        procedure.getData().rules(),
        supplements,
        "SUPPLEMENT_REQUESTED",
        "신청자에게 필요한 정보의 보완을 요청했습니다.");
    return save(procedure, actor);
  }

  /**
   * 신청자가 답변해도 담당자의 해결 확인 전까지 제출을 허용하지 않는다.
   *
   * @throws DomainException 작성자·버전·보완 상태가 맞지 않는 경우
   */
  @Transactional
  public SecurityRequestResponse answerSupplement(
      Actor actor, UUID id, UUID supplementId, SupplementAnswerRequest input) {
    requireRole(actor, Role.APPLICANT);
    SecurityRequest procedure = editable(actor, id, input.expectedRevision());
    SecurityRequestData.Supplement target = supplement(procedure, supplementId);
    if (target.status().equals("RESOLVED")) {
      throw new DomainException(
          409, "SUPPLEMENT_ALREADY_RESOLVED", "해결된 보완 요청의 답변을 바꿀 수 없습니다.", procedure.getRevision());
    }
    SecurityRequestData.Supplement changed =
        new SecurityRequestData.Supplement(
            target.id(),
            target.question(),
            text(input.answer(), 4000, true),
            target.requestedByRole(),
            target.requestedBy(),
            "ANSWERED",
            target.createdAt(),
            null);
    List<SecurityRequestData.Supplement> supplements = replaceSupplement(procedure, changed);
    changeContent(
        procedure,
        actor,
        procedure.getData().answers(),
        procedure.getData().rules(),
        supplements,
        "SUPPLEMENT_ANSWERED",
        "보완 답변을 저장했습니다. 요청 담당자의 해결 확인이 필요합니다.");
    return save(procedure, actor);
  }

  /**
   * 보완 요청을 만든 담당 분야가 답변을 재확인한 경우에만 해결 상태로 바꾼다.
   *
   * @throws DomainException 요청 역할이 아니거나 답변이 아직 없는 경우
   */
  @Transactional
  public SecurityRequestResponse resolveSupplement(
      Actor actor, UUID id, UUID supplementId, long expectedRevision) {
    requireSpecialist(actor);
    SecurityRequest procedure = editable(actor, id, expectedRevision);
    SecurityRequestData.Supplement target = supplement(procedure, supplementId);
    if (target.requestedByRole() != actor.role()) {
      throw new DomainException(403, "REQUESTING_ROLE_REQUIRED", "보완을 요청한 담당 분야가 해결 여부를 확인해야 합니다.");
    }
    if (!target.status().equals("ANSWERED")) {
      throw new DomainException(
          409,
          "SUPPLEMENT_ANSWER_REQUIRED",
          "신청자의 답변을 받은 뒤 해결 확인할 수 있습니다.",
          procedure.getRevision());
    }
    SecurityRequestData.Supplement changed =
        new SecurityRequestData.Supplement(
            target.id(),
            target.question(),
            target.answer(),
            target.requestedByRole(),
            target.requestedBy(),
            "RESOLVED",
            target.createdAt(),
            Instant.now());
    changeContent(
        procedure,
        actor,
        procedure.getData().answers(),
        procedure.getData().rules(),
        replaceSupplement(procedure, changed),
        "SUPPLEMENT_RESOLVED",
        "요청 담당자가 보완 답변을 읽고 해결 여부를 확인했습니다.");
    return save(procedure, actor);
  }

  /**
   * 모든 제출 조건을 통과한 한 버전의 자료와 문서를 멱등하게 보존한다.
   *
   * @throws DomainException 미확정·미해결 보완·검토 미완료·중복 키 충돌이 있는 경우
   */
  @Transactional
  public SecurityRequestResponse submit(
      Actor actor, UUID id, long expectedRevision, String idempotencyKey) {
    requireRole(actor, Role.APPLICANT);
    SecurityRequest request = load(actor, id, true);
    request.requireActive();
    if (documents.isRepeated(actor, id, expectedRevision, idempotencyKey))
      return response(request, actor);
    request.checkRevision(expectedRevision);
    request.submit(
        actor,
        request.withEvent(event(actor, "SUBMITTED", "신청자가 최종 내용을 확인하고 새 차수의 불변 제출본을 보존했습니다.")));
    documents.preserve(actor, expectedRevision, idempotencyKey, snapshot(request, Instant.now()));
    return save(request, actor);
  }

  /** 이전 접수 경로도 SECURITY의 최종 검토로 해석하고 단독 확정을 허용하지 않는다. */
  @Transactional
  public SecurityRequestResponse receive(Actor actor, UUID id, long expectedRevision) {
    requireRole(actor, Role.SECURITY);
    return finalReview(actor, id, new ReviewRequest(expectedRevision, "제출 서류의 정보보안 최종 검토를 마쳤습니다."));
  }

  /** 권한 범위 안에서 현재 초안 또는 최근 제출본을 다운로드한다. */
  public DocumentDownloadResponse download(Actor actor, UUID id) {
    return download(actor, id, null);
  }

  /** 차수 지정 시 반환·종결 이후에도 당시 제출본의 바이트를 그대로 제공한다. */
  public DocumentDownloadResponse download(Actor actor, UUID id, Integer version) {
    SecurityRequest request = load(actor, id, false);
    boolean terminal =
        request.getStatus() == SecurityRequestStatus.CLOSED
            || request.getStatus() == SecurityRequestStatus.WITHDRAWN;
    boolean submitted =
        version != null
            || request.getStage() == 4
            || (terminal && request.getWorkflow().submissionVersion() > 0);
    String content =
        submitted
            ? documents.download(actor, id, version)
            : documents.renderDraft(snapshot(request, null));
    return new DocumentDownloadResponse(
        "SecurityAdvisor-" + id + (version == null ? "" : "-v" + version) + ".html", content);
  }

  /** 이전 제출 차수의 목록도 신청 자체와 동일한 조회 권한을 적용한다. */
  public List<SubmissionVersion> submissionVersions(Actor actor, UUID id) {
    load(actor, id, false);
    return documents.versions(actor, id);
  }

  /**
   * 명시적으로 켠 시연 환경에서만 호출하며 동일 작성자에게 합성 시나리오를 한 번 구성한다.
   *
   * @throws DomainException 합성 역할의 기관이 다르거나 시연 자료가 업무 규칙을 위반하는 경우
   */
  @Transactional
  public void seedDemo(Actor applicant, Actor infra, Actor security) {
    requireRole(applicant, Role.APPLICANT);
    requireRole(infra, Role.INFRA);
    requireRole(security, Role.SECURITY);
    if (!applicant.institutionId().equals(infra.institutionId())
        || !applicant.institutionId().equals(security.institutionId())) {
      throw new DomainException(422, "DEMO_INSTITUTION_MISMATCH", "시연 계정은 같은 합성 기관에 속해야 합니다.");
    }
    if (procedures.existsByInstitutionIdAndOwnerId(applicant.institutionId(), applicant.userId()))
      return;
    List<String> titles =
        List.of(
            "주택연금 안내 챗봇",
            "공공시설 예약 안내",
            "온라인 상담 예약 서비스",
            "민원 서식 안내 도우미",
            "디지털 자료 열람 서비스",
            "교육 신청 안내 도우미",
            "시설 점검 현황 서비스",
            "정책 정보 검색 도우미",
            "공개 통계 안내 서비스",
            "업무 일정 안내 도우미",
            "기관 방문 예약 서비스",
            "시민 이용 안내 도우미");
    for (int index = 0; index < titles.size(); index++) {
      String title = titles.get(index);
      SecurityRequestResponse current =
          create(
              applicant,
              new CreateSecurityRequestRequest(
                  "[합성] " + title,
                  index % 2 == 0 ? "FIREWALL" : "SECURITY_REVIEW",
                  "가상 디지털사업팀",
                  "합성 시연 자료입니다. "
                      + title
                      + "의 사업 목적과 담당자 협의 절차를 연습합니다. 실제 기관 정보·개인정보·내부 자산은 사용하지 않습니다."));
      if (index == 0 || index == 10) continue;
      if (index == 1) {
        updateAnswers(
            applicant,
            current.id(),
            new AnswerPatchRequest(
                current.revision(),
                List.of(
                    new AnswerPatchRequest.AnswerInput(
                        "purpose", "합성 공개 안내 정보를 찾아보는 시연용 서비스입니다.", false, false))));
        continue;
      }
      current = fillDemoAnswers(applicant, current);
      current = consult(applicant, current.id(), current.revision());
      if (index == 2) continue;
      current = fillDemoAnswers(infra, get(infra, current.id()));
      if (current.documentType().equals("FIREWALL")) {
        current =
            updateNetwork(
                infra,
                current.id(),
                new NetworkRequest(
                    current.revision(),
                    List.of(
                        new NetworkRequest.RuleInput(
                            null,
                            "합성 안내 화면",
                            "192.0.2.10",
                            "합성 안내 API",
                            "198.51.100.20",
                            "443",
                            "TCP",
                            "ONE_WAY",
                            LocalDate.of(2026, 11, 10),
                            LocalDate.of(2026, 11, 30),
                            "공개 예제 주소 대역을 이용한 문서 작성 시연"))));
      }
      if (index == 3) continue;
      current =
          allocate(
              infra,
              current.id(),
              new ReviewRequest(current.revision(), "합성 시연의 운영 환경과 예제 주소 자원 할당을 확인했습니다."));
      current = fillDemoAnswers(security, get(security, current.id()));
      if (index == 4 || index == 5) {
        current =
            requestSupplement(
                security,
                current.id(),
                new SupplementQuestionRequest(
                    current.revision(), "공개 안내 자료만 사용하며 실제 이용자 식별정보를 수집하지 않는지 확인해 주세요."));
        if (index == 5) {
          answerSupplement(
              applicant,
              current.id(),
              current.supplements().getFirst().id(),
              new SupplementAnswerRequest(
                  current.revision(), "합성 시연은 공개 예제 자료만 사용하며 실제 이용자 정보는 수집하지 않습니다."));
        }
        continue;
      }
      current =
          review(
              security,
              current.id(),
              new ReviewRequest(
                  current.revision(), "합성 서류의 정보 확인과 보안 검토를 마쳤습니다. 실제 처리 완료를 의미하지 않습니다."));
      if (index == 9) continue;
      current =
          review(
              infra,
              current.id(),
              new ReviewRequest(
                  current.revision(), "합성 운영 환경과 통신 범위를 확인했습니다. 실제 장비 적용은 수행하지 않았습니다."));
      if (index == 6) continue;
      current = submit(applicant, current.id(), current.revision(), "demo-" + current.id());
      if (index == 8 || index == 11) {
        current =
            finalReview(
                infra,
                current.id(),
                new ReviewRequest(current.revision(), "합성 제출본의 통신·인프라 최종 검토입니다."));
        current =
            finalReview(
                security,
                current.id(),
                new ReviewRequest(current.revision(), "합성 제출본의 정보보안 최종 검토입니다."));
        confirm(security, current.id(), current.revision());
      }
    }
  }

  private SecurityRequestResponse fillDemoAnswers(Actor actor, SecurityRequestResponse procedure) {
    List<AnswerPatchRequest.AnswerInput> answers =
        procedure.answers().stream()
            .filter(answer -> answer.ownerRole().equals(actor.role().name()))
            .map(
                answer ->
                    new AnswerPatchRequest.AnswerInput(
                        answer.key(), demoAnswer(answer.key()), true, false))
            .toList();
    return updateAnswers(
        actor, procedure.id(), new AnswerPatchRequest(procedure.revision(), answers));
  }

  private static String demoAnswer(String key) {
    return switch (key) {
      case "purpose" -> "공개된 예제 안내 정보를 쉽게 찾아보는 합성 시연 서비스입니다.";
      case "audience" -> "가상의 일반 이용자와 시연 담당자";
      case "dataTypes" -> "공개 예제 안내문과 가상 질문만 사용합니다. 실제 개인정보는 수집하지 않습니다.";
      case "externalTransfer" -> "NO";
      case "period" -> "합성 시연 기간: 2026년 11월 10일~11월 30일";
      case "dataFlow" -> "가상 이용자 → 합성 안내 화면 → 합성 안내 API → 공개 예제 자료 → 안내 화면";
      case "operatingEnvironment" -> "실제 기관 시스템과 분리된 합성 시연 환경입니다. 공개 문서용 예제 주소만 사용합니다.";
      case "accessControl" -> "가상 역할에 따라 신청 작성·담당 검토·기관 설정 권한을 구분합니다.";
      case "retention" -> "시연용 합성 입력은 시연 종료 후 삭제하는 가상 계획입니다.";
      case "logging" -> "합성 신청의 작성·보완·검토 이력을 기록하며 실제 개인정보는 기록하지 않습니다.";
      default -> "담당자가 확인한 합성 시연 답변입니다. 실제 기관 정책 또는 자산 정보가 아닙니다.";
    };
  }

  private SecurityRequest load(Actor actor, UUID id, boolean lock) {
    requireBusinessActor(actor);
    SecurityRequest found =
        (lock
                ? procedures.lockByIdAndInstitutionId(id, actor.institutionId())
                : procedures.findByIdAndInstitutionId(id, actor.institutionId()))
            .orElseThrow(SecurityRequestService::notFound);
    found.checkActor(actor);
    return found;
  }

  private SecurityRequest editable(Actor actor, UUID id, long expectedRevision) {
    SecurityRequest procedure = load(actor, id, true);
    procedure.requireActive();
    procedure.checkRevision(expectedRevision);
    procedure.checkContentActor(actor);
    return procedure;
  }

  private SecurityRequestResponse save(SecurityRequest procedure, Actor actor) {
    return response(procedures.saveAndFlush(procedure), actor);
  }

  private SecurityRequest writable(Actor actor, UUID id, long expectedRevision) {
    SecurityRequest request = load(actor, id, true);
    request.requireActive();
    request.checkRevision(expectedRevision);
    return request;
  }

  private static boolean canRead(SecurityRequest request, Actor actor) {
    try {
      request.checkActor(actor);
      return true;
    } catch (DomainException exception) {
      return false;
    }
  }

  private SecurityRequestResponse response(SecurityRequest request, Actor actor) {
    List<String> actions = new ArrayList<>();
    boolean terminated =
        request.getStatus() == SecurityRequestStatus.CLOSED
            || request.getStatus() == SecurityRequestStatus.WITHDRAWN;
    if (!terminated) {
      int stage = request.getStage();
      boolean applicant = actor.role() == Role.APPLICANT;
      boolean allocated = request.getWorkflow().allocation().status().equals("COMPLETE");
      if (applicant) {
        actions.add("WITHDRAW");
        if (stage <= 3) actions.add("EDIT");
        if (stage == 1) {
          actions.add("ANALYZE");
          if (WorkflowRules.consultationBlockers(request).isEmpty()) actions.add("CONSULT");
        }
        if (stage == 3) {
          actions.add("FINAL_DRAFT_ANALYZE");
          actions.add("RETURN");
          if (WorkflowRules.submissionBlockers(request).isEmpty()) actions.add("SUBMIT");
        }
        if (stage <= 3
            && request.getData().supplements().stream()
                .anyMatch(item -> !item.status().equals("RESOLVED"))) actions.add("ANSWER");
      } else {
        actions.add("CLOSE");
        if (stage == 2 || stage == 4) actions.add("RETURN");
        if (stage == 2 && (actor.role() == Role.INFRA || allocated)) {
          actions.add("EDIT");
          actions.add("SUPPLEMENT");
          if (request.getData().reviews().stream()
              .noneMatch(
                  item ->
                      item.role() == actor.role()
                          && (item.status().equals("COMPLETE")
                              || item.status().equals("IN_PROGRESS")))) {
            actions.add("START_REVIEW");
          }
          if (actor.role() == Role.INFRA
              && WorkflowRules.allocationBlockers(request).isEmpty()
              && !allocated) actions.add("ALLOCATE");
          if (WorkflowRules.reviewBlockers(request, actor.role()).isEmpty()
              && !WorkflowRules.currentReview(request, actor.role())) actions.add("REVIEW");
          if (request.getData().supplements().stream()
              .anyMatch(
                  item ->
                      item.requestedByRole() == actor.role() && item.status().equals("ANSWERED")))
            actions.add("RESOLVE");
        }
        if (stage == 4
            && (request.getStatus() == SecurityRequestStatus.SUBMITTED
                || request.getStatus() == SecurityRequestStatus.RECEIVED)) {
          if (request.getWorkflow().finalReviews().stream()
              .noneMatch(item -> item.role() == actor.role() && item.status().equals("COMPLETE")))
            actions.add("FINAL_REVIEW");
          if (request.getWorkflow().finalReviews().stream()
              .allMatch(item -> item.status().equals("COMPLETE"))) actions.add("CONFIRM");
        }
      }
    }
    return SecurityRequestResponse.from(
        request, WorkflowRules.submissionBlockers(request), actions);
  }

  private static SecurityRequestData.Answer updateAnswer(
      Actor actor, SecurityRequestData.Answer old, AnswerPatchRequest.AnswerInput input) {
    String value = text(input.value(), 4000, false);
    if (input.notApplicable()
        && (!old.requiredAt().equals("OPTIONAL") || !input.confirmed() || value.isBlank())) {
      throw new DomainException(
          422, "NOT_APPLICABLE_REASON_REQUIRED", "선택 질문만 해당 없음으로 지정할 수 있으며 사유와 사람 확인이 필요합니다.");
    }
    if (value.isBlank()) {
      if (input.confirmed())
        throw new DomainException(422, "EMPTY_ANSWER", "내용이 없는 값은 확인할 수 없습니다.");
      return new SecurityRequestData.Answer(
          old.key(),
          old.label(),
          old.reason(),
          old.ownerRole(),
          old.requiredAt(),
          "",
          SecurityRequestData.AnswerStatus.EMPTY,
          null,
          null);
    }
    validateExternalTransfer(old.key(), value);
    boolean unknown = old.key().equals("externalTransfer") && value.equals("UNKNOWN");
    SecurityRequestData.AnswerStatus status =
        input.notApplicable()
            ? SecurityRequestData.AnswerStatus.NOT_APPLICABLE
            : input.confirmed() && !unknown
                ? SecurityRequestData.AnswerStatus.CONFIRMED
                : SecurityRequestData.AnswerStatus.PROPOSED;
    if (old.value().equals(value)
        && old.status() == status
        && old.source() != null
        && (status == SecurityRequestData.AnswerStatus.PROPOSED || old.confirmation() != null))
      return old;
    SecurityRequestData.Source source =
        old.value().equals(value) && old.source() != null
            ? old.source()
            : new SecurityRequestData.Source(
                actor.role() == Role.APPLICANT
                    ? SecurityRequestData.SourceKind.USER_ANSWER
                    : SecurityRequestData.SourceKind.STAFF_INPUT,
                actor.role() == Role.APPLICANT
                    ? "신청자가 직접 입력하거나 수정한 답변"
                    : "해당 분야 담당자가 직접 입력하거나 수정한 정보",
                actor.displayName(),
                Instant.now());
    SecurityRequestData.Confirmation confirmation =
        status == SecurityRequestData.AnswerStatus.PROPOSED
            ? null
            : new SecurityRequestData.Confirmation(
                actor.displayName(), actor.role(), Instant.now());
    return new SecurityRequestData.Answer(
        old.key(),
        old.label(),
        old.reason(),
        old.ownerRole(),
        old.requiredAt(),
        value,
        status,
        source,
        confirmation);
  }

  private static void changeContent(
      SecurityRequest request,
      Actor actor,
      List<SecurityRequestData.Answer> answers,
      List<SecurityRequestData.NetworkRule> rules,
      List<SecurityRequestData.Supplement> supplements,
      String action,
      String description) {
    changeContent(request, actor, answers, rules, supplements, action, description, Set.of());
  }

  private static void changeContent(
      SecurityRequest request,
      Actor actor,
      List<SecurityRequestData.Answer> answers,
      List<SecurityRequestData.NetworkRule> rules,
      List<SecurityRequestData.Supplement> supplements,
      String action,
      String description,
      Set<String> reconfirmFields) {
    Set<String> changed = new HashSet<>(reconfirmFields);
    Map<String, SecurityRequestData.Answer> old = answerMap(request);
    for (SecurityRequestData.Answer answer : answers) {
      if (!answer.equals(old.get(answer.key()))) changed.add(answer.key());
    }
    if (!request.getData().rules().equals(rules)) changed.add("network");
    for (SecurityRequestData.Supplement supplement : supplements) {
      if (!request.getData().supplements().contains(supplement))
        changed.add("supplement:" + supplement.id());
    }
    request.edit(
        actor,
        new SecurityRequestData(
            answers,
            rules,
            request.getData().reviews(),
            supplements,
            appendEvent(request.getData().timeline(), event(actor, action, description))),
        changed);
  }

  private static List<SecurityRequestData.Event> appendEvent(
      List<SecurityRequestData.Event> timeline, SecurityRequestData.Event event) {
    if (timeline.size() >= 1000)
      throw new DomainException(422, "HISTORY_LIMIT", "한 신청의 기록 한도에 도달했습니다. 담당자에게 문의해 주세요.");
    List<SecurityRequestData.Event> next = new ArrayList<>(timeline);
    next.add(event);
    return List.copyOf(next);
  }

  private static SecurityRequestData.Event event(Actor actor, String action, String description) {
    return new SecurityRequestData.Event(
        UUID.randomUUID(), action, description, actor.displayName(), Instant.now());
  }

  private static Map<String, SecurityRequestData.Answer> answerMap(SecurityRequest procedure) {
    Map<String, SecurityRequestData.Answer> answers = new HashMap<>();
    for (SecurityRequestData.Answer answer : procedure.getData().answers())
      answers.put(answer.key(), answer);
    return answers;
  }

  private static SecurityRequestData.Supplement supplement(SecurityRequest procedure, UUID id) {
    return procedure.getData().supplements().stream()
        .filter(item -> item.id().equals(id))
        .findFirst()
        .orElseThrow(() -> new DomainException(404, "SUPPLEMENT_NOT_FOUND", "보완 요청을 찾을 수 없습니다."));
  }

  private static List<SecurityRequestData.Supplement> replaceSupplement(
      SecurityRequest procedure, SecurityRequestData.Supplement changed) {
    return procedure.getData().supplements().stream()
        .map(item -> item.id().equals(changed.id()) ? changed : item)
        .toList();
  }

  private SubmissionDraft snapshot(SecurityRequest request, Instant submittedAt) {
    return new SubmissionDraft(
        request.getId(),
        request.getTitle(),
        request.getDocumentType().name(),
        request.getDepartment(),
        request.getDescription(),
        request.getOwnerName(),
        request.getRevision(),
        request.getPolicyVersion(),
        request.getPolicy(),
        mapper.convertValue(request.getData(), DocumentData.class),
        submittedAt,
        request.getWorkflow().submissionVersion(),
        request.getWorkflow().finalDraft() == null
            ? null
            : mapper.convertValue(
                request.getWorkflow().finalDraft(), DocumentData.FinalDraft.class));
  }

  private static ReviewWork reviewWork(SecurityRequest request, boolean finalPhase) {
    List<ReviewWork.Field> fields =
        request.getData().answers().stream()
            .map(
                answer ->
                    new ReviewWork.Field(
                        answer.key(),
                        answer.label(),
                        answer.ownerRole(),
                        !answer.requiredAt().equals("OPTIONAL") || !answer.value().isBlank(),
                        WorkflowRules.resolved(answer)))
            .toList();
    return new ReviewWork(
        request.getId(),
        request.getStage(),
        request.getWorkflow().allocation().status().equals("COMPLETE"),
        request.getRevision(),
        fields,
        request.getDocumentType() == DocumentType.FIREWALL,
        !request.getData().rules().isEmpty()
            && request.getData().rules().stream()
                .allMatch(rule -> rule.source() != null && rule.confirmation() != null),
        request.getData().supplements().stream()
            .anyMatch(item -> !item.status().equals("RESOLVED")),
        (finalPhase ? request.getWorkflow().finalReviews() : request.getData().reviews())
            .stream().map(item -> new ReviewWork.Mark(item.role(), item.status())).toList());
  }

  private static void requireBusinessActor(Actor actor) {
    if (actor == null) throw new DomainException(401, "AUTHENTICATION_REQUIRED", "로그인 후 이용해 주세요.");
    if (actor.role() == Role.ADMIN)
      throw new DomainException(403, "BUSINESS_ROLE_REQUIRED", "기관 관리자는 업무 신청을 조회하거나 검토할 수 없습니다.");
  }

  private static void requireRole(Actor actor, Role role) {
    if (actor == null || actor.role() != role)
      throw new DomainException(403, "ROLE_REQUIRED", "이 작업을 수행할 담당 역할이 아닙니다.");
  }

  private static void requireSpecialist(Actor actor) {
    if (actor == null || (actor.role() != Role.INFRA && actor.role() != Role.SECURITY)) {
      throw new DomainException(403, "SPECIALIST_REQUIRED", "전문 담당자만 이 작업을 수행할 수 있습니다.");
    }
  }

  private static void validateExternalTransfer(String key, String value) {
    if (key.equals("externalTransfer") && !Set.of("NO", "YES", "UNKNOWN").contains(value)) {
      throw new DomainException(
          422, "INVALID_EXTERNAL_TRANSFER", "외부 전송 여부를 예·아니요·잘 모름 중에서 선택해 주세요.");
    }
  }

  private static void rejectBlockers(List<String> blockers, String code) {
    if (!blockers.isEmpty()) throw new DomainException(422, code, String.join(" ", blockers));
  }

  private static String text(String value, int limit, boolean required) {
    if (value == null || value.length() > limit || (required && value.isBlank())) {
      throw new DomainException(422, "INVALID_INPUT", "입력의 필수 여부와 최대 길이를 확인해 주세요.");
    }
    return value.strip();
  }

  private static DomainException notFound() {
    return new DomainException(404, "PROCEDURE_NOT_FOUND", "열람할 수 있는 신청을 찾지 못했습니다.");
  }
}
