# 팀 시작 안내

이 문서는 합성 데이터로 개발을 시작하는 절차입니다. 제품 규칙은 `claude/FUNCTIONAL_SPEC.md`, 개발 규칙은 `AGENTS.md`가 기준입니다. README의 작업 브랜치에서 시작합니다.

## 1. 실행 환경

| 경로 | 필요한 소프트웨어 | 비고 |
|---|---|---|
| Docker 전체 실행 | Git, Python 3.10+, Docker Engine/Desktop, Compose v2의 `--wait` 지원 버전 | Java와 Node는 컨테이너에 포함 |
| 로컬 개발 | 위 도구 + JDK 25, Node.js 24 LTS와 npm | DB는 Compose로 실행, Gradle Wrapper 사용 |
| 브라우저 | 최신 Chromium 계열 Chrome/Edge 권장 | 실제 확인한 OS·브라우저 버전은 VERIFICATION 참조 |

Linux, macOS, Windows의 Docker 사용 환경을 위한 명령입니다. Windows에서는 WSL2 터미널을 권장하며 `python3`가 없으면 설치 환경의 `python`을 사용합니다. 해당 OS 모두에서 실행을 검증했다는 뜻은 아닙니다.

프로젝트 루트에서 `python3 scripts/init-demo.py`를 실행합니다. `.env.example`은 변수 설명용이며 빈 비밀값으로 실행할 수 없습니다. 생성된 `.env`는 Git에서 제외됩니다. 기존 `.env`를 다시 실행하면 기존 비밀값을 유지합니다. 암호·키를 다른 팀원의 환경과 공유하지 않습니다.

## 2. Docker로 전체 실행

```bash
python3 scripts/init-demo.py
docker compose --profile app config --quiet
docker compose --profile app up --build --detach --wait --wait-timeout 300
docker compose --profile app ps
```

웹은 `http://localhost:3000`입니다. DB·API·웹의 호스트 포트는 loopback에만 공개됩니다. `securityadvisor.localhost`를 사용하는 환경에서도 같은 웹에 접속할 수 있습니다. 이름 해석이 되지 않으면 `localhost`를 사용합니다.

DB는 `securityadvisor`, 앱 계정은 `securityadvisor_app`, Flyway 계정은 `securityadvisor_migrator`입니다. 최초 DB 초기화에만 `postgres`와 `SECURITYADVISOR_DB_BOOTSTRAP_PASSWORD`를 사용합니다. 초기화 스크립트가 pgvector 확장을 설치하고, 앱에는 데이터 읽기·쓰기 권한, migrator에는 스키마 변경 권한을 부여합니다. 두 업무 계정 모두 superuser가 아닙니다. 초기화 스크립트는 **비어 있는 DB 볼륨에서 최초 한 번** 실행됩니다.

변경한 `.env`를 적용할 때는 서비스를 다시 생성합니다. 기존 DB의 암호는 `.env` 변경만으로 자동 변경되지 않습니다. 기존 `boan` DB/볼륨을 이 초기화 경로에 재사용하지 않습니다. 데이터 이동이 필요하면 별도 마이그레이션 계획을 세웁니다.

```bash
docker compose --profile app up --detach --force-recreate
```

중지는 `docker compose --profile app down`입니다. `--volumes`를 붙이면 시연 DB와 업로드가 삭제되므로 일반 중지에 사용하지 않습니다. 삭제가 필요한 경우 보존할 합성 자료를 먼저 확인합니다. `SECURITYADVISOR_CONTEXT_KEY`를 잃거나 바꾸면 기존 암호화 컨텍스트를 복원할 수 없습니다.

## 3. Java·Next.js 로컬 개발

먼저 DB와 프런트엔드 의존성을 준비합니다.

```bash
python3 scripts/init-demo.py
docker compose up --detach --wait db
cd frontend
npm ci
cd ..
```

터미널 A:

```bash
python3 scripts/run-backend.py
```

터미널 B:

```bash
python3 scripts/run-frontend.py
```

