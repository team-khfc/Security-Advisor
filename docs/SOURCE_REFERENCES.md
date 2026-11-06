# 기준 자료와 출처

확인일: 2026-11-07. 요구사항 원본 판본은 2026-11-06 제공본입니다. 이 저장소는 팀 개발을 시작할 실행 코드와 공개용 지침을 모읍니다. 원본 문서의 식별자는 [source-manifest.json](source-manifest.json)에 기록합니다. 원본 SHA-256은 **사용자 제공 파일의 식별자**이며, 실명·연락처·비공개 첨부 링크를 공개용으로 정리한 복사본과 바이트가 같다는 주장은 아닙니다.

## 프로젝트 원문

| 용도                   | 현재 기준 파일                                  | 기준 버전                |
| ---------------------- | ----------------------------------------------- | ------------------------ |
| 전체 맥락·확정 결정    | [PROJECT_CONTEXT](../claude/PROJECT_CONTEXT.md) | v1.9                     |
| 기능·도메인 불변식     | [FUNCTIONAL_SPEC](../claude/FUNCTIONAL_SPEC.md) | v1.2                     |
| 사람·AI 공통 개발 규칙 | [AGENTS](../AGENTS.md)                          | v1.5                     |
| 팀·범위·일정·제출      | [PROJECT_RULES](../claude/PROJECT_RULES.md)     | v1.4                     |
| Google 기반 코드 규칙  | [CODING_STYLE](../CODING_STYLE.md)              | 제공본 식별자는 manifest |
| KISA 기반 보안 규칙    | [SECURE_CODING](../claude/SECURE_CODING.md)     | 제공본 식별자는 manifest |
| 협업·API·수용 기준     | [CONTRIBUTING](../CONTRIBUTING.md)              | v0.6                     |
| 화면·KRDS·접근성       | [design.md](../design.md)                       | **v3.1**                 |

PROJECT_CONTEXT v1.9의 문서 지도에 남아 있는 design v3.0 참조는 원문을 보존합니다. 실제 최신 제공 디자인 규칙은 루트 `design.md` v3.1이며 이번 구현은 이를 사용합니다. 디자인의 업무 의미는 FUNCTIONAL_SPEC, 시각 표현·컴포넌트 계약은 design.md를 따릅니다.

루트의 PROJECT_CONTEXT·FUNCTIONAL_SPEC·PROJECT_RULES·SECURE_CODING 파일은 `claude/`의 기준 파일로 연결하는 안내입니다. 요약과 원문이 다르면 원문을 확인합니다. 상세 구현 가정은 ADR과 CONTRACT에 기록하며 이를 원문 확정 결정으로 위장하지 않습니다.

## 디자인·코드 출발점

**현재 화면 기준은 사용자가 정정하여 지정한 [prototype-soo 신청 현황](https://team-khfc.github.io/prototype-soo/requests.html)입니다.** [원본 커밋 8cba7444d66fae5d245df150348ad6ce034413a4](https://github.com/team-khfc/prototype-soo/tree/8cba7444d66fae5d245df150348ad6ce034413a4)의 HTML·CSS·로고를 대조했습니다. 업무 동작·권한·데이터·접근성 수치는 현재 기능 명세와 design.md v3.1을 유지합니다. 아래 `prototype` 커밋은 최초 개발 입력의 출처이며 현재 화면 대조 기준과 구분합니다.

- 개발·디자인 시작점: [team-khfc/prototype](https://github.com/team-khfc/prototype).
- 이번 입력 스냅샷: [커밋 3900181bc85440780b199266a75f1b789f76f2d0](https://github.com/team-khfc/prototype/tree/3900181bc85440780b199266a75f1b789f76f2d0).
- 원본 디렉터리: `보안길잡이 디자인시안 프로토타입/`. 원본은 위 커밋에서 조회하며 실행 저장소에 정적 패키지 전체를 다시 배포하지 않습니다.
- `design.md` 자체에는 이전 디자인 기준 커밋 `07c2b59`가 기재되어 있습니다. 제공 문서의 이 참조와 이번에 취득한 저장소 전체 스냅샷 `3900181`을 구별합니다.
- 실행 애플리케이션은 이전 시제품 기반을 독립 복사하여 최신 지침·4단계 절차·브랜드·디자인으로 정합화한 것입니다. 이전 시제품의 검사 결과를 이번 버전의 통과 증거로 재사용하지 않습니다.
- 개발 결과 저장소: [team-khfc/Security-Advisor](https://github.com/team-khfc/Security-Advisor). 공식 대회 제출 공공GitLab과 구별합니다.

화면 매핑은 [DESIGN_MAPPING](DESIGN_MAPPING.md), 자산·라이선스는 [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES.md)를 참조합니다. 원본 정적 페이지의 브라우저 상태·CDN·예시 파일은 현재 Next.js/API의 기능 증거가 아닙니다.

## 구현에서 사용하는 공개 참고 자료

`PublicKnowledgeRetriever`에 저장하는 것은 아래 공식 공개 페이지의 짧은 편집 요약입니다. 첨부 문서 전체나 기관 비공개 자료를 수집한 색인이 아닙니다.

- [KISA 소프트웨어 개발 보안 가이드 공식 게시물](https://www.kisa.kr/2060204/form?lang_type=KO&page=1&postSeq=5): 자료명·첨부파일 안내 요약.
- [NIST SP 800-41 Rev.1 공식 페이지](https://csrc.nist.gov/pubs/sp/800/41/r1/final): 방화벽·정책 개요 요약.

## CI 의존성 출처

2026-11-06 공식 릴리스에서 확인한 commit SHA를 workflow에 고정했습니다. 이 조회는 로컬 또는 GitHub CI를 실제 실행했다는 뜻이 아닙니다.

| Action          | 릴리스                                                                   | 고정 commit                                |
| --------------- | ------------------------------------------------------------------------ | ------------------------------------------ |
| checkout        | [v7.0.1](https://github.com/actions/checkout/releases/tag/v7.0.1)        | `3d3c42e5aac5ba805825da76410c181273ba90b1` |
| setup-node      | [v7.1.0](https://github.com/actions/setup-node/releases/tag/v7.1.0)      | `949feb2413d6458794dcd2491c4babbbce0c15c1` |
| setup-java      | [v6.2.0](https://github.com/actions/setup-java/releases/tag/v6.2.0)      | `77dd5b2ce225ea11469928ac317850245a74ae78` |
| upload-artifact | [v7.0.2](https://github.com/actions/upload-artifact/releases/tag/v7.0.2) | `cf430e030ddbb5b0abf93d22962f4752f3646cd9` |

키·계정·참가자 연락처가 포함될 수 있는 원본 대회 첨부물은 이 공개 저장소에 복제하지 않습니다. 대회 제출·모델 권장과 팀 자체 완료 조건은 PROJECT_RULES·TEAM_START에서 구분합니다.
