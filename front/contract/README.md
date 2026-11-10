# Back API 계약 동기화

기준일: 2026-11-11

- Back 커밋: `c8678469a728a535f037b638b275b8ae1715f63a` (협의 비교·AI 요약 확장, 백엔드 동반 배포 필요)
- 원본: https://github.com/team-khfc/Security-Advisor-Back/blob/c8678469a728a535f037b638b275b8ae1715f63a/docs/api/openapi.yaml
- 서버·운영 검토 확장 API PR: https://github.com/team-khfc/Security-Advisor-Back/pull/28
- ICT인프라 검토·AI 망 구성 API PR: https://github.com/team-khfc/Security-Advisor-Back/pull/27
- 항목별 권한·형식 및 담당자 일괄 저장 API PR: https://github.com/team-khfc/Security-Advisor-Back/pull/24
- 모델 구성·연결 시험 API PR: https://github.com/team-khfc/Security-Advisor-Back/pull/22
- 지식 게시본·지표 API PR: https://github.com/team-khfc/Security-Advisor-Back/pull/20
- 질문·기한 정책 게시 API PR: https://github.com/team-khfc/Security-Advisor-Back/pull/18
- 알림·처리할 일 API PR: https://github.com/team-khfc/Security-Advisor-Back/pull/16
- 담당자 업무 인계 API PR: https://github.com/team-khfc/Security-Advisor-Back/pull/14
- 목록·이력 API PR: https://github.com/team-khfc/Security-Advisor-Back/pull/10
- 최종 보고서·PDF API PR: https://github.com/team-khfc/Security-Advisor-Back/pull/4
- 인터뷰 API PR: https://github.com/team-khfc/Security-Advisor-Back/pull/2
- 요청서: https://github.com/team-khfc/Security-Advisor-Back/blob/74cbdfb5ef0896b2628d243e3bec7f01b183eaac/docs/FRONT_CHANGE_REQUEST_20261109.md
- `openapi.yaml`은 Back 원본의 사본이며 Front에서 계약을 임의 개정하지 않는다.

## 응답과 화면의 경계

서버·운영 검토 확장 계약: 서버 목록·통신 구간의 서버 ID 연결·운영 사항·구성 체크리스트·임시 저장 상태를 추가했습니다. `infrastructure-proposals`의 `target: SERVERS`는 필드별 근거를 포함한 서버 사양 제안을 반환합니다. 기존 제출본은 이전 계약 그대로 표시하며 이번 백엔드와 함께 배포해야 합니다.

망 구성은 GET/PUT `/api/security-requests/{id}/infrastructure-plan`, AI 초안은 POST `/api/security-requests/{id}/infrastructure-proposals`를 사용합니다. AI 초안은 기존 값을 저장하지 않습니다. 필드별 원문 근거를 비교해 입력칸에 선택 적용하고 담당자가 보완·확인한 뒤 별도 저장합니다. 최근 첨부 3개 텍스트 발췌를 참고하며 이미지 분석은 포함하지 않습니다. 실제 모델 호출은 미검증이며 모의 모드는 실제 AI 추출 성공을 가장하지 않고 안내와 빈 제안을 반환합니다.

담당자 답변 일괄 저장은 `PATCH /api/reviews/{id}/answers`를 사용한다. 기존 병렬 PUT의 부분 저장·동시 충돌을 피하고 항목별 권한·형식·revision을 한 트랜잭션으로 검사한다. [검증 기록](../docs/ANSWER_FIELD_POLICY_20261110.md).

모델 관리 화면은 `/api/llm-configurations`의 목록·단건·선택 상태·변경 비교·페이지 이력·복원과 `/api/llm-connection-tests`를 사용한다. 관리자 전용이며 키 값은 받지 않는다. 연결 시험의 HTTP 201은 시험 자원 생성이며 성공은 응답의 `status=SUCCEEDED`로 판단한다. 화면 모의 모드의 `FAILED/SIMULATED`는 실제 연결 성공을 뜻하지 않는다. 변경·복원 시 `expectedRevision`을 보내고 409 충돌에서는 입력을 보존한다. [검증 기록](../docs/LLM_ADMINISTRATION_20261110.md)을 참고한다.

