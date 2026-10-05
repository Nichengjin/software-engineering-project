#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
pgbin=/usr/lib/postgresql/15/bin
if [[ ! -x "$pgbin/initdb" ]]; then
  sudo apt-get update -qq
  sudo env DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends postgresql-15 postgresql-client-15
fi
umask 077
mkdir -p "$repo_root/.local"
chmod 700 "$repo_root/.local"
password_file="$repo_root/.local/postgres-password"
if [[ ! -f "$password_file" ]]; then
  node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))' > "$password_file"
fi
chmod 600 "$password_file"
if [[ ! -f "$repo_root/.local/postgres/PG_VERSION" ]]; then
  "$pgbin/initdb" -D "$repo_root/.local/postgres" --username=wylie \
    --auth-local=trust --auth-host=scram-sha-256 --pwfile="$password_file" > "$repo_root/.local/initdb.log"
fi
if [[ ! -f "$repo_root/.local/databases-ready" ]]; then
  # Offline bootstrap: setup leaves no unsupervised daemon running.
  printf 'CREATE DATABASE wylie;\nCREATE DATABASE wylie_test;\n' | \
    "$pgbin/postgres" --single -D "$repo_root/.local/postgres" postgres > "$repo_root/.local/bootstrap.log" 2>&1
  touch "$repo_root/.local/databases-ready"
fi
node "$repo_root/scripts/local-env.mjs"
echo 'Local PG15 prepared. Credentials stay in ignored .env and .local/postgres-password; start the supervised postgres service.'
