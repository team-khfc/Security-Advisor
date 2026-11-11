# 심사용 통합 릴리스 · 2026-11-11

`back/`, `front/`는 아래 검증된 개발 저장소의 Git 추적 파일 스냅샷이다. 서브모듈이나 별도 저장소 다운로드가 필요 없다. `.env`, 빌드 산출물, 개발자 DB, 기존 Docker 자격증명을 복사하지 않았다.

| 경로 | 원본 | 릴리스 태그 | 커밋 |
|---|---|---|---|
| back/ | team-khfc/Security-Advisor-Back | v1.0.3-demo.20261111 | db6c2f1dc2c9d68cfb73783d7de1d14a5995842f |
| front/ | team-khfc/Security-Advisor-Front | v1.0.3-demo.20261111 | b7db949db64081b5c45bb0387d7886427601afc7 |

원본 PR: [백엔드 #31](https://github.com/team-khfc/Security-Advisor-Back/pull/31), [프론트 #79](https://github.com/team-khfc/Security-Advisor-Front/pull/79), [프론트 #80](https://github.com/team-khfc/Security-Advisor-Front/pull/80). 위 PR들은 주요 기능의 개발 이력이다. 현재 스냅샷의 정확한 기준은 위 표의 태그·커밋이며, 이후 보안 검사 대응 변경도 포함한다.

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

GPT 협의 요약의 근거 식별자 매핑 수정: [백엔드 #33](https://github.com/team-khfc/Security-Advisor-Back/pull/33). API와 저장 형식은 유지하고 실제 GPT 2회 검증을 통과했다.

공공 GitLab 제출 검사 대응: SMTP의 TLS 및 인증서 검증 강제, minimatch 11.0.1 보안 수정, 비밀값이 아닌 테스트 예제 명확화. 스냅샷 해시는 path/sha256 필드로 구분하며 전체 무결성 검증을 유지한다.

## 공공 GitLab 개발 원본

- [Front](https://gitlab.aigov.go.kr/pocketmun1216/securityadvisor-front) · [Back](https://gitlab.aigov.go.kr/pocketmun1216/securityadvisor-back)
- 위 표의 `v1.0.3-demo.20261111` 태그는 공공 GitLab에도 동일한 커밋으로 이관했다. 보안 수정의 GitHub PR은 Front #81, Back #34이며 CI 통과 커밋을 배포본에 포함했다. GitHub main 병합 여부와 배포본 포함 여부는 구분한다.
- 공공 GitLab main에는 이관용 README 변경이 추가되어 있으므로 main과 스냅샷의 커밋이 다를 수 있다. 배포본 재현에는 표의 태그·커밋을 사용한다.
- 개발·스냅샷 교체·통합 검증·기존 설치 업데이트는 [README 유지보수 안내](README.md#개발부터-통합-배포까지)를 따른다.
