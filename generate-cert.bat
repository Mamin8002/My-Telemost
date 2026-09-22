@echo off
chcp 65001 >nul
echo.
echo ========================================
echo   Generating SSL Certificate
echo ========================================
echo.

REM Check OpenSSL
where openssl >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: OpenSSL not installed!
    echo.
    echo Download from: https://slproweb.com/products/Win32OpenSSL.html
    echo or install via Chocolatey: choco install openssl
    pause
    exit /b 1
)

echo [OK] OpenSSL found
echo.

REM Get IP address
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
    set IP=%%a
    goto :found
)
:found
set IP=%IP: =%

echo Detected IP: %IP%
echo.

REM Create SSL directory
if not exist "ssl" mkdir ssl
cd ssl

REM Generate private key
echo [1/3] Generating private key...
openssl genrsa -out server.key 2048
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Failed to generate key
    pause
    exit /b 1
)
echo [OK] Private key created
echo.

REM Create config file
echo [2/3] Creating configuration...
(
echo [req]
echo default_bits = 2048
echo prompt = no
echo default_md = sha256
echo req_extensions = req_ext
echo distinguished_name = dn
echo.
echo [dn]
echo C = RU
echo ST = Moscow
echo L = Moscow
echo O = MeetFlow
echo OU = Development
echo CN = %IP%
echo.
echo [req_ext]
echo subjectAltName = @alt_names
echo.
echo [alt_names]
echo DNS.1 = localhost
echo DNS.2 = *.local
echo IP.1 = 127.0.0.1
echo IP.2 = %IP%
) > openssl.cnf
echo [OK] Configuration created
echo.

REM Generate certificate
echo [3/3] Generating SSL certificate...
openssl req -new -x509 -key server.key -out server.crt -days 365 -config openssl.cnf -extensions req_ext
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Failed to generate certificate
    pause
    exit /b 1
)
echo [OK] Certificate created
echo.

cd ..

echo ========================================
echo   SUCCESS!
echo ========================================
echo.
echo Files created:
echo   - ssl\server.key  (private key)
echo   - ssl\server.crt  (certificate)
echo.
echo Certificate valid for 365 days
echo.
echo IMPORTANT: Install certificate on all devices!
echo.
echo Next steps:
echo   1. Copy ssl\server.crt to all devices
echo   2. Install as trusted certificate
echo   3. Run: node server.js
echo   4. Open: https://%IP%:3000
echo.
pause
