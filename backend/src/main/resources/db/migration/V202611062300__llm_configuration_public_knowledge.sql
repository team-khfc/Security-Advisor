-- 이전 게시본과 신청 스냅샷을 보존한 채 실행 모델 구성만 별도로 관리한다.
CREATE TABLE llm_configurations (
  institution_id UUID PRIMARY KEY,
  revision BIGINT NOT NULL CHECK (revision > 0),
  lock_version BIGINT NOT NULL DEFAULT 0,
  connections JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE llm_configuration_changes (
  id UUID PRIMARY KEY,
  institution_id UUID NOT NULL REFERENCES llm_configurations(institution_id),
  revision BIGINT NOT NULL,
  changed_by UUID NOT NULL,
  author VARCHAR(100) NOT NULL,
  connections JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (institution_id, revision)
);
CREATE TRIGGER immutable_model_configuration_changes
BEFORE UPDATE OR DELETE ON llm_configuration_changes
FOR EACH ROW EXECUTE FUNCTION reject_publication_change();

ALTER TABLE analysis_jobs ADD COLUMN model_configuration_revision BIGINT NOT NULL DEFAULT 0;
ALTER TABLE analysis_jobs ADD COLUMN purpose VARCHAR(30) NOT NULL DEFAULT 'DOCUMENT_ANALYSIS';
ALTER TABLE analysis_jobs ADD COLUMN generated_text TEXT;
ALTER TABLE analysis_jobs DROP CONSTRAINT analysis_jobs_provider_check;
-- 기존 GEMMA 이력은 읽기 전용으로 보존한다. 새 실행에는 허용하지 않는다.
ALTER TABLE analysis_jobs ADD CONSTRAINT analysis_jobs_provider_check
  CHECK (provider IN ('EXAMPLE', 'OPENAI', 'OPENAI_COMPATIBLE', 'GEMMA'));

CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE public_knowledge_vectors (
  id UUID PRIMARY KEY,
  content TEXT NOT NULL,
  metadata JSONB NOT NULL,
  embedding vector(256) NOT NULL
);
CREATE INDEX public_knowledge_vectors_cosine_idx
  ON public_knowledge_vectors USING hnsw (embedding vector_cosine_ops);
