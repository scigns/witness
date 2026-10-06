#!/usr/bin/env python3
"""Build/release evidence and fail-closed deployment validation. No credentials in evidence."""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from datetime import datetime, timezone

SOURCE = 'https://github.com/scigns/witness'
REPOSITORIES = {kind: f'ghcr.io/scigns/witness-{kind}' for kind in ('api', 'web')}
DIGEST = re.compile(r'sha256:[0-9a-f]{64}')
SHA = re.compile(r'[0-9a-f]{40}')


def require(condition, message):
    if not condition:
        raise ValueError(message)


def inventory():
    root = Path('services/api-gateway/prisma')
    files = [root / 'schema.prisma', *sorted((root / 'migrations').glob('*/migration.sql'))]
    return [{'path': str(p.relative_to(root)), 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()} for p in files]


def inspect_image(ref, manifest, kind, registry=True):
    image = json.loads(subprocess.check_output(['docker', 'image', 'inspect', ref], text=True))[0]
    labels = image['Config'].get('Labels') or {}
    for name, value in [('revision', manifest['git_sha']), ('version', manifest['version']), ('source', SOURCE)]:
        require(labels.get('org.opencontainers.image.' + name) == value, f'{kind}: OCI {name} mismatch')
    require(image['Os'] + '/' + image['Architecture'] == manifest['platform'], f'{kind}: platform mismatch')
    require(DIGEST.fullmatch(image['Id']), f'{kind}: invalid local image ID')
    if registry:
        require(ref in image.get('RepoDigests', []), f'{kind}: pulled registry digest mismatch')
    if kind == 'web':
        inputs = manifest['build_inputs']['web']
        require(labels.get('io.witness.web.api-url') == inputs['NEXT_PUBLIC_WITNESS_API_URL'], 'web: API build input mismatch')
        require(labels.get('io.witness.web.profile') == inputs['NEXT_PUBLIC_WITNESS_PROFILE'], 'web: profile build input mismatch')
    if kind == 'api':
        env = dict(item.split('=', 1) for item in image['Config'].get('Env', []))
        require(env.get('WITNESS_BUILD_ID') == manifest['git_sha'], 'api: baked build identity mismatch')
        # Read only the candidate image, no mounts, network or production credentials.
        js = '''const fs=require('fs'),crypto=require('crypto'); const root='prisma';
const paths=['schema.prisma',...fs.readdirSync(root+'/migrations').sort().filter(n=>fs.existsSync(root+'/migrations/'+n+'/migration.sql')).map(n=>'migrations/'+n+'/migration.sql')];
console.log(JSON.stringify(paths.map(path=>({path,sha256:crypto.createHash('sha256').update(fs.readFileSync(root+'/'+path)).digest('hex')}))));'''
        actual = json.loads(subprocess.check_output(['docker', 'run', '--rm', '--network', 'none', '--entrypoint', 'node', ref, '-e', js], text=True))
        require(actual == manifest['migrations'], 'api: packaged migration/schema checksum mismatch')
    return image['Id']


def validate(manifest):
    sha = subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()
    require(SHA.fullmatch(sha), 'invalid checkout SHA')
    require(manifest.get('schema_version') == 1 and manifest.get('published') is True, 'not published release evidence')
    require(sha == manifest.get('git_sha') == os.environ.get('WITNESS_APPROVED_RELEASE_SHA'), 'approved SHA mismatch')
    require(manifest.get('version') == json.loads(Path('package.json').read_text())['version'], 'version mismatch')
    require(manifest.get('platform') == 'linux/amd64', 'unsupported deployment platform')
    require(manifest.get('migrations') == inventory(), 'checkout migration/schema checksum mismatch')
    build = manifest.get('build', {})
    require(build.get('workflow') == '.github/workflows/ci.yml' and str(build.get('run_id', '')).isdigit(), 'invalid build workflow evidence')
    publish = manifest.get('publication', {})
    require(publish.get('workflow') == '.github/workflows/release-artifacts.yml', 'invalid publication workflow')
    require(str(publish.get('run_id', '')).isdigit() and str(publish['run_id']) == os.environ.get('WITNESS_APPROVED_ARTIFACT_RUN_ID'), 'artifact run approval mismatch')
    require(isinstance(manifest.get('created_at'), str), 'missing release timestamp')
    for kind in ('api', 'web'):
        item = manifest.get('images', {}).get(kind, {})
        require(item.get('repository') == REPOSITORIES[kind], f'{kind}: wrong repository')
        require(isinstance(item.get('digest'), str) and DIGEST.fullmatch(item['digest']), f'{kind}: malformed digest')
        require(item.get('oci_revision') == sha, f'{kind}: manifest revision mismatch')
        ref = item['repository'] + '@' + item['digest']
        require(ref == os.environ.get('WITNESS_APPROVED_' + kind.upper() + '_IMAGE'), f'{kind}: missing/mismatched image approval')
    require(manifest.get('build_inputs') == json.loads(Path('scripts/release/image-build.json').read_text()), 'build input contract mismatch')


def main():
    command, path = sys.argv[1:3]
    if command == 'create':
        sha = subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()
        require(SHA.fullmatch(sha), 'invalid build SHA')
        manifest = {'schema_version': 1, 'published': False, 'git_sha': sha,
                    'version': json.loads(Path('package.json').read_text())['version'],
                    'platform': 'linux/amd64', 'created_at': datetime.now(timezone.utc).isoformat(),
                    'build': {'workflow': '.github/workflows/ci.yml', 'run_id': os.environ['GITHUB_RUN_ID'], 'run_attempt': os.environ['GITHUB_RUN_ATTEMPT']},
                    'build_inputs': json.loads(Path('scripts/release/image-build.json').read_text()),
                    'migrations': inventory(), 'images': {}}
        for kind in ('api', 'web'):
            ref = f'witness-artifact-{kind}:{sha}'
            local_id = inspect_image(ref, manifest, kind, registry=False)
            manifest['images'][kind] = {'repository': REPOSITORIES[kind], 'local_id': local_id, 'oci_revision': sha}
        Path(path).write_text(json.dumps(manifest, indent=2, sort_keys=True) + '\n')
        return
    manifest = json.loads(Path(path).read_text())
    if command == 'validate':
        validate(manifest)
        for kind in ('api', 'web'):
            print(manifest['images'][kind]['repository'] + '@' + manifest['images'][kind]['digest'])
    elif command == 'inspect':
        validate(manifest)
        for kind in ('api', 'web'):
            item = manifest['images'][kind]
            print(inspect_image(item['repository'] + '@' + item['digest'], manifest, kind))
    else:
        raise ValueError('unknown artifact operation')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, KeyError, subprocess.CalledProcessError) as error:
        print(f'Artifact verification refused: {error}', file=sys.stderr)
        sys.exit(1)
