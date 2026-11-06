-- 기존 행·원본 답변·제출본 바이트는 보존하고 4단계 업무 메타데이터만 추가한다.
ALTER TABLE procedures DROP CONSTRAINT procedures_status_check;
ALTER TABLE procedures ADD CONSTRAINT procedures_status_check
  CHECK (status IN ('DRAFT', 'COLLABORATING', 'FINAL_REVIEW', 'SUBMITTED',
                    'RECEIVED', 'CONFIRMED', 'CLOSED', 'WITHDRAWN'));

ALTER TABLE procedures ADD COLUMN workflow jsonb NOT NULL DEFAULT
'{"stage":1,"allocation":{"status":"PENDING","revision":null,"comment":"","actorName":null,"at":null},"finalReviews":[{"role":"INFRA","status":"PENDING","revision":null,"comment":"","actorName":null,"at":null},{"role":"SECURITY","status":"PENDING","revision":null,"comment":"","actorName":null,"at":null}],"returnItems":[],"assignments":[],"terminalReason":null,"submissionVersion":0,"finalDraft":null}'::jsonb;

-- 이전 접수는 서류 확정이 아니므로 그대로 RECEIVED로 보존한다.
UPDATE procedures SET workflow = jsonb_set(workflow, '{stage}',
  to_jsonb(CASE WHEN status = 'DRAFT' THEN 1 WHEN status = 'COLLABORATING' THEN 2 ELSE 4 END));
UPDATE procedures SET workflow = jsonb_set(
  jsonb_set(workflow, '{submissionVersion}', '1'::jsonb),
  '{allocation,status}', '"COMPLETE"'::jsonb)
WHERE status IN ('SUBMITTED', 'RECEIVED');

-- 기존 UNIQUE는 한 신청의 재제출을 막았으므로 차수별 UNIQUE로 확장한다.
-- ADD COLUMN 기본값은 이전 불변 행을 UPDATE하지 않으며 보호 트리거도 유지한다.
ALTER TABLE procedure_submissions DROP CONSTRAINT procedure_submissions_procedure_id_key;
ALTER TABLE procedure_submissions ADD COLUMN submission_version integer NOT NULL DEFAULT 1;
ALTER TABLE procedure_submissions ADD COLUMN request_revision bigint;
ALTER TABLE procedure_submissions ADD CONSTRAINT procedure_submission_version_positive
  CHECK (submission_version > 0);
ALTER TABLE procedure_submissions ADD CONSTRAINT procedure_submission_version_unique
  UNIQUE (procedure_id, submission_version);
CREATE INDEX procedure_submission_latest_idx
  ON procedure_submissions (institution_id, procedure_id, submission_version DESC);
