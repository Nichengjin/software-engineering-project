#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

"${repo_root}/scripts/check-docs.sh"
"${repo_root}/scripts/check-repo-hygiene.sh"
"${repo_root}/scripts/check-action-pinning.sh"

while IFS= read -r file; do
  bash -n "$file"
done < <(find "${repo_root}/scripts" -type f -name '*.sh' | sort)

bash -n "${repo_root}/.agents/setup"
cd "$repo_root"
npm run db:generate
npm run db:migrate:test
npm run typecheck
npm test
npm run build

echo "基础检查、类型检查、PostgreSQL 集成测试与构建通过"
