@echo off
rem Double-click to run the Wellitas store on Windows: http://localhost:3000 (store) and /admin.
cd /d "%~dp0server"
where node >nul 2>nul || (echo Node.js is not installed. Download the LTS version from https://nodejs.org & pause & exit /b 1)
node -e "const [a,b]=process.versions.node.split('.').map(Number); process.exit(a>22||(a===22&&b>=13)?0:1)" || (echo Node.js is too old. Install Node 22.13 or newer from https://nodejs.org & pause & exit /b 1)
if not exist node_modules call npm install --omit=dev --no-fund --no-audit
findstr /r "^RAZORPAY_KEY_ID=." .env >nul 2>nul || set PAYMENTS_DEMO=1
start "" http://localhost:3000
echo.
echo Store:  http://localhost:3000
echo Admin:  http://localhost:3000/admin   (first login is saved in server\data\FIRST-LOGIN.txt)
echo Close this window to stop.
echo.
node server.js
pause
