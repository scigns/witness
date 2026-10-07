"""Publication trust boundaries, without contacting GitHub, Docker or production."""
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import publication

SHA = 'a' * 40
ROOT = Path(__file__).resolve().parents[2]


class PublicationSafety(unittest.TestCase):
    def test_recovery_run_requires_successful_trusted_exact_sha_publication(self):
        env = {'WITNESS_APPROVED_ROLLBACK_SHA': SHA,
               'WITNESS_APPROVED_ROLLBACK_ARTIFACT_RUN_ID': '456'}
        run = {'head_sha': SHA, 'conclusion': 'success', 'workflow_id': 789,
               'head_repository': {'full_name': 'scigns/witness'}, 'event': 'push',
               'head_branch': 'witness-artifact-' + SHA}
        def api(path):
            return {'id': 789} if 'workflows/' in path else run
        with patch.dict(os.environ, env), patch.object(publication, 'api', side_effect=api):
            publication.release_run(recovery=True)
            for key, value in [('head_sha', 'b' * 40), ('conclusion', 'failure'),
                               ('workflow_id', 123), ('event', 'pull_request')]:
                old = run[key]
                run[key] = value
                with self.subTest(key=key), self.assertRaises(ValueError):
                    publication.release_run(recovery=True)
                run[key] = old

    def run_gate(self, **overrides):
        with tempfile.TemporaryDirectory() as temp:
            env = {'GITHUB_SHA':SHA, 'GITHUB_EVENT_NAME':'push', 'GITHUB_REPOSITORY':'scigns/witness',
                   'GITHUB_REF':'refs/tags/witness-artifact-'+SHA, 'GITHUB_OUTPUT':temp+'/outputs'}
            env.update(overrides)
            run = {'head_sha':SHA,'conclusion':'success','head_repository':{'full_name':'scigns/witness'},
                   'event':'pull_request','id':123,'run_attempt':1}
            def api(path):
                if 'codeql.yml' in path: return {'workflow_runs':[]}
                return {'workflow_runs':[run]}
            with patch.dict(os.environ,env), patch.object(publication,'api',side_effect=api), patch.object(publication.subprocess,'check_output',return_value=SHA+'\n'):
                publication.gates()
            return Path(env['GITHUB_OUTPUT']).read_text()

    def test_only_explicit_exact_sha_trusted_tag_is_publishable(self):
        self.assertIn('ci_run=123',self.run_gate())
        for env in [dict(GITHUB_EVENT_NAME='pull_request'),dict(GITHUB_REF='refs/heads/main'),
                    dict(GITHUB_REF='refs/tags/witness-artifact-'+'b'*40),dict(GITHUB_REPOSITORY='attacker/witness')]:
            with self.subTest(env=env), self.assertRaises(ValueError):
                self.run_gate(**env)

    def test_latest_failed_or_pending_gates_are_not_passing(self):
        for conclusion in ['failure', None, 'cancelled']:
            run={'head_sha':SHA,'conclusion':conclusion}
            with tempfile.TemporaryDirectory() as temp, patch.dict(os.environ,{'GITHUB_SHA':SHA,'GITHUB_EVENT_NAME':'push','GITHUB_REPOSITORY':'scigns/witness','GITHUB_REF':'refs/tags/witness-artifact-'+SHA,'GITHUB_OUTPUT':temp+'/out'}), patch.object(publication,'api',return_value={'workflow_runs':[run]}), patch.object(publication.subprocess,'check_output',return_value=SHA+'\n'), self.assertRaises(ValueError):
                publication.gates()

    def test_build_job_has_no_production_secrets_or_registry_write(self):
        ci=(ROOT/'.github/workflows/ci.yml').read_text()
        image_job=ci.split('  images:\n')[1].split('  gate:\n')[0]
        self.assertNotIn('secrets.',image_job)
        self.assertNotIn('packages: write',image_job)
        self.assertIn('runs-on: ubuntu-latest',image_job)
        build=(ROOT/'scripts/release/build-images.sh').read_text()
        self.assertNotIn('docker login',build)
        self.assertNotIn('--secret',build)
        self.assertNotIn('DATABASE_URL',build)
        self.assertNotIn('GHCR_TOKEN',build)
        publisher=(ROOT/'scripts/release/publication.py').read_text()
        self.assertNotIn("['docker', 'build'",publisher)
        self.assertNotIn("['docker', 'buildx'",publisher)
        self.assertIn("'load'",publisher)
        self.assertIn("'push'",publisher)

    def test_compose_has_no_api_web_build_fallback(self):
        import re
        compose=(ROOT/'deployments/cloud-managed/docker-compose.pilot.yml').read_text()
        for kind in ['api','web']:
            block=re.search(r'^  '+kind+r':\n(.*?)(?=^  \S|\Z)',compose,re.M|re.S).group(1)
            self.assertNotRegex(block,r'(?m)^\s+build:')
            self.assertIn('pull_policy: never',block)
            self.assertIn('@sha256:'+'0'*64,block)


if __name__ == '__main__':
    unittest.main()
