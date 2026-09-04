#!/usr/bin/env bash
# Verify every relative markdown link resolves — against what git actually tracks,
# not against what happens to be sitting in the working tree.
#
# Why the distinction matters: git does not track empty directories. A link to a
# directory created locally with `mkdir` resolves on the author's machine and 404s
# for everyone who clones. This check originally tested the filesystem and passed
# locally while 41 links were broken in CI. Testing git's view is the only version
# of this check that means anything.
#
# A broken link in operator documentation is a real failure: the operator is often
# air-gapped and cannot search for the page we forgot to write.
set -uo pipefail

TRACKED=$(mktemp)
trap 'rm -f "$TRACKED"' EXIT

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "::error::Not a git repository — cannot verify links against tracked content."
  exit 1
fi

# Everything git tracks, plus every directory implied by those paths, so that a
# link to `docs/guides/` resolves when that directory has tracked content.
{
  git ls-files
  git ls-files | while IFS= read -r f; do
    d=$(dirname "$f")
    while [ "$d" != "." ] && [ "$d" != "/" ]; do
      echo "$d"
      d=$(dirname "$d")
    done
  done
} | sort -u > "$TRACKED"

failures=0

while IFS= read -r file; do
  dir=$(dirname "$file")
  targets=$(grep -oE '\]\([^)#][^)]*\)' "$file" 2>/dev/null | sed -E 's/^\]\(//; s/\)$//' || true)
  [ -z "$targets" ] && continue

  while IFS= read -r target; do
    [ -z "$target" ] && continue
    case "$target" in
      http://*|https://*|mailto:*|'#'*) continue ;;
    esac
    clean="${target%%#*}"     # strip anchor
    clean="${clean%/}"        # a trailing slash is a directory link
    [ -z "$clean" ] && continue
    # Markdown link targets percent-encode reserved characters (e.g. a space in a
    # filename becomes %20); git ls-files reports the literal path, so decode before
    # comparing or any tracked file with a space or other encoded character 404s here.
    clean=$(python3 -c 'import sys, urllib.parse; print(urllib.parse.unquote(sys.argv[1]))' "$clean")

    resolved=$(python3 -c 'import os,sys; print(os.path.normpath(os.path.join(sys.argv[1], sys.argv[2])))' "$dir" "$clean" 2>/dev/null) || resolved="$dir/$clean"

    if ! grep -Fxq "$resolved" "$TRACKED"; then
      echo "::error file=$file::broken link -> $target (not tracked by git)"
      failures=$((failures + 1))
    fi
  done <<< "$targets"
done < <(git ls-files '*.md')

if [ "$failures" -gt 0 ]; then
  echo
  echo "$failures broken internal link(s)."
  echo
  echo "If a target exists on your machine but is reported here, it is almost certainly"
  echo "an empty directory. Git does not track those — add a README.md explaining what"
  echo "belongs there, which is more useful to a reader than a .gitkeep anyway."
  exit 1
fi

echo "All internal links resolve against tracked content."
