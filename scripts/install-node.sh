#!/usr/bin/env bash
# Run as the application user (appuser), without sudo.
set -eo pipefail

if [[ -z "${NVM_DIR:-}" ]]; then
  if [[ -n "${XDG_CONFIG_HOME:-}" ]]; then
    NVM_DIR="$XDG_CONFIG_HOME/nvm"
  else
    NVM_DIR="$HOME/.nvm"
  fi
fi
export NVM_DIR

if [[ ! -s "$NVM_DIR/nvm.sh" ]]; then
  installer=$(mktemp)
  trap 'rm -f "$installer"' EXIT
  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.41.0/install.sh -o "$installer"
  bash "$installer"
fi

. "$NVM_DIR/nvm.sh"
nvm install 26
nvm alias default 26
nvm use 26
node --version
npm --version
echo 'Node 26 已安装。新终端会使用默认版本；当前父 shell 可运行 . "$NVM_DIR/nvm.sh" 或重新登录。'
