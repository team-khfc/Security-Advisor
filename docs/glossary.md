# 유비쿼터스 언어

한국어 업무 의미를 먼저 정하고 코드·API·화면에서 같은 의미로 사용합니다. 구현 식별자는 현재 버전 기준이며 새 이름 변경은 API·DB 호환성과 함께 PR로 검토합니다.

| 업무 용어 | 코드·API 식별자 | 의미와 경계 |
|---|---|---|
| 보안길잡이 | SecurityAdvisor / `kr.securityadvisor` | 서비스명·백엔드 패키지 |
| 신청 | `SecurityRequest` / `/security-requests` | 두 문서의 작성·협의·확정을 묶는 애그리거트 |
| 방화벽 신청서 | `FIREWALL` | 통신 규칙을 포함하는 문서 종류 |
| 보안성검토 신청서 | `SECURITY_REVIEW` | 접근·보관·기록 등 검토 설명을 포함하는 문서 종류 |
| 작성자·일반 사용자 | `APPLICANT` | 자신이 만든 신청의 업무 설명과 사람 확인 |
| ICT인프라 담당자 | `INFRA` | 운영 환경·통신·자원 할당·분야 협의 |
| 정보보안 담당자 | `SECURITY` | 할당 후 보안 검토·보완·분야 협의 |
| 기관 관리자 | `ADMIN` | 기관 설정·모델 구성·컨텍스트; 업무 신청 열람 권한과 분리 |
| 작성 | stage 1 / `DRAFT` | AI 분석과 인터뷰, 아직 담당자 협의 전 |
| 담당자 협의 | stage 2 / `COLLABORATING` | INFRA 할당 선행 후 두 분야 협의 |
| 사용자 최종 검토 | stage 3 / `FINAL_REVIEW` | 최종 초안의 보완분도 사람이 확인 |
| 확정·관리 | stage 4 | 제출본 최종 검토와 서류 확정·이력 관리 |
| 자원 할당 | `allocation` | 서버·주소·통신 등 INFRA의 할당 확인; 협의 완료와 별개 |
| 분야 협의 | `reviews` | 현재 자료에 대한 각 담당 분야의 검토 |
| 제출본 최종 검토 | `finalReviews` | stage 4의 제출본에 대한 두 분야 확인 |
| 제출 | `SUBMITTED` / `submit` | 확인된 문서를 제출 차수로 보존 |
| 서류 확정 | `CONFIRMED` / `confirmDocument` | 두 분야 최종 검토 후 문서 확정; 장비 적용 아님 |
| 차수 반환 | `returnTo` / `returnItems` | 허용된 이전 단계로 돌아가며 값과 이력 보존 |
| 보완 항목 | `fieldKeys` / `affected` | 직접 지정한 필드와 영향을 받아 재확인할 필드 |
| 종결(반려) | `CLOSED` | 담당자가 사유를 남긴 업무 종료 |
| 철회 | `WITHDRAWN` | 작성자가 사유를 남긴 업무 종료 |
| 추가 보완 질문 | `supplements` | 질문→답변→요청 분야 해소 확인 |
| 답변 | `answers` | 질문 책임·필수 시점·값·출처·사람 확인을 포함 |
| 사용자 답변 출처 | `USER_ANSWER` | 신청자가 직접 제공한 설명 |
| AI 추론 출처 | `AI_INFERRED` | 근거를 가진 AI 제안; 사람 확인과 별개 |
| 담당자 입력 출처 | `STAFF_INPUT` | 담당 분야가 직접 입력한 사실 |
| 담당자 확인 출처 | `STAFF_CONFIRMED` | 담당 분야가 확인한 출처 유형 |
| 사람 확인 | `confirmation` | actorName·role·시각; 기존 AI 출처를 지우지 않음 |
| 변경 버전 | `revision` | 낙관적 충돌 방지용 현재 신청/설정 버전 |
| 예상 변경 버전 | `expectedRevision` | 사용자가 읽고 수정한 기준 버전 |
| 게시 정책 버전 | `policyVersion` | 신청 생성 시 고정한 기관 정책 스냅샷 |
| 제출 차수 | `submissionVersion` | 재제출마다 증가하는 불변 문서 버전 |
| 기관 정책 초안 | `draft` | 저장했으나 아직 새 신청에 적용하지 않은 설정 |
| 게시본 | `published` | 새 신청에 적용할 확정 설정; 제출본과 다름 |
| 최종 AI 초안 | `finalDraft` | 3단계 보완 제안; 확인 전 미확정 |
| AI 작업 | `AnalysisJob` | 입력·모델 구성 revision과 성공/실패/결과 기록 |
| 공개 지식 | `knowledge` | 공개 출처를 가진 참고 지식; 기관 사실을 대신하지 않음 |
| 기관 컨텍스트 | `PrivateContext` | 별도 암호화한 비공개 사실; 공개 RAG 색인과 분리 |
| 실행 모델 연결 | `ModelConnection` | 공급자·모델·URL·키 참조·생성 옵션 |
| 합성 AI | `EXAMPLE` | 외부 모델 호출 없이 시연을 위한 응답 |
| 실제 연결 모드 | `LIVE` | 외부 공급자 구성 상태; 성공 증거와 구분 |

## 호환 이름

`procedures`, `procedure_submissions`는 기존 Flyway 테이블 이름입니다. 새 도메인과 API의 이름은 `SecurityRequest`지만 적용된 migration을 이름 정리만을 위해 수정하지 않습니다. `AnalysisResponse.procedureId`도 현재 응답 호환 필드이므로 변경 시 버전 전략이 필요합니다.

원문 출처 용어 `AI_INFERENCE`, `SPECIALIST_INPUT`, `SPECIALIST_CONFIRMATION`은 현재 API의 `AI_INFERRED`, `STAFF_INPUT`, `STAFF_CONFIRMED`와 대응합니다. JSON은 CONTRACT의 canonical 값을 사용합니다. `RECEIVED`는 이전 데이터 호환 상태이고 현재 UI/API 업무 상태는 `SUBMITTED`로 정규화합니다. 새 기능이 이를 독립된 완료 단계로 다시 사용하지 않습니다.
