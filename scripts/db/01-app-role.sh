#!/bin/sh
set -eu
# PostgreSQL 최초 초기화 전용. 비밀값을 프로세스 인수나 SQL 문자열에 직접 넣지 않는다.
: "${SECURITYADVISOR_MIGRATION_PASSWORD:?Migration password is required}"
: "${SECURITYADVISOR_DB_PASSWORD:?Application password is required}"
psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set=ON_ERROR_STOP=1 <<'SQL'
\getenv migration_password SECURITYADVISOR_MIGRATION_PASSWORD
\getenv app_password SECURITYADVISOR_DB_PASSWORD
SELECT format('CREATE ROLE securityadvisor_migrator LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE', :'migration_password') \gexec
SELECT format('CREATE ROLE securityadvisor_app LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE', :'app_password') \gexec
ALTER DATABASE securityadvisor OWNER TO securityadvisor_migrator;
REVOKE ALL ON DATABASE securityadvisor FROM PUBLIC;
GRANT CONNECT ON DATABASE securityadvisor TO securityadvisor_migrator, securityadvisor_app;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT ALL ON SCHEMA public TO securityadvisor_migrator;
GRANT USAGE ON SCHEMA public TO securityadvisor_app;
CREATE EXTENSION IF NOT EXISTS vector;
ALTER DEFAULT PRIVILEGES FOR ROLE securityadvisor_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO securityadvisor_app;
ALTER DEFAULT PRIVILEGES FOR ROLE securityadvisor_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO securityadvisor_app;
SQL
