@echo off
title Block Blitz Server
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js is not installed yet.
  echo  1. Go to https://nodejs.org and download the LTS version.
  echo  2. Run the installer, then double-click start-windows.bat again.
  echo.
  pause
  exit /b
)
for /f %%v in ('node -p "process.versions.node.split('.')[0]"') do set NODE_MAJOR=%%v
if %NODE_MAJOR% LSS 18 (
  echo.
  echo  Your Node.js is too old. Block Blitz needs version 18 or newer.
  echo  Download the LTS version from https://nodejs.org and install it.
  echo.
  pause
  exit /b
)
if not exist node_modules\express (
  echo Installing game files for the first time, please wait...
  call npm install
)
set OPEN_BROWSER=1
node server.js
echo.
echo  The server has stopped. Scroll up to see any error message.
pause
