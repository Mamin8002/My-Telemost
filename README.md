# MeetFlow — Сервис видеоконференций

Платформа для организации видеозвонков и аудиоконференций с поддержкой WebRTC, демонстрации экрана, чата, записи встреч и сквозного шифрования.

## 🚀 Возможности

- **Регистрация и авторизация** — создание аккаунта, управление профилем
- **Дашборд** — управление встречами, статистика, настройки аккаунта
- **Видеоконференции** — HD видео и аудио через WebRTC (PeerJS)
- **Демонстрация экрана** — показ экрана или отдельного окна
- **Встроенный чат** — обмен сообщениями в реальном времени
- **Управление участниками** — просмотр и контроль участников встречи
- **Запись встреч** — фиксация проведения конференции
- **Приглашения по ссылке** — неограниченное число участников
- **P2P соединения** — прямое соединение между участниками через WebRTC
- **Адаптивный дизайн** — поддержка всех устройств и ОС
- **Безопасность** — сквозное шифрование через DTLS-SRTP

## 🏗️ Архитектура

```
┌─────────────────────────────────────────────────────────┐
│                   Frontend (React + Vite)                │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────────────┐ │
│  │  Auth     │ │Dashboard │ │   VideoRoom (WebRTC)     │ │
│  │  Pages    │ │  Panel   │ │   PeerJS P2P Mesh       │ │
│  └──────────┘ └──────────┘ └──────────────────────────┘ │
├─────────────────────────────────────────────────────────┤
│              State Management (Zustand + localStorage)   │
├─────────────────────────────────────────────────────────┤
│              PeerJS Signaling (0.peerjs.com)             │
│           (бесплатный публичный сигнальный сервер)       │
├─────────────────────────────────────────────────────────┤
│              WebRTC P2P Mesh Network                     │
│  getUserMedia | getDisplayMedia | RTCPeerConnection     │
│  DTLS-SRTP encryption | ICE/STUN/TURN                   │
└─────────────────────────────────────────────────────────┘
```

### Как работает подключение:

1. **Организатор** создаёт комнату → регистрируется на PeerJS с ID = `meetflow-{roomId}`
2. **Участники** переходят по ссылке → подключаются к хосту через PeerJS
3. **WebRTC** устанавливает P2P соединение между всеми участниками (mesh topology)
4. **Медиа** передаётся напрямую между браузерами (без сервера-посредника)
5. **Данные** (чат, статусы) проходят через хоста для синхронизации

## 📋 Требования

- Node.js 18+ 
- npm 9+
- Современный браузер с поддержкой WebRTC (Chrome 90+, Firefox 88+, Safari 15+, Edge 90+)
- HTTPS для доступа к камере/микрофону (кроме localhost)
- Доступ к интернету для PeerJS signaling server

## ⚡ Быстрый старт (локальная разработка)

```bash
# 1. Клонируйте репозиторий
git clone https://github.com/your-org/meetflow.git
cd meetflow

# 2. Установите зависимости
npm install

# 3. Запустите dev-сервер
npm run dev

# 4. Откройте в браузере
# http://localhost:5173
```

> **Важно:** Для работы камеры/микрофона используйте localhost или HTTPS.

## 🌐 Развёртывание на сервере

### Вариант 1: Nginx + статический хостинг (рекомендуется)

#### 1. Сборка проекта

```bash
npm install
npm run build
```

Результат сборки появится в папке `dist/`.

#### 2. Установка Nginx

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install nginx
```

**CentOS/RHEL:**
```bash
sudo yum install epel-release
sudo yum install nginx
```

#### 3. Конфигурация Nginx

Создайте файл `/etc/nginx/sites-available/meetflow`:

```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    # Редирект на HTTPS (обязательно для WebRTC!)
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    # SSL сертификаты (Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    
    # SSL настройки
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    
    # Заголовки безопасности
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Разрешаем доступ к камере/микрофону/экрану
    add_header Permissions-Policy "camera=(self) microphone=(self) display-capture=(self)" always;

    root /var/www/meetflow/dist;
    index index.html;

    # SPA routing - все маршруты на index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Кэширование статики
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Gzip сжатие
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript image/svg+xml;
}
```

#### 4. Развёртывание файлов

```bash
# Создайте директорию
sudo mkdir -p /var/www/meetflow/dist

