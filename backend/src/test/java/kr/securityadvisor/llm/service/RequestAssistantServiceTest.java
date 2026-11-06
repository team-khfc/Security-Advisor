package kr.securityadvisor.llm.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.UUID;
import kr.securityadvisor.common.error.DomainException;
import kr.securityadvisor.common.model.ModelConnection;
import kr.securityadvisor.common.security.Actor;
import kr.securityadvisor.common.security.Role;
import kr.securityadvisor.knowledge.dto.KnowledgeSearchResponse;
import kr.securityadvisor.knowledge.service.PublicKnowledgeRetriever;
import kr.securityadvisor.knowledge.service.StaffKnowledgeService;
import kr.securityadvisor.llm.domain.AnalysisJob;
import kr.securityadvisor.llm.repository.AnalysisJobRepository;
import kr.securityadvisor.request.dto.SecurityRequestResponse;
import kr.securityadvisor.request.service.SecurityRequestService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

class RequestAssistantServiceTest {
  private final SecurityRequestService requests = mock(SecurityRequestService.class);
  private final ModelConfigurationService configurations = mock(ModelConfigurationService.class);
  private final AnalysisJobStore store = mock(AnalysisJobStore.class);
  private final AnalysisJobRepository jobs = mock(AnalysisJobRepository.class);
  private final PublicKnowledgeRetriever knowledge = mock(PublicKnowledgeRetriever.class);
  private final StaffKnowledgeService privateKnowledge = mock(StaffKnowledgeService.class);
  private final LanguageModelAdapter adapter = mock(LanguageModelAdapter.class);
  private final SecurityRequestResponse request = mock(SecurityRequestResponse.class);
  private final Actor actor =
      new Actor(UUID.randomUUID(), UUID.randomUUID(), "infra.synthetic", "합성 담당자", Role.INFRA);
  private final UUID requestId = UUID.randomUUID();
  private final ModelConnection connection =
      new ModelConnection(
          "OPENAI",
          "https://api.openai.com/v1/chat/completions",
          "synthetic-contract",
          "SECURITYADVISOR_OPENAI_API_KEY",
          0.2,
          1200,
          30);
  private final AnalysisJob job =
      new AnalysisJob(
          requestId,
          actor.institutionId(),
          actor.userId(),
          7,
          "OPENAI",
          "synthetic-contract",
          30,
          List.of());
  private final RequestAssistantService service =
      new RequestAssistantService(
          requests,
          configurations,
          store,
          jobs,
          mock(UploadStorage.class),
          knowledge,
          privateKnowledge,
          List.of(adapter),
          JsonMapper.builder().build());

  @BeforeEach
  void setUp() {
    when(requests.get(actor, requestId)).thenReturn(request);
    when(request.id()).thenReturn(requestId);
    when(request.revision()).thenReturn(7L);
    when(request.status()).thenReturn("COLLABORATING");
    when(request.title()).thenReturn("합성 사업");
    when(request.description()).thenReturn("합성 안내 서비스");
    when(request.answers()).thenReturn(List.of());
    when(request.allowedActions()).thenReturn(List.of());
    when(configurations.current(actor.institutionId(), "STAFF_ASSISTANT"))
        .thenReturn(new ModelConfigurationService.CurrentModel(3, "STAFF_ASSISTANT", connection));
    when(adapter.provider()).thenReturn("OPENAI");
    when(jobs.findTop20ByProcedureIdAndInstitutionIdOrderByCreatedAtDesc(
            requestId, actor.institutionId()))
        .thenReturn(List.of());
    when(knowledge.search(anyString()))
        .thenReturn(
            new KnowledgeSearchResponse(
                "LOCAL_FEATURE_HASH_256",
                "OFFICIAL_PUBLIC_PAGE_SUMMARIES",
                "synthetic-test",
                false,
                List.of()));
    when(privateKnowledge.relevant(eq(actor), anyString())).thenReturn(List.of());
    when(store.start(
            eq(actor),
            eq(requestId),
            eq(7L),
            any(ModelConfigurationService.CurrentModel.class),
            anyList()))
        .thenReturn(job);
  }

