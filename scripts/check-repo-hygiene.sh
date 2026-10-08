#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

required_files=(
  ".gitignore"
  ".editorconfig"
  ".gitattributes"
  "CODEOWNERS"
  "CONTRIBUTING.md"
  "SECURITY.md"
  ".github/PULL_REQUEST_TEMPLATE.md"
  ".github/dependency-review-config.yml"
  ".github/dependabot.yml"
  ".github/ISSUE_TEMPLATE/bug_report.yml"
  ".github/ISSUE_TEMPLATE/feature_request.yml"
  ".github/ISSUE_TEMPLATE/config.yml"
  ".github/workflows/ci.yml"
  ".github/workflows/release.yml"
  ".github/workflows/supply-chain-security.yml"
  ".markdownlint.json"
  "scripts/check-action-pinning.sh"
)

failed=0

for path in "${required_files[@]}"; do
  if [[ ! -f "${repo_root}/${path}" ]]; then
    echo "缺少必要文件: ${path}"
    failed=1
  fi
done

if grep -q $'\r' "${repo_root}/README.md"; then
  echo "README.md 含有 CRLF 换行"
  failed=1
fi

if ! grep -q "make ci" "${repo_root}/CONTRIBUTING.md"; then
  echo "CONTRIBUTING.md 应明确提到 make ci"
  failed=1
fi

# 私有配置与运行状态不属于配置库，见 docs/CONFIG_MANAGEMENT_PLAN.md 第 2.3 节。
if [[ -d "${repo_root}/.git" || -f "${repo_root}/.git" ]]; then
  private_files="$(git -C "${repo_root}" ls-files -- '.env' '.env.*' '.local' 'tmp' | grep -vx '.env.example' || true)"
  if [[ -n "${private_files}" ]]; then
    echo "私有配置或运行状态被纳入版本库:"
    echo "${private_files}"
    failed=1
  fi
fi

if [[ "${failed}" -ne 0 ]]; then
  exit 1
fi

echo "仓库基础卫生检查通过"
