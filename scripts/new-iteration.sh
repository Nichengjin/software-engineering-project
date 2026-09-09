#!/usr/bin/env bash

set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "用法: $0 <iteration-slug>" >&2
  exit 1
fi

slug="$1"
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
dir="${repo_root}/docs/iterations"

last="$(find "${dir}" -maxdepth 1 -name 'IT-*.md' | sed -E 's/.*IT-([0-9]+).*/\1/' | sort -n | tail -n 1)"
next="$(printf '%02d' $(( ${last:-0} + 1 )))"
target="${dir}/IT-${next}-${slug}.md"

sed "s/IT-xx/IT-${next}/g" "${dir}/templates/iteration.md" > "${target}"

echo "${target}"
echo "记得在 docs/iterations/README.md 的总览表里加一行。"
