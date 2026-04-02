@echo off
setlocal enabledelayedexpansion

cd /d "%~dp0"
title Product Manage System - Stop Backend

echo Stopping backend on port 3000 (if running)...

set "FOUND=0"
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do (
  set "FOUND=1"
  echo Killing PID %%P ...
  taskkill /PID %%P /F >nul 2>nul
  if errorlevel 1 (
    echo Failed to kill PID %%P ^(may need Administrator^).
  ) else (
    echo PID %%P stopped.
  )
)

if "!FOUND!"=="0" (
  echo No process is listening on port 3000. Nothing to stop.
) else (
  echo Done.
)

pause
exit /b 0
