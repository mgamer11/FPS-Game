#!/bin/bash
# Block Blitz - double-click this file on a Mac to start the game server.
cd "$(dirname "$0")"

pause_and_exit() {
  echo ""
  read -p "Press Enter to close this window..."
  exit 1
}

# Node.js installed from nodejs.org lives here; make sure we can find it.
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"

if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo " Node.js is not installed yet."
  echo " 1. Go to https://nodejs.org and download the LTS version (the big green button)."
  echo " 2. Open the downloaded file and click through the installer."
  echo " 3. Double-click start-mac.command again."
  pause_and_exit
fi

NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo ""
  echo " Your Node.js is too old (version $(node -v)). Block Blitz needs version 18 or newer."
  echo " Download the LTS version from https://nodejs.org, install it, then try again."
  pause_and_exit
fi

if [ ! -d node_modules/express ] || [ ! -d node_modules/ws ] || [ ! -d node_modules/three ]; then
  echo "Installing game files for the first time, please wait (needs internet)..."
  if ! npm install; then
    echo ""
    echo " Installing failed. Check your internet connection and try again."
    pause_and_exit
  fi
fi

OPEN_BROWSER=1 node server.js
echo ""
echo " The server has stopped. Scroll up to see any error message."
pause_and_exit
