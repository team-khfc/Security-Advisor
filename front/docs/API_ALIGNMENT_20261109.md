# API 정합성 수정 검증 — 2026-11-09

## 반영 내용

- 실제 DTO용 Zod 스키마와 화면 어댑터 분리, 숫자 ID 및 확장 서류 코드 지원.
- 게시본 질문 조인, 답변별 revision 및 needsReview 유지, AI 출처를 보존하는 별도 확인 요청.
- 신청 하위 자원 useQueries 조회와 제출본 snapshot 표시.
- 사업 답변 PATCH /answers, 사업 개요 PUT, 협의·보완·반환·배정·최종 확인 본문 변환.
- 제출 Idempotency-Key 헤더와 실제 Back이 요구하는 expectedRevision 본문.
- 업로드 → 분석 작업 생성 → 상태 폴링 → 제안 적용. HWP 변환 안내와 TXT 허용.
- 세션 부서·만료시각, 갱신 응답, username 기반 회원 관리 및 activation 경로.
- 신청별 감사 이력과 actorUsername 대응.
- 모의 서버의 HTTP DTO 직렬화, 새 경로와 요청 본문 지원. 확정된 사업 개요는 AI 제안으로 덮어쓰지 않고 warnings 반환.

## 검증 결과

- npm run format:check: 통과.
- npm run typecheck: 통과.
- npm run lint: 통과(경고 0).
- npm test: 11개 파일, 101개 테스트 통과.
- tools/check_doc_versions.py: 문서 9종 버전·단일 경로·공개본 해시·연락처 형식 검사 통과. Windows Store 별칭 대신 설치된 Python 3.14 실행 파일로 실행.
- git diff --check: 통과.
- 실제 계약에 맞춰 기존 HTTP 테스트의 요청 경로·응답 파싱을 갱신하고, 별도 계약 테스트와 확정값 보존 회귀 테스트를 추가했다.
- 프로덕션 빌드와 실제 Back 연동은 아래 환경 제한 때문에 완료되지 않았다.

## 실제 Back 연동 및 빌드 제한

- Docker CLI에서 dockerDesktopLinuxEngine named pipe 접근이 permission denied로 실패했다. 실제 Back의 로그인 → 사업 생성 → 신청 생성 → 답변 저장 → 협의 → 멱등 제출 흐름은 실행하지 못했다. 모의 테스트 통과를 실제 Back 검증으로 간주하지 않는다.
- Next 프로덕션 빌드는 컴파일·TypeScript·정적 페이지 생성 이후 standalone 파일 복사 단계에서 Windows EPERM mkdir 오류로 종료되었다. 완성된 배포 빌드로 보고하지 않는다.
- 요청서와 실제 Back의 차이는 contract/README.md에 근거와 함께 기록했다. 외부 PR·이슈 생성 및 push는 수행하지 않았다.
- 기존 node_modules를 사용했고 의존성·CI·compose·규칙 문서는 변경하지 않았다.
