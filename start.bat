@echo off
chcp 65001 >nul
echo.
echo ========================================
echo   Starting MeetFlow Server
echo ========================================
echo.

REM Check Node.js
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Node.js not installed!
    echo.
    echo Download from: https://nodejs.org/
    pause
    exit /b 1
)

echo [OK] Node.js found
echo.

REM Install dependencies if needed
if not exist "node_modules" (
    echo [1/3] Installing dependencies...
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo ERROR: Failed to install dependencies
        pause
        exit /b 1
    )
    echo [OK] Dependencies installed
    echo.
) else (
    echo [1/3] Dependencies already installed
    echo.
)

REM Build frontend
echo [2/3] Building frontend...
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Failed to build frontend
    pause
    exit /b 1
)
echo [OK] Frontend built
echo.

REM Get IP address
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
    set IP=%%a
    goto :found
)
:found
set IP=%IP: =%

echo [3/3] Starting server...
echo.
echo ========================================
echo   Server starting...
echo ========================================
echo.
echo Local access:   http://localhost:3000
echo Network access: http://%IP%:3000
echo.
echo If SSL certificates exist, HTTPS will be enabled automatically
echo.
echo Press Ctrl+C to stop the server
echo.
echo ========================================
echo.

REM Start server
node server.js

pause
