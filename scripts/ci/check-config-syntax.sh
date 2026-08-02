#!/usr/bin/env bash
# Validate the syntax of every YAML and JSON file in the repository.
#
# Why this exists: .github/labels.yml shipped as invalid YAML because the initial
# syntax check enumerated files by hand and simply missed it. A check that depends
# on someone remembering to add a file to a list will eventually miss one — so this
# one discovers files instead of being told about them.
set -euo pipefail

python3 - <<'PY'
import glob, json, sys, pathlib

try:
    import yaml
except ImportError:
    print("PyYAML not available — YAML validation skipped.")
    yaml = None

failures = 0
checked = 0

def skip(path: str) -> bool:
    parts = pathlib.Path(path).parts
    return any(p in {"node_modules", ".git", "dist", "build", ".next"} for p in parts)

if yaml:
    for f in sorted(set(glob.glob("**/*.yml", recursive=True) + glob.glob("**/*.yaml", recursive=True))):
        if skip(f):
            continue
        checked += 1
        try:
            yaml.safe_load(open(f))
        except Exception as e:
            print(f"::error file={f}::invalid YAML — {str(e).splitlines()[0]}")
            failures += 1

for f in sorted(glob.glob("**/*.json", recursive=True)):
    if skip(f):
        continue
    checked += 1
    try:
        json.load(open(f))
    except Exception as e:
        print(f"::error file={f}::invalid JSON — {e}")
        failures += 1

print(f"Checked {checked} configuration files.")
sys.exit(1 if failures else 0)
PY