지식 관리는 `/api/knowledge-drafts/current`의 목록·단건·비교·게시와 `/api/knowledge-publications`의 페이지 이력·불변 원문 API를 사용한다. 모두 관리자 전용이며 기존 지식 POST/PUT은 초안만 저장한다. 항목 수정에는 항목 revision, 게시 메모와 게시에는 전체 초안 revision을 전달한다. 게시 비교 결과와 메모의 revision이 다르면 재비교를 요청한다. `BusinessCaseResponse.knowledgePublicationId`를 인터뷰 도움말 조회에 전달하고 캐시 키에도 포함한다. `GET /api/insights/summary`는 관리자 전용 읽기 결과로 계산 시각·null 비율을 그대로 표시한다. [실제 검증 기록](../docs/KNOWLEDGE_INSIGHTS_20261110.md)을 참고한다.

기관 설정은 관리자 전용 초안 조회·저장·비교·게시 API를 사용한다. `ConfigurationResponse.builtInFields`로 기본 질문 계약을 보호하고 실제 저장 응답의 revision을 다음 변경에 전달한다. `GET /api/configurations/{id}/comparison`의 revision으로 게시하며 409에서는 내 입력을 유지한다. `GET /api/publications?page&size`와 `GET /api/publications/{id}/comparison`으로 이력·게시 당시 변경 내용을 조회한다. 새 게시본은 새 사업에 적용하고 기존 사업과 추가 신청은 고정된 publicationId를 유지한다. [기관 설정 검증 기록](../docs/CONFIGURATION_PUBLISHING_20261110.md)에 실제 흐름을 기록했다.

`GET /api/notifications`는 배열에서 `PageResponse`로 변경되었다. `page`/`size`/`unreadOnly`를 사용하며 현재 수신 권한을 먼저 적용한다. `/api/notifications/unread-count`, `PATCH /api/notifications/{id}`, `/api/todos`, `/api/todo-summary`를 연결한다. 알림 읽음과 업무 완료를 분리하며 안전한 `/requests/{id}` 링크만 사용한다. Back과 함께 배포해야 하며 실제 화면 검증은 [알림·처리할 일 기록](../docs/NOTIFICATIONS_20261110.md)에 있다.

배정과 목록의 분야별 요약은 `reassignmentReason`으로 인계 필요 사유를 전달한다. 담당자 목록은 `eligible`/`unavailableReason`으로 현재 계정 역할·활성·분야 등록 상태를 함께 판정한다. 프론트는 상태를 임의 변경하지 않고 관리자 등록·기본 지정·활성 관리 및 사유 있는 재배정 API를 사용한다. 실제 화면 검증은 [업무 인계 기록](../docs/ASSIGNMENT_HANDOFF_20261110.md)을 참고한다.

`features/request/apiTypes.ts`는 실제 HTTP 응답을 검증한다. 숫자 ID, 답변의 fieldKey/valueSource/revision, Back 열거형, 게시본 질문, 독립된 하위 자원 DTO를 사용한다. `features/request/adapters/backend.ts`는 기존 화면 모델로 변환한다. 화면 내부의 문자열 id·상태 별칭은 HTTP 응답 타입이 아니다.

상세 화면은 신청 본체와 사업 건, 협의, 배정, 보완, 반환, 기한, 제출본, 최종 확인을 독립 Query로 읽는다. 게시본은 사업 건의 publicationId로 조회하여 기존 신청에 새 질문을 섞지 않는다. 제출본은 별도 상세의 snapshot을 표시한다. allowedActions는 버튼 노출 후보일 뿐이며 제출 차단 사유를 클라이언트에서 계산하지 않는다. 업무 API의 422 detail이 최종 안내다.

모의 서버는 기존 합성 도메인 모델을 `mocks/contractMapper.ts`에서 같은 HTTP DTO로 직렬화한다. 로그인과 일반 API는 동일 스키마를 사용하며 모의 세션에만 mock 표시를 덧붙인다.

