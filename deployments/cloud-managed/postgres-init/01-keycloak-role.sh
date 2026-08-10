#!/bin/sh
# Provisions Keycloak's own Postgres role and database, separate from
# Witness's. Runs once, only on a fresh data directory — the official
# postgres image sources every script in docker-entrypoint-initdb.d during
# first-time initialisation and never again, so this does not touch an
# existing deployment's data.
#
# Keycloak gets its own role rather than reusing POSTGRES_USER so a
# compromise of one datastore does not hand over the other's credentials.
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE ROLE "${KEYCLOAK_DB_USER}" LOGIN PASSWORD '${KEYCLOAK_DB_PASSWORD}';
    CREATE DATABASE "${KEYCLOAK_DB}" OWNER "${KEYCLOAK_DB_USER}";
EOSQL
