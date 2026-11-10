# SecurityAdvisor — 완성본·배포 저장소

이 저장소는 Back·Front 릴리스 스냅샷과 전체 실행 구성을 모으는 **SecurityAdvisor 완성본·배포·공공GitLab 제출 저장소**입니다. 저장소 역할과 릴리스 절차는 [AGENTS.md](AGENTS.md) 0장과 [CONTRIBUTING.md](CONTRIBUTING.md) 2장을 따릅니다.

## 현재 상태

2026-11-10 문서 동기화 기준으로 애플리케이션 파일은 정적 디자인 시안입니다. `back/`·`front/` 릴리스 스냅샷, 전체 실행용 `compose.yaml`, `RELEASE.md`는 아직 구성되지 않았습니다. 아래 실행 명령으로 확인할 수 있는 범위는 브라우저 저장소를 사용하는 정적 시안입니다. 실제 Back·Front 통합 실행본의 빌드·구동·smoke 검증은 후속 작업으로 남아 있습니다.

## 작업 전 참조 문서

1. [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md): 기준 버전 표·확정 결정·미결 사항·제출 체크리스트
2. [FUNCTIONAL_SPEC.md](FUNCTIONAL_SPEC.md): 업무 규칙·도메인·불변식·상태·스키마
3. [AGENTS.md](AGENTS.md): 저장소 역할·개발 실행 규칙·디자인 시안 운영·AI 에이전트 규칙
4. [PROJECT_RULES.md](PROJECT_RULES.md): 범위·일정·의사결정·문서 개정 절차
5. [CONTRIBUTING.md](CONTRIBUTING.md): 협업·릴리스 절차·데이터 계약·수용 기준
6. [CODING_STYLE.md](CODING_STYLE.md)와 [SECURE_CODING.md](SECURE_CODING.md): 코드 작성·보안 기준
7. [design.md](design.md): KRDS·화면·접근성 기준
8. [claude/INSTRUCTIONS.md](claude/INSTRUCTIONS.md): 프로젝트 요약 지침

공개 규칙 사본의 비식별 변환 범위와 원본·공개본 해시는 [docs/SOURCE_PROVENANCE.md](docs/SOURCE_PROVENANCE.md)에 기록합니다. 버전 확인 방법은 [AGENTS.md](AGENTS.md) 9장을 따릅니다.

### 문서 검사

```bash
python3 tools/check_doc_versions.py
```

이 명령은 기준 버전·문서 경로·공개본 출처를 점검합니다. 애플리케이션 빌드와 통합 구동의 검사 결과는 해당 변경의 검증 기록으로 관리합니다.

## 개발과 디자인의 참조 위치

