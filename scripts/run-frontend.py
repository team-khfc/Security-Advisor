#!/usr/bin/env python3
""".env의 로컬 API·웹 포트를 사용해 Next.js 개발 서버를 시작한다."""
import os
from pathlib import Path
import subprocess
from env_config import load_environment, port

root = Path(__file__).resolve().parents[1]
environment = load_environment(root)
api_port = port(environment, "SECURITYADVISOR_API_PORT", 8080)
web_port = port(environment, "SECURITYADVISOR_WEB_PORT", 3000)
environment.setdefault("API_ORIGIN", "http://127.0.0.1:" + api_port)
environment.setdefault("NEXT_TELEMETRY_DISABLED", "1")
npm = "npm.cmd" if os.name == "nt" else "npm"
try:
    result = subprocess.run([npm, "run", "dev", "--", "--port", web_port],
                            cwd=root / "frontend", env=environment)
    raise SystemExit(result.returncode)
except KeyboardInterrupt:
    raise SystemExit(130)
