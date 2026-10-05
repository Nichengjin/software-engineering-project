#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec /usr/lib/postgresql/15/bin/postgres -D "${repo_root}/.local/postgres" \
  -h 127.0.0.1 -p "${PGPORT:-5432}" -k "${repo_root}/.local"
