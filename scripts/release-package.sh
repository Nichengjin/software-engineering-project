#!/usr/bin/env bash

# 生成最终配置库的发布制品，规则见 docs/CONFIG_MANAGEMENT_PLAN.md 第 5 节。
# 只打包已提交的 HEAD；未提交的修改不会进入制品，只在 manifest 里标记 worktree_dirty。

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
dist_dir="${repo_root}/dist"
artifact="wylie-college-source.tgz"

git_sha="$(git -C "${repo_root}" rev-parse --verify HEAD)"
label="${RELEASE_TAG:-$(git -C "${repo_root}" rev-parse --short=12 HEAD)}"
prefix="wylie-college-${label}"

rm -rf "${dist_dir}"
mkdir -p "${dist_dir}"

# git archive 只含版本库中的文件，.env、.local、node_modules 等被忽略的内容不会进入制品。
git -C "${repo_root}" archive --format=tar --prefix="${prefix}/" "${git_sha}" | gzip -n > "${dist_dir}/${artifact}"

node "${repo_root}/scripts/release-manifest.mjs" --sha "${git_sha}" --out "${dist_dir}" --artifact "${dist_dir}/${artifact}"

# RELEASE_VERIFY_BUILD=1 时在临时目录解包，按锁文件安装并完整构建，确认制品不依赖本机状态。
if [[ "${RELEASE_VERIFY_BUILD:-0}" == "1" ]]; then
  verify_dir="$(mktemp -d)"
  trap 'rm -rf "${verify_dir}"' EXIT
  tar -xzf "${dist_dir}/${artifact}" -C "${verify_dir}"
  (
    cd "${verify_dir}/${prefix}"
    npm ci --no-audit --no-fund
    npm run db:generate
    npm run build
  )
  echo "制品解包后锁定安装与构建通过"
fi

echo "${dist_dir}/${artifact}"
