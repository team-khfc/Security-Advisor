# SecurityAdvisor 통합 배포·유지보수 가이드

전체 서비스를 실행하는 저장소다. 기능은 Front·Back 원본에서 수정하고 검증된 태그를 `front/`, `back/` 스냅샷으로 가져온다. [규칙 적용](RULES_GUIDE.md)과 [README](../README.md)의 설치·시연 안내를 함께 읽는다.

## 설치·설정 우선순위

Docker만 있으면 서비스를 빌드·실행할 수 있다. 최초 `.env.example`을 `.env`로 복사하고 `docker compose up -d --build`를 실행한다. PowerShell 복사 명령은 `Copy-Item .env.example .env`다. 기본 화면 3000, Back 8080은 `FRONT_PORT/BACK_PORT`로 바꾼다. `demo`의 Exited(0)은 정상 초기화 완료다.

| 대상 | 실제 구성 |
|---|---|
| DB | PostgreSQL 17 호환 이미지, DB `securityadvisor_demo`, 사용자 `demo`, 호스트 포트 미공개 |
| 앱 | `DB_URL=jdbc:postgresql://db:5432/securityadvisor_demo`, `DB_USERNAME=demo`, 비밀번호는 `.env` POSTGRES_PASSWORD |
| 볼륨 | `database`(DB), `documents`(첨부·생성 문서), `demo-state`(시나리오 생성 상태) |
| Front | `API_MODE=api`, `API_BASE_URL=http://app:8080` |
| 프로젝트 | 기본 `security-advisor-demo`; 다른 작업은 `-p`와 별도 호스트 포트로 분리 |

실제 볼륨 이름은 compose 프로젝트 접두사가 붙는다. `.env`는 보간과 app 환경 주입에 사용되지만 compose의 명시적 `environment`가 우선한다. DB 주소·사용자, Front API 주소, 앱 STORAGE_DIR, 시연용 SESSION_COOKIE_SECURE·SMTP_HOST·NOTIFY_WEBHOOK_URL 등 고정값은 `.env`만 바꿔도 덮어써지지 않는다. `docker compose config` 출력에는 비밀값이 포함될 수 있으므로 공유하지 않고, 문법 확인은 `docker compose config --quiet`로 한다.

`pgvector/pgvector:pg17` 이미지를 사용해도 현재 검색은 FTS이며 벡터 확장을 사용한다는 의미가 아니다. DB 테이블·마이그레이션은 `back/src/main/resources/db/migration/`이 기준이다. 기관별 DB 테넌트가 아닌 설치당 1기관 구성이다.

## DB 변경·백업·복원

외부 DB로 옮길 때는 `.env`만 바꾸지 말고 app의 명시적 DB 설정과 db 의존성을 검토한 배포 설정 변경이 필요하다. 스키마 변경은 Back 원본의 새 Flyway 파일로 만든다. 이미 적용된 파일은 수정하지 않는다. POSTGRES_PASSWORD 변경만으로 기존 DB 비밀번호가 바뀌지 않으므로 DB 계정 변경과 앱 연결값을 함께 계획한다.

배포 전 쓰기를 중지한 일관된 시점의 DB·documents·demo-state와 설치 설정을 보관한다. 키가 포함된 설정과 백업은 Git에 올리지 않는다.

```bash
docker compose exec db pg_dump -U demo -d securityadvisor_demo -Fc -f /tmp/backup.dump
docker compose cp db:/tmp/backup.dump ./backup.dump
```

복원 검증은 별도 환경의 신규 DB에서 수행한다.

```bash
docker compose cp ./backup.dump db:/tmp/restore.dump
docker compose exec db createdb -U demo restore_check
docker compose exec db pg_restore -U demo -d restore_check --no-owner /tmp/restore.dump
```

파일 볼륨도 같은 시점으로 복원하고 해당 DB에 맞는 앱 버전으로 확인한다. 위 명령은 실제 서비스 DB를 덮어쓰지 않는다. 별도 환경의 연결 설정을 복원 DB로 맞춘 뒤 검증하고 전환한다. schema 변경 후에는 코드만 이전 태그로 되돌려도 복구된다고 보장할 수 없다.

## LLM·기관 설정

[LLM 구성 가이드](LLM_CONFIGURATION.md)를 따른다. `.env`의 fake/live·키·허용 목록은 앱 재생성으로 반영하고, 관리자 `/models`에서 모델·용도·우선순위·한도를 비교·저장·시험한다. 화면의 기관 표시는 설치 환경값, 질문·기한·지식은 관리자 게시본으로 관리한다. 기존 신청의 게시본이나 제출본을 직접 DB 수정하지 않는다.

## 원본 변경부터 배포까지

1. Back·Front에서 각각 수정·검사·리뷰 후 새 태그를 지정한다. 한쪽만 바뀌면 다른 쪽의 검증 버전을 유지한다.
2. 통합 저장소 작업 브랜치에서 원본 태그의 추적 파일을 스냅샷으로 교체한다. 삭제된 파일도 반영하고 `.env`·DB·빌드 산출물은 포함하지 않는다.
3. 개발용 `.github/`와 공통 규칙의 중복 사본 제외는 RELEASE.md 기준이다. 규칙은 루트에만 두고 하위 스냅샷에 중복시키지 않는다.
4. RELEASE.md의 태그·커밋과 snapshots.json 파일 해시를 원본 기준으로 갱신한다. GitHub의 이전 manifest는 파일명→해시 객체, 공공 GitLab 버전은 path/sha256 배열일 수 있으므로 해당 체크아웃 검사기의 형식을 따른다.
5. 규칙 동기화만 하는 이번 변경에서는 애플리케이션 스냅샷을 교체하지 않는다. 원본 규칙과 스냅샷 코드의 미결 정책 차이는 PROJECT_CONTEXT에 기록한다.
6. 별도 깨끗한 모의 환경에서 아래 검사를 수행한 뒤 변경 요청에 결과를 적고 병합·배포 태그를 만든다.

```bash
python3 tools/check_doc_versions.py
python3 scripts/verify-snapshots.py
docker compose config --quiet
docker compose up -d --build
docker compose --profile test run --rm smoke
```

시연이 진행된 기존 환경은 초기 시나리오를 전제로 한 smoke가 실패할 수 있다. 사용자 데이터를 지우지 말고 별도 `-p` 프로젝트·포트에서 검증한다. 실제 AI는 README의 live 검사 절차를 따르며 비용·데이터 전송을 고려한다.

## 기존 설치 업데이트

백업 후 승인된 태그 또는 main을 받고 기존 `.env`를 보존한 채 `docker compose up -d --build`로 반영한다. 새 환경값은 `.env.example`과 비교해 추가한다. `docker compose down -v`는 데이터 삭제이므로 업데이트 절차에 넣지 않는다. 로그인·신청 조회·PDF·변경 기능과 재시작 후 데이터 보존을 확인한다.

GitHub·공공 GitLab main과 내부 스냅샷 출처는 서로 다른 값일 수 있다. 양쪽 PR/MR·검사 결과·릴리스 커밋을 각각 기록한다. GitLab 업로드 보안 검사는 GitHub Actions의 통합 업무 검사를 대신하지 않으며 `.github/workflows`는 GitLab에서 자동 실행되지 않는다.
