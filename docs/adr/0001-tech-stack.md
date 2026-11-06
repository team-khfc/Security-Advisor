# ADR 0001 · 기술 스택과 재현 실행

- 상태: 팀 확정 기술 스택 반영
- 기록일: 2026-11-06
- 근거: [AGENTS v1.5](../../AGENTS.md), [PROJECT_CONTEXT v1.9](../../claude/PROJECT_CONTEXT.md), [FUNCTIONAL_SPEC v1.2](../../claude/FUNCTIONAL_SPEC.md), 현재 빌드 설정

이 문서는 기존 팀 확정 사항과 구현에 고정된 버전을 기록합니다. 업무 절차·권한·서류 필드를 새로 확정하지 않습니다. 참조한 prototype 기준 커밋은 `3900181bc85440780b199266a75f1b789f76f2d0`이며 제공 지침의 식별자는 [source-manifest.json](../source-manifest.json)에 있습니다.

## 결정

Next.js App Router·React 19·TypeScript 5.9·TanStack Query 5, **Java 25 LTS·Spring Boot 4.1**·Gradle Kotlin DSL·Spring Data JPA, **PostgreSQL 17·Flyway·pgvector**, Docker Compose를 사용합니다. 이전 산출물의 Java 21 기준은 이 버전에 적용하지 않습니다.

현재 빌드에 고정된 버전은 다음과 같습니다. 패치 변경은 빌드 파일·lock 파일과 이 ADR의 영향을 함께 검토합니다.

| 구성 | 현재 기준 | 저장소 근거 |
|---|---|---|
| Java | toolchain 25; 이번 검증은 Temurin 25.0.5+8 | [build.gradle.kts](../../backend/build.gradle.kts) |
| Spring Boot | 4.1.2 | [build.gradle.kts](../../backend/build.gradle.kts) |
| Spring AI | 2.0.2 | [ADR 0002](0002-spring-ai.md) |
| Spring Data JPA·Flyway·PostgreSQL JDBC | Spring Boot 4.1.2 BOM 관리 | [build.gradle.kts](../../backend/build.gradle.kts) |
| Gradle Wrapper | 9.1.0, 배포 SHA-256 고정 | [gradle-wrapper.properties](../../backend/gradle/wrapper/gradle-wrapper.properties) |
| 포맷·구조 검사 | Spotless 7.2.1, google-java-format 1.35.0, ArchUnit 1.4.1 | [build.gradle.kts](../../backend/build.gradle.kts) |
| Node.js | 24 계열 | [CI](../../.github/workflows/ci.yml), [프런트 Dockerfile](../../frontend/Dockerfile) |
| Next.js·React | Next.js 16.4.5, React·React DOM 19.3.1 | [package.json](../../frontend/package.json), [package-lock.json](../../frontend/package-lock.json) |
| TypeScript·TanStack Query | 5.9.3·5.106.1 | [package.json](../../frontend/package.json) |
| PostgreSQL·pgvector | PostgreSQL 17, pgvector 0.8.0 이미지와 digest 고정; 외부 DB 검증은 PostgreSQL 17.11 | [compose.yaml](../../compose.yaml) |

DDD 기능 패키지는 `kr.securityadvisor.<context>`이며 `domain/service/controller/dto/repository` 경계를 적용합니다. 업무 도메인에서 Spring AI·웹 타입을 사용하지 않습니다. AGENTS가 허용한 JPA 매핑 외 프레임워크 의존을 줄입니다. 이벤트 소싱·CQRS는 1차 범위에서 도입하지 않습니다.

기능 경계는 `request`, `review`, `document`, `configuration`, `knowledge`, `llm`, `auth`, `common`입니다. 현재 `SecurityRequest`가 신청 상태·할당·분야 검토 값의 일관성을 한 트랜잭션 안에서 지키며, `review`의 `ReviewCycle`은 공개 DTO를 통해 검토 결정을 제공합니다. `document`는 독립적인 불변 `Submission`과 제출 HTML을 보관합니다. 컨텍스트 사이에서 다른 컨텍스트의 JPA 엔티티·저장소를 직접 참조하지 않고 서비스와 DTO로 협력합니다. 이 구조는 현재 구현 경계이며 검토별 독립 저장소를 이미 분리했다는 뜻은 아닙니다. [구조 검사](../../backend/src/test/java/kr/securityadvisor/ArchitectureTest.java)에서 계층 경계·패키지 순환·컨텍스트 간 엔티티 및 저장소 참조를 검사합니다.

## 실행·DB 권한

Compose의 `db`는 기본 서비스, `backend`·`frontend`는 `app` 프로필입니다. 최초 실행은 스크립트가 생성한 로컬 비밀값을 사용하며 .env는 추적하지 않습니다. 웹·API·DB 호스트 포트는 loopback으로 제한합니다.

DB 관리자 `postgres`는 초기화 때 vector 확장과 역할을 준비합니다. `securityadvisor_migrator`는 DB/스키마 DDL·Flyway, `securityadvisor_app`은 애플리케이션 데이터 읽기·쓰기를 담당합니다. 앱 계정에는 CREATE·SUPERUSER·CREATEDB·CREATEROLE을 주지 않습니다. 이미 초기화된 볼륨에서 환경변수만 바꿔 암호·역할이 변경된다고 가정하지 않습니다.

Flyway가 스키마를 관리하고 Hibernate는 `validate`, `open-in-view=false`를 사용합니다. 타임스탬프 migration 파일은 적용 후 수정하지 않습니다. 기존 테이블 `procedures` 이름은 호환성을 위해 유지하고 새 업무 이름은 SecurityRequest를 사용합니다.

## 검증과 제한

`spotlessCheck check bootJar`, 프런트 `npm run check`·`build`, Compose 신규 기동·HTTP·Chromium 검사를 CI에 정의합니다. DB 통합은 Testcontainers를 기본으로 하며 전용 외부 PostgreSQL 검증 결과는 별도 기록합니다. 환경 제한으로 실행하지 않은 Docker·브라우저 검사를 통과로 보고하지 않습니다.

이번 작업에서는 Java 25로 `spotlessApply check bootJar`를 실행해 **105개 테스트가 통과했고 실패·오류·건너뜀은 모두 0건**입니다. 이 중 실DB 통합 테스트는 23개입니다. PostgreSQL 17.11과 pgvector 0.8.0을 새 전용 DB로 준비했으며 실제 SQL·JSONB·불변 트리거·동시 수정·벡터 검색을 검사했습니다. 테스트마다 생성하는 인증·암호화 키 때문에 해당 외부 검증 경로에는 비어 있는 일회성 DB를 사용합니다.

이 환경에는 Docker가 없어 기본 Testcontainers 및 Compose 이미지 실행 결과를 이 105개에 포함하지 않습니다. [IntegrationTestSupport](../../backend/src/test/java/kr/securityadvisor/IntegrationTestSupport.java)는 외부 검증 DB 환경변수가 없으면 Testcontainers를 사용하도록 유지했습니다. 실제 통과 수치·환경과 전체 앱 검증은 [VERIFICATION](../VERIFICATION.md) 및 [백엔드 증빙](../evidence/backend-tests.json)에 기록합니다. CI 설정의 존재는 GitHub 실행 성공이나 브랜치 보호 적용을 의미하지 않습니다.
