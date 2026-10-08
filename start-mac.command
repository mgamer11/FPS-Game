#!/bin/bash
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo " Node.js is not installed yet."
  echo " Download the LTS version from https://nodejs.org, install it, then run this file again."
  read -p "Press Enter to close..."
  exit 1
fi
if [ ! -d node_modules ]; then
  echo "Installing game files for the first time, please wait..."
  npm install
fi
(sleep 2; open http://localhost:3000) &
node server.js
