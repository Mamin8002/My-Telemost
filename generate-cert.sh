#!/bin/bash

# Скрипт для генерации самоподписанного SSL сертификата через OpenSSL

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║   Генерация SSL сертификата для MeetFlow                 ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# Проверяем наличие OpenSSL
if ! command -v openssl &> /dev/null; then
    echo "❌ OpenSSL не установлен!"
    echo ""
    echo "Установите OpenSSL:"
    echo "  Ubuntu/Debian: sudo apt install openssl"
    echo "  macOS: brew install openssl"
    echo "  Windows: https://slproweb.com/products/Win32OpenSSL.html"
    exit 1
fi

echo "✓ OpenSSL найден"
echo ""

# Получаем IP адрес
IP=$(hostname -I 2>/dev/null | awk '{print $1}' || ipconfig getifaddr en0 2>/dev/null || echo "localhost")

echo "Обнаружен IP адрес: $IP"
echo ""

# Создаем директорию для сертификатов
mkdir -p ssl
cd ssl

# Генерируем приватный ключ
echo "🔐 Генерация приватного ключа..."
openssl genrsa -out server.key 2048

# Создаем конфигурационный файл для SAN (Subject Alternative Names)
cat > openssl.cnf << EOF
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
CN = $IP

[req_ext]
subjectAltName = @alt_names

[alt_names]
DNS.1 = localhost
DNS.2 = *.local
IP.1 = 127.0.0.1
IP.2 = $IP
EOF

echo "✓ Конфигурация создана"
echo ""

# Генерируем сертификат
echo "📜 Генерация самоподписанного сертификата..."
openssl req -new -x509 -key server.key -out server.crt -days 365 -config openssl.cnf -extensions req_ext

echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║                                                           ║"
echo "║   ✅ SSL сертификат успешно создан!                      ║"
echo "║                                                           ║"
echo "║   Файлы:                                                  ║"
echo "║   • ssl/server.key  - приватный ключ                     ║"
echo "║   • ssl/server.crt  - сертификат                         ║"
echo "║   • ssl/openssl.cnf - конфигурация                       ║"
echo "║                                                           ║"
echo "║   Сертификат действителен 365 дней                       ║"
echo "║                                                           ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""
echo "⚠️  ВАЖНО: Добавьте сертификат в доверенные на всех устройствах!"
echo ""
echo "📱 Как добавить сертификат в доверенные:"
echo ""
echo "   Windows:"
echo "   1. Скопируйте ssl/server.crt на устройство"
echo "   2. Дважды кликните по файлу"
echo "   3. Нажмите 'Установить сертификат'"
echo "   4. Выберите 'Локальный компьютер'"
echo "   5. Выберите 'Поместить все сертификаты в следующее хранилище'"
echo "   6. Выберите 'Доверенные корневые центры сертификации'"
echo ""
echo "   macOS:"
echo "   1. Скопируйте ssl/server.crt на устройство"
echo "   2. Откройте Keychain Access"
echo "   3. Перетащите файл в 'System'"
echo "   4. Дважды кликните по сертификату"
echo "   5. В 'Trust' выберите 'Always Trust'"
echo ""
echo "   iOS:"
echo "   1. Отправьте ssl/server.crt себе на email или AirDrop"
echo "   2. Откройте файл на устройстве"
echo "   3. Settings → Profile Downloaded → Install"
echo "   4. Settings → General → About → Certificate Trust Settings"
echo "   5. Включите доверие для сертификата"
echo ""
echo "   Android:"
echo "   1. Скопируйте ssl/server.crt на устройство"
echo "   2. Settings → Security → Encryption & Credentials"
echo "   3. Install a certificate → CA certificate"
echo "   4. Выберите файл server.crt"
echo ""
echo "Теперь запустите сервер: node server.js"
echo ""

cd ..
