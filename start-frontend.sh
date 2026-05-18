#!/bin/bash
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
export NVM_DIR="$HOME/.nvm"
cd /Users/radek/yt-transcript/client
exec /opt/homebrew/bin/node node_modules/vite/bin/vite.js --host 0.0.0.0 --port 3000
