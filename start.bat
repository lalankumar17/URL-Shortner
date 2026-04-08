@echo off
setlocal

cd /d "%~dp0"

echo Starting URL Shortener Application (JS Only Version)...

where node >nul 2>&1
if errorlevel 1 (
	echo [ERROR] Node.js is not installed or not available in PATH.
	echo Install Node.js from https://nodejs.org and try again.
	exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
	echo [ERROR] npm is not installed or not available in PATH.
	echo Reinstall Node.js and try again.
	exit /b 1
)

if not exist "node-backend\node_modules" (
	echo Installing backend dependencies...
	pushd "node-backend"
	call npm install
	if errorlevel 1 (
		echo [ERROR] Failed to install backend dependencies.
		popd
		exit /b 1
	)
	popd
)

echo Starting Node.js Fullstack Server on port 3000 in the background...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath 'node' -ArgumentList 'server.js' -WorkingDirectory '%~dp0node-backend' -WindowStyle Hidden"

echo Waiting for service to start...
timeout /t 2 /nobreak > nul

echo Opening browser...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process 'http://localhost:3000'"
