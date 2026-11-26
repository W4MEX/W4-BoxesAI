import hashlib, io, json, subprocess, sys, tarfile
import tempfile
import unittest
from pathlib import Path
from core_sync import apply_delta, approved

class SyncTests(unittest.TestCase):
    def test_scopes(self):
        self.assertTrue(approved("packages/web/src/example.ts"))
        for path in (
            ".github/workflows/publish.yml", "packages/ee/LICENSE",
            "packages/server/api/src/app/ee/a.ts", "packages/a/.env.local",
            "packages/server/api/src/app/w4/access-policy.ts",
            "packages/a/../../outside", "packages/a/C:bad",
        ):
            self.assertFalse(approved(path), path)

    def test_preserves_local_edits_and_updates_clean_files(self):
        with tempfile.TemporaryDirectory() as workspace:
            root = Path(workspace)
            (root / "packages/core").mkdir(parents=True)
            (root / "packages/core/core.ts").write_bytes(b"old\r\n")
            (root / "packages/core/sidebar.ts").write_bytes(b"W4 selector")
            (root / "packages/core/deleted.ts").write_bytes(b"old")
            old = {"packages/core/core.ts": b"old\n", "packages/core/sidebar.ts": b"old", "packages/core/deleted.ts": b"old"}
            new = {"packages/core/core.ts": b"new", "packages/core/sidebar.ts": b"upstream", "packages/core/added.ts": b"new"}
            result = apply_delta(root, old, new)
            self.assertEqual(result["conflicts"], ["packages/core/sidebar.ts"])
            self.assertEqual(result["applied"], ["packages/core/added.ts", "packages/core/core.ts", "packages/core/deleted.ts"])
            self.assertEqual((root / "packages/core/sidebar.ts").read_bytes(), b"W4 selector")
            self.assertEqual((root / "packages/core/core.ts").read_bytes(), b"new")
            self.assertEqual(apply_delta(root, old, new)["applied"], [])

    def test_license_change_creates_report_without_importing_code(self):
        with tempfile.TemporaryDirectory() as workspace:
            root = Path(workspace)
            (root / "deploy/w4").mkdir(parents=True)
            (root / "packages/core").mkdir(parents=True)
            source = root / "packages/core/core.ts"
            source.write_bytes(b"old")
            old_license = b"old license"
            base = "a" * 40
            (root / "deploy/w4/upstream.json").write_text(json.dumps({
                "commit": base, "license_sha256": hashlib.sha256(old_license).hexdigest(),
            }))
            for name, license, code in (("old", old_license, b"old"), ("new", b"new license", b"new")):
                with tarfile.open(root / f"{name}.tar.gz", "w:gz") as archive:
                    for filename, data in (("LICENSE", license), ("package.json", b"{}"), ("packages/core/core.ts", code)):
                        member = tarfile.TarInfo(f"source/{filename}")
                        member.size = len(data)
                        archive.addfile(member, io.BytesIO(data))
            subprocess.run([
                sys.executable, str(Path(__file__).with_name("core_sync.py")),
                "--root", str(root), "--old", str(root / "old.tar.gz"),
                "--new", str(root / "new.tar.gz"), "--commit", "b" * 40,
            ], check=True, capture_output=True)
            proposal = json.loads((root / "deploy/w4/upstream-proposal.json").read_text())
            self.assertEqual(proposal["license_changes"], ["LICENSE"])
            self.assertEqual(proposal["applied"], [])
            self.assertEqual(source.read_bytes(), b"old")

if __name__ == "__main__":
    unittest.main()
