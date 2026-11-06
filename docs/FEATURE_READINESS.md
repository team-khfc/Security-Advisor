# 기능 준비 현황

기준: 2026-11-06 팀 개발 시작 버전. **IMPLEMENTED는 코드가 있다는 뜻**이며 실행 통과 여부는 [VERIFICATION](VERIFICATION.md)의 해당 증거로 확인합니다. MOCK과 LIVE_UNVERIFIED를 완료로 합산하지 않습니다.

| 상태 | 의미 |
|---|---|
| IMPLEMENTED | 실행 앱·서버·저장 경로가 구현됨 |
| MOCK | 외부 시스템 대신 명시적인 합성 동작을 사용 |
| LIVE_UNVERIFIED | 외부 연결 코드는 있으나 실제 공급자·모델·환경 검증 없음 |
| PARTIAL | 명세 중 제한된 범위만 구현 |
| NOT_IMPLEMENTED | 해당 기능의 구현 없음 |

| 기능 | 상태 | 현재 범위·남은 일 |
|---|---|---|
| 역할 4종 로그인·세션·CSRF | IMPLEMENTED | 합성 계정, 서버 권한·기관·작성자 검사; 운영 SSO 별도 |
| 방화벽·보안성검토 신청 | IMPLEMENTED | 두 종류의 필드와 같은 4단계 업무 |
| 출처 4종·사람 확인 | IMPLEMENTED | 근거와 확인 주체 분리, 미확정 제출 차단 |
| INFRA 자원 할당 선행 | IMPLEMENTED | 할당과 분야 협의 구분, SECURITY 선행 조건 검사 |
| 추가 보완 질문·답변·해소 | IMPLEMENTED | 요청 분야가 해소, 답변만으로 완료하지 않음 |
| 2→1·3→2·3→1·4→3 반환 | IMPLEMENTED | 사유·항목 필수, 값·제출본 보존, 영향 확인 무효화 |
| 종결(반려)·철회 | IMPLEMENTED | 사유·이력 보존, 종료 뒤 변경 차단 |
| 최종 AI 초안의 사람 확인 | IMPLEMENTED + MOCK | 업무 게이트와 기록 구현, 기본 내용은 EXAMPLE |
| 두 분야 최종 검토·서류 확정 | IMPLEMENTED | 실제 방화벽 장비 적용은 범위 밖 |
| 불변 제출 차수·멱등성 | IMPLEMENTED | 이전 HTML 보존·재제출 새 차수·중복 제출 처리 |
| 기관 정책 초안·게시·이력 | IMPLEMENTED | 새 신청만 새 게시 버전 적용, INFRA_FIRST 고정 |
| 기관별 모델 설정·변경 이력 | IMPLEMENTED | 용도별 DB 설정, 키는 환경변수 참조·URL 허용 목록 |
| 자료 분석·담당자 AI 질의 | IMPLEMENTED + MOCK | EXAMPLE 응답, 분석 revision·실패·미확정 후보 |
| Spring AI ChatClient·ChatModel 어댑터 | IMPLEMENTED / LIVE_UNVERIFIED | 프로토콜 fixture 검증과 두 외부 모델의 실제 성공은 구분 |
| OpenAI·별도 OpenAI 호환 공급자 | LIVE_UNVERIFIED | 실제 키 미제공, 독립적인 2개 실모델 구동 증거 필요 |
| 공개 요약 검색 | IMPLEMENTED / PARTIAL | Spring AI PGVector, 로컬 특징 해시 256차원, 공식 공개 페이지 2종의 편집 요약 |
| 원문 전체 수집·실제 임베딩 모델 RAG | NOT_IMPLEMENTED | 모델·자료 라이선스·원문 인용·검색 품질 검증 필요 |
| 기관 비공개 컨텍스트 | IMPLEMENTED / PARTIAL | 기관별 암호화 보관·권한 분리; 공개 색인·모델 자동 전달 없음 |
| 파일 업로드 | PARTIAL | UTF-8 TXT/MD 1MiB; PDF/DOCX 파싱 미지원 |
| 문서 출력 | PARTIAL | 이스케이프된 HTML; HWP/DOCX/PDF 정식 양식 미지원 |
| 디자인 v3.1 화면 적용 | PARTIAL | Next 업무 화면·공통 토큰·합성 디자인 미리보기; 시각 검수는 별도 증거 |
| 접근성 | PARTIAL | 라벨·키보드·상태 표현 구현, 인증·전체 보조공학 검증 없음 |
| 공휴일 제외 업무일 기한 계산 | NOT_IMPLEMENTED | design v3.1 부록 요구, 일정 데이터·계산 검증 필요 |
| 운영 SSO·기관 실계정·권한 배정 | NOT_IMPLEMENTED | 합성 계정 외 인증 프로비저닝 별도 |
| 실제 장비·내부 자산 연계 | NOT_IMPLEMENTED | 1차 자동 적용 범위 아님 |
| Docker Compose·CI | IMPLEMENTED | 설정·검사 파이프라인 준비, 실제 실행 상태는 VERIFICATION 참조 |

## 팀에서 먼저 확정할 가정

[ADR 0004](adr/0004-provisional-schema-and-permissions.md)의 필드 최소 집합, 담당 분야의 조회 범위·최종 확정 주체, 네트워크 제한은 개발을 시작하기 위한 잠정 구현 결정입니다. 기관의 공식 승인 정책이나 확정 제출 양식으로 표시하지 않습니다. 외부 모델 검증·검색 품질·정식 문서 출력 등을 추가할 때 해당 범위와 수용 기준부터 기록합니다.
