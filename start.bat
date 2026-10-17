@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [Torrent Vault] 未检测到 Node.js，请先安装 Node.js 18.18 或更高版本。
  pause
  exit /b 1
)

if not exist "node_modules\express" (
  echo [Torrent Vault] 正在安装依赖，请稍候...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo [Torrent Vault] 依赖安装失败。
    pause
    exit /b 1
  )
)

if not exist "dist\index.html" (
  echo [Torrent Vault] 正在构建前端...
  call npm run build
  if errorlevel 1 (
    echo [Torrent Vault] 前端构建失败。
    pause
    exit /b 1
  )
)

echo [Torrent Vault] 正在启动，浏览器将自动打开 http://127.0.0.1:4000
start "" /b powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://127.0.0.1:4000'"
call npm start
pause
