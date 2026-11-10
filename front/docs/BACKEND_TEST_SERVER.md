# 실제 Back 연결 테스트 서버

기준: 2026-11-09, Back 커밋 `12d89eda4e1c785dd09f67bdeb85cee3ccc8507c`의 [FRONTEND_HANDOFF.md](https://github.com/team-khfc/Security-Advisor-Back/blob/12d89eda4e1c785dd09f67bdeb85cee3ccc8507c/docs/FRONTEND_HANDOFF.md)와 [OpenAPI](https://github.com/team-khfc/Security-Advisor-Back/blob/12d89eda4e1c785dd09f67bdeb85cee3ccc8507c/docs/api/openapi.yaml).

## 목적과 연결 범위

실제 Spring Boot 백엔드, PostgreSQL 17, 이 Front의 Next.js 서버를 함께 실행하는 개발용 구성이다. Back 소스와 DB 정의는 Back 저장소가 소유하고, 이 저장소의 Compose 파일은 Back의 기존 `compose.yaml`에 Front와 테스트 설정을 추가한다. 완성본 배포 저장소를 대체하지 않는다.

**서버 기동과 모든 업무 화면의 연동 완료는 별개다.** 현재 인증·세션·CSRF 프록시와 기관 정보 응답 변환을 제공한다. 사업·신청 DTO, 답변 저장, 협의, 제출, 문서 등의 연결 차이는 아래 표에 기록했다. 테스트 서버가 시작되어도 이 영역의 화면은 오류를 표시할 수 있다. API 실패를 모의 성공으로 바꾸지 않는다.

## 준비

- Docker Desktop의 Linux 컨테이너 실행 환경. Docker Compose **2.24.4 이상**이 필요하다(`ports`·테스트 환경 파일을 교체하는 [`!override`](https://docs.docker.com/reference/compose-file/merge/#replace-value) 사용).
- Node.js 24. 실행 도구는 Node 기본 모듈만 사용하므로 서버 기동을 위해 호스트에서 `npm ci`를 먼저 할 필요는 없다.
- Front 저장소와 Back 소스 폴더. Back에는 `compose.yaml`, `Dockerfile`, `docs/FRONTEND_HANDOFF.md`가 있어야 한다.

Java 25·Gradle·프론트 의존성은 컨테이너 안에서 준비한다. Back 폴더의 `.env`와 Front의 기존 `.env.local`은 수정하지 않는다.

## Windows에서 실행

이 변경이 포함된 **Front 저장소 폴더**에서 PowerShell로 실행한다.

```powershell
npm run test:server -- --backend "$env:USERPROFILE\Desktop\repo\Security-Advisor-Back-main"
```

첫 실행은 이미지와 의존성을 내려받고 빌드하므로 시간이 걸린다. Docker가 없거나 실행되지 않았으면 도구가 실패 사유를 표시한다. 준비 검사를 통과한 뒤에만 설정과 컨테이너를 생성한다.

| 주소 | 대상 |
| --- | --- |
| http://localhost:3001/login | 실제 API 모드의 Front |
| http://localhost:8081/swagger-ui.html | Back API 명세와 요청 도구 |
| http://localhost:8081/actuator/health | Back 상태 확인 |

기존 3000 포트의 모의 Front와 구분하기 위해 기본 포트를 3001·8081로 정했다. 기존 서버를 종료하지 않는다. 포트를 다른 프로그램이 사용하면 `.env.backend-test`의 `SECURITYADVISOR_FRONTEND_PORT`·`SECURITYADVISOR_BACKEND_PORT`를 서로 다른 빈 포트로 설정한 뒤 다시 실행한다. 연결 검사에도 `npm run test:connection -- --url http://127.0.0.1:변경한포트`로 Front 주소를 지정한다.

테스트 환경 파일은 Front의 `.env.backend-test`에 최초 한 번 생성한다. DB·합성 계정 비밀번호는 실행 시 생성하고 콘솔에 출력하지 않는다. 다시 실행해도 기존 파일과 DB 볼륨을 보존한다. 비밀번호는 이 로컬 파일에서 확인한다. 환경 파일은 Git과 Docker 빌드 컨텍스트에서 제외된다.

합성 계정은 `applicant`, `applicant2`, `infra`, `security`, `admin`이며 비밀번호는 `.env.backend-test`의 `DEMO_ACCOUNT_PASSWORD`다. 백엔드가 이미 생성한 계정·DB 비밀번호는 환경 파일을 편집하는 것만으로 자동 변경되지 않으므로, 기존 테스트 환경에서는 값을 임의로 바꾸지 않는다.

기본값 `LLM_MODE=fake`는 **AI 응답만 고정 응답**으로 실행한다. Spring Boot·DB·인증은 실제 서버다. 실제 모델 검증은 로컬 테스트 환경 파일에 `LLM_MODE=live`와 필요한 키를 설정한 후 별도로 수행한다. 키를 코드·커밋·채팅에 넣지 않는다. 이 테스트 구성에서는 메일·웹훅 외부 발송을 끈다.

## 연결 검사와 종료

기동 후 다음 명령으로 같은 출처 프록시를 통한 실제 연결을 확인한다.

```powershell
npm run test:connection
```

검사는 기관 정보, 미로그인 401·CSRF 쿠키, CSRF 없는 로그인 차단, 정상 로그인·세션 유지, 인증된 사업 건 목록 API, 로그아웃을 확인한다. 응답 내용·쿠키·비밀번호를 출력하지 않는다. 사업이나 신청을 생성·수정하지 않는다. 검사 성공은 이 기본 연결 범위에 한정된다.

테스트 컨테이너를 종료할 때는 다음 명령을 사용한다. 데이터 볼륨은 삭제하지 않는다.

```powershell
npm run test:server -- --backend "$env:USERPROFILE\Desktop\repo\Security-Advisor-Back-main" --stop
```

실제 실행 옵션은 `npm run test:server -- --help`에서 확인할 수 있다.

## 기동 시 처리

1. Back 경로와 Docker·Compose 버전을 확인한다.
2. 격리된 테스트 환경 파일과 Compose 프로젝트를 준비한다.
3. Back·Front 이미지를 빌드한다. Back 코드를 Front 안에 복사하지 않는다.
4. 일회성 초기화 컨테이너로 테스트 업로드 볼륨의 소유자를 Back의 `app` 사용자로 맞춘다. 실제 Back 프로세스는 기존 비루트 사용자로 실행한다.
5. DB·Back·Front를 시작하고 Back 상태와 Front를 통한 실제 기관 정보 응답이 정상인 경우에만 준비 완료를 표시한다.

호스트에 공개되는 포트는 로컬 루프백으로 제한한다. 기본 Compose 프로젝트 이름은 `securityadvisor-integration`이며 Back 단독 실행의 DB·업로드 볼륨과 구분한다. 실패 시 기존 사용자 프로세스를 종료하거나 데이터 볼륨을 삭제하지 않는다.

## 확인된 업무 계약 차이

| 영역 | 현재 Front | Back 확정 계약·후속 연결 |
| --- | --- | --- |
| 기관 정보 | 내부적으로 `institutionName`, `institutionCode`, `mode` 사용 | `{name, code}`를 실제 API 모드로 변환하는 어댑터 반영 |
| 인증 | `/api/auth/login`, `/me`, `/logout`, CSRF 쿠키/헤더 | 프록시·사용자 응답 어댑터 사용. 실제 실행 결과는 연결 검사에서 확인 |
| 사업 건 | 모의 `id`, `answers`, `requestIds` 등을 요구 | `businessCaseId`, `caseAnswers`, 하위 `requests` 등으로 응답. 목록·상세를 구분한 DTO 연결 필요 |
| 신청 현황 | `GET /api/security-requests`와 통합 화면 DTO 기대 | 사업 건의 하위 신청, 담당자 `/api/reviews` 등 역할별 조회를 사용하도록 연결 필요 |
| 공통 답변 저장 | `PATCH /api/business-cases/{id}`로 일괄 저장 | 필드별 `PUT /api/business-cases/{id}/answers/{key}`와 확인 API, 각 revision 처리 필요 |
| 분석 | 파일·텍스트를 분석 요청에 함께 전달 | 업로드 → 분석 작업 생성 → 작업 조회 순서 연결 필요 |
| 협의·문서·관리 | Front 모의 경로·통합 응답 기반 | OpenAPI의 개별 자원·상태·생성 문서·제출본·회원 관리 계약에 맞춘 후속 연결 필요 |

전체 Front 모의 계약과 실제 Back의 차이는 [계약 연결 상태](../contract/README.md), 미검증 범위는 [현재 한계](KNOWN_LIMITATIONS.md)를 함께 확인한다.

## 검증 기록의 해석

`Real backend connection` GitHub Actions는 위 Back 커밋으로 실제 DB·Back·Front 컨테이너를 만들고 연결 검사를 수행한다. 실행 결과는 해당 PR의 Actions 결과가 기준이다. CI의 서버는 작업 종료 시 중단되므로 사용자 PC에 서버가 계속 실행 중이라는 의미가 아니다. Docker가 없는 작업 환경에서 소스·단위 테스트만 실행한 결과는 컨테이너 기동 성공으로 보고하지 않는다.

실제 Windows의 Docker Desktop 실행, 브라우저 화면, 전 업무 흐름, 실제 LLM 응답은 별도 검증 대상이다.
