@echo off
setlocal
cd /d "%~dp0"
title GymPulse Live Tunnel
node launch.js %*
if %ERRORLEVEL% NEQ 0 (
  echo.
  echo Process ended with error code %ERRORLEVEL%.
  pause
)
