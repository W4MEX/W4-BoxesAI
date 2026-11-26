"""Import approved Activepieces source paths. Never import upstream Git history."""
import argparse
import hashlib
import json
import re
import tarfile
import urllib.request
from pathlib import Path, PurePosixPath

ROOT_FILES = {
    "LICENSE", "package.json", "bun.lock", "tsconfig.base.json", "tsconfig.json",
    "turbo.json", "bunfig.toml", ".eslintrc.json", ".eslintrc.cjs",
    ".eslintignore", ".prettierrc", ".prettierignore", ".gitattributes",
}
UPSTREAM_ROOTS = ("packages/", "scripts/", "tools/")
EXCLUDED = ("packages/ee/", "packages/server/api/src/app/ee/")
LOCAL_PREFIXES = ("deploy/w4/", "packages/server/api/src/app/w4/", "packages/web/public/w4-brand/")
SECRET_NAME = re.compile(r"(^|/)(\.env[^/]*|id_(rsa|ed25519)|credentials(?:\.json)?|\.npmrc|[^/]+\.(?:pem|key|pfx|tfstate|sqlite3?|tar|tgz|zip|dump))(?:/|$)", re.I)
SECRET_CONTENT = re.compile(rb"-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----|(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|xox[baprs]-[A-Za-z0-9-]{16,})")
COMMERCIAL_IMPORT = re.compile(rb"""(?:from\s*|import\s*\(\s*|require\s*\(\s*)["'](?:@activepieces/ee(?:[-/\w]*|$)|[^"']*/app/ee/|[^"']*/packages/ee/)""")
LICENSE = re.compile(r"(^|/)(licen[cs]e|copying|notice)([._-]|$)", re.I)
SHA = re.compile(r"[0-9a-f]{40}")

def safe_path(name):
    path = PurePosixPath(name)
    return not path.is_absolute() and not any(part.casefold() in {'.git', '..'} or ':' in part or '\\' in part for part in path.parts)

def approved(name):
    if not safe_path(name) or SECRET_NAME.search(name) or name.startswith(EXCLUDED + LOCAL_PREFIXES):
        return False
    return name in ROOT_FILES or name.startswith(UPSTREAM_ROOTS)

def snapshot(archive):
    result = {}
    with tarfile.open(archive, "r:gz") as tar:
        for member in tar:
            if not member.isfile() or "/" not in member.name:
                continue
            _, name = member.name.split("/", 1)
            if approved(name):
                if name in result or member.size > 35_000_000:
                    raise ValueError(f"Unexpected archive member: {name}")
                result[name] = tar.extractfile(member).read()
    if "LICENSE" not in result or "package.json" not in result:
        raise ValueError("Archive lacks required base files")
    return result

def download(commit, path):
    if SHA.fullmatch(commit) is None:
        raise ValueError("Commit must be a full Git SHA")
    url = f"https://codeload.github.com/activepieces/activepieces/tar.gz/{commit}"
    with urllib.request.urlopen(url, timeout=90) as response, path.open("wb") as stream:
        total = 0
        while chunk := response.read(1024 * 1024):
            total += len(chunk)
            if total > 250_000_000:
                raise ValueError("Archive exceeds the allowed size")
            stream.write(chunk)

def normalized(data):
    if data is not None and b"\0" not in data:
        return data.replace(b"\r\n", b"\n")
    return data

def syncable(name):
    return name in ROOT_FILES or name.startswith((
        "packages/core/", "packages/server/", "packages/web/",
        "packages/pieces/common/", "packages/pieces/framework/", "packages/pieces/core/",
    ))

def apply_delta(root, old, new):
    conflicts, applied, license_changes = [], [], []
    for name in sorted(old.keys() | new.keys()):
        before, after = old.get(name), new.get(name)
        if not syncable(name) or before == after:
            continue
        path = root / name
        if LICENSE.search(name):
            license_changes.append(name)
        if name in {"LICENSE", "package.json", "bun.lock"}:
            conflicts.append(name)
            continue
        current = path.read_bytes() if path.is_file() else None
        if normalized(current) == normalized(after):
            continue
        if normalized(current) != normalized(before):
            conflicts.append(name)
            continue
        if after is None:
            path.unlink()
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(after)
        applied.append(name)
    return {"applied": applied, "conflicts": conflicts, "license_changes": license_changes}

def is_license_change(name, before, after):
    if LICENSE.search(name):
        return True
    if not name.endswith("/package.json"):
        return False
    def declaration(data):
        return json.loads(data).get("license") if data else None
    return declaration(before) != declaration(after)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--old", type=Path, required=True)
    parser.add_argument("--new", type=Path, required=True)
    parser.add_argument("--commit", required=True)
    args = parser.parse_args()
    if not SHA.fullmatch(args.commit):
        parser.error("--commit must be a full SHA")
    lock_path = args.root / "deploy/w4/upstream.json"
    lock = json.loads(lock_path.read_text(encoding="utf-8"))
    old, new = snapshot(args.old), snapshot(args.new)
    normalized_license = normalized(old["LICENSE"])
    if hashlib.sha256(normalized_license).hexdigest() != lock["license_sha256"]:
        raise SystemExit("Baseline LICENSE differs from the reviewed lock")
    changed_licenses = [
        name for name in sorted(old.keys() | new.keys())
        if syncable(name) and normalized(old.get(name)) != normalized(new.get(name))
        and is_license_change(name, old.get(name), new.get(name))
    ]
    if changed_licenses:
        result = {"applied": [], "conflicts": [], "license_changes": changed_licenses}
    else:
        result = apply_delta(args.root, old, new)
    result.update(base=lock["commit"], target=args.commit, review_required=True)
    if normalized(new["LICENSE"]) != normalized_license:
        result["license_scope_changed"] = True
    report = args.root / "deploy/w4/upstream-proposal.json"
    report.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(f"Applied {len(result['applied'])} files; preserved {len(result['conflicts'])} conflicts for review")

if __name__ == "__main__":
    main()
