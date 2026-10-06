#!/usr/bin/env python3
"""Trusted full-SHA tag publication; imports existing CI bytes, never compiles."""
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from artifacts import REPOSITORIES, SHA, inspect_image, inventory, require


def api(path):
    return json.loads(subprocess.check_output(['gh', 'api', path], text=True))


def gates():
    sha = subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()
    require(SHA.fullmatch(sha) and sha == os.environ['GITHUB_SHA'], 'checkout mismatch')
    require(os.environ['GITHUB_EVENT_NAME'] == 'push', 'publication is tag-push only')
    require(os.environ['GITHUB_REPOSITORY'] == 'scigns/witness', 'wrong source repository')
    require(os.environ['GITHUB_REF'] == 'refs/tags/witness-artifact-' + sha, 'tag must name the exact approved SHA')
    selected = {}
    for workflow in ('ci.yml', 'security.yml', 'codeql.yml'):
        runs = api(f'repos/scigns/witness/actions/workflows/{workflow}/runs?head_sha={sha}&per_page=100')['workflow_runs']
        if workflow == 'codeql.yml' and not runs:
            continue # Existing CodeQL scope is main/develop; do not change its gates.
        require(bool(runs), f'no exact-SHA {workflow} evidence')
        run = runs[0]
        require(run['head_sha'] == sha and run['conclusion'] == 'success', f'latest {workflow} has not passed')
        require(run['head_repository']['full_name'] == 'scigns/witness', 'fork artifacts are not publishable')
        require(run['event'] in ('push', 'pull_request'), 'invalid validation context')
        selected[workflow] = run
    # CI uploads immutable archives for its own run attempt. Expired/missing => fail, never rebuild.
    run = selected['ci.yml']
    with open(os.environ['GITHUB_OUTPUT'], 'a') as output:
        output.write(f'ci_run={run["id"]}\nci_attempt={run["run_attempt"]}\n')


def release_run():
    sha = os.environ['WITNESS_APPROVED_RELEASE_SHA']
    run_id = os.environ['WITNESS_APPROVED_ARTIFACT_RUN_ID']
    require(SHA.fullmatch(sha) and run_id.isdigit(), 'invalid release approval')
    run = api(f'repos/scigns/witness/actions/runs/{run_id}')
    workflow = api('repos/scigns/witness/actions/workflows/release-artifacts.yml')
    require(run['workflow_id'] == workflow['id'] and run['head_sha'] == sha, 'wrong publication run/SHA')
    require(run['conclusion'] == 'success' and run['event'] == 'push', 'publication did not pass')
    require(run['head_repository']['full_name'] == 'scigns/witness', 'wrong publication repository')


def publish():
    root = Path('release-artifacts')
    subprocess.run(['sha256sum', '--check', 'SHA256SUMS'], cwd=root, check=True)
    manifest = json.loads((root / 'build-manifest.json').read_text())
    sha = os.environ['GITHUB_SHA']
    require(manifest['published'] is False and manifest['git_sha'] == sha, 'wrong CI artifact SHA')
    require(manifest['build']['workflow'] == '.github/workflows/ci.yml', 'wrong build workflow')
    require(str(manifest['build']['run_id']) == os.environ['EXPECTED_CI_RUN'], 'wrong CI run')
    require(str(manifest['build']['run_attempt']) == os.environ['EXPECTED_CI_ATTEMPT'], 'wrong CI attempt')
    require(manifest['platform'] == 'linux/amd64' and manifest['migrations'] == inventory(), 'migration/platform mismatch')
    require(manifest['build_inputs'] == json.loads(Path('scripts/release/image-build.json').read_text()), 'build inputs mismatch')
    require(manifest['version'] == json.loads(Path('package.json').read_text())['version'], 'version mismatch')
    subprocess.run(['docker', 'load', '-i', str(root / 'images.tar.gz')], check=True)
    for kind in ('api', 'web'):
        require(manifest['images'][kind]['repository'] == REPOSITORIES[kind], 'wrong image repository')
        require(manifest['images'][kind]['oci_revision'] == sha, 'manifest revision mismatch')
        local = f'witness-artifact-{kind}:{sha}'
        require(inspect_image(local, manifest, kind, registry=False) == manifest['images'][kind]['local_id'], 'archive image ID mismatch')
    # Ephemeral workflow token only; build jobs have no registry-write capability.
    with tempfile.TemporaryDirectory(prefix='witness-ghcr-') as config:
        env = dict(os.environ, DOCKER_CONFIG=config)
        subprocess.run(['docker', 'login', 'ghcr.io', '-u', os.environ['GHCR_USER'], '--password-stdin'],
                       input=os.environ['GHCR_TOKEN'], text=True, env=env, check=True)
        for kind in ('api', 'web'):
            item = manifest['images'][kind]
            tag = item['repository'] + ':' + sha
            # Prevent accidental replacement of an existing discoverability tag.
            exists = subprocess.run(['docker', 'manifest', 'inspect', tag], env=env, capture_output=True)
            require(exists.returncode != 0, f'{tag} already exists; use its recorded manifest, never overwrite')
            subprocess.run(['docker', 'tag', item['local_id'], tag], check=True, env=env)
            output = subprocess.check_output(['docker', 'push', tag], text=True, env=env)
            matches = re.findall(r'digest: (sha256:[0-9a-f]{64})', output)
            require(len(matches) == 1, 'registry push returned ambiguous digest')
            item['digest'] = matches[0]
            ref = item['repository'] + '@' + item['digest']
            subprocess.run(['docker', 'pull', '--platform', 'linux/amd64', ref], check=True, env=env)
            inspect_image(ref, manifest, kind)
    manifest['published'] = True
    manifest['publication'] = {'workflow': '.github/workflows/release-artifacts.yml', 'run_id': os.environ['GITHUB_RUN_ID'],
                               'run_attempt': os.environ['GITHUB_RUN_ATTEMPT'], 'created_at': datetime.now(timezone.utc).isoformat()}
    (root / 'release-manifest.json').write_text(json.dumps(manifest, sort_keys=True, indent=2) + '\n')


if __name__ == '__main__':
    try:
        {'gates': gates, 'publish': publish, 'release-run': release_run}[sys.argv[1]]()
    except (ValueError, KeyError, subprocess.CalledProcessError) as error:
        print(f'Publication refused: {error}', file=sys.stderr)
        sys.exit(1)
