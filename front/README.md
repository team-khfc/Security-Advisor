# 보안길잡이 · 프론트엔드

**반복되는 보안 업무는 자동으로, 담당자 협의까지 편리하게.**

보안길잡이(SecurityAdvisor)는 사업 담당자의 기획서와 설명을 바탕으로 보안 서류 작성을 돕고, ICT인프라·정보보안 담당자의 협의와 최종 확정까지 연결하는 서비스입니다. 이 저장소는 **화면과 모의 API를 개발하는 프론트엔드 원본**입니다.

> **심사·전체 서비스 실행:** 프론트·백엔드·DB와 테스트 계정을 함께 제공하는 [통합 배포 저장소](https://github.com/team-khfc/Security-Advisor)를 이용하세요. 이 저장소의 단독 실행은 개발용입니다.

## 주요 기능

| 사용자 | 제공 기능 |
|---|---|
| 신청자 | 사업 기획서 첨부·분석, AI 인터뷰, 답변 작성·확인, 협의 결과 비교·요약, 최종 초안 수정·제출 |
| ICT인프라 담당자 | 여러 서버·통신 구간·운영 정보 작성, AI 구성 제안 비교·선택 적용, 체크리스트와 협의 |
| 정보보안 담당자 | 사업·망 구성 검토, 보완 요청, 구성 변경에 따른 인프라 재협의, 최종 확인·서류 확정 |
| 기관관리자 | 담당자 등록·재배정, 질문·기한 정책, 공개 지식·기관 정보, 업무 지표, AI 모델 구성·연결 시험 |

지원 서류는 **방화벽 정책 허용 신청서**와 **정보화사업 보안성검토 신청서**입니다. 한 사업의 공통 정보를 공유하면서 서류별 협의·제출 상태는 독립적으로 관리합니다.

## 빠른 시작 — 모의 API

준비물: **Node.js 24 권장**(`>=22.14 <25`), npm. 전체 개발 검사에는 Python 3도 필요합니다.

```bash
npm ci
npm run dev
```

[로그인 화면](http://localhost:3000/login)에서 합성 계정 카드를 선택합니다. 백엔드·DB·AI 키 없이 실행되며, `npm run dev`는 모의 모드를 명시적으로 선택합니다.

| 계정 | 역할 |
|---|---|
| `applicant`, `applicant2` | 신청자 |
| `infra` | ICT인프라 담당자 |
| `security` | 정보보안 담당자 |
| `admin` | 기관관리자 |

카드 로그인은 모의 모드 전용입니다. 모의 업무 데이터는 프로세스 메모리에 저장되며 재시작하면 초기화됩니다. 실제 AI 품질과 서버 생성 PDF는 실제 백엔드 연결 상태에서 확인해야 합니다. 통합 심사용 환경의 지정 계정은 통합 배포 README를 따릅니다.

## 실제 백엔드 연결

1. [.env.example](.env.example)을 `.env.local`로 복사합니다. 기존 파일이 있으면 필요한 값만 수정합니다.
2. 실행 중인 백엔드 주소를 설정합니다.

```dotenv
API_MODE=api
API_BASE_URL=http://localhost:8080
```

```bash
npm run dev:api
```

브라우저는 같은 출처의 `/api/*`를 호출하고 Next.js 서버가 백엔드로 중계합니다. 인증·신청·협의·문서·관리자 기능은 실제 API와 연결되어 있으며, API 실패를 모의 성공으로 바꾸지 않습니다. **AI 키는 프론트가 아닌 백엔드 환경변수에 설정**합니다.

| 환경변수 | 설명 |
|---|---|
| `API_MODE` | `mock` 또는 `api`; 개발 명령은 각 모드를 명시적으로 지정 |
| `API_BASE_URL` | 서버에서만 사용하는 백엔드 주소 |
| `INSTITUTION_NAME`, `INSTITUTION_CODE` | 모의 실행 시 기관 표시 설정 |
| `DEMO_ACCOUNT_PASSWORD` | 모의 아이디·비밀번호 로그인 사용 시 선택 설정 |

개발용 Docker 통합 도구는 [백엔드 연결 안내](docs/BACKEND_TEST_SERVER.md)를 참고하세요. 심사위원 설치에는 통합 배포 저장소를 권장합니다.

## 화면 안내

| 경로 | 기능 |
|---|---|
| `/requests`, `/requests/new` | 신청 검색·목록·새 사업 시작 |
| `/cases/[id]` | 사업 공통 인터뷰·자료 분석·답변 작성 |
| `/requests/[id]` | 담당자 협의·보완·변경 비교·최종 검토·제출 |
| `/todos`, `/notifications` | 처리할 일 카드·알림·읽음 처리 |
| `/documents`, `/history` | 서버 문서 미리보기·PDF·권한별 이력 |
| `/network`, `/policies`, `/supplements` | 망 구성·방화벽 적용 기록·보완 요청 |
| `/members`, `/settings` | 계정·담당자·질문 및 기한 정책 |
| `/knowledge`, `/insights`, `/models` | 지식·기관 정보·업무 지표·AI 모델 관리 |

역할에 따라 메뉴와 동작이 달라집니다. 신청자 본인과 배정된 담당자의 조회 범위 및 저장 권한은 서버에서도 검증합니다.

## 개발·검증

```bash
npm run check       # 형식·타입·린트·테스트·문서 기준 검사
npm run build       # 프로덕션 빌드
npm run start       # 빌드 결과 실행
```

형식 수정은 `npm run format`, 개별 검사는 `npm run typecheck`, `npm run lint`, `npm test`를 사용합니다. 명령 목록 자체가 검사 결과를 의미하지는 않습니다.

| 기술 | 구성 |
|---|---|
| UI | Next.js 16 · React 19 · TypeScript 5.9 |
| 상태·검증 | TanStack Query · Zod |
| 검사 | Vitest · Testing Library · ESLint · Prettier |
| 배포 | Node 24 다단계 Docker 빌드 · Next.js standalone |

정확한 의존성 버전은 [package.json](package.json)과 [package-lock.json](package-lock.json)에 고정되어 있습니다.

```text
app/          페이지와 서버 API 중계
features/     업무별 화면·상태·API 연결
components/   공통 UI
lib/          인증·권한·서버 중계 등 공통 기능
mocks/        개발용 합성 데이터와 모의 API
contract/     백엔드 OpenAPI 계약 사본
tests/        화면·권한·업무 흐름 검사
```

## 참고 문서

- [업무 명세](FUNCTIONAL_SPEC.md) · [개발 규칙](AGENTS.md) · [기여 안내](CONTRIBUTING.md)
- [API 계약](contract/README.md) · [프론트 구조 결정](docs/adr/0001-frontend-foundation.md)
- [통합 배포](https://github.com/team-khfc/Security-Advisor) · [백엔드 원본](https://github.com/team-khfc/Security-Advisor-Back)

개별 `docs/` 검증 기록은 해당 작성 시점의 결과입니다. 제출 버전의 소스 출처와 통합 검증은 통합 배포 저장소의 `RELEASE.md`와 `docs/JUDGE_VALIDATION.md`를 기준으로 확인하세요.
