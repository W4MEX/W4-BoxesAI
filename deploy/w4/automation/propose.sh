#!/usr/bin/env bash
set -euo pipefail

upstream=https://github.com/activepieces/activepieces.git
lock=deploy/w4/upstream.json
base=$(jq -er '.commit' "$lock")
version=$(jq -er '.version' "$lock")
tag=$(gh api repos/activepieces/activepieces/releases/latest --jq .tag_name)
[[ "$base" =~ ^[a-f0-9]{40}$ ]]
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]
[[ "$tag" =~ ^v?[0-9]+\.[0-9]+\.[0-9]+$ ]]
target_version="${tag#v}"
if [[ "$target_version" == "$version" || "$(printf '%s\n' "$version" "$target_version" | sort -V | tail -1)" != "$target_version" ]]; then
  echo "No newer stable release"
  exit 0
fi
target=$(git ls-remote --exit-code "$upstream" "refs/tags/$tag" "refs/tags/$tag^{}" |
  awk 'NR==1 {ref=$1} /\^\{\}$/ {ref=$1} END {print ref}')
[[ "$target" =~ ^[a-f0-9]{40}$ ]]
if [[ "$base" == "$target" ]]; then exit 0; fi
branch="upstream/activepieces-${target_version}-${target:0:12}"
tmp=$(mktemp -d)
trap 'rm -rf -- "$tmp"' EXIT
cat > "$tmp/body.txt" <<EOF
Activepieces ${version} -> ${target_version}
Base: ${base}
Target: ${target}

See deploy/w4/upstream-proposal.json for applied files, conflicts and license changes.
Review the candidate license and dependency notices. Resolve conflicts while preserving W4 features.
After reconciliation, update deploy/w4/upstream.json and remove the pending proposal marker.
Approve the verification workflow if GitHub requests approval, then request a human review.
EOF
create_pr() {
  gh pr create --draft --base main --head "$branch" --title "Propose Activepieces ${target_version}" --body-file "$tmp/body.txt"
}
if git ls-remote --exit-code --heads origin "refs/heads/$branch" >/dev/null; then
  existing=$(gh pr list --head "$branch" --base main --state all --json number --jq 'length')
  if [[ "$existing" == 0 ]]; then create_pr; fi
  exit 0
else
  code=$?
  [[ "$code" -eq 2 ]]
fi
export BASE_SHA="$base" TARGET_SHA="$target" ARCHIVE_DIR="$tmp"
PYTHONPATH=deploy/w4/automation python3 - <<'PY'
import os
from pathlib import Path
from core_sync import download
folder = Path(os.environ["ARCHIVE_DIR"])
download(os.environ["BASE_SHA"], folder / "old.tar.gz")
download(os.environ["TARGET_SHA"], folder / "new.tar.gz")
PY
git switch -c "$branch"
python3 deploy/w4/automation/core_sync.py --root "$PWD" --old "$tmp/old.tar.gz" --new "$tmp/new.tar.gz" --commit "$target"
git -c core.hooksPath=/dev/null add -A
PYTHONPATH=deploy/w4/automation python3 - <<'PY'
from pathlib import Path
from audit_publication import audit
count, issues = audit(Path.cwd())
for reason, path in issues:
    print(f"{reason}: {path}")
if issues:
    raise SystemExit("Candidate failed publication audit")
print(f"Publication checks scanned {count} paths")
PY
git -c core.hooksPath=/dev/null -c user.name='github-actions[bot]' -c user.email='41898282+github-actions[bot]@users.noreply.github.com' commit -m "Propose Activepieces ${target_version}"
git push origin "HEAD:refs/heads/$branch"
create_pr