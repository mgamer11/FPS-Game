@echo off
title Block Blitz Server
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js is not installed yet.
  echo  Download the "LTS" version from https://nodejs.org , install it, then run this file again.
  echo.
  pause
  exit /b
)
if not exist node_modules (
  echo Installing game files for the first time, please wait...
  call npm install
)
start "" http://localhost:3000
node server.js
pause
