# 검증 기록

검증일: **2026-11-06**. 대상은 이 SecurityAdvisor 팀 개발 시작 버전입니다. 이전 시제품의 Java·테스트 수·HTTP 경로 수·브라우저 확인 기록은 이번 결과로 재사용하지 않고 제거했습니다.

이 문서는 로컬 검증과 최초 CI의 기록입니다. 이후 커밋의 현재 CI 상태·브라우저 결과는 [PR #2의 검사](https://github.com/team-khfc/Security-Advisor/pull/2/checks)와 [실행 목록](https://github.com/team-khfc/Security-Advisor/actions/workflows/ci.yml)을 확인합니다.

## 2026-11-07 시각 수정 검증

사용자가 지정한 `prototype-soo/requests.html`과 이전 CI 스크린샷을 직접 대조해 셸·목록의 구조 차이와 색상 소실을 확인했습니다. `application.css`의 후행 자기 참조 토큰을 제거하고 원본 로고·CSS·화면 구조를 적용했습니다. 현재 화면 출처는 [DESIGN_MAPPING](DESIGN_MAPPING.md)과 [source manifest](source-manifest.json)에 기록합니다.

- 프런트 `npm run check`: Prettier·TypeScript·ESLint와 **3파일 21건** 통과. 최초에는 변경된 분석 버튼·선택 상태 문구 때문에 기존 검사 2건이 실패했습니다. 미전송 문구를 복원하고, 파일이 있는 경우와 텍스트만 있는 경우의 읽기 전용 검사를 각각 유지했습니다. 재시도 실패가 이전 성공 배지를 남기지 않는 회귀도 추가했습니다.
- 프로덕션 빌드: `API_ORIGIN=http://127.0.0.1:18080 npm run build` 성공.
- `git diff --check` 통과, 프런트 CSS의 직접 자기 참조 토큰 0건.
- 브라우저 검사를 `/requests`, `/requests/new`, 분석 전송 전, 상세 시안, 모바일·다크 화면으로 확장했습니다. 실제 계산된 카드·테두리·배경·선택 메뉴·주요 버튼 색과 로고 로드를 검사합니다.
- 문서 없이 작성해 질문으로 진입하는 흐름, 선택 파일이 초안 생성 뒤에도 유지되며 명시적 분석 클릭 전에는 서버 분석 이력이 생기지 않는 흐름, 화면 설정 모달을 닫은 뒤 계정 버튼으로 초점이 돌아가는 흐름을 검사에 포함했습니다.

이 항목은 로컬 명령 실행과 검사 범위를 설명합니다. 현재 커밋의 CI 실행 결과·스크린샷 직접 검토 결과는 [PR #2](https://github.com/team-khfc/Security-Advisor/pull/2)에서 해당 커밋과 함께 기록합니다. 과거 실행 #2의 Chromium 20건 통과는 이번 시각 변경의 통과 증거가 아니며, 전체 접근성 인증이나 픽셀 단위 동일성을 의미하지 않습니다.

## 실제 실행 결과

| 검사                            | 환경·명령                                                                                                                                             | 관찰한 결과                                                          |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 백엔드 전체 검사·빌드           | Java 25, Boot 4.1.2, 새 disposable PostgreSQL 17.11 + pgvector 0.8.0; 설치된 Gradle 9.1.0 바이너리로 `gradle --no-daemon spotlessApply check bootJar` | **105 tests, 실패 0·오류 0·스킵 0**, Spotless·ArchUnit·JAR 빌드 성공 |
| 프런트 형식·타입·lint·단위 검사 | `npm run format`, `npm run check`                                                                                                                     | Prettier·TypeScript·ESLint 통과, **Vitest 3파일 19건 통과**          |
| 프런트 production build         | Next.js 16.4.5, `API_ORIGIN=http://127.0.0.1:18080 npm run build`                                                                                     | 빌드 성공, 정적 생성 14/14                                           |
| 실제 HTTP 통합                  | 실제 Java 25 JAR + Next.js production 서버 + 별도 PostgreSQL 17.11/pgvector; 프런트 `/api` 프록시 경유                                                | **10개 시나리오 그룹 통과**                                          |
| 런타임 DB 권한                  | 실제 `securityadvisor_app` 계정                                                                                                                       | DDL 거절 확인                                                        |
| 재시작 보존                     | 백엔드 정상 종료·재시작                                                                                                                               | 신청 건수 유지 확인                                                  |
| 실행 API 계약                   | 실행 서버 `/v3/api-docs`                                                                                                                              | **35개 경로**, `docs/openapi.json`에 보관; 서버 URL만 `/`로 정규화   |

백엔드 결과는 실제 PostgreSQL을 사용하는 **외부 전용 검사 DB 경로**입니다. H2나 저장소 대역으로 바꾸지 않았으며, Docker의 Testcontainers 실행 결과로 집계하지 않습니다. 외부 검사 DB도 매번 새 DB를 만들어 실행했으며 생성된 로그인 암호·암호화 키를 재사용하지 않았습니다.

이번 로컬 검사는 설치된 Gradle 9.1.0 바이너리를 사용했습니다. 저장소 Wrapper도 같은 버전을 가리키지만, Wrapper 다운로드·실행 검증은 GitHub CI의 `./gradlew` 실행과 구분합니다.

프런트엔드의 이 실행은 기존 시제품에서 독립 복사한 node_modules를 사용했습니다. lock 파일을 이용한 새 `npm ci` 및 Docker 빌드는 CI에서 다시 검증하도록 구성했습니다. 형식·타입·빌드 성공을 브라우저 시각 검수 성공으로 표현하지 않습니다.

## HTTP에서 확인한 업무 범위

- 세션·CSRF·로그아웃, 역할 경계, 같은 기관의 다른 작성자와 다른 기관의 접근 제한.
- FIREWALL·SECURITY_REVIEW 두 서류의 4단계, INFRA 자원 할당 선행과 분야 협의의 분리.
- 미확정 AI 원출처 보존, 사람 확인, 최종 AI 초안 미확정 상태의 제출 차단.
- 2→1, 3→1, 3→2, 4→3 반환, 기존 답변·통신·이력 보존과 필요한 재확인.
- 재제출의 새 차수, 첫 제출본 HTML의 불변성, 멱등 제출.
- 두 분야 최종 검토 전 확정 거절, 완료 후 서류 확정; 확정 뒤 일반 내용 변경 거절.
- 종결·철회의 사유 필수와 종료 상태의 변경 차단.
- INFRA_FIRST 고정, 기관 설정의 멱등 게시와 기존 신청 정책 버전 유지.
- 기관 컨텍스트 접근 제한, DB 모델 구성 revision·변경 이력.
- 실제 pgvector를 통한 공개 편집 요약 검색. `LOCAL_FEATURE_HASH_256`·원문 미색인 표시 확인.

초기 smoke의 미완료 최종 검토 확정 요청은 422를 예상했으나 실제 도메인 계약은 409 `FINAL_REVIEWS_REQUIRED`였습니다. 기대값을 상태 충돌 의미에 맞추고 오류 코드·최신 revision도 확인하도록 수정한 후 전체 흐름을 다시 실행해 통과했습니다.

## 최초 GitHub CI 실행

[실행 #1](https://github.com/team-khfc/Security-Advisor/actions/runs/42244615755)은 커밋 `daaf748f6bd222f937b2f379b58ac41f6bdf27ce`를 새 Ubuntu 실행기에서 검사했습니다.

- 백엔드 Wrapper 실행·Java 25 검사·Testcontainers·JAR 빌드: 성공.
- 새 `npm ci`, 프런트 검사와 production build: 성공.
- Docker Compose 이미지 빌드·서비스 기동·HTTP 업무 흐름: 성공.
- Chromium: 로그인·사업 생성까지 진행한 뒤, 반환 상태 자료가 없다는 검증 스크립트 전제에서 실패했습니다. 기존 자료에 의존하지 않고 실제 API로 반환 상태와 이전 값을 준비하도록 검증 스크립트를 수정했습니다. 이 최초 실행 전체를 성공으로 집계하지 않습니다.

반환 시나리오 준비 수정 이후의 전체 브라우저 검사 결과는 위 PR의 해당 커밋 검사에서 확인합니다. 브라우저 검사는 합성 계정·실제 서버 API·작은 화면·기기 다크 설정을 사용하며 접근성 인증을 대신하지 않습니다.

## 실행하지 못했거나 별도 검증이 필요한 범위

| 범위                                              | 상태·이유                                                                          | 다음 확인 경로                          |
| ------------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------- |
| 로컬 Docker 이미지 빌드·Compose 전체 기동         | 로컬은 **미검증**. GitHub 실행 #1의 빌드·기동·HTTP는 성공                          | 현재 커밋의 GitHub CI compose 작업      |
| Testcontainers 경로                               | 로컬은 **미검증**. GitHub 실행 #1의 backend 작업 성공                              | 현재 커밋의 GitHub CI backend 작업      |
| 로컬 Chromium 실제 화면 검사                      | **실행 실패**. Chromium Unix 소켓이 제한되고 권한 확대 요청도 자동 정책에서 거절됨 | CI의 `scripts/browser-smoke.mjs`        |
| GitHub Actions 실행                               | 최초 실행의 부분 결과는 위 기록에 명시                                             | 현재 결과는 해당 PR의 커밋별 CI 실행    |
| 외부 LLM 2종 실호출·교체 구동                     | **미검증**. 실제 키 미제공                                                         | 승인된 키·모델로 별도 실행 증거         |
| 외부 임베딩 모델 RAG·원문 전체 색인               | **미구현/미검증**                                                                  | 자료·모델·검색 품질 수용 기준 먼저 확정 |
| 전체 접근성·스크린리더·대비·확대·여러 OS/브라우저 | **미검증**                                                                         | 설계 수용 기준에 따른 수동·도구 검사    |
| 운영 SSO·기관 실계정·장비 적용                    | **미구현**                                                                         | 1차 범위·기관 승인에 따른 후속 결정     |

CI는 새 환경에서 형식·타입·lint·단위·ArchUnit·Testcontainers·production build와 Compose HTTP·Chromium 검사를 수행하도록 구성했습니다. workflow 파일만으로 GitHub 실행 통과를 주장하지 않습니다. 브라우저 artifact는 합성 화면 PNG와 결과 JSON만 수집하며 .env·쿠키·API 키·raw 서버 로그를 업로드하지 않습니다.

## 증거

- [백엔드 JUnit 집계](evidence/backend-tests.json): 현재 XML에서 추출한 테스트 수·suite 요약. 원시 로그를 복제하지 않았습니다.
- [프런트 검증 기록](../frontend/verification/validation-2026-11-06.txt): 실제 명령·초기 실패 수정·최종 결과 요약. raw shell 캡처와 구별합니다.
- [HTTP 검사 출력](evidence/native-http-check.txt): 10개 실제 시나리오 결과.
- [통합 환경 요약](evidence/native-http-summary.json): 버전·DB 권한·재시작·미검증 범위.
- [OpenAPI](openapi.json): 이번 실행 서버에서 생성한 35개 경로.

기능 구현 자체의 범위는 [FEATURE_READINESS](FEATURE_READINESS.md)를 따릅니다. 코드 존재·규칙 문서·합성 응답·실행 성공·대회 증빙 완료를 서로 구분합니다.
