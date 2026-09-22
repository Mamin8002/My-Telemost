# MeetFlow Server Startup Script for Windows
# Run this script in PowerShell

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Starting MeetFlow Server" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check Node.js
try {
    $null = Get-Command node -ErrorAction Stop
    Write-Host "[OK] Node.js found" -ForegroundColor Green
} catch {
    Write-Host "ERROR: Node.js not installed!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Download from: https://nodejs.org/"
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

# Install dependencies if needed
if (-not (Test-Path "node_modules")) {
    Write-Host "[1/3] Installing dependencies..." -ForegroundColor Cyan
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Failed to install dependencies" -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
    Write-Host "[OK] Dependencies installed" -ForegroundColor Green
    Write-Host ""
} else {
    Write-Host "[1/3] Dependencies already installed" -ForegroundColor Gray
    Write-Host ""
}

# Build frontend
Write-Host "[2/3] Building frontend..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to build frontend" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Host "[OK] Frontend built" -ForegroundColor Green
Write-Host ""

# Get IP address
$ip = (Get-NetIPAddress -AddressFamily IPv4 | 
       Where-Object { $_.InterfaceAlias -notlike "*Loopback*" -and $_.IPAddress -ne "127.0.0.1" } | 
       Select-Object -First 1).IPAddress

if (-not $ip) {
    $ip = "localhost"
}

# Check SSL
$sslEnabled = Test-Path "ssl\server.crt" -and (Test-Path "ssl\server.key")
$protocol = if ($sslEnabled) { "HTTPS" } else { "HTTP" }
$color = if ($sslEnabled) { "Green" } else { "Yellow" }

Write-Host "[3/3] Starting server..." -ForegroundColor Cyan
Write-Host ""
Write-Host "========================================" -ForegroundColor $color
Write-Host "  Server starting..." -ForegroundColor $color
Write-Host "========================================" -ForegroundColor $color
Write-Host ""
Write-Host "Protocol:         $protocol" -ForegroundColor White
Write-Host "Local access:     http://localhost:3000" -ForegroundColor White
Write-Host "Network access:   $protocol://$ip`:3000" -ForegroundColor White
Write-Host ""

if (-not $sslEnabled) {
    Write-Host "WARNING: SSL certificates not found!" -ForegroundColor Yellow
    Write-Host "Camera and microphone may not work over HTTP." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "To enable HTTPS:" -ForegroundColor Cyan
    Write-Host "  1. Run: .\generate-cert.ps1" -ForegroundColor Gray
    Write-Host "  2. Restart this script" -ForegroundColor Gray
    Write-Host ""
}

Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Gray
Write-Host ""
Write-Host "========================================" -ForegroundColor $color
Write-Host ""

# Start server
node server.js
