-- 새 설치에서만 생성한다. 기존 데이터 변경·삭제는 없으며 복구는 새 DB 백업 절차를 따른다.
CREATE TABLE procedures (
    id uuid PRIMARY KEY,
    institution_id uuid NOT NULL,
    owner_id uuid NOT NULL,
    owner_name varchar(100) NOT NULL,
    title varchar(160) NOT NULL,
    document_type varchar(32) NOT NULL CHECK (document_type IN ('FIREWALL', 'SECURITY_REVIEW')),
    department varchar(100) NOT NULL,
    description text NOT NULL,
    status varchar(32) NOT NULL CHECK (status IN ('DRAFT', 'COLLABORATING', 'SUBMITTED', 'RECEIVED')),
    revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
    lock_version bigint NOT NULL DEFAULT 0,
    policy_version bigint NOT NULL,
    policy jsonb NOT NULL,
    data jsonb NOT NULL,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL
);

CREATE INDEX procedures_owner_idx ON procedures (institution_id, owner_id, updated_at DESC);
CREATE INDEX procedures_status_idx ON procedures (institution_id, status, updated_at DESC);

CREATE TABLE procedure_submissions (
    id uuid PRIMARY KEY,
    procedure_id uuid NOT NULL UNIQUE REFERENCES procedures (id),
    institution_id uuid NOT NULL,
    owner_id uuid NOT NULL,
    idempotency_key varchar(100) NOT NULL,
    snapshot jsonb NOT NULL,
    document_html text NOT NULL,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    UNIQUE (institution_id, owner_id, idempotency_key)
);

-- 신청의 접수 이력은 별도 행에 남기고 제출 당시 자료에는 어떤 수정도 허용하지 않는다.
CREATE FUNCTION reject_submission_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Submitted documents are immutable' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER protect_submitted_documents
BEFORE UPDATE OR DELETE ON procedure_submissions
FOR EACH ROW EXECUTE FUNCTION reject_submission_mutation();
