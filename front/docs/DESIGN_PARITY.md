# 디자인 시안 반영 기록

기록일: 2026-11-07. 이 문서는 새 프론트 구현의 디자인 기준과 의도적인 차이를 설명한다. 기능·디자인 규칙 원본을 개정하거나 접근성 인증을 대신하지 않는다.

## 참조 기준

| 구분 | 참조한 원본 |
| --- | --- |
| 최신 디자인 시안 | [`team-khfc/prototype-soo` 커밋 `1af32fb424ea79a1a4ce60484a83f9d1935fef25`](https://github.com/team-khfc/prototype-soo/tree/1af32fb424ea79a1a4ce60484a83f9d1935fef25) |
| 디자인 변경 사항 | 같은 커밋의 [`MERGE_NOTES.md`](https://github.com/team-khfc/prototype-soo/blob/1af32fb424ea79a1a4ce60484a83f9d1935fef25/MERGE_NOTES.md) |
| 시각 규칙 | [루트 `design.md`](../design.md) v3.1, 2026-11-06 / [시안에 포함된 원본](https://github.com/team-khfc/prototype-soo/blob/1af32fb424ea79a1a4ce60484a83f9d1935fef25/docs/design.md) |
| 업무 의미와 권한 | [FUNCTIONAL_SPEC.md](../FUNCTIONAL_SPEC.md) v1.11 및 [PROJECT_CONTEXT.md](../PROJECT_CONTEXT.md) 기준 버전 표 |

작업 시작 시 제공된 `design.md`와 시안의 `docs/design.md`는 바이트 단위로 같았다. SHA-256은 `5dbc2fbb05decc7e9a98523b3f103e2b21d78d6191bbe6826fcce678afc802c1`이다. 시안 저장소는 읽기 전용 참조로 사용했으며, 구현은 이 Front 저장소에 새로 작성했다.

업무 의미는 FUNCTIONAL_SPEC, 시각 규칙은 design.md, 개별 화면 구성은 최신 시안 순서로 판단한다. 이후 화면을 수정할 때에는 시안 기본 브랜치와 MERGE_NOTES를 다시 확인하고 새 참조 커밋을 작업 기록에 남긴다. 이 기록의 커밋을 앞으로도 고정해서 쓰라는 의미는 아니다.

## 화면 대응

| 시안 화면 | 새 프론트 경로·구현 | 반영 내용 |
| --- | --- | --- |
| 공통 셸 `partials/shell.html` | [ServiceShell](../components/ServiceShell.tsx) | 서비스 로고, 운영 기관 표시, 통합 검색, 역할별 사이드바, 글자 크기 조절, 접기·모바일 메뉴, 도움말 |
| `requests.html` | `/requests` · [RequestList](../features/request/RequestList.tsx) | 한 줄 요약 카드 4개, 상태·기간·검색 필터, 역할별 5열 목록, 상태 아래 할 일, 신청자용 담당자 현황, 5건 단위 페이지 이동 |
| `new-request.html` | `/requests/new` · [NewRequest](../features/request/NewRequest.tsx) | 넓은 파일 선택 영역, 선택 파일 표시, 파일 없이 시작하기. 사업명·부서·신청 서류 선택은 최신 업무 모델에 맞게 추가 |
| 새 신청의 인터뷰 작업 영역 | `/cases/[id]` · [CaseInterview](../features/request/CaseInterview.tsx) | 인터뷰·분석 입력과 수집 정보의 분리, 출처·확인 상태, 같은 사업에서 만든 신청 연결 |
| `request-detail.html`, `submitted.html` | `/requests/[id]` · [RequestDetail](../features/request/RequestDetail.tsx) | 4단계 표시, 사업·통신·서류 정보, 보완 요청, 제출본, 처리 이력, 우측 담당자 협의·업무 패널. 제출 뒤에도 같은 자원 경로 사용 |
| `supplements.html` | `/supplements` · [SupplementList](../features/request/SupportingPages.tsx) | 열린 보완 요청과 확인한 요청 구분, 신청 상세의 답변 영역으로 연결 |
| `documents.html` | `/documents` · [DocumentList](../features/document/DocumentList.tsx) | 서류별 목록, 초안·제출본 구분, 텍스트 미리보기, 명시적인 JSON 내려받기 |
| `history.html` | `/history` · [AuditList](../features/audit/AuditList.tsx) | 읽기 전용 이력, 업무 종류·검색 필터, 대상 신청 링크, 행위자·시간·사유 표시 |
| `network.html` | `/network` · [NetworkList](../features/request/SupportingPages.tsx) | 등록된 통신 값과 자원 할당 상태를 표로 조회하고 신청 상세로 연결 |
| `settings.html` | `/settings` · [ConfigurationPage](../features/configuration/ConfigurationPage.tsx) | 탭 구조를 사용한 기준 정보 안내. 편집·게시 버튼을 실제 기능처럼 제공하지 않음 |
| `policies.html`, 알림 팝업 | `/policies`, 헤더 알림 | P2 구현 예정 안내. 정책 적용·회수·만료 및 알림 전송 기능 없음 |
| 별도 인증·계정 관리 | `/login`, `/signup`, `/members` | 현재 인증 경계와 관리자 계정 관리에 필요한 신규 화면. 시안 셸과 같은 색·타이포그래피·공통 부품 사용 |

## 유지한 시각 체계

[tokens.css](../styles/tokens.css), [base.css](../styles/base.css), [components.css](../styles/components.css)와 화면별 CSS는 해당 시안의 스타일을 출발점으로 삼았다. React 상태와 접근 가능한 요소에 필요한 보정은 [globals.css](../styles/globals.css), 신규 화면 스타일은 [application.css](../styles/application.css)에 둔다.

| 요소 | 구현 기준 |
| --- | --- |
| 색 | 배경 `#F4F5F6`, 흰색 표면, 테두리 `#CDD1D5`, 주색 `#256EF4`, 본문 `#1E2124`, 보조 글자 `#464C53` |
| 셸 | 데스크톱 사이드바 `24rem`, 남은 폭을 본문에 배분, 헤더·본문·푸터의 최대 폭 1920px |
| 타이포그래피 | 본문 17px, 제목 32px, 섹션 제목 24px. Pretendard GOV 정적 글꼴을 로컬 자산으로 제공 |
| 컨트롤 | 기본 버튼·입력 높이 `4.8rem`; 작은 버튼의 터치 환경 최소 높이 44px; 포커스 윤곽선 |
| 목록 | 행당 실제 링크, 키보드 초점, 신청번호·사업명·접수일, 단계와 상태 분리, 처리 기한과 지남 상태의 글자 설명 |
| 반응형 | 1279px·1023px·767px 경계에 맞춰 상세·인터뷰·셸 배치 조정. 긴 표는 표 영역 안에서 가로 스크롤 |
| 자산 | 시안 로고와 로컬 KRDS/Pretendard GOV 자산 사용. 외부 글꼴·아이콘 CDN에 실행 의존하지 않음 |

시안에는 루트 글자 크기 `56.25%`와 본문의 `zoom: .9`가 함께 있어 본문의 실효 크기가 약 13.8px이다. MERGE_NOTES는 이 배율을 유지한다고 적지만, design.md v3.1 본문 규칙과 부록 A-1은 17px로 고치도록 정한다. 이번 구현은 **루트 62.5%와 본문 `1.7rem`을 사용하고 `zoom`을 제거**했다. 작업 영역 높이의 배율 보정도 함께 제거했다. 따라서 배치·색·구성은 시안을 따르지만 한 화면에 들어가는 행 수와 물리적인 크기까지 일치한다고 주장하지 않는다.

## 업무 규칙에 따른 의도적인 차이

| 시안의 표시 또는 시연 동작 | 이번 구현 | 근거·의미 |
| --- | --- | --- |
| 3단계 `제출 준비`, 완료 시 `처리 완료/처리 불가` | `최종 검토 중`, `제출됨`, `확정`, `종결(반려)`, `철회`를 명시 | FUNCTIONAL_SPEC 상태와 단계 구분을 우선. 서류 확정이 실제 방화벽 적용을 뜻하지 않음 |
| 사업과 신청이 하나처럼 보이는 흐름 | BusinessCase 1 : N SecurityRequest, 서류 2종 복수 선택 | 공통 정보는 CASE에서 한 번 수집하고 각 신청의 상태·반환·제출은 독립 |
| 역할별 고정 담당자와 브라우저 역할 전환 | 서버 세션의 계정과 실제 배정 결과 표시 | 담당자 배정·본인 신청 검토 금지·서버 권한 검사. 합성 계정 진입은 모의 로그인 화면에서만 제공 |
| 확인 상태의 일부를 단계·협의 완료로 추정 | 값마다 출처·근거·사람의 확인 기록 확인 | AI 제안은 단계가 진행되거나 초안이 생성되어도 자동으로 확정되지 않음 |
| 협의·제출 버튼의 시연 상태 변경 | INFRA 할당과 협의 완료를 별도 처리, 양 분야 협의 후 사용자 제출 | 배정된 담당자만 행위 가능. INFRA 선행 조건은 모의 API의 도메인 규칙에서도 검사 |
| 단순 완료 처리 | 제출본에 대해 INFRA 최종 확인 → SECURITY 최종 확인 → SECURITY 확정 | 초안·설정 게시본·제출본을 구분하고 제출 당시 값을 보존 |
| 임시 화면 되돌림·삭제 | 허용된 차수 반환, 종결, 철회와 필수 사유 | 기존 값·감사 이력 보존. 반환 항목만 강조하고 보완·재확인 필요 상태 표시 |
| 브라우저 안 문서 생성·AI 버튼·CDN 파서 | 합성 분석 예제와 JSON 미리보기 | 정식 LLM, 문서 파싱, HWP·PDF 생성 결과처럼 표현하지 않음 |
| 기관 설정의 순서·게시 조작, 정책·알림 시연 | INFRA 선행 고정 기준 안내, 나머지는 구현 예정 | P1 범위와 P2 착수 조건에 맞춤 |

상태명·배율처럼 원본 문서와 차이가 있는 항목은 이 문서와 PR에서 검토 대상으로 남긴다. 디자인 저장소를 수정하거나, 디자인 담당의 합의가 있었다고 가정하지 않는다.

## 접근성과 검증 범위

실제 링크·폼 라벨·표 제목, 현재 메뉴 및 단계 표시, 네이티브 `dialog`, 키보드 검색·탭 조작, 숨은 설명과 포커스 스타일을 구현했다. 원본의 `innerHTML`, 브라우저 업무 데이터 저장소, 외부 CDN 스크립트를 런타임으로 가져오지 않았다.

이는 코드에 적용한 설계 사항이다. 모든 화면·역할·배율의 시각 일치, 실제 화면 낭독기 사용성, KRDS 접근성 준수 여부가 검증되었다는 뜻은 아니다. 실행한 검증의 결과는 해당 PR에 남기고, 남은 범위는 [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md)를 따른다.