두 스크립트는 `.env`를 셸 코드로 실행하지 않고 읽습니다. 이미 설정한 프로세스 환경변수가 `.env`보다 우선합니다. 백엔드는 `local` 프로필과 프로젝트의 `local-uploads/`를 사용하며, 프런트엔드는 API 포트에 맞춰 프록시를 설정합니다. IDE에서는 같은 환경변수와 `local` 프로필을 명시합니다. `./gradlew bootRun` 자체는 루트 `.env`를 자동으로 읽지 않습니다.

| 변경 대상 | 설정 |
|---|---|
| 웹 포트 | `SECURITYADVISOR_WEB_PORT` (기본 3000) |
| API 포트 | `SECURITYADVISOR_API_PORT` (기본 8080) |
| DB 호스트 포트 | `SECURITYADVISOR_DB_PORT` (기본 5432) |
| 로컬 개발 JDBC | `SECURITYADVISOR_DB_URL`; DB 포트 변경 시 함께 수정 |
| 로컬 업로드 경로 | `SECURITYADVISOR_UPLOAD_DIRECTORY`를 지정하면 개발 기본 경로 대신 사용 |

Compose 내부의 API 8080·DB 5432는 고정이고 호스트 포트만 바뀝니다. Compose는 JDBC를 `db:5432/securityadvisor`로 지정합니다. 브라우저는 Next.js와 같은 출처의 `/api`를 사용합니다.

## 4. 합성 계정과 자료

README의 4개 역할 계정으로 로그인합니다. 같은 브라우저 프로필에서 로그인 역할을 바꾸면 기존 세션도 바뀌므로 로그아웃하거나 별도 브라우저 프로필을 사용합니다. `second.demo`, `outside.demo`는 소유자·기관 격리 검증 전용이며 일반 시연 메뉴에 노출할 필요가 없습니다.

`SECURITYADVISOR_DEMO_ENABLED=true`가 합성 계정을 생성합니다. `SECURITYADVISOR_DEMO_SCENARIOS=true`는 첫 DB에 합성 업무 시나리오를 준비합니다. 기존 저장값을 임의로 덮어쓰는 초기화 버튼은 없습니다. 실제 내부 IP·서버명·규정·개인정보를 입력하지 않습니다. 통신 예시는 문서용 예약 주소 `192.0.2.10`, `198.51.100.20`을 사용합니다.

업로드 예시는 `examples/synthetic-business-plan.md`입니다. 현재 파일 지원은 **UTF-8 TXT/MD 1MiB 1개**이며 PDF/DOCX는 지원하지 않습니다. 선택만으로 분석을 시작하지 않으며 사용자가 분석을 실행해야 서버로 전송됩니다.

## 5. 핵심 시연 3개

### 시연 A: 두 서류의 4단계

1. 일반 사용자로 문서 종류를 선택하고 합성 사업 설명을 작성합니다. 예시 자료 분석을 실행하고 미확정 후보의 근거를 읽어 확인합니다.
2. 필수 설명 확인 후 협의를 요청합니다. INFRA가 담당 항목과 방화벽 통신 규칙을 입력하고 **자원 할당 완료**를 기록합니다. 이 동작만으로 INFRA 협의가 끝나지 않습니다.
3. SECURITY 검토와 INFRA 분야 협의를 각각 완료합니다. 보완 요청은 신청자 답변 후 요청 분야가 해소해야 합니다.
4. 3단계에서 최종 AI 초안을 실행·확인하고 제출합니다. 4단계에서 두 담당 분야의 최종 검토 뒤 서류를 확정합니다. 다운로드한 HTML은 실제 장비 적용 증명이 아닙니다.

### 시연 B: 반환과 이력

2→1, 3→2, 3→1, 4→3의 반환에서 사유와 보완 항목을 지정합니다. 기존 값은 남고 지정·영향 항목의 재확인이 요구됩니다. 제출 후 반환·재제출하면 새 제출 차수가 생기고 이전 HTML은 유지됩니다. 종결(반려)·철회도 사유와 기존 이력을 보존합니다.

### 시연 C: 기관 설정과 모델 구성

