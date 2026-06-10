#!/bin/bash
export NVM_DIR="$HOME/.nvm"
source "$NVM_DIR/nvm.sh"
nvm use 24 --silent
cd /home/ranjan/apps/konsolx
exec node_modules/.bin/electron build-electron/main.js --no-sandbox "$@"
