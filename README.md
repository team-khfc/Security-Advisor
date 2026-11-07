# 보안길잡이 AI

공공기관 현업 담당자가 AI와 대화하며 방화벽 신청서를 작성하고, ICT인프라·정보보안 담당자가 함께 검토하는 서비스의 프론트엔드입니다. 화면마다 파일을 나눠 여러 디자이너가 동시에 작업할 수 있게 구성했습니다.

> **이 저장소의 용도:** 디자인 담당 전용 작업 저장소입니다. 팀 저장소(`team-khfc/prototype`의 `보안길잡이 디자인시안 프로토타입/`)에 병합하기 전에 팀장·팀원이 화면과 변경 내용을 확인하는 곳입니다.
>
> - 바로 보기: https://team-khfc.github.io/prototype-soo/ (GitHub Pages를 켠 경우)
> - 출발점: 팀 저장소 `team-khfc/prototype` 커밋 `3900181` (2026-11-06)
> - 팀 저장소와 달라진 점: [`MERGE_NOTES.md`](MERGE_NOTES.md)
> - 디자인 규칙: [`docs/design.md`](docs/design.md) (디자인 담당 관리)

## 실행

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

KRDS 기반 디자인 규칙은 `docs/design.md`를 따릅니다. 새 신청 문서 분석 시험용 기획서는 `samples/`에 있습니다.

## 외부 라이브러리

문서 분석과 양식 자동 인식은 cdnjs에서 JSZip, SheetJS, pdf.js를 필요할 때 불러옵니다. 인터넷 연결이 필요하며, 문서 내용은 서버로 보내지 않고 브라우저 안에서만 읽습니다.

---

Copyright © 2026 Team HF. All rights reserved.
