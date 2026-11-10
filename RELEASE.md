# 심사용 통합 릴리스 · 2026-11-11

`back/`, `front/`는 아래 검증된 개발 저장소의 Git 추적 파일 스냅샷이다. 서브모듈이나 별도 저장소 다운로드가 필요 없다. `.env`, 빌드 산출물, 개발자 DB, 기존 Docker 자격증명을 복사하지 않았다.

| 경로 | 원본 | 릴리스 태그 | 커밋 |
|---|---|---|---|
| back/ | team-khfc/Security-Advisor-Back | v1.0.1-demo.20261111 | 16ae480a344940b00f023f11d3d8d39dba42efe6 |
| front/ | team-khfc/Security-Advisor-Front | v1.0.0-demo.20261111 | 8bc1470f98db896752fd24e54b7a57ad5ab0a9eb |

원본 PR: [백엔드 #31](https://github.com/team-khfc/Security-Advisor-Back/pull/31), [프론트 #79](https://github.com/team-khfc/Security-Advisor-Front/pull/79), [프론트 #80](https://github.com/team-khfc/Security-Advisor-Front/pull/80). 각 PR의 GitHub 검사를 통과한 뒤 main에 반영한 버전이다.

## 스냅샷 처리

- 애플리케이션 소스는 수정하지 않고 원본 커밋에서 복사했다.
- 개발용 `.github/` 워크플로는 제외하고, 통합 저장소의 `Judge installation` 검사로 교체했다.
- 팀 공통 규칙 9종은 루트에 한 번만 두고 `back/`, `front/` 내부의 사본은 제외했다.
- `.env.example`의 값은 공개 로컬 시연 기본값이며 실제 API 키는 없다.
- `snapshots.json`은 파일별 SHA-256을 보존한다. `python3 scripts/verify-snapshots.py`로 검증한다. 배치 파일은 원본 `.gitattributes`의 CRLF 체크아웃을 고려해 LF로 정규화한다.
- 기존 정적 HTML 시안은 보존했다. 이전 README와 디자인 문서는 `docs/LEGACY_PROTOTYPE_*`로 구분한다.

## 이 릴리스에 추가한 배포 구성

- Docker Compose로 PostgreSQL·백엔드·프론트와 1회 시연 초기화 실행
- 사용자 지정 5개 계정, 기본 담당자 등록, 기존 설치용 계정 비활성화
- 정상 API를 사용하는 14개 사업·15개 신청·5개 제출본 및 PDF 시나리오
- 문서용 IP·합성 계획서, 협의 기준본·변경/확인·보완·반환·확정·방화벽 기록
- 재실행 시 기존 데이터 보존, 중간 실패 시 중복 생성 방지
- 설치·테스트·촬영·실제 AI 연결 안내와 자동 통합 검사

검증 범위와 결과: [JUDGE_VALIDATION.md](docs/JUDGE_VALIDATION.md).

협의 요약 출력 중단·근거 오류 구분 수정: [백엔드 #32](https://github.com/team-khfc/Security-Advisor-Back/pull/32). 문서 전용 모델은 8192토큰·우선순위 4로 초기화하며 기존 설치는 관리자 설정으로 변경한다.
