"""개발용 환경 파일을 셸 실행 없이 읽는다. 값은 출력하지 않는다."""
import os
from pathlib import Path
import re


def load_environment(root: Path) -> dict[str, str]:
    configuration = root / ".env"
    if not configuration.is_file():
        raise SystemExit("먼저 python3 scripts/init-demo.py를 실행해 주세요.")
    values = {}
    for line in configuration.read_text(encoding="utf-8").splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        name, separator, value = line.partition("=")
        if not separator or not re.fullmatch(r"(?:SECURITYADVISOR|BOAN)_[A-Z0-9_]+", name):
            raise SystemExit(".env에는 SECURITYADVISOR_* 이름=값 형식만 사용해 주세요.")
        if name in values:
            raise SystemExit(".env에 중복된 설정 이름이 있습니다.")
        values[name] = value
    return {**values, **os.environ}


def port(environment: dict[str, str], name: str, default: int) -> str:
    value = environment.get(name, str(default))
    if not value.isdigit() or not 1 <= int(value) <= 65535:
        raise SystemExit(name + "에는 1~65535의 포트 번호를 지정해 주세요.")
    return value
