# 개발 안내

## 기준과 변경 책임

`claude/PROJECT_CONTEXT.md`의 확정 결정을 확인한 뒤 `claude/FUNCTIONAL_SPEC.md`의 업무 불변식을 읽습니다. `AGENTS.md`는 사람과 AI의 개발 규칙입니다. `CODING_STYLE.md`의 Google 기준과 `claude/SECURE_CODING.md`의 KISA 기준을 같은 비중으로 적용합니다. 세부 원문이 요약보다 우선하며, 원문끼리 충돌하면 가정을 기록하고 책임자에게 확인합니다.

| 결정 | 기록 위치 | 검토 역할 |
|---|---|---|
| 서비스 범위·업무 절차 | PROJECT_CONTEXT 확정된 결정 | 팀 리더·기획 책임자 |
| 기술 선택·예외 | `docs/adr/` | 기술 책임자 |
| 화면·상태·접근성 | `design.md`, DESIGN_MAPPING | 디자인 책임자와 개발 담당자 |
| 필드·권한·API | CONTRACT, glossary, PR | 프런트엔드·백엔드 담당자 공동 |
| 제출·외부 산출물 | PROJECT_RULES | 제출 책임자 |

실명·GitHub 계정을 추정해 CODEOWNERS를 만들지 않습니다. 저장소 관리자가 팀 배정을 확인한 후 브랜치 보호·필수 리뷰·필수 CI를 설정합니다. CI 파일만으로 보호 규칙이 적용되지는 않습니다.

## 구조와 DDD 경계

`frontend/app`은 경로, `features`는 업무 기능, `components`는 공통 UI, `lib`는 HTTP·타입 등의 기반입니다. 서버의 기준 패키지는 `kr.securityadvisor`입니다.

| 바운디드 컨텍스트 | 책임 |
|---|---|
| `request` | 신청 애그리거트·4단계·반환·할당·필드 출처·revision |
| `review` | 담당 분야 검토 개념; 현재 일부 상태와 메서드는 request 애그리거트에서 일관성 보장 |
| `document` | HTML 문서 생성과 불변 제출 차수 |
| `configuration` | 기관 정책 초안·게시·설정 검증 |
| `knowledge` | 공개 지식 검색과 별도 비공개 컨텍스트 보관 |
| `llm` | 용도별 모델 설정·AI 작업·공통 어댑터 |
| `auth` | 세션·계정·역할 |
| `common` | 최소 공통 오류·시간·보안 값 |

폴더가 있다고 모든 컨텍스트가 독립적으로 완성된 것은 아닙니다. 현재 전술 DDD를 사용하며 이벤트 소싱·CQRS는 도입하지 않습니다. 상태 변경은 `openConsultation`, `acceptReview`, `submit`, `returnTo`, `confirmDocument` 같은 업무 동사로 수행합니다. 도메인은 웹·Spring AI 타입을 직접 사용하지 않습니다. JPA 엔티티 매핑은 AGENTS의 허용 범위에 따릅니다.

API 계약은 `docs/CONTRACT.md`, 코드 식별자 기준은 `docs/glossary.md`입니다. 서비스는 트랜잭션·기관·권한·외부 I/O를 연결하고 도메인이 상태·불변식을 강제합니다. 엔티티를 API 응답으로 직접 노출하지 않습니다.

## 작업 순서

1. 이슈에 명세 절·담당 역할·성공/실패 수용 기준을 적습니다.
2. 지정 디자인에서 화면·상태를 확인하고 필드·권한·API 계약을 먼저 맞춥니다.
3. `feat/<이슈번호>-<주제>` 또는 해당 변경 종류의 브랜치에서 구현합니다. 한 PR은 하나의 검토 가능한 문제를 다룹니다.
4. 필요한 도메인·권한·기관·충돌·실패 검사를 실행하고 실제 결과만 기록합니다.
5. 한국어 Conventional Commit과 PR 설명을 작성합니다. 작성자 이외의 검토자가 확인한 뒤 squash merge합니다.

