#!/usr/bin/env python3
"""비밀값을 출력하지 않고 SecurityAdvisor의 합성 시연 환경을 준비한다."""
import base64
import os
from pathlib import Path
import secrets

def create_password():
    return "Aa9" + secrets.token_urlsafe(27)


def prepare_environment(root: Path):
    destination = root / ".env"
    if destination.exists():
        existing = {}
        for line in destination.read_text(encoding="utf-8").splitlines():
            if not line or line.startswith("#"):
                continue
            name, separator, value = line.partition("=")
            if not separator or not name.startswith(("SECURITYADVISOR_", "BOAN_")):
                raise SystemExit("기존 .env의 설정 형식을 확인해 주세요.")
            existing[name] = value
        aliases = {
            "SECURITYADVISOR_" + name.removeprefix("BOAN_"): value
            for name, value in existing.items()
            if name.startswith("BOAN_")
            and "SECURITYADVISOR_" + name.removeprefix("BOAN_") not in existing
        }
        if "SECURITYADVISOR_DB_BOOTSTRAP_PASSWORD" not in existing:
            aliases["SECURITYADVISOR_DB_BOOTSTRAP_PASSWORD"] = create_password()
        if aliases:
            with destination.open("a", encoding="utf-8") as stream:
                stream.write("\n# SecurityAdvisor 이름 전환: 기존 비밀값을 그대로 참조합니다.\n")
                for name, value in aliases.items():
                    stream.write(f"{name}={value}\n")
            os.chmod(destination, 0o600)
            print("기존 암호와 암호화 키를 유지하고 누락된 로컬 설정을 추가했습니다.")
        else:
            os.chmod(destination, 0o600)
            print("기존 .env와 모든 비밀값을 유지했습니다.")
        return

    values = {
        "SECURITYADVISOR_DB_BOOTSTRAP_PASSWORD": create_password(),
        "SECURITYADVISOR_DB_USER": "securityadvisor_app",
        "SECURITYADVISOR_DB_PASSWORD": create_password(),
        "SECURITYADVISOR_MIGRATION_USER": "securityadvisor_migrator",
        "SECURITYADVISOR_MIGRATION_PASSWORD": create_password(),
        "SECURITYADVISOR_DB_URL": "jdbc:postgresql://localhost:5432/securityadvisor",
        "SECURITYADVISOR_CONTEXT_KEY": base64.b64encode(secrets.token_bytes(32)).decode("ascii"),
        "SECURITYADVISOR_DEMO_ENABLED": "true",
        "SECURITYADVISOR_DEMO_SCENARIOS": "true",
        "SECURITYADVISOR_DEMO_APPLICANT_PASSWORD": create_password(),
        "SECURITYADVISOR_DEMO_SECURITY_PASSWORD": create_password(),
        "SECURITYADVISOR_DEMO_INFRA_PASSWORD": create_password(),
        "SECURITYADVISOR_DEMO_ADMIN_PASSWORD": create_password(),
        "SECURITYADVISOR_OPENAI_API_KEY": "",
        "SECURITYADVISOR_OPENAI_COMPATIBLE_API_KEY": "",
        "SECURITYADVISOR_ALLOWED_LLM_ENDPOINTS": "https://api.openai.com/v1/chat/completions",
        "SECURITYADVISOR_WEB_PORT": "3000",
        "SECURITYADVISOR_API_PORT": "8080",
        "SECURITYADVISOR_DB_PORT": "5432",
    }
    descriptor = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
        stream.write("# 합성 시연 전용. Git 및 공유 산출물에 포함하지 마세요.\n")
        for name, value in values.items():
            stream.write(f"{name}={value}\n")
    print(".env 생성 완료. 역할별 암호는 SECURITYADVISOR_DEMO_*_PASSWORD에서 확인하세요.")


if __name__ == "__main__":
    prepare_environment(Path(__file__).resolve().parents[1])
    print("docker compose --profile app up -d --build")
    print("웹 http://securityadvisor.localhost:3000 · 서버 http://api.securityadvisor.localhost:8080")
    print("환경에서 .localhost 이름을 지원하지 않으면 README의 hosts 설정을 적용하세요.")

