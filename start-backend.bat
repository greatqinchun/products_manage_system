@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

cd /d "%~dp0"
title 库存管理系统 - 后端一键启动

echo ========================================
echo   后端服务一键启动
echo ========================================
echo.

echo [1/4] 检查 Node.js...
where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 未检测到 Node.js，请先安装: https://nodejs.org/
  pause
  exit /b 1
)
for /f "delims=" %%V in ('node -v') do echo       当前版本: %%V

echo.
echo [2/4] 释放端口 3000（若已有本服务占用）...
set "PID_TO_KILL="
for /f "tokens=5" %%P in ('netstat -ano 2^>nul ^| findstr ":3000" ^| findstr "LISTENING"') do (
  set "PID_TO_KILL=%%P"
)
if defined PID_TO_KILL (
  echo       结束进程 PID: !PID_TO_KILL!
  taskkill /PID !PID_TO_KILL! /F >nul 2>nul
  if errorlevel 1 (
    echo       [提示] 无法结束该进程，请手动关闭占用 3000 端口的程序或以管理员运行本脚本。
  )
) else (
  echo       端口 3000 未被监听，可直接启动。
)

echo.
echo [3/4] 检查依赖 node_modules...
if not exist "node_modules\" (
  echo       正在执行 npm install，首次可能较慢...
  call npm.cmd install
  if errorlevel 1 (
    echo [错误] npm install 失败，请检查网络与 Node 环境。
    pause
    exit /b 1
  )
) else (
  echo       依赖已存在，跳过安装。
)

echo.
echo [4/4] 启动后端（新窗口运行，关闭该窗口即停止服务）...
start "products_manage_system_backend" cmd /k "cd /d ""%~dp0"" && title 库存管理系统-后端 && npm start"

echo.
echo 已发送启动命令。请在标题为「products_manage_system_backend」的窗口中查看日志。
echo 浏览器访问: http://localhost:3000
echo.
echo 本窗口将于 5 秒后自动关闭；也可直接关闭。
timeout /t 5 >nul
exit /b 0