예: `feat(request): 반환 항목의 재확인 상태 추가`. DB 변경은 타임스탬프 Flyway migration을 추가하며 이미 배포한 migration을 수정하지 않습니다. Hibernate는 `validate`를 유지합니다. 화면이 보여 주는 role/allowedActions만으로 요청을 승인하지 않습니다.

## 품질 명령

백엔드(JDK 25, Docker 필요):

```bash
cd backend
./gradlew spotlessApply
./gradlew spotlessCheck check bootJar
```

`check`는 단위 검사·ArchUnit·DB 통합 검사를 포함합니다. 기본 통합 경로는 Testcontainers의 PostgreSQL 17/pgvector이며 Docker가 없으면 완료로 처리하지 않습니다. 전용 외부 검사 DB를 쓸 때는 `SECURITYADVISOR_TEST_JDBC_URL`, `SECURITYADVISOR_TEST_DB_USER`, `SECURITYADVISOR_TEST_DB_PASSWORD`를 명시합니다. 외부 경로는 Flyway로 전용 DB를 변경하므로 일반 개발 DB나 운영 DB에 연결하지 않습니다. 검사 로그인 암호와 암호화 키는 실행마다 생성되므로 외부 검사 DB도 매번 새 disposable DB로 준비해야 하며 이전 테스트 DB를 재사용하지 않습니다. 외부 DB 결과와 Testcontainers 결과를 서로 바꿔 표기하지 않습니다.

프런트엔드(Node.js 24):

```bash
cd frontend
npm ci
npm run format
npm run check
npm run build
```

`check`는 Prettier·TypeScript·ESLint·Vitest를 실행합니다. 실행 앱에서 키보드 이동·초점·라벨·모바일 표 스크롤과 로딩/빈 상태/오류 상태도 확인합니다. 자동 검사만으로 접근성 인증을 주장하지 않습니다.

`.github/workflows/ci.yml`은 위 두 검사와 **새 Compose 볼륨에서 기동 후 HTTP smoke**를 별도 작업으로 수행하도록 구성했습니다. 배포·실제 LLM 호출·공식 제출은 수행하지 않습니다. GitHub Actions 실행 여부와 결과는 CI 실행 화면으로 확인해야 합니다. Actions는 공식 릴리스의 full SHA로 고정했습니다.

## 완료의 의미

화면·API·도메인·DB가 연결되고 성공/실패·역할·기관·버전 경계를 확인해야 해당 기능을 검증 완료로 기록할 수 있습니다. 합성 AI의 성공은 외부 LLM의 성공이 아니며, pgvector 쿼리 성공은 임베딩 품질 평가가 아닙니다. `FEATURE_READINESS.md`에 구현 상태, `VERIFICATION.md`에 실행 증거를 각각 기록합니다.

정책 초안·게시본·신청 정책 스냅샷·제출본은 서로 다릅니다. 반환은 값을 삭제하지 않으며 영향받은 확인을 무효화합니다. AI 원출처를 사람 확인으로 덮어쓰지 않습니다. 비밀값·실제 내부 자산·실존 개인정보는 커밋·테스트 픽스처·스크린샷·문서에 넣지 않습니다.

## 일정과 후속 개발

원문 기준 기능 동결은 11월 8일, 통합·오류 수정은 11월 9일, 가이드·영상·공공GitLab 준비는 11월 10일, 본 제출은 11월 11일 오전입니다. 세부 담당과 마감은 PROJECT_RULES를 따릅니다. GitHub PR 준비가 공식 제출 완료를 뜻하지 않습니다. 마감 후 공식 공공GitLab 산출물 수정 금지 규칙을 지킵니다.

우선 후속 작업은 필드·권한 가정 확정, 실제 두 모델 교체 구동 증거, 공개 자료 수집·임베딩 품질 검증, 미지원 문서 형식과 운영 인증 요구의 범위 결정입니다. 기능 동결 이후 새 범위를 임의로 추가하지 않습니다.
