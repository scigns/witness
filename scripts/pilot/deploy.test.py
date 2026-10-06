"""Exercise the existing deploy script with fake infrastructure; never contacts a host."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

SOURCE = Path(__file__).resolve().parents[2]
CANDIDATE = "a" * 40
PREVIOUS = "b" * 40
OLD_API = "sha256:" + "1" * 64
OLD_WEB = "sha256:" + "2" * 64
NEW_API = "sha256:" + "3" * 64
NEW_WEB = "sha256:" + "4" * 64

FAKE = r'''#!/usr/bin/env python3
import json, os, sys
from pathlib import Path
root = Path(os.environ['FAKE_ROOT'])
name = Path(sys.argv[0]).name
args = sys.argv[1:]
with (root / 'calls').open('a') as log:
    log.write(json.dumps([name, args]) + '\n')
if name == 'git':
    if args == ['rev-parse', '--show-toplevel']: print(root)
    elif args == ['rev-parse', 'HEAD']: print('a' * 40)
    elif args[:1] == ['diff']: sys.exit(0)
    else: sys.exit(3)
elif name == 'docker':
    if args[:1] == ['inspect']:
        print('sha256:' + ('1' if args[-1] == 'api-container' else '2') * 64)
    elif args[:2] == ['image', 'inspect']:
        if '--format' in args: print('sha256:' + ('3' if 'api' in args[-1] else '4') * 64)
    elif args[:1] == ['compose']:
        if 'config' in args: print(json.dumps({'services':{'api':{'environment':{'SECRET':'fixture-secret'}}}}))
        elif 'ps' in args: print(args[-1] + '-container')
        elif 'exec' in args:
            if 'sh' in args:
                print('migration|checksum|finished|')
                sys.exit(0)
            if os.environ.get('FAIL_BACKUP') == '1': sys.exit(7)
            if 'pg_restore' in args and os.environ.get('FAIL_ARCHIVE') == '1': sys.exit(9)
            sys.stdout.buffer.write(b'PGDMP synthetic fixture')
        elif 'up' in args:
            files = [args[i + 1] for i, a in enumerate(args[:-1]) if a == '-f']
            text = Path(files[-1]).read_text()
            rollback = ('sha256:' + '1' * 64) in text
            if not rollback and os.environ.get('FAIL_RECREATE') == '1': sys.exit(10)
            if rollback and os.environ.get('WITNESS_BUILD_ID') != 'b' * 40: sys.exit(8)
            (root / 'state').write_text('old' if rollback else 'new')
    else: sys.exit(3)
elif name == 'curl':
    assert not any(a.startswith('-') and 'k' in a for a in args)
    if args[-1].endswith('/api/build-identity'):
        print(json.dumps({'buildId': ('b' if os.environ.get('WRONG_WEB_BUILD') == '1' else 'a') * 40}))
    if args[-1].endswith('/ready'):
        state = (root / 'state').read_text() if (root / 'state').exists() else 'old'
        wrong = os.environ.get('WRONG_BUILD') == '1'
        build = 'a' * 40 if state == 'new' and not wrong else 'b' * 40
        print(json.dumps({'status': 'ok', 'buildId': build, 'version': '0.4.0'}))
'''


class DeploySafety(unittest.TestCase):
    def test_wrong_web_artifact_rolls_back(self):
        result, calls, root = self.run_deploy(WRONG_WEB_BUILD='1')
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual((root / 'state').read_text(), 'old')

    def run_deploy(self, **flags):
        temporary = tempfile.TemporaryDirectory(prefix="witness-deploy-test-")
        self.addCleanup(temporary.cleanup)
        root = Path(temporary.name)
        for relative in ["scripts/pilot/deploy.sh", "scripts/pilot/backup.sh", "scripts/ops/backup-status.sh"]:
            destination = root / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(SOURCE / relative, destination)
        (root / "deployments/cloud-managed").mkdir(parents=True)
        (root / "services/api-gateway/prisma/migrations/fixture").mkdir(parents=True)
        (root / "services/api-gateway/prisma/schema.prisma").write_text('// fixture')
        (root / "services/api-gateway/prisma/migrations/fixture/migration.sql").write_text('SELECT 1;')
        (root / "package.json").write_text(json.dumps({"version": "0.4.1"}))
        (root / ".env").write_text("POSTGRES_USER=fixture\nPOSTGRES_DB=fixture\nPOSTGRES_PASSWORD=fixture\nKEYCLOAK_DB_USER=fixture\nKEYCLOAK_DB_PASSWORD=fixture\n")
        binary = root / "bin"
        binary.mkdir()
        for name in ["git", "docker", "curl"]:
            script = binary / name
            script.write_text(FAKE)
            script.chmod(0o700)
        environment = dict(os.environ, PATH=f"{binary}:{os.environ['PATH']}", FAKE_ROOT=str(root),
                           WITNESS_ENV_FILE=str(root / ".env"), WITNESS_DEPLOY_EVIDENCE_DIR=str(root / "evidence"),
                           WITNESS_APPROVED_RELEASE_SHA=CANDIDATE, WITNESS_DEPLOY_HEALTH_TIMEOUT_SECONDS="2",
                           WITNESS_PILOT_API_URL="https://api.fixture.example", WITNESS_PILOT_WEB_URL="https://app.fixture.example")
        environment.update(flags)
        result = subprocess.run(["bash", str(root / "scripts/pilot/deploy.sh")], cwd=root, env=environment, capture_output=True, text=True, timeout=30)
        calls = [json.loads(line) for line in (root / "calls").read_text().splitlines()]
        return result, calls, root

    def test_missing_approval_never_touches_infrastructure(self):
        result, calls, _ = self.run_deploy(WITNESS_APPROVED_RELEASE_SHA="")
        self.assertNotEqual(result.returncode, 0)
        self.assertTrue(all(name == "git" for name, _ in calls))

    def test_success_records_exact_images_and_backs_up_before_migration(self):
        result, calls, root = self.run_deploy()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        manifest = (root / "evidence/manifest.txt").read_text()
        for value in [CANDIDATE, PREVIOUS, OLD_API, OLD_WEB, NEW_API, NEW_WEB]:
            self.assertIn(value, manifest)
        backups = [i for i, (_, args) in enumerate(calls) if "pg_dump" in args]
        migration = next(i for i, (_, args) in enumerate(calls) if "migrate" in args)
        self.assertEqual(len(backups), 2)
        self.assertLess(max(backups), migration)

    def test_wrong_build_rolls_back_exact_previous_images_and_identity(self):
        result, _, root = self.run_deploy(WRONG_BUILD="1")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("rollback succeeded", result.stdout)
        self.assertEqual((root / "state").read_text(), "old")

    def test_recreate_failure_rolls_back(self):
        result, _, root = self.run_deploy(FAIL_RECREATE="1")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("rollback succeeded", result.stdout)
        self.assertEqual((root / "state").read_text(), "old")

    def test_invalid_archive_prevents_migration(self):
        result, calls, _ = self.run_deploy(FAIL_ARCHIVE="1")
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(any("migrate" in args or "up" in args for _, args in calls))

    def test_failed_backup_prevents_migration_and_recreation(self):
        result, calls, _ = self.run_deploy(FAIL_BACKUP="1")
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(any("migrate" in args or "up" in args for _, args in calls))


if __name__ == "__main__":
    unittest.main()
