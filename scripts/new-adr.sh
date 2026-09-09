#!/usr/bin/env bash

set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "用法: $0 <adr-slug>" >&2
  exit 1
fi

slug="$1"
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
dir="${repo_root}/docs/design-docs/adr"

last="$(find "${dir}" -maxdepth 1 -name 'ADR-*.md' | sed -E 's/.*ADR-([0-9]+).*/\1/' | sort -n | tail -n 1)"
next="$(printf '%03d' $(( ${last:-0} + 1 )))"
target="${dir}/ADR-${next}-${slug}.md"

sed "s/ADR-xxx/ADR-${next}/g; s/YYYY-MM-DD/$(date +%Y-%m-%d)/" "${repo_root}/docs/design-docs/templates/adr.md" > "${target}"

echo "${target}"
echo "记得在 docs/design-docs/adr/README.md 的索引表里加一行。"
