#!/usr/bin/env bash
# sql-check — runs schema.sql, accounts.sql and home.sql on a throwaway local
# Postgres (with a stand-in for Supabase's auth schema) and exercises the
# functions for real: ratings per game, fixed bots, XP, the daily bonus, the
# 45-second brake, loadout checks, and that every file is safe to re-run.
# Needs a local Postgres 16 (not a repo dependency).  Usage: bash tools/sql-check.sh
set -euo pipefail
BIN=${PGBIN:-/usr/lib/postgresql/16/bin}
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
D=$(mktemp -d /tmp/itpg.XXXXXX)
RUNAS=""
if [ "$(id -u)" = "0" ]; then chown -R postgres "$D"; chmod 755 "$D"; RUNAS="su postgres -c"; fi
run() { if [ -n "$RUNAS" ]; then su postgres -c "$*"; else bash -c "$*"; fi; }
run "$BIN/initdb -D $D/data -A trust -U postgres >/dev/null"
run "$BIN/pg_ctl -D $D/data -o '-k $D -c listen_addresses=' -w start >/dev/null"
trap 'run "$BIN/pg_ctl -D $D/data -m immediate stop >/dev/null" || true; rm -rf "$D"' EXIT
Q="psql -h $D -U postgres -v ON_ERROR_STOP=1 -q -X"
$Q -c "create database it" postgres
$Q it <<'SQL'
create role anon; create role authenticated;
create schema auth; create schema extensions;
create table auth.users (instance_id uuid, id uuid primary key, aud text, role text, email text unique, encrypted_password text,
  email_confirmed_at timestamptz, created_at timestamptz, updated_at timestamptz, raw_app_meta_data jsonb, raw_user_meta_data jsonb,
  confirmation_token text, recovery_token text, email_change_token_new text, email_change text);
create table auth.identities (provider_id text, user_id uuid, identity_data jsonb, provider text, last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
SQL
for f in schema accounts home accounts home home; do $Q it -f "$ROOT/supabase/$f.sql" >/dev/null; done
echo "schema, accounts and home ran; accounts and home ran again"
$Q it -f "$ROOT/tools/sql-check.sql"
