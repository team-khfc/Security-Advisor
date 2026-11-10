# ADR 0001: 신규 프론트 개발 기반과 API 경계

- 기록일: 2026-11-07
- 상태: 이번 Front 개발 시작점에 적용. 실제 업무 API 계약은 미확정
- 범위: Security-Advisor-Front의 화면·전송·모의 API·개발 도구

## 배경

기존 프로토타입과 최신 디자인 시안의 차이가 크므로 화면 구현을 새로 구성한다. 프로젝트가 지정한 Next.js App Router·React 19·TypeScript 5.9·TanStack Query를 사용하고, 최신 업무 규칙과 시안의 시연 동작을 분리해야 한다.

디자인 기준은 [`prototype-soo`의 `1af32fb424ea79a1a4ce60484a83f9d1935fef25`](https://github.com/team-khfc/prototype-soo/tree/1af32fb424ea79a1a4ce60484a83f9d1935fef25)와 MERGE_NOTES다. 실제 Back 참조는 [`6253f9c7bf0d8862be1d93a32062de6bd887f68d`](https://github.com/team-khfc/Security-Advisor-Back/tree/6253f9c7bf0d8862be1d93a32062de6bd887f68d)이며, 새 업무 흐름의 확정 OpenAPI는 확인되지 않았다. 따라서 Front가 독립적으로 실행되면서도 모의 동작과 실제 연동을 구분할 수 있는 구조가 필요하다.

관련 기준: [PROJECT_CONTEXT](../../PROJECT_CONTEXT.md), [FUNCTIONAL_SPEC](../../FUNCTIONAL_SPEC.md), [AGENTS](../../AGENTS.md), [CODING_STYLE](../../CODING_STYLE.md), [SECURE_CODING](../../SECURE_CODING.md), [CONTRIBUTING](../../CONTRIBUTING.md), [design.md](../../design.md).

## 결정

### 1. App Router와 기능별 코드 경계

페이지는 기능 컴포넌트를 연결하고, 업무 화면·Query 훅·입출력 타입은 `features/` 아래에 모은다. 공통 셸·UI는 `components/`, 전송·프록시·공통 타입은 `lib/`, 모의 HTTP 처리와 합성 데이터는 `mocks/`가 맡는다.

BusinessCase 1:N SecurityRequest, 값의 출처·사람의 확인, 제출 스냅샷, 역할·배정·revision 검사는 타입과 모의 도메인 함수로 명시한다. 프론트의 조건부 버튼은 사용성 기능이며 실제 업무 권한은 서버 책임이다. 이 모델은 Front 개발·시나리오 검증용이고 실제 Back의 DDD 구현을 대체하지 않는다.

### 2. 같은 HTTP 경로를 쓰는 서버 모의 API

브라우저 저장소에서 신청 상태를 직접 조작하지 않는다. 개발 기본값은 Next.js Node 라우트가 실행하는 메모리 모의 API다. 화면은 모의·실제 모드 모두 `/api/...`를 호출한다. 모의에서도 쿠키 인증·CSRF·입력 검증·권한·HTTP 오류·revision 충돌을 통과해야 업무가 변경된다.

브라우저 Service Worker 기반 모의 라이브러리를 추가하지 않았다. 현재 요구의 서버 세션·쿠키·다운로드·요청 크기 검사를 하나의 HTTP 경계에서 다루기 위해 Next 라우트를 사용한다. 그 대신 메모리 상태의 재시작 초기화·단일 프로세스 한계가 있으므로 운영 데이터 저장으로 사용하지 않는다.

### 3. 런타임 환경변수로 실제 Back 프록시 선택

`API_MODE=api`일 때 [API 라우트](../../app/api/[...path]/route.ts)는 [serverProxy.ts](../../lib/serverProxy.ts)를 통해 `API_BASE_URL`로 요청을 전달한다. 빌드 시점 rewrites에 Back 주소를 고정하는 대신 서버 런타임에서 선택하여 하나의 Front 빌드가 설치별 설정을 읽도록 한다. Back 주소와 모드에 `NEXT_PUBLIC_` 환경변수를 사용하지 않는다.

프록시는 고정 origin, 허용된 요청·응답 헤더, 요청 크기 제한, 타임아웃, 동일 출처 쿠키 전달을 제공하고 외부 리다이렉트를 따라가지 않는다. 이 선택으로 요청 스트리밍·쿠키·Location·오류 전달을 직접 관리해야 하며, 실제 Back 통합 테스트가 필요하다. 실제 모드의 오류를 모의 응답으로 숨기지 않는다.

현행 Back의 `/auth/login`·`/auth/logout`·`/auth/me`는 REST 자원 명명 원칙의 예외로 인증 어댑터 안에서 연결한다. Back 소유 계약을 Front만 변경하지 않는다. 실제와 모의의 경로·DTO 차이는 [계약 기록](../../contract/README.md)에 공개한다.

### 4. 서버 상태·폼 입력·목록 조건을 분리

서버 상태는 TanStack Query, 작성 중 입력은 컴포넌트 상태와 계정·자원별 탭 메모리, 다시 열 수 있어야 하는 목록 조건은 URL에 둔다. 계정 변경 후 이전 사용자의 Query 캐시를 없앤다. 세션 토큰·업무 데이터의 브라우저 영속 저장은 두지 않는다. 모든 변경은 명시적 mutation이며 실패·충돌을 성공으로 표시하지 않는다.

새 신청·인터뷰·분석·답변 초안과 선택 파일을 같은 탭의 계정·자원별 메모리에 임시 보관한다. 화면 이동·세션 만료 후 같은 계정으로 돌아올 때 초안을 복원하고 저장·제안 적용 성공 시 해당 초안을 해제한다. 사용자의 분석 요청 전에 파일을 업로드하지 않으며, 새로고침·탭 종료 후 복원을 보장하지 않는다. 구현 경계는 [inputDrafts.ts](../../lib/inputDrafts.ts)와 [uploadDraft.ts](../../lib/uploadDraft.ts)다.

### 5. 시안의 시각 자산을 재사용하고 업무 동작은 새로 구현

로고·토큰·CSS를 참조하고 React 컴포넌트로 화면을 새로 만든다. 시안의 `innerHTML`, `localStorage`, 역할 전환, 외부 CDN 파서와 저장·AI 시연 코드를 가져오지 않는다. 본문 `zoom`을 제거하고 design.md의 17px 본문·최대 1920px 폭·터치 영역 기준으로 보정한다. 로컬 Pretendard GOV와 KRDS 자산을 사용해 외부 글꼴 CDN 의존을 제거한다.

모의 분석·JSON 다운로드는 그대로 해당 형식과 한계를 표시한다. 실제 LLM, HWP·PDF 문서 생성, 정책 적용·지표·알림을 완료한 것처럼 보이는 버튼을 제공하지 않는다. 구체적인 디자인 차이는 [DESIGN_PARITY](../DESIGN_PARITY.md)를 따른다.

## 의존성 선택

새 의존성은 [package.json](../../package.json)과 잠금 파일에 고정한다. 아래 버전은 이 결정 시점의 직접 의존성이며 향후 갱신의 기준은 저장소 파일이다.

| 의존성                             | 버전                | 채택 이유                                                                                                       |
| ---------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------- |
| Next.js                            | 16.4.5              | 지정 App Router, React 화면, 동일 출처 API 경계, standalone 빌드                                                |
| React / React DOM                  | 19.3.1              | 지정 React 19 기반 컴포넌트·폼·상태 관리                                                                        |
| TypeScript                         | 5.9.3               | 지정 언어 버전, 역할·업무 상태·DTO 정적 검사                                                                    |
| TanStack Query                     | 5.107.1             | 지정 서버 상태 도구, 조회·mutation·캐시 무효화·오류 상태 분리                                                   |
| Zod                                | 4.6.7               | 외부 응답과 모의 API 입력의 런타임 검증. TypeScript 타입만으로 신뢰하지 않음                                    |
| bcryptjs                           | 3.0.3               | Node 모의 API의 환경변수 비밀번호·가입 비밀번호 해시. 브라우저 인증이나 실제 Back 비밀번호 저장을 대신하지 않음 |
| Vitest / jsdom                     | 5.1.0 / 31.0.0      | 도메인·HTTP 경계 및 DOM 기반 테스트 실행 환경                                                                   |
| Testing Library React / user-event | 16.3.3 / 14.6.8     | 사용자 관점의 React 상호작용 검사를 위한 도구                                                                   |
| ESLint / eslint-config-next        | 9.39.1 / 16.4.5     | Next·React·TypeScript 코드 규칙 검사                                                                            |
| Prettier                           | 3.7.4               | 공통 형식 유지                                                                                                  |
| Node·React 타입 정의               | package.json에 고정 | 사용하는 런타임·React API의 정적 타입                                                                           |

Node 실행 범위는 `>=22.14 <25`로 선언하여 Node 22·24 환경을 대상으로 한다. 모든 지원 조합에서 검증되었다는 의미는 아니다. 실제 사용 버전·설치·실행 결과는 PR과 CI에서 기록한다.

## 결과와 후속 조건

Front는 Back 없이 합성 시나리오를 실행할 수 있고, 시안 변경을 화면 코드에 독립적으로 반영할 수 있다. 실제 계약이 도착하면 HTTP 클라이언트 전체를 바꾸기보다 DTO·스키마·훅·모의 응답을 같은 계약으로 정렬한다.

반대로 모의 API와 실제 Back 사이의 차이를 계속 관리해야 한다. 현재 설치·업무 계약 미확정, 실제 인증 만료·회원 정보 응답 차이, 대규모 목록 처리, 정식 문서·LLM·RAG, 통합 Docker와 보조기술 검증이 남아 있다. [KNOWN_LIMITATIONS](../KNOWN_LIMITATIONS.md)에 범위를 유지하며, 이 ADR을 기능 완료·운영 승인·실제 Back 검증 기록으로 사용하지 않는다.

Back 계약 변경은 Back PR에서 먼저 확정하고 Front가 따라간다. 배포 저장소에는 검증한 Back·Front 릴리스 스냅샷을 반영하며, 그 저장소에서 업무 코드를 별도로 수정하지 않는다.
