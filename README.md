# MeetFlow — Сервис видеоконференций

Платформа для организации видеозвонков и аудиоконференций с поддержкой WebRTC, демонстрации экрана, чата, записи встреч и сквозного шифрования.

## 🚀 Возможности

- **Регистрация и авторизация** — создание аккаунта, управление профилем
- **Дашборд** — управление встречами, статистика, настройки аккаунта
- **Видеоконференции** — HD видео и аудио через WebRTC
- **Демонстрация экрана** — показ экрана или отдельного окна
- **Встроенный чат** — обмен сообщениями в реальном времени
- **Управление участниками** — просмотр и контроль участников встречи
- **Запись встреч** — фиксация проведения конференции
- **Приглашения по ссылке** — неограниченное число участников
- **Адаптивный дизайн** — поддержка всех устройств и ОС
- **Безопасность** — сквозное шифрование данных

## 🏗️ Архитектура

```
┌─────────────────────────────────────────────────┐
│                   Frontend (React)               │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │  Auth     │ │Dashboard │ │   VideoRoom      │ │
│  │  Pages    │ │  Panel   │ │   (WebRTC)       │ │
│  └──────────┘ └──────────┘ └──────────────────┘ │
├─────────────────────────────────────────────────┤
│              State Management (Zustand)          │
├─────────────────────────────────────────────────┤
│              BroadcastChannel API                │
│           (сигнализация для демо)                │
├─────────────────────────────────────────────────┤
│              WebRTC (MediaStream API)            │
│  getUserMedia | getDisplayMedia | RTCPeerConn   │
└─────────────────────────────────────────────────┘
```

### Для production-развёртывания рекомендуется:

- **Signaling Server** — Socket.IO / WebSocket для установки WebRTC соединений
- **TURN/STUN серверы** — Coturn для обхода NAT
- **SFU/MCU** — mediasoup или Janus для масштабирования
- **База данных** — PostgreSQL для хранения пользователей и метаданных
- **CDN** — CloudFlare / AWS CloudFront для маршрутизации
- **Микросервисы** — Node.js / Go для обработки запросов

## 📋 Требования

- Node.js 18+ 
- npm 9+
- Современный браузер с поддержкой WebRTC (Chrome, Firefox, Safari, Edge)
- HTTPS для доступа к камере/микрофону (кроме localhost)

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

## 🌐 Развёртывание на сервере

### Вариант 1: Nginx + статический хостинг

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
    
    # Редирект на HTTPS
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

    # Разрешаем доступ к камере/микрофону
    add_header Permissions-Policy "camera=self; microphone=self; display-capture=self";

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
sudo mkdir -p /var/www/meetflow

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

# Автообновление
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

    add_header Permissions-Policy "camera=self; microphone=self; display-capture=self";

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

### Вариант 3: Vercel / Netlify (бесплатный хостинг)

```bash
# Vercel
npm i -g vercel
vercel --prod

# Netlify
npm i -g netlify-cli
netlify deploy --prod --dir=dist
```

## 🔧 Production: Полная архитектура с WebRTC сервером

Для полноценного продакшн-решения добавьте:

### 1. Signaling Server (Socket.IO)

```bash
mkdir signaling-server && cd signaling-server
npm init -y
npm install express socket.io cors
```

```javascript
// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const rooms = new Map();

io.on('connection', (socket) => {
  socket.on('join-room', ({ roomId, userId, userName }) => {
    socket.join(roomId);
    if (!rooms.has(roomId)) rooms.set(roomId, new Map());
    rooms.get(roomId).set(userId, { userId, userName, socketId: socket.id });
    
    socket.to(roomId).emit('user-joined', { userId, userName });
    socket.emit('room-users', Array.from(rooms.get(roomId).values()));
  });

  socket.on('signal', ({ roomId, targetId, signal }) => {
    io.to(targetId).emit('signal', { senderId: socket.id, signal });
  });

  socket.on('leave-room', ({ roomId, userId }) => {
    if (rooms.has(roomId)) {
      rooms.get(roomId).delete(userId);
      socket.to(roomId).emit('user-left', { userId });
    }
  });

  socket.on('disconnect', () => {
    rooms.forEach((users, roomId) => {
      users.forEach((user, userId) => {
        if (user.socketId === socket.id) {
          users.delete(userId);
          socket.to(roomId).emit('user-left', { userId });
        }
      });
    });
  });
});

server.listen(3001, () => console.log('Signaling server on :3001'));
```

### 2. TURN/STUN сервер (Coturn)

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

### 3. Nginx reverse proxy для signaling

```nginx
upstream signaling {
    server 127.0.0.1:3001;
}

server {
    listen 443 ssl;
    server_name your-domain.com;
    
    # ... SSL настройки ...

    location /socket.io/ {
        proxy_pass http://signaling;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
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
```

## 🔒 Безопасность

- Все данные передаются по HTTPS (TLS 1.3)
- WebRTC использует DTLS-SRTP для шифрования медиа
- Пароли хешируются (bcrypt)
- CORS настроен для ограничения доступа
- Rate limiting для предотвращения атак
- Content Security Policy заголовки

## 📱 Поддерживаемые платформы

| Платформа | Браузер | Статус |
|-----------|---------|--------|
| Windows | Chrome, Edge, Firefox | ✅ |
| macOS | Chrome, Safari, Firefox | ✅ |
| Linux | Chrome, Firefox | ✅ |
| Android | Chrome, Firefox | ✅ |
| iOS | Safari | ✅ |

## 📄 Лицензия

MIT License
