# ADR 0002 · Spring AI 경계와 모델 연결

- 상태: 팀 확정 AI 계층 반영, 외부 실모델 검증은 미완료
- 기록일: 2026-11-06
- 근거: [AGENTS v1.5의 AI 규칙](../../AGENTS.md), [PROJECT_CONTEXT의 확정 결정](../../claude/PROJECT_CONTEXT.md), [FUNCTIONAL_SPEC의 F-03·F-06·F-09·F-10](../../claude/FUNCTIONAL_SPEC.md), llm·knowledge 구현

Spring AI 채택·공통 어댑터·공급자 교체·공개 지식과 기관 사실 분리는 기존 확정 사항입니다. 이 ADR은 그 구현 범위와 아직 입증하지 못한 부분을 기록합니다. 지침 출처와 기준 커밋은 [source-manifest.json](../source-manifest.json)을 따릅니다.

## 결정

Spring AI **2.0.2**의 `ChatClient`·`ChatModel`을 공통 `LanguageModelAdapter` 뒤에서 사용합니다. `OpenAiAdapter`와 `OpenAiCompatibleAdapter`는 `SpringAiModelClient`로 연결하고 업무 도메인에 SDK 타입을 노출하지 않습니다. `ExampleAdapter`는 명시적인 합성 실행 경로입니다.

[build.gradle.kts](../../backend/build.gradle.kts)는 `spring-ai-openai`, `spring-ai-client-chat`, `spring-ai-pgvector-store`를 모두 2.0.2로 고정합니다. [SpringAiModelClient](../../backend/src/main/java/kr/securityadvisor/llm/service/SpringAiModelClient.java)는 `ChatModel` 구현체인 `OpenAiChatModel`을 만들고 `ChatClient`로 호출합니다. 정확한 구성별 클라이언트를 최대 32개 캐시하며, OpenAI SDK의 최하위 HTTP는 프로젝트의 제한된 전송 계층을 사용합니다. JSON 응답 형식·토큰 상한·완료 사유를 확인하고 자동 재시도와 공급자 저장 옵션은 끕니다. 공통 계약은 [LanguageModelAdapter](../../backend/src/main/java/kr/securityadvisor/llm/service/LanguageModelAdapter.java)입니다.

`OPENAI_COMPATIBLE`은 OpenAI Chat Completions 호환 경로입니다. 공급자 이름만으로 EXAONE·HyperCLOVA X·Gemma의 모든 배포 API와 호환된다고 보장하지 않습니다. `EXAMPLE` 문서 분석은 이름 붙은 원문 행을 발췌하며, 담당자 질의·최종 초안 예시는 신청 원문을 발췌합니다. 외부 생성 모델 호출이나 자유문장의 의미 이해로 집계하지 않습니다.

`DOCUMENT_ANALYSIS`, `STAFF_ASSISTANT`, `FINAL_DRAFT`의 공급자·모델·정확한 endpoint·키 참조·온도·토큰·시간 제한은 기관별 DB 설정과 변경 이력으로 관리합니다. 실제 키는 환경변수에서만 읽습니다. 구성 revision과 신청 revision을 작업에 기록해 오래된 결과가 현재 자료를 덮어쓰지 않도록 합니다.

서버 운영자의 정확한 HTTPS URL 허용 목록과 공개 주소 검증, 시간·응답 크기 상한을 적용합니다. 관리자 입력 자체를 신뢰하지 않습니다. 외부 오류 본문과 키를 로그·응답에 노출하지 않으며 외부 실패를 EXAMPLE 성공으로 자동 대체하지 않습니다. AI 제안은 구조와 후보 필드를 검증한 뒤 미확정으로 반영합니다.

## 지식·기관 사실 분리

공개 검색은 Spring AI `VectorStore`의 `PgVectorStore` 구현을 사용합니다. 초기 범위는 **KISA 개발 보안 안내와 NIST 방화벽 가이드 공개 페이지 2종의 편집 요약**이며 `LocalFeatureEmbedding`의 256차원 특징 해시를 사용합니다. 문자 특징을 해시·정규화하는 로컬 연산이며 신경망 의미 임베딩을 호출하지 않습니다. PGVector 테이블·HNSW 인덱스·코사인 검색은 실제 구현되어 있습니다. 결과에는 자료명·판본·절·URL·요약·유사도와 `embeddingMethod=LOCAL_FEATURE_HASH_256`, `fullDocumentsIndexed=false`를 표시합니다. 구현 근거는 [PublicVectorConfiguration](../../backend/src/main/java/kr/securityadvisor/knowledge/service/PublicVectorConfiguration.java), [LocalFeatureEmbedding](../../backend/src/main/java/kr/securityadvisor/knowledge/service/LocalFeatureEmbedding.java), [PublicKnowledgeRetriever](../../backend/src/main/java/kr/securityadvisor/knowledge/service/PublicKnowledgeRetriever.java)입니다.

이 범위는 외부 임베딩 모델 RAG나 공개 원문 전체 색인·품질 검증을 뜻하지 않습니다. 첨부 PDF의 전문 추출·청크 색인도 완료 범위가 아닙니다. 실제 임베딩 모델을 도입하면 차원·테이블·재색인·비용·품질 수용 기준을 별도 결정합니다. 기관 비공개 컨텍스트는 별도 AES-256-GCM 보관 경로를 사용합니다. [RequestAssistantService](../../backend/src/main/java/kr/securityadvisor/llm/service/RequestAssistantService.java)는 담당자 권한으로 조회한 기관 참고 사실을 응답의 별도 근거로 돌려주고, `PRIVATE_CONTEXT`를 모델 프롬프트에서 제외합니다. 공개 벡터 색인에도 넣지 않습니다.

## 완료 증거

[ModelAdapterProtocolTest](../../backend/src/test/java/kr/securityadvisor/llm/service/ModelAdapterProtocolTest.java)는 실제 Spring AI·OpenAI SDK 직렬화를 거치고 최하위 HTTP만 합성 대역으로 바꿔 요청·응답 파싱·실패·경계 검사를 확인합니다. [LlmConfigurationIntegrationTest](../../backend/src/test/java/kr/securityadvisor/LlmConfigurationIntegrationTest.java)는 실DB에서 모델 구성·변경 이력과 PGVector 검색 결과를 검사합니다. 이 검사는 [ADR 0001](0001-tech-stack.md)의 **105개 통과**에 포함됩니다. 두 외부 모델의 실제 인증·생성 품질·전환 구동 증거는 아닙니다. 이번 환경에는 실제 API 키가 제공되지 않았습니다.

팀 완료 조건인 독립적인 두 모델 구동을 입증하려면 각 공급자의 승인된 키·실제 모델 접근 권한을 준비해 합성 입력으로 실행하고, 공급자·모델·용도·구성 revision·시각·성공/실패를 비밀값 없이 남깁니다. 공통기반 등 두 번째 공급자의 호환성은 실제 endpoint에서 확인해야 합니다. 대회 가이드의 권장과 팀의 완료 조건을 구분합니다.

## 결과

공통 어댑터와 DB 설정으로 모델 전환의 업무 코드 영향을 줄입니다. 모델 API 세부 차이, 응답 완전성, 실제 RAG 품질과 외부 접근 가능성은 별도 검증 과제로 유지합니다.
