-- 새 설치에서만 적용하는 기관·분석 스키마다. 기존 운영 자료를 삭제하지 않는다.
CREATE TABLE institution_settings (
  institution_id UUID PRIMARY KEY,
  revision BIGINT NOT NULL CHECK (revision > 0),
  lock_version BIGINT NOT NULL DEFAULT 0,
  published_version BIGINT NOT NULL CHECK (published_version > 0),
  draft_policy JSONB NOT NULL,
  published_policy JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE policy_publications (
  id UUID PRIMARY KEY,
  institution_id UUID NOT NULL REFERENCES institution_settings(institution_id),
  version BIGINT NOT NULL CHECK (version > 0),
  base_revision BIGINT NOT NULL CHECK (base_revision >= 0),
  request_key VARCHAR(80) NOT NULL,
  published_by VARCHAR(100) NOT NULL,
  policy JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT uq_publication_version UNIQUE (institution_id, version),
  CONSTRAINT uq_publication_request UNIQUE (institution_id, request_key)
);

CREATE FUNCTION reject_publication_change() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Published policy snapshots are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER immutable_policy_publications
BEFORE UPDATE OR DELETE ON policy_publications
FOR EACH ROW EXECUTE FUNCTION reject_publication_change();

CREATE TABLE private_contexts (
  id UUID PRIMARY KEY,
  institution_id UUID NOT NULL,
  encrypted_payload BYTEA NOT NULL,
  created_by VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX ix_private_context_tenant_created ON private_contexts(institution_id, created_at DESC);

CREATE TABLE analysis_jobs (
  id UUID PRIMARY KEY,
  procedure_id UUID NOT NULL REFERENCES procedures(id),
  institution_id UUID NOT NULL,
  requested_by UUID NOT NULL,
  input_revision BIGINT NOT NULL CHECK (input_revision >= 0),
  status VARCHAR(20) NOT NULL CHECK (status IN ('RUNNING', 'SUCCEEDED', 'FAILED')),
  provider VARCHAR(20) NOT NULL CHECK (provider IN ('EXAMPLE', 'OPENAI', 'GEMMA')),
  model VARCHAR(120) NOT NULL,
  timeout_seconds INTEGER NOT NULL CHECK (timeout_seconds BETWEEN 5 AND 60),
  error_message VARCHAR(500),
  applied_at TIMESTAMPTZ,
  source_objects JSONB NOT NULL,
  suggestions JSONB NOT NULL,
  lock_version BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX ix_analysis_procedure_created ON analysis_jobs(institution_id, procedure_id, created_at DESC);
