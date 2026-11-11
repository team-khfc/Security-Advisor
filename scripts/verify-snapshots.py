"""배포 스냅샷의 해시와 파일 목록을 릴리스 명세와 대조한다."""
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parent.parent
manifest = json.loads((root / 'snapshots.json').read_text(encoding='utf-8'))
def digest(path):
    data = path.read_bytes()
    # 원본 .gitattributes가 Windows 배치 파일을 CRLF로 체크아웃한다.
    if path.suffix == '.bat':
        data = data.replace(b'\r\n', b'\n')
    return hashlib.sha256(data).hexdigest()

for name, entry in manifest.items():
    actual = {
        str(path.relative_to(root / name)).replace('\\', '/'): digest(path)
        for path in (root / name).rglob('*') if path.is_file()
        and not any(part in {'.next', 'node_modules', '.gradle', 'build'} for part in path.parts)
    }
    expected = {row['path']: row['sha256'] for row in entry['files']}
    if len(expected) != len(entry['files']):
        raise SystemExit(f'{name}: duplicate snapshot paths')
    if actual != expected:
        changed = sorted(key for key in actual.keys() | expected.keys() if actual.get(key) != expected.get(key))
        raise SystemExit(f'{name}: snapshot mismatch: {changed}')
    print(f"PASS {name}: {len(actual)} files, source {entry['commit']}")
