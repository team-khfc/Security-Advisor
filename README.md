# 보안길잡이 · SecurityAdvisor

정보보안에 익숙하지 않은 공공기관 담당자가 사업을 설명하고, ICT인프라·정보보안 담당자와 협의하여 **방화벽 신청서와 보안성검토 신청서**를 준비하는 팀 개발용 프로토타입입니다.

**작성 → 담당자 협의(INFRA 할당 선행) → 사용자 최종 검토 → 확정·관리**의 4단계를 서버가 관리합니다. AI는 제안하며 사람이 확인합니다. **서류 확정은 방화벽 적용을 의미하지 않습니다.**

## 빠른 실행

Docker Engine/Desktop와 Compose v2(`--wait` 지원), Git, Python 3.10 이상이 필요합니다. 모든 시연 정보는 합성 데이터입니다. 기본 AI는 외부 호출이 없는 `EXAMPLE` 모드입니다.

PR 병합 전에는 아래 작업 브랜치를 사용합니다. 병합 후에는 `main`을 사용할 수 있습니다.

```bash
git clone --branch feat/1-team-development-starter https://github.com/team-khfc/Security-Advisor.git
cd Security-Advisor
python3 scripts/init-demo.py
docker compose --profile app up --build --detach --wait --wait-timeout 300
```

- 웹: <http://localhost:3000>
- API 상태: <http://localhost:8080/api/health>
- API 명세: <http://localhost:3000/swagger-ui.html>
- 디자인 검토: <http://localhost:3000/design-preview/requests>

`init-demo.py`는 로컬 `.env`에 서로 다른 DB·역할별 암호와 암호화 키를 생성합니다. 암호를 출력하거나 Git에 저장하지 않습니다. 로그인 암호는 자신의 `.env`에서 아래 변수로 확인합니다.

| 역할             | 로그인 ID        | 암호 변수                                 |
| ---------------- | ---------------- | ----------------------------------------- |
| 일반 사용자      | `applicant.demo` | `SECURITYADVISOR_DEMO_APPLICANT_PASSWORD` |
| ICT인프라 담당자 | `infra.demo`     | `SECURITYADVISOR_DEMO_INFRA_PASSWORD`     |
| 정보보안 담당자  | `security.demo`  | `SECURITYADVISOR_DEMO_SECURITY_PASSWORD`  |
| 기관 관리자      | `admin.demo`     | `SECURITYADVISOR_DEMO_ADMIN_PASSWORD`     |

중지: `docker compose --profile app down`. DB와 업로드 볼륨은 유지됩니다. 포트 변경·로컬 개발·모델 연결·시연 순서는 [팀 시작 안내](docs/TEAM_START.md)를 따릅니다.

## 개발 기준

| 계층 | 기준                                                                 |
| ---- | -------------------------------------------------------------------- |
| 화면 | Next.js App Router, React 19, TypeScript 5.9, TanStack Query         |
| 서버 | **Java 25 LTS**, Spring Boot 4.1, Gradle Kotlin DSL, Spring Data JPA |
| AI   | **Spring AI 2.0**, 공통 LLM 어댑터 뒤에서 사용                       |
| 저장 | PostgreSQL 17, Flyway, pgvector                                      |
| 실행 | Docker Compose 또는 Java 25·Node.js 24 로컬 개발                     |
| 설계 | DDD 바운디드 컨텍스트·업무 동사·유비쿼터스 언어                      |

정확한 패치 버전은 `backend/build.gradle.kts`와 `frontend/package-lock.json`을 기준으로 합니다. 문서 기준은 PROJECT_CONTEXT v1.9, FUNCTIONAL_SPEC v1.2, AGENTS v1.5, **design.md v3.1**이며 원본 식별자는 [source-manifest.json](docs/source-manifest.json)에 있습니다.

## 먼저 읽을 문서

1. [프로젝트 맥락](claude/PROJECT_CONTEXT.md) → [기능 명세](claude/FUNCTIONAL_SPEC.md)
2. [공통 개발 지침](AGENTS.md) → [운영 지침](claude/PROJECT_RULES.md)
3. [코딩 스타일](CODING_STYLE.md) + [시큐어코딩](claude/SECURE_CODING.md)
4. [협업 절차](CONTRIBUTING.md) → [디자인 기준](design.md)
5. [개발 안내](docs/DEVELOPMENT.md) · [API 계약](docs/CONTRACT.md) · [용어집](docs/glossary.md)

## 구현 범위와 증거

[기능 준비 현황](docs/FEATURE_READINESS.md)은 구현·합성 응답·외부 실호출 미검증을 나눕니다. [검증 기록](docs/VERIFICATION.md)은 실제 실행 결과와 남은 검증을 기록합니다. 명세의 체크리스트와 CI 파일 존재만으로 검증 완료를 뜻하지 않습니다.

현재 업로드는 UTF-8 TXT/MD 1MiB, 문서 다운로드는 HTML입니다. 공개 지식은 **로컬 특징 해시와 pgvector를 이용한 제한된 요약 검색**입니다. 실제 임베딩 모델 RAG나 두 외부 LLM 실구동을 완료했다고 표시하지 않습니다.

개발 결과는 이 저장소에 모읍니다. 최초 개발 출발점은 [team-khfc/prototype](https://github.com/team-khfc/prototype)이며, 현재 화면은 사용자가 지정한 [prototype-soo 신청 현황](https://team-khfc.github.io/prototype-soo/requests.html)을 기준으로 맞춥니다. 원본 커밋과 실제 반영 차이는 [디자인 매핑](docs/DESIGN_MAPPING.md)에 기록합니다. 원본 정적 패키지를 실행 앱과 함께 복제하지 않습니다. 이 GitHub 저장소는 개발용이며, 공식 제출 대상 공공GitLab과 제출 절차는 [운영 지침](claude/PROJECT_RULES.md)을 따릅니다.
