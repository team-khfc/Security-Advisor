-- 신규 시연 스키마만 생성한다. 기존 자료 삭제·변경 없음.
-- 되돌림이 필요하면 새 후속 마이그레이션을 작성하고 저장 자료를 먼저 보존한다.
CREATE TABLE user_accounts (
  id UUID PRIMARY KEY,
  institution_id UUID NOT NULL,
  username VARCHAR(80) NOT NULL UNIQUE,
  display_name VARCHAR(100) NOT NULL,
  password_hash VARCHAR(100) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('APPLICANT','SECURITY','INFRA','ADMIN')),
  active BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX user_accounts_institution_idx ON user_accounts(institution_id);