| 영역 | 저장소·문서 |
| --- | --- |
| 서버·DB 개발과 API 계약 | [Security-Advisor-Back](https://github.com/team-khfc/Security-Advisor-Back) |
| 화면 개발 | [Security-Advisor-Front](https://github.com/team-khfc/Security-Advisor-Front) |
| 디자인 시안 원본 | [prototype-soo](https://github.com/team-khfc/prototype-soo) · [미리보기](https://team-khfc.github.io/prototype-soo/) |
| 디자인 규칙 원본 | [prototype-soo/docs/design.md](https://github.com/team-khfc/prototype-soo/blob/main/docs/design.md) |
| 현재 보관된 정적 시안의 과거 변경 기록 | [MERGE_NOTES.md](MERGE_NOTES.md) |

기능 개발은 Back·Front에서 진행하고, 이 저장소의 스냅샷 갱신은 [CONTRIBUTING.md](CONTRIBUTING.md) 2장의 릴리스 절차를 따릅니다.

## 정적 시안 실행

빌드 없이 바로 열 수 있습니다. 화면 사이 데이터를 브라우저 저장소에 보관하므로 로컬 서버로 여는 것을 권장합니다.

```bash
python -m http.server 8000
# 브라우저에서 http://localhost:8000/ 열기
```

GitHub Pages에 그대로 올리면 `index.html`이 신청 현황으로 연결됩니다.

## 화면과 파일

한 화면을 고칠 때는 아래 표의 세 파일만 보면 됩니다.

| 화면 | 페이지 | 화면 코드 (마크업·동작) | 화면 전용 스타일 |
| --- | --- | --- | --- |
| 신청 현황 / 협의 요청함 | `requests.html` | `assets/js/screens/requests.js` | `assets/css/screens/requests.css` |
| 새 신청 (문서 분석·대화) | `new-request.html` | `assets/js/screens/new-request.js` | `assets/css/screens/new-request.css` |
| 신청 상세 · 담당자 검토 | `request-detail.html?id=…` | `assets/js/screens/request-detail.js` | `assets/css/screens/request-detail.css` |
| 제출 완료 | `submitted.html?id=…` | `assets/js/screens/submitted.js` | (공통 스타일만 사용) |
| 보완 요청 | `supplements.html` | `assets/js/screens/supplements.js` | (공통) |
| 문서함 | `documents.html` | `assets/js/screens/documents.js` | (공통) |
| 통신 정보 | `network.html` | `assets/js/screens/network.js` | (공통) |
| 검토·처리 이력 | `history.html` | `assets/js/screens/history.js` | (공통) |
| 정책 수명주기 | `policies.html` | `assets/js/screens/policies.js` | (공통) |
| 기관 설정 | `settings.html` | `assets/js/screens/settings.js` | `assets/css/screens/settings.css` |

예: 신청 단계 담당 디자이너는 `new-request.*`, 검토 화면 담당 디자이너는 `request-detail.*`만 수정하면 서로 겹치지 않습니다.

## 공통 영역

여러 화면이 함께 쓰는 부분입니다. 고치기 전에 팀에 알리고, 한 사람이 맡아 반영하는 것을 권장합니다.

| 파일 | 내용 |
| --- | --- |
| `assets/css/tokens.css` | 색, 단계 색, 둥글기 등 디자인 토큰 (라이트·다크 모드) |
| `assets/css/base.css` | 머리글, 메뉴, 바닥글, 버튼, 배지, 입력, 알림, 표, 대화상자 |
| `assets/css/components.css` | 요약 카드, 필터·검색, 페이지 번호, 문서 카드, 데이터 흐름도, 보완 요청 카드 |
| `assets/js/core.js` | 데이터, 상태, 머리글·메뉴, 알림, 통합 검색, 사용자 전환, 대화상자, 저장 |
| `assets/js/components.js` | 문서 카드·미리보기, 보완 요청 카드, 데이터 흐름도, 작성 중 삭제 |
| `assets/js/boot.js` | 저장된 데이터 복원 후 현재 페이지 그리기 (항상 마지막에 불러옴) |
| `partials/shell.html` | 모든 페이지의 머리글·메뉴·바닥글 원본 |

### 머리글·메뉴·바닥글 수정

각 페이지의 `<!-- shell:start -->` ~ `<!-- shell:end -->` 사이는 직접 고치지 않습니다. `partials/shell.html`을 고친 뒤 아래를 실행하면 모든 페이지에 반영됩니다.

```bash
python tools/sync-shell.py
```

## 화면 코드 구조

각 화면 파일은 다음 두 가지를 등록합니다.

```js
VIEWS.dash = renderDash;              // 이 화면을 그리는 함수 (#main 안에 HTML을 넣음)
ACT['search'] = (버튼, 신청, 이벤트) => { ... };   // data-act="search" 버튼을 눌렀을 때 동작
```

- 마크업은 각 화면의 `render…()` 함수 안 템플릿 문자열에 있습니다.
- 버튼에 `data-act="이름"`을 달고 같은 이름으로 `ACT['이름']`을 등록하면 동작이 연결됩니다. `data-id`에 신청번호를 넣으면 두 번째 인자로 해당 신청이 들어옵니다.
- 화면 사이 이동은 일반 링크(`requests.html`, `request-detail.html?id=SF-2026-012`)나 `go('requests')`를 씁니다.

## 데이터

- 시연 데이터는 `core.js`의 `projects`, `policies`에 들어 있습니다.
- 작업 내용은 브라우저 저장소(localStorage)에 보관되어 페이지를 옮겨도 유지됩니다.
- 처음 상태로 돌리려면 왼쪽 메뉴의 **이용 안내 > 저장된 데이터 초기화**를 누릅니다.
- 오른쪽 위 사용자 이름을 눌러 신청자, ICT인프라, 정보보안, 기관 관리자 화면을 바꿔 볼 수 있습니다.

## 디자인 기준

KRDS 기반 디자인 규칙은 [design.md](design.md)를 따릅니다. 현재 디자인 시안 원본과의 차이를 확인할 때는 위의 prototype-soo 링크를 사용합니다. 문서 분석 시연에는 합성 자료를 사용합니다.

## 외부 라이브러리

문서 분석과 양식 자동 인식은 cdnjs에서 JSZip, SheetJS, pdf.js를 필요할 때 불러옵니다. 인터넷 연결이 필요하며, 문서 내용은 서버로 보내지 않고 브라우저 안에서만 읽습니다.

---

Copyright © 2026 Team HF. All rights reserved.
