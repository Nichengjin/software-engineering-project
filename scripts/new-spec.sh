#!/usr/bin/env bash

set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "用法: $0 <story-slug>" >&2
  exit 1
fi

slug="$1"
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
dir="${repo_root}/docs/product-specs"

last="$(find "${dir}" -maxdepth 1 -name 'US-*.md' | sed -E 's/.*US-([0-9]+).*/\1/' | sort -n | tail -n 1)"
next="$(printf '%03d' $(( ${last:-0} + 1 )))"
target="${dir}/US-${next}-${slug}.md"

sed "s/US-xxx/US-${next}/g" "${dir}/templates/user-story.md" > "${target}"

echo "${target}"
echo "记得在 docs/product-specs/backlog.md 里加一行，并在需要时更新 traceability.md。"
