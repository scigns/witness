"""Recovery approval boundaries; no Docker, services or network."""
import copy
import json
import os
from pathlib import Path
import unittest
from unittest.mock import patch
import artifacts


class RecoveryApproval(unittest.TestCase):
    def setUp(self):
        self.candidate = 'a' * 40
        self.recovery = 'b' * 40
        self.manifest = {
            'schema_version': 1, 'published': True, 'git_sha': self.recovery,
            'version': json.loads(Path('package.json').read_text())['version'],
            'platform': 'linux/amd64', 'migrations': artifacts.inventory(),
            'build_inputs': json.loads(Path('scripts/release/image-build.json').read_text()),
            'build': {'workflow': '.github/workflows/ci.yml', 'run_id': '123'},
            'publication': {'workflow': '.github/workflows/release-artifacts.yml', 'run_id': '456'},
            'images': {kind: {'repository': artifacts.REPOSITORIES[kind],
                             'digest': 'sha256:' + digit * 64, 'oci_revision': self.recovery}
                       for kind, digit in [('api', '1'), ('web', '2')]},
        }
        self.env = {
            'WITNESS_APPROVED_ROLLBACK_RELEASE_SHA': self.candidate,
            'WITNESS_APPROVED_ROLLBACK_SHA': self.recovery,
            'WITNESS_APPROVED_ROLLBACK_ARTIFACT_RUN_ID': '456',
            **{'WITNESS_APPROVED_ROLLBACK_' + kind.upper() + '_REF':
               item['repository'] + '@' + item['digest']
               for kind, item in self.manifest['images'].items()},
        }

    def validate(self, manifest=None, **env):
        with patch.dict(os.environ, {**self.env, **env}, clear=True), patch.object(
                artifacts.subprocess, 'check_output', return_value=self.candidate + '\n'):
            artifacts.validate_recovery(manifest or self.manifest)

    def test_exact_candidate_and_recovery_tuple_passes(self):
        self.validate()

    def test_missing_or_stale_approval_refuses(self):
        for key in self.env:
            with self.subTest(key=key), self.assertRaises(ValueError):
                self.validate(**{key: ''})
        with self.assertRaises(ValueError):
            self.validate(WITNESS_APPROVED_ROLLBACK_RELEASE_SHA='c' * 40)

    def test_different_schema_unpublished_or_untrusted_artifact_refuses(self):
        for mutation in [lambda m: m.update(migrations=[]),
                         lambda m: m.update(published=False),
                         lambda m: m['images']['api'].update(digest='latest'),
                         lambda m: m['images']['web'].update(repository='ghcr.io/other/web'),
                         lambda m: m['images']['api'].update(oci_revision=self.candidate),
                         lambda m: m['publication'].update(run_id='789')]:
            manifest = copy.deepcopy(self.manifest)
            mutation(manifest)
            with self.subTest(manifest=manifest), self.assertRaises(ValueError):
                self.validate(manifest)


if __name__ == '__main__':
    unittest.main()
