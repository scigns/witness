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
import json, os, sys, hashlib
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
        if args[-1].startswith('ghcr.io/'):
            kind = 'api' if 'witness-api@' in args[-1] else 'web'
            labels = {'org.opencontainers.image.revision': ('b' if os.environ.get('WRONG_REVISION') == '1' else 'a') * 40,
                      'org.opencontainers.image.version': '0.4.1', 'org.opencontainers.image.source': 'https://github.com/scigns/witness'}
            labels.update({'io.witness.web.api-url':'https://api.buildwithwitness.com','io.witness.web.profile':'hybrid'})
            print(json.dumps([{'Id':'sha256:' + ('3' if kind == 'api' else '4') * 64,
                'RepoDigests': [] if os.environ.get('WRONG_REPO_DIGEST') == '1' else [args[-1]],
                'Os':'linux','Architecture':'amd64','Config':{'Labels': labels, 'Env':['WITNESS_BUILD_ID='+'a'*40]}}]))
    elif args[:1] == ['pull']:
        if os.environ.get('FAIL_PULL') == '1': sys.exit(11)
    elif args[:1] == ['run']:
        files = [root/'services/api-gateway/prisma/schema.prisma', root/'services/api-gateway/prisma/migrations/fixture/migration.sql']
        print(json.dumps([{'path':str(p.relative_to(root/'services/api-gateway/prisma')), 'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in files]))
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
        elif 'run' in args:
            assert '--no-build' in args
            files = [args[i + 1] for i, a in enumerate(args[:-1]) if a == '-f']
            (root/'migration-image.txt').write_text(Path(files[-1]).read_text())
        elif 'up' in args:
            assert '--no-build' in args
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
        for relative in ["scripts/pilot/deploy.sh", "scripts/pilot/backup.sh", "scripts/ops/backup-status.sh", "scripts/release/artifacts.py", "scripts/release/image-build.json"]:
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
        import hashlib
        migration_root = root / "services/api-gateway/prisma"
        manifest = {'schema_version':1, 'published':True, 'git_sha':CANDIDATE, 'version':'0.4.1', 'platform':'linux/amd64',
                    'created_at':'2026-10-06T00:00:00Z',
                    'build':{'workflow':'.github/workflows/ci.yml','run_id':'123'},
                    'publication':{'workflow':'.github/workflows/release-artifacts.yml','run_id':'456'},
                    'build_inputs':json.loads((root/'scripts/release/image-build.json').read_text()),
                    'migrations':[{'path':str(p.relative_to(migration_root)), 'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
                                  for p in [migration_root/'schema.prisma',migration_root/'migrations/fixture/migration.sql']],
                    'images':{kind:{'repository':f'ghcr.io/scigns/witness-{kind}','digest':'sha256:'+digit*64,'oci_revision':CANDIDATE}
                              for kind,digit in [('api','6'),('web','7')]}}
        patch = flags.pop('MANIFEST_PATCH', None)
        if patch: patch(manifest)
        manifest_file = root/'release-manifest.json'
        manifest_file.write_text(json.dumps(manifest))
        environment = dict(os.environ, PATH=f"{binary}:{os.environ['PATH']}", FAKE_ROOT=str(root),
                           WITNESS_ENV_FILE=str(root / ".env"), WITNESS_DEPLOY_EVIDENCE_DIR=str(root / "evidence"),
                           WITNESS_APPROVED_RELEASE_SHA=CANDIDATE, WITNESS_DEPLOY_HEALTH_TIMEOUT_SECONDS="2",
                           WITNESS_RELEASE_MANIFEST=str(manifest_file), WITNESS_APPROVED_ARTIFACT_RUN_ID='456',
                           WITNESS_APPROVED_API_IMAGE='ghcr.io/scigns/witness-api@sha256:'+'6'*64,
                           WITNESS_APPROVED_WEB_IMAGE='ghcr.io/scigns/witness-web@sha256:'+'7'*64,
                           WITNESS_APPROVED_ROLLBACK_RELEASE_SHA=CANDIDATE,
                           WITNESS_APPROVED_ROLLBACK_API_IMAGE=OLD_API, WITNESS_APPROVED_ROLLBACK_WEB_IMAGE=OLD_WEB,
                           WITNESS_PILOT_API_URL="https://api.fixture.example", WITNESS_PILOT_WEB_URL="https://app.fixture.example")
        environment.update(flags)
        result = subprocess.run(["bash", str(root / "scripts/pilot/deploy.sh")], cwd=root, env=environment, capture_output=True, text=True, timeout=30)
        calls = [json.loads(line) for line in (root / "calls").read_text().splitlines()]
        return result, calls, root

    def test_missing_approval_never_touches_infrastructure(self):
        result, calls, _ = self.run_deploy(WITNESS_APPROVED_RELEASE_SHA="")
        self.assertNotEqual(result.returncode, 0)
        self.assertTrue(all(name == "git" for name, _ in calls))

    def test_missing_or_stale_rollback_approval_prevents_mutation(self):
        for flags in [dict(WITNESS_APPROVED_ROLLBACK_RELEASE_SHA=""),
                      dict(WITNESS_APPROVED_ROLLBACK_RELEASE_SHA=PREVIOUS),
                      dict(WITNESS_APPROVED_ROLLBACK_API_IMAGE=NEW_API),
                      dict(WITNESS_APPROVED_ROLLBACK_WEB_IMAGE=NEW_WEB)]:
            with self.subTest(flags=flags):
                result, calls, root = self.run_deploy(**flags)
                self.assertNotEqual(result.returncode, 0)
                self.assertFalse((root / "evidence").exists())
                self.assertFalse(any(any(action in args for action in ["build", "migrate", "up", "pg_dump"]) for _, args in calls))

    def test_bad_digest_repository_and_sha_refuse_before_pull(self):
        patches = [lambda m: m['images']['api'].update(digest='latest'),
                   lambda m: m['images']['web'].update(repository='ghcr.io/attacker/web'),
                   lambda m: m.update(git_sha=PREVIOUS),
                   lambda m: m.update(migrations=[])]
        for patch in patches:
            result, calls, _ = self.run_deploy(MANIFEST_PATCH=patch)
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse(any(name=='docker' for name,_ in calls))

    def test_missing_image_and_run_approval_refuse_before_pull(self):
        for flag in ['WITNESS_APPROVED_API_IMAGE','WITNESS_APPROVED_WEB_IMAGE','WITNESS_APPROVED_ARTIFACT_RUN_ID']:
            result, calls, _ = self.run_deploy(**{flag:''})
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse(any(name=='docker' for name,_ in calls))

    def test_registry_failure_and_wrong_metadata_refuse_before_backup(self):
        for flag in ['FAIL_PULL', 'WRONG_REVISION', 'WRONG_REPO_DIGEST']:
            result, calls, _ = self.run_deploy(**{flag:'1'})
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse(any(any(action in args for action in ['build','migrate','up','pg_dump']) for _,args in calls))

    def test_no_build_and_migration_uses_verified_artifact(self):
        result, calls, root = self.run_deploy()
        self.assertEqual(result.returncode, 0, result.stdout+result.stderr)
        self.assertFalse(any('build' in args for _,args in calls))
        pulls = [args[-1] for name,args in calls if name=='docker' and args[:1]==['pull']]
        self.assertEqual(pulls,['ghcr.io/scigns/witness-api@sha256:'+'6'*64,'ghcr.io/scigns/witness-web@sha256:'+'7'*64])
        self.assertIn(NEW_API,(root/'migration-image.txt').read_text())
        self.assertIn(NEW_WEB,(root/'migration-image.txt').read_text())
        for _,args in calls:
            if 'up' in args or 'migrate' in args:
                self.assertIn('--no-build',args)

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
