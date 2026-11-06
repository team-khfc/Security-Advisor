package kr.securityadvisor.llm.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;
import kr.securityadvisor.common.model.Suggestion;

/** 외부 규약도 자유 형식 객체 대신 제한된 형식으로 직렬화한다. */
public final class ModelProtocol {
  private ModelProtocol() {}

  /** 사업 설명은 명령과 구분되는 하나의 데이터 속성으로 전송한다. */
  public record InputDocument(String document) {}

  /** 두 어댑터가 공통으로 요구하는 유일한 분석 결과 구조다. */
  public record Proposals(List<Suggestion> suggestions) {}

  /** OpenAI의 메시지 객체다. */
  @JsonIgnoreProperties(ignoreUnknown = true)
  public record OpenAiMessage(String role, String content) {}

  /** OpenAI JSON 응답 모드 설정이다. */
  public record OpenAiResponseFormat(String type) {}

  /** 응답 토큰 상한을 포함하는 Chat Completions 요청이다. */
  public record OpenAiRequest(
      String model,
      List<OpenAiMessage> messages,
      double temperature,
      @JsonProperty("max_completion_tokens") int maxCompletionTokens,
      @JsonProperty("response_format") OpenAiResponseFormat responseFormat,
      boolean store) {}

  /** 사용량 등 부가 정보는 업무 데이터에 반영하지 않는다. */
  @JsonIgnoreProperties(ignoreUnknown = true)
  public record OpenAiResponse(List<OpenAiChoice> choices) {}

  /** 중단·길이 초과 결과를 성공으로 취급하지 않도록 종료 사유를 읽는다. */
  @JsonIgnoreProperties(ignoreUnknown = true)
  public record OpenAiChoice(
      OpenAiMessage message, @JsonProperty("finish_reason") String finishReason) {}

  /** Gemma의 텍스트 부분이다. 내부 사고로 표시된 부분은 결과에서 제외한다. */
  @JsonIgnoreProperties(ignoreUnknown = true)
  @JsonInclude(JsonInclude.Include.NON_NULL)
  public record GemmaPart(String text, Boolean thought) {}

  /** Gemini API를 통해 제공되는 Gemma의 대화 내용이다. */
  @JsonIgnoreProperties(ignoreUnknown = true)
  public record GemmaContent(String role, List<GemmaPart> parts) {}

  /** Gemma의 생성 상한이다. */
  public record GemmaGenerationConfig(double temperature, int maxOutputTokens) {}

  /** Gemma API 요청이다. NIA 실증 모델 호출을 의미하지 않는다. */
  public record GemmaRequest(List<GemmaContent> contents, GemmaGenerationConfig generationConfig) {}

  /** 후보 배열 외의 응답 메타데이터는 보관하지 않는다. */
  @JsonIgnoreProperties(ignoreUnknown = true)
  public record GemmaResponse(List<GemmaCandidate> candidates) {}

  /** 정상 종료한 텍스트 응답만 후보 해석 대상으로 삼는다. */
  @JsonIgnoreProperties(ignoreUnknown = true)
  public record GemmaCandidate(GemmaContent content, String finishReason) {}
}