## 요청서와 실제 구현의 차이

1. 6절 제출: 실제 SubmissionController와 SubmitCommand는 `{ expectedRevision }` 본문을 필수로 요구한다. 이를 유지하고 멱등 키는 헤더로만 보낸다.
2. 1절 페이지: OpenAPI의 명시적 PageResponse는 평탄한 메타데이터다. Spring Page의 중첩 page 객체도 함께 검증·정규화한다.
3. 2절 게시본 질문: 실제 필드는 `fieldSchema.fields`다. current 대신 사업 건에 연결된 게시본 ID를 사용한다.
4. 8절 회원 목록: `GET /api/members`는 Page가 아닌 MemberDetail 배열이며 active가 포함된다. 로그인/내 정보의 MemberResponse와 구분한다. 활성 상태만 바꾸면 PUT activation을 사용한다.
5. 답변 확인: Answer 구현상 사용자 직접 입력은 저장 시 확정되고 confirmedBy는 null이다. 사용자 confirmation API는 AI_INFERRED에만 적용한다. 같은 AI 값을 확인할 때 다시 저장하여 USER_ANSWER로 바꾸지 않는다. 담당자 입력·확인은 `/api/reviews/{id}/answers/{fieldKey}` 경로를 사용한다.

## 검증

신청 목록은 서버의 검색·필터·페이지·summary/overview를 사용하고, 사업별 관련 신청도 businessCaseId로 조회한다. 이력은 현재 계정 범위의 페이지 API를 사용하며 최초 throughId를 후속 페이지에 전달한다. 실제 도커의 합성 신청 220건과 이력 146건 검증은 [목록·이력 기록](../docs/PAGED_LISTS_20261110.md)에 있다.

문서 미리보기·다운로드는 기존 GeneratedDocumentResponse를 공유한다. 생성 응답의 문서 번호를
PDF 다운로드에 그대로 사용하며, 구현과 실제 화면 검증은 [정식 문서 통합 기록](../docs/SERVER_DOCUMENT_PREVIEW_20261110.md)에 있다.

기존 정렬 결과는 `docs/API_ALIGNMENT_20261109.md`, 신청자 인터뷰 추가 사항과 실제 도커 검증은 `docs/APPLICANT_INTERVIEW_20261110.md`에 기록한다.

신청자 인터뷰의 GET/POST 대화와 POST 적용 계약을 추가했다. 화면은 게시본 `type`·`hint`를 보존하고, 항목 도움말은 해당 사업 건의 `publicationId`로 조회한다. 자유 질문과 추천 미리보기는 답변 저장과 분리한다. 명시적 적용 뒤에도 AI 값은 미확정이며 기존 confirmation API로 확인한다.

최종 보고서는 GET `final-draft`, POST `final-draft-generations`/`final-drafts`, PUT `final-drafts/{id}/confirmation`을 사용한다. 생성 시 신청 revision, 확인 시 초안 revision을 보낸다. 최초 조회 204는 미작성으로 처리하고, 제출 후에는 snapshot.finalDraft를 표시한다. PDF는 기존 generated-documents에 submissionId를 지정한 뒤 download?format=PDF로 받는다. 실제 Docker 검증은 [최종 보고서 기록](../docs/FINAL_DRAFT_20261110.md)에 있다.

처리할 일 카드 계약 확장(PR #30): 처리할 일 카드 표시를 위해 TodoItem.context(사업명·담당부서·서류 종류·상태·단계·최근 변경)를 추가했습니다. 백엔드 PR #30과 함께 배포하며 기존 권한·페이지 조회 기준은 유지합니다.

협의 비교 확장: GET consultation-comparison과 POST consultation-summaries를 추가했습니다. 협의 요청 기준본·실제 변경 기록을 사용하고, 기존 신청의 과거 변경은 추정하지 않습니다. AI 요약은 원본 fingerprint와 근거 항목 키를 연결하며 원본 변경 후 이전 요약을 숨깁니다. 검증 기록은 백엔드 docs/CONSULTATION_COMPARISON_20261111.md에 있습니다.
