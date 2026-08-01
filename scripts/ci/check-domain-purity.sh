#!/usr/bin/env bash
# ADR-0003: the domain layer imports nothing but the standard library and other
# domain code. No NestJS, no Prisma, no HTTP, no filesystem, no clock, no random
# source — time, identity and hashing are injected as ports.
#
# Why a shell script when ESLint already has a rule for this: the ESLint rule is
# a list of known-bad packages and only catches what somebody thought to add. This
# checks the inverse — that `packages/domain` declares no runtime dependencies at
# all and imports nothing outside itself. A new dependency nobody predicted fails
# here without anyone having to update a denylist first.
#
# The purity rule is not aesthetic. It is what makes the domain testable without
# a database and portable across the transports the roadmap adds later.
set -uo pipefail

DOMAIN="packages/domain"
fail=0

if [ ! -d "$DOMAIN/src" ]; then
  echo "No domain source at $DOMAIN/src — nothing to check."
  exit 0
fi

echo "== Runtime dependencies =="
deps=$(node -e '
  const pkg = require("./packages/domain/package.json");
  const deps = Object.keys(pkg.dependencies ?? {});
  process.stdout.write(deps.join("\n"));
' 2>/dev/null)

if [ -n "$deps" ]; then
  echo "::error file=$DOMAIN/package.json::the domain package declares runtime dependencies:"
  echo "$deps" | sed 's/^/    /'
  echo "    Inject these as ports instead (ADR-0003)."
  fail=1
else
  echo "  ✓ none declared"
fi

echo
echo "== Imports =="
# Every import must be relative. Anything bare is a package, and a package is by
# definition outside the domain.
while IFS= read -r file; do
  [ -z "$file" ] && continue
  case "$file" in *.test.ts) continue ;; esac

  # Only real module specifiers: an `import`/`export ... from '…'` statement, or a
  # bare `import '…'`. Matching `from '…'` anywhere would also match the words
  # "from '<x>' to '<y>'" inside an error-message template literal, which is a
  # sentence, not a dependency — that false positive is why this is anchored.
  while IFS= read -r spec; do
    [ -z "$spec" ] && continue
    case "$spec" in
      ./*|../*) continue ;;
      *)
        echo "::error file=$file::non-relative import '$spec' — the domain layer may import only the standard library and other domain code (ADR-0003)"
        fail=1
        ;;
    esac
  done < <(
    grep -oE "^[[:space:]]*(import|export)[^;]*[[:space:]]from[[:space:]]+'[^']+'" "$file" 2>/dev/null \
      | grep -oE "'[^']+'$" | tr -d "'"
    grep -oE "^[[:space:]]*import[[:space:]]+'[^']+'" "$file" 2>/dev/null \
      | grep -oE "'[^']+'" | tr -d "'"
  )
done < <(find "$DOMAIN/src" -name '*.ts' 2>/dev/null)

if [ "$fail" -eq 0 ]; then
  echo "  ✓ every import is relative"
  echo
  echo "Domain purity verified."
fi

exit "$fail"
