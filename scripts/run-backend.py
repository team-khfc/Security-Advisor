#!/usr/bin/env python3
"""생성된 환경과 로컬 업로드 경로로 Spring Boot 개발 서버를 시작한다."""
import os
from pathlib import Path
import subprocess
from env_config import load_environment

root = Path(__file__).resolve().parents[1]
environment = load_environment(root)
environment["SPRING_PROFILES_ACTIVE"] = "local"
environment.setdefault("SECURITYADVISOR_UPLOAD_DIRECTORY", str(root / "local-uploads"))
wrapper = "gradlew.bat" if os.name == "nt" else "./gradlew"
try:
    result = subprocess.run([wrapper, "bootRun"], cwd=root / "backend", env=environment)
    raise SystemExit(result.returncode)
except KeyboardInterrupt:
    raise SystemExit(130)