관리자로 추가 질문·안내 문구를 수정한 후 초안 저장과 게시를 구분합니다. 새 신청에는 새 게시 버전이 적용되고 기존 신청은 생성 시점 정책을 유지합니다. 모델 구성은 용도별 연결을 DB에 저장하며 비밀값 대신 환경변수 이름을 사용합니다. 업무 신청 내용은 관리자 권한으로 조회할 수 없습니다.

## 6. 실제 모델 연결과 전환

초기 모델은 모든 용도에서 `EXAMPLE`이며 결정적 합성 응답을 사용합니다. 실모델을 쓰려면 승인된 개발 환경에서 다음을 준비합니다.

1. `.env`의 `SECURITYADVISOR_OPENAI_API_KEY` 또는 `SECURITYADVISOR_OPENAI_COMPATIBLE_API_KEY`에 해당 환경의 키를 둡니다. 키를 UI·DB·Git·캡처에 넣지 않습니다.
2. `SECURITYADVISOR_ALLOWED_LLM_ENDPOINTS`에 정확한 HTTPS `/chat/completions` URL을 쉼표로 구분하여 등록하고 API를 재시작합니다. 기본 허용 URL은 OpenAI의 `https://api.openai.com/v1/chat/completions` 하나입니다.
3. 관리자 모델 화면 또는 `PUT /api/institution/models`에서 `DOCUMENT_ANALYSIS`, `STAFF_ASSISTANT`, `FINAL_DRAFT` 각각의 연결을 선택합니다. `provider`, `endpoint`, 접근 가능한 `model`, `keyReference`, `temperature`, `maxTokens`, `timeoutSeconds`를 저장합니다.
4. `OPENAI`의 키 참조는 `SECURITYADVISOR_OPENAI_API_KEY`, `OPENAI_COMPATIBLE`은 `SECURITYADVISOR_OPENAI_COMPATIBLE_API_KEY`입니다. 연결 URL은 운영자가 허용 목록에 넣은 것과 정확히 일치해야 합니다. 외부 호출 실패를 예시 성공으로 대체하지 않습니다.
5. 합성 입력으로 공급자별 실호출을 따로 실행하고 모델·용도·성공/실패·시각·구성 revision을 기록합니다. 키와 응답의 민감 내용은 증거에서 제외합니다.

모델 설정의 `LIVE` 표시는 **실연결로 설정되었다는 뜻**이며 성공 증거가 아닙니다. 공통기반 등 두 번째 제공자가 OpenAI 호환 프로토콜을 실제 지원하는지와 해당 모델 접근 권한을 확인해야 합니다. 서로 독립적인 두 실모델의 교체 구동은 팀 완료 조건이며 이번 기본 환경에는 키가 없어 미검증입니다. 대회 안내서의 표현은 권장이므로 별도의 참가 자격 요건으로 확대 해석하지 않습니다.

공개 검색은 현재 로컬 특징 해시 256차원과 pgvector를 사용합니다. 외부 임베딩 모델이나 공개 원문 전체 수집을 사용한 RAG 품질 검증은 별도 작업입니다.

## 7. 문제 해결과 검증

`docker compose --profile app ps`에서 상태를 먼저 확인합니다. DB 연결 실패는 서비스 기동 상태·DB 포트·사용자·암호 일치를 확인합니다. 인증 실패는 역할별 암호와 세션을 확인합니다. 권한·버전 오류를 화면 상태만 바꾸어 우회하지 않습니다. 로그를 공유할 때 키·암호·본문·세션을 제외합니다.

실행 중인 합성 환경의 HTTP 흐름 검사:

```bash
python3 scripts/smoke.py
```

기본 대상은 `http://127.0.0.1:3000`입니다. 포트를 바꾸면 프로세스 환경변수 `SECURITYADVISOR_TEST_BASE_URL`을 지정합니다. 이 검사는 합성 신청·설정·컨텍스트를 생성·변경하므로 **개발용 시연 환경에서만** 실행합니다.

전체 품질 명령은 [DEVELOPMENT.md](DEVELOPMENT.md), 이번 실제 결과는 [VERIFICATION.md](VERIFICATION.md)를 참조합니다. 로컬 환경에서 Docker를 사용할 수 없었다면 native 검사와 Compose/Testcontainers 검사 결과를 구분해야 합니다.
