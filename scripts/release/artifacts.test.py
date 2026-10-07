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



class CommercialDeploymentConfig(unittest.TestCase):
    def setUp(self):
        self.inputs = {'NEXT_PUBLIC_WITNESS_API_URL': 'https://api.example.invalid',
                       'NEXT_PUBLIC_WITNESS_PROFILE': 'hybrid', 'NEXT_PUBLIC_WITNESS_BASE_PATH': ''}
        self.fields = ('BILLING_LEGAL_NAME', 'BILLING_ADDRESS', 'BILLING_EMAIL',
                       'BILLING_BANK_ACCOUNT_NAME', 'BILLING_BANK_BSB', 'BILLING_BANK_ACCOUNT_NUMBER')
        self.config = {'services': {
            'web': {'environment': {'WITNESS_IMAGE_' + key.removeprefix('NEXT_PUBLIC_WITNESS_'): value
                                    for key, value in self.inputs.items()}},
            'api': {'environment': {'WITNESS_DEPLOYMENT_PROFILE': 'hybrid',
                                    **{key: 'synthetic fixture' for key in self.fields}}}}}

    def test_complete_supplier_profile_and_matching_build_inputs_pass(self):
        artifacts.validate_deployment_config(self.config, self.inputs)

    def test_missing_blank_or_nonstring_supplier_fields_refuse_without_values_in_error(self):
        for key in self.fields:
            for missing in (None, '', '   ', 123):
                config = copy.deepcopy(self.config)
                config['services']['api']['environment'][key] = missing
                with self.subTest(key=key, value=missing), self.assertRaisesRegex(
                        ValueError, '^commercial supplier profile missing: ' + key + '$'):
                    artifacts.validate_deployment_config(config, self.inputs)

    def test_build_drift_still_refuses(self):
        config = copy.deepcopy(self.config)
        config['services']['web']['environment']['WITNESS_IMAGE_API_URL'] = 'https://other.example.invalid'
        with self.assertRaises(ValueError):
            artifacts.validate_deployment_config(config, self.inputs)

    def test_production_compose_forwards_reviewed_supplier_fields(self):
        compose = Path('deployments/cloud-managed/docker-compose.pilot.yml').read_text()
        for key in self.fields:
            self.assertIn(key + ': ${' + key + ':-}', compose)



class OfflineRuntimeConfig(unittest.TestCase):
    def test_installed_validator_is_offline_and_secret_values_use_stdin_only(self):
        from types import SimpleNamespace
        env = {'KEYCLOAK_SMTP_PASSWORD': 'private-synthetic-secret',
               'BILLING_BANK_ACCOUNT_NUMBER': 'private-synthetic-remittance'}
        ref = 'ghcr.io/scigns/witness-api@sha256:' + '1' * 64
        with patch.object(artifacts.subprocess, 'run', return_value=SimpleNamespace(returncode=0)) as run:
            artifacts.validate_runtime_config(env, ref)
        args, kwargs = run.call_args
        self.assertIn('none', args[0])
        self.assertIn(ref, args[0])
        self.assertIn('-i', args[0])
        self.assertTrue(kwargs['capture_output'])
        self.assertEqual(json.loads(kwargs['input']), env)
        self.assertNotIn(env['KEYCLOAK_SMTP_PASSWORD'], str(args))
        self.assertNotIn(env['BILLING_BANK_ACCOUNT_NUMBER'], str(args))

    def test_invalid_runtime_refuses_without_emitting_validator_output(self):
        from types import SimpleNamespace
        result = SimpleNamespace(returncode=1, stderr='private-synthetic-secret', stdout='private-remittance')
        with patch.object(artifacts.subprocess, 'run', return_value=result), self.assertRaisesRegex(
                ValueError, '^candidate runtime configuration rejected; review protected production settings$'):
            artifacts.validate_runtime_config({}, 'ghcr.io/scigns/witness-api@sha256:' + '1' * 64)


if __name__ == '__main__':
    unittest.main()
