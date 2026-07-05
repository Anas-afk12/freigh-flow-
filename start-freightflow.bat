@echo off
REM ============================================================
REM  FreightFlow PRO - one-click launcher (Windows)
REM  Put this file inside your project folder:
REM    C:\Users\rayya\Downloads\freigh-flow-
REM  Then double-click it.
REM ============================================================
cd /d "%~dp0"

echo.
echo [1/3] Checking Node.js...
where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js is not installed.
  echo Download the LTS version from https://nodejs.org  then run this again.
  pause
  exit /b 1
)
node -v

echo.
echo [2/3] Installing dependencies (first run only, may take a few minutes)...
if not exist node_modules (
  call npm install --omit=dev --ignore-scripts
) else (
  echo Dependencies already installed - skipping.
)

echo.
echo [3/3] Preparing local database + sample data...
call npm run db:reset

echo.
echo Starting FreightFlow PRO...
echo Opening http://localhost:3000 in your browser.
start "" http://localhost:3000
call npm start
pause
