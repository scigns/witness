#!/usr/bin/env bash
# Every variable the compose stack REQUIRES must be documented in .env.example.
#
# Why: compose's `${VAR:?message}` syntax makes a variable mandatory. If such a
# variable is absent from .env.example, `cp .env.example .env && make dev` fails
# for every new contributor with an error about a variable they have never heard
# of. That happened — KEYCLOAK_ADMIN_PASSWORD was required by the stack and absent
# from the template — and this gate exists so it cannot happen twice.
set -uo pipefail

example=".env.example"
missing=0

if [ ! -f "$example" ]; then
  echo "::error::$example is missing"
  exit 1
fi

required=$(grep -rhoE '\$\{[A-Z0-9_]+:\?' infrastructure/docker/*.yml 2>/dev/null \
  | sed -E 's/^\$\{//; s/:\?$//' | sort -u)

if [ -z "$required" ]; then
  echo "No mandatory compose variables found."
  exit 0
fi

while IFS= read -r var; do
  [ -z "$var" ] && continue
  if grep -qE "^${var}=" "$example"; then
    echo "  ✓ $var"
  else
    echo "::error file=$example::compose requires $var but $example does not define it"
    missing=$(( missing + 1 ))
  fi
done <<< "$required"

if [ "$missing" -gt 0 ]; then
  echo
  echo "$missing required variable(s) missing from $example."
  echo "A contributor running 'cp .env.example .env && make dev' would hit an"
  echo "error naming a variable the template never mentioned."
  exit 1
fi

echo "All mandatory compose variables are documented."