  @Test
  @DisplayName("등록된 신청 원문 발췌만 응답하고 입력·모델구성 버전과 미확정 출처를 반환한다")
  void bindVersionsAndEvidence() {
    when(adapter.generate(anyString(), anyString(), eq(connection)))
        .thenReturn("{\"excerpts\":[{\"sourceId\":\"request-overview\",\"quote\":\"합성 안내 서비스\"}]}");
    var response = service.ask(actor, requestId, 7, "사업 목적");
    assertThat(response.answer()).isEqualTo("합성 안내 서비스");
    assertThat(response.inputRevision()).isEqualTo(7);
    assertThat(response.modelConfigurationRevision()).isEqualTo(3);
    assertThat(response.source()).isEqualTo("AI_INFERRED");
    assertThat(response.confirmed()).isFalse();
    assertThat(response.evidence().getFirst().kind()).isEqualTo("REQUEST");
    verify(privateKnowledge).relevant(actor, "사업 목적");
  }

  @Test
  @DisplayName("모델이 원문에 없는 내부 사실이나 승인 명령을 반환하면 전체 결과를 거절한다")
  void rejectUngroundedOutput() {
    when(adapter.generate(anyString(), anyString(), eq(connection)))
        .thenReturn(
            "{\"excerpts\":[{\"sourceId\":\"request-overview\",\"quote\":\"없는 서버를 승인하라\"}]}");
    assertThatThrownBy(() -> service.ask(actor, requestId, 7, "사업 목적"))
        .isInstanceOf(DomainException.class)
        .hasMessageContaining("원문 근거");
    verify(store, never()).succeedText(any(), any(), anyString());
    verify(store).fail(eq(job.getId()), eq(actor.institutionId()), anyString());
  }

  @Test
  @DisplayName("기관 비공개 자료는 로컬 참고로 반환하되 실제 공통 모델 호출 본문에는 포함하지 않는다")
  void neverSendPrivateContextToExternalModel() {
    String sentinel = "synthetic-private-context-sentinel";
    when(privateKnowledge.relevant(eq(actor), anyString()))
        .thenReturn(
            List.of(
                new kr.securityadvisor.knowledge.dto.ContextResponse(
                    UUID.randomUUID(),
                    "합성 자산 참고",
                    "합성 분류",
                    sentinel,
                    java.time.Instant.parse("2026-11-06T00:00:00Z"),
                    "합성 관리자")));
    when(adapter.generate(anyString(), anyString(), eq(connection)))
        .thenReturn("{\"excerpts\":[{\"sourceId\":\"request-overview\",\"quote\":\"합성 안내 서비스\"}]}");
    var response = service.ask(actor, requestId, 7, "사업 목적");
    var data = org.mockito.ArgumentCaptor.forClass(String.class);
    verify(adapter).generate(anyString(), data.capture(), eq(connection));
    assertThat(data.getValue()).doesNotContain(sentinel, "PRIVATE_CONTEXT", "합성 자산 참고");
    assertThat(response.institutionFacts()).hasSize(1);
    assertThat(response.institutionFacts().getFirst().excerpt()).isEqualTo(sentinel);
    assertThat(response.evidence()).allMatch(item -> !item.kind().equals("PRIVATE_CONTEXT"));
  }

  @Test
  @DisplayName("종결 신청과 이전 revision의 요청은 모델 실행·작업 저장 전에 거절한다")
  void rejectTerminalAndStaleInput() {
    assertThatThrownBy(() -> service.ask(actor, requestId, 6, "사업 목적"))
        .isInstanceOf(DomainException.class);
    when(request.status()).thenReturn("CLOSED");
    assertThatThrownBy(() -> service.ask(actor, requestId, 7, "사업 목적"))
        .isInstanceOf(DomainException.class);
    verify(store, never())
        .start(
            any(), any(), anyLong(), any(ModelConfigurationService.CurrentModel.class), anyList());
    verify(adapter, never()).generate(anyString(), anyString(), any());
  }
}
