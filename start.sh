#!/bin/bash

# MeetFlow - Запуск сервера в локальной сети

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║                                                           ║"
echo "║   MeetFlow - Запуск сервера                              ║"
echo "║                                                           ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# Проверяем наличие Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js не установлен. Установите Node.js 18+ с https://nodejs.org/"
    exit 1
fi

echo "✓ Node.js версия: $(node --version)"
echo ""

# Устанавливаем зависимости если нужно
if [ ! -d "node_modules" ]; then
    echo "📦 Установка зависимостей..."
    npm install
    echo ""
fi

# Собираем фронтенд
echo "🔨 Сборка фронтенда..."
npm run build
echo ""

# Получаем IP адрес
IP=$(hostname -I 2>/dev/null || ipconfig getifaddr en0 2>/dev/null || echo "localhost")

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║                                                           ║"
echo "║   ✅ Сервер запущен!                                     ║"
echo "║                                                           ║"
echo "║   Локальный доступ:  http://localhost:3000               ║"
echo "║   Сетевой доступ:    http://${IP}:3000                   ║"
echo "║                                                           ║"
echo "║   Откройте ссылку на других устройствах в сети           ║"
echo "║                                                           ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""
echo "Для остановки нажмите Ctrl+C"
echo ""

# Запускаем сервер
node server.js
