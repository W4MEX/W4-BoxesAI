import hashlib
import json
import subprocess
import sys
from pathlib import Path

from core_sync import EXCLUDED, SECRET_CONTENT, SECRET_NAME, SHA, safe_path

def audit(root):
    found = []
    paths = subprocess.check_output(["git", "ls-files", "-z"], cwd=root).decode().split("\0")
    for name in filter(None, paths):
        if not safe_path(name) or name.startswith(EXCLUDED) or SECRET_NAME.search(name):
            found.append(("prohibited path", name))
            continue
        path = root / name
        if path.is_symlink() or not path.is_file():
            found.append(("not a regular file", name))
            continue
        if path.stat().st_size > 35_000_000:
            found.append(("oversized file", name))
            continue
        data = path.read_bytes()
        if b"\0" not in data and SECRET_CONTENT.search(data):
            found.append(("credential-shaped text", name))
    return len(paths) - 1, found

def verify(root):
    count, found = audit(root)
    lock = json.loads((root / "deploy/w4/upstream.json").read_text(encoding="utf-8"))
    license_data = (root / "LICENSE").read_bytes().replace(b"\r\n", b"\n")
    if lock["repository"] != "activepieces/activepieces" or not SHA.fullmatch(lock["commit"]):
        found.append(("invalid upstream lock", "deploy/w4/upstream.json"))
    if hashlib.sha256(license_data).hexdigest() != lock["license_sha256"]:
        found.append(("unreviewed base license", "LICENSE"))
    if (root / "deploy/w4/upstream-proposal.json").exists():
        found.append(("unresolved update proposal", "deploy/w4/upstream-proposal.json"))
    print(f"Scanned {count} tracked paths; findings: {len(found)}")
    for reason, name in found:
        print(f"{reason}: {name}")
    return not found

if __name__ == "__main__":
    sys.exit(0 if verify(Path.cwd()) else 1)
