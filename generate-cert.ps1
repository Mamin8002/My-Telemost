# MeetFlow SSL Certificate Generator for Windows
# Run this script in PowerShell

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  MeetFlow SSL Certificate Generator" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check OpenSSL
try {
    $null = Get-Command openssl -ErrorAction Stop
    Write-Host "[OK] OpenSSL found" -ForegroundColor Green
} catch {
    Write-Host "ERROR: OpenSSL not installed!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Install OpenSSL:"
    Write-Host "  Option 1: Download from https://slproweb.com/products/Win32OpenSSL.html"
    Write-Host "  Option 2: Install via Chocolatey: choco install openssl"
    Write-Host "  Option 3: Install via winget: winget install openssl"
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

# Get IP address
$ip = (Get-NetIPAddress -AddressFamily IPv4 | 
       Where-Object { $_.InterfaceAlias -notlike "*Loopback*" -and $_.IPAddress -ne "127.0.0.1" } | 
       Select-Object -First 1).IPAddress

if (-not $ip) {
    $ip = "localhost"
}

Write-Host "Detected IP: $ip" -ForegroundColor Yellow
Write-Host ""

# Create SSL directory
$sslDir = Join-Path $PSScriptRoot "ssl"
if (-not (Test-Path $sslDir)) {
    New-Item -ItemType Directory -Path $sslDir | Out-Null
}

Set-Location $sslDir

# Step 1: Generate private key
Write-Host "[1/3] Generating private key..." -ForegroundColor Cyan
openssl genrsa -out server.key 2048 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to generate key" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Host "[OK] Private key created" -ForegroundColor Green
Write-Host ""

# Step 2: Create config file
Write-Host "[2/3] Creating configuration..." -ForegroundColor Cyan
$configContent = @"
[req]
default_bits = 2048
prompt = no
default_md = sha256
req_extensions = req_ext
distinguished_name = dn

[dn]
C = RU
ST = Moscow
L = Moscow
O = MeetFlow
OU = Development
CN = $ip

[req_ext]
subjectAltName = @alt_names

[alt_names]
DNS.1 = localhost
DNS.2 = *.local
IP.1 = 127.0.0.1
IP.2 = $ip
"@

$configContent | Out-File -FilePath "openssl.cnf" -Encoding UTF8
Write-Host "[OK] Configuration created" -ForegroundColor Green
Write-Host ""

# Step 3: Generate certificate
Write-Host "[3/3] Generating SSL certificate..." -ForegroundColor Cyan
openssl req -new -x509 -key server.key -out server.crt -days 365 -config openssl.cnf -extensions req_ext 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to generate certificate" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Host "[OK] Certificate created" -ForegroundColor Green
Write-Host ""

Set-Location $PSScriptRoot

# Success message
Write-Host "========================================" -ForegroundColor Green
Write-Host "  SUCCESS!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Files created:" -ForegroundColor White
Write-Host "  - ssl\server.key  (private key)" -ForegroundColor Gray
Write-Host "  - ssl\server.crt  (certificate)" -ForegroundColor Gray
Write-Host ""
Write-Host "Certificate valid for 365 days" -ForegroundColor Yellow
Write-Host ""
Write-Host "IMPORTANT: Install certificate on all devices!" -ForegroundColor Red
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Copy ssl\server.crt to all devices"
Write-Host "  2. Install as trusted certificate (see SSL_GUIDE.md)"
Write-Host "  3. Run: node server.js"
Write-Host "  4. Open: https://$ip`:3000"
Write-Host ""
Write-Host "For detailed instructions, see SSL_GUIDE.md" -ForegroundColor Gray
Write-Host ""
Read-Host "Press Enter to exit"