# Скопируйте сборку
sudo cp -r dist/* /var/www/meetflow/dist/

# Установите права
sudo chown -R www-data:www-data /var/www/meetflow
sudo chmod -R 755 /var/www/meetflow
```

#### 5. Получение SSL сертификата (Let's Encrypt)

```bash
# Установите Certbot
sudo apt install certbot python3-certbot-nginx

# Получите сертификат
sudo certbot --nginx -d your-domain.com

# Проверьте автообновление
sudo certbot renew --dry-run
```

#### 6. Активация сайта

```bash
# Создайте символическую ссылку
sudo ln -s /etc/nginx/sites-available/meetflow /etc/nginx/sites-enabled/

# Проверьте конфигурацию
sudo nginx -t

# Перезапустите Nginx
sudo systemctl restart nginx
sudo systemctl enable nginx
```

#### 7. Готово! Откройте `https://your-domain.com`

### Вариант 2: Docker

#### 1. Создайте `Dockerfile`:

```dockerfile
FROM node:18-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

#### 2. Создайте `nginx.conf`:

```nginx
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    add_header Permissions-Policy "camera=(self) microphone=(self) display-capture=(self)";

    location / {
        try_files $uri $uri/ /index.html;
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    gzip on;
    gzip_types text/plain text/css application/json application/javascript;
}
```

#### 3. Создайте `docker-compose.yml`:

```yaml
version: '3.8'
services:
  meetflow:
    build: .
    ports:
      - "80:80"
      - "443:443"
    restart: unless-stopped
    volumes:
      - ./ssl:/etc/nginx/ssl:ro
```

#### 4. Запуск:

```bash
docker-compose up -d
```

### Вариант 3: Vercel / Netlify (бесплатный хостинг с HTTPS)

```bash
# Vercel
npm i -g vercel
vercel --prod

# Netlify
npm i -g netlify-cli
netlify deploy --prod --dir=dist
```

> Vercel и Netlify автоматически предоставляют HTTPS, что необходимо для WebRTC.

### Вариант 4: GitHub Pages

```bash
# Установите gh-pages
npm install -D gh-pages

# Добавьте в package.json:
# "deploy": "gh-pages -d dist"

# Разверните
npm run build
npm run deploy
```

## 🔧 Production: Собственный сигнальный сервер

Для полной независимости от публичного PeerJS сервера разверните свой:

### 1. PeerJS Server

```bash
mkdir signaling-server && cd signaling-server
npm init -y
npm install peer express

# server.js
cat > server.js << 'EOF'
const express = require('express');
const { PeerServer } = require('peer');

const app = express();
app.use(express.static('../dist')); // раздача фронтенда

const peerServer = PeerServer({
  port: 3001,
  path: '/peerjs',
  proxied: true,
});

app.listen(3000, () => console.log('App on :3000, PeerJS on :3001'));
EOF

node server.js
```

### 2. Обновите PeerJS конфигурацию в коде:

```typescript
const peer = new Peer(myPeerId, {
  host: 'your-domain.com',
  port: 443,
  secure: true,
  path: '/peerjs',
});
```

### 3. TURN/STUN сервер (Coturn) — для обхода NAT

```bash
sudo apt install coturn

# /etc/turnserver.conf
listening-port=3478
tls-listening-port=5349
listening-ip=0.0.0.0
external-ip=YOUR_SERVER_IP
realm=your-domain.com
server-name=your-domain.com
lt-cred-mech
userdb=/var/lib/turn/turndb
cert=/etc/letsencrypt/live/your-domain.com/fullchain.pem
pkey=/etc/letsencrypt/live/your-domain.com/privkey.pem

sudo systemctl enable coturn
sudo systemctl start coturn
```

### 4. Nginx reverse proxy для PeerJS

```nginx
upstream peerjs {
    server 127.0.0.1:3001;
}

server {
    listen 443 ssl;
    server_name your-domain.com;
    
    # ... SSL настройки ...

    location /peerjs/ {
        proxy_pass http://peerjs/peerjs/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        root /var/www/meetflow/dist;
        try_files $uri $uri/ /index.html;
    }
}
```

## 📊 Мониторинг и логирование

```bash
# Nginx логи
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log

# PM2 для Node.js процессов
npm install -g pm2
pm2 start signaling-server/server.js --name signaling
pm2 startup
pm2 save

# Мониторинг
pm2 monit
```

## 🔒 Безопасность

- Все данные передаются по HTTPS (TLS 1.3)
- WebRTC использует DTLS-SRTP для шифрования медиапотоков
- P2P соединения — медиа не проходит через сервер
- Пароли хешируются (bcrypt)
- CORS настроен для ограничения доступа
- Content Security Policy заголовки
- Permissions-Policy для контроля доступа к устройствам

## 📱 Поддерживаемые платформы

| Платформа | Браузер | Статус |
|-----------|---------|--------|
| Windows | Chrome, Edge, Firefox | ✅ |
| macOS | Chrome, Safari, Firefox | ✅ |
| Linux | Chrome, Firefox | ✅ |
| Android | Chrome, Firefox, Samsung Internet | ✅ |
| iOS | Safari | ✅ |

## ⚠️ Ограничения

- **Mesh topology** — каждый участник соединяется со всеми. Рекомендуется до 6-8 участников.
- **Публичный PeerJS сервер** — используется для signaling. Для продакшена разверните свой.
- **NAT traversal** — в сложных сетях может потребоваться TURN сервер.
- **Пропускная способность** — каждый участник отправляет N-1 видеопотоков.

## 📦 Стек технологий

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS
- **State:** Zustand с persist middleware
- **WebRTC:** PeerJS (signaling + connection management)
- **Routing:** React Router v6
- **Icons:** Lucide React
- **Deployment:** Nginx / Docker / Vercel / Netlify

## 📄 Лицензия

MIT License
