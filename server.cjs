const express = require('express');
const { createServer } = require('http');
const { createServer: createHttpsServer } = require('https');
const { Server } = require('socket.io');
const { ExpressPeerServer } = require('peer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();

// CORS для локальной сети
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST']
}));

// Проверяем наличие SSL сертификатов
const sslDir = path.join(__dirname, 'ssl');
const hasSSL = fs.existsSync(path.join(sslDir, 'server.key')) && 
               fs.existsSync(path.join(sslDir, 'server.crt'));

let httpServer;
let protocol = 'http';
let port = process.env.PORT || 3000;

if (hasSSL) {
  console.log('🔒 SSL сертификаты найдены, запускаем HTTPS сервер...');
  
  const sslOptions = {
    key: fs.readFileSync(path.join(sslDir, 'server.key')),
    cert: fs.readFileSync(path.join(sslDir, 'server.crt'))
  };
  
  httpServer = createHttpsServer(sslOptions, app);
  protocol = 'https';
} else {
  console.log('⚠️  SSL сертификаты не найдены, запускаем HTTP сервер...');
  console.log('💡 Для HTTPS запустите: ./generate-cert.sh (Linux/macOS) или generate-cert.bat (Windows)');
  httpServer = createServer(app);
}

// Socket.IO для сигнализации
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// PeerJS сервер встроенный
const peerServer = ExpressPeerServer(httpServer, {
  path: '/peerjs',
  debug: true
});

// Хранилище комнат и чатов
const rooms = new Map();
const chatHistory = new Map(); // roomId -> [messages]

// Socket.IO signaling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Присоединение к комнате
  socket.on('join-room', ({ roomId, peerId, userName }) => {
    console.log(`${userName} joining room ${roomId} with peerId ${peerId}`);
    
    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Map());
    }
    
    const room = rooms.get(roomId);
    room.set(peerId, { peerId, userName, socketId: socket.id });
    
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.peerId = peerId;
    
    // Отправляем список участников новому пользователю
    const participants = Array.from(room.values());
    socket.emit('room-users', participants);
    
    // Отправляем историю чата
    if (chatHistory.has(roomId)) {
      socket.emit('chat-history', chatHistory.get(roomId));
    }
    
    // Уведомляем остальных
    socket.to(roomId).emit('user-joined', { peerId, userName });
    
    console.log(`Room ${roomId} now has ${room.size} participants`);
  });

  // WebRTC signaling
  socket.on('signal-offer', ({ roomId, targetPeerId, offer }) => {
    console.log(`Offer from ${socket.data.peerId} to ${targetPeerId}`);
    // Отправляем только целевому участнику
    const targetSocket = Array.from(io.sockets.sockets.values())
      .find(s => s.data.peerId === targetPeerId && s.data.roomId === roomId);
    if (targetSocket) {
      targetSocket.emit('signal-offer', {
        fromPeerId: socket.data.peerId,
        offer
      });
    }
  });

  socket.on('signal-answer', ({ roomId, targetPeerId, answer }) => {
    console.log(`Answer from ${socket.data.peerId} to ${targetPeerId}`);
    // Отправляем только целевому участнику
    const targetSocket = Array.from(io.sockets.sockets.values())
      .find(s => s.data.peerId === targetPeerId && s.data.roomId === roomId);
    if (targetSocket) {
      targetSocket.emit('signal-answer', {
        fromPeerId: socket.data.peerId,
        answer
      });
    }
  });

  socket.on('signal-ice-candidate', ({ roomId, targetPeerId, candidate }) => {
    // Отправляем только целевому участнику
    const targetSocket = Array.from(io.sockets.sockets.values())
      .find(s => s.data.peerId === targetPeerId && s.data.roomId === roomId);
    if (targetSocket) {
      targetSocket.emit('signal-ice-candidate', {
        fromPeerId: socket.data.peerId,
        candidate
      });
    }
  });

  // Chat messages
  socket.on('chat-message', ({ roomId, message }) => {
    // Сохраняем в историю
    if (!chatHistory.has(roomId)) {
      chatHistory.set(roomId, []);
    }
    const history = chatHistory.get(roomId);
    history.push(message);
    
    // Ограничиваем историю до 100 сообщений
    if (history.length > 100) {
      history.shift();
    }
    
    // Отправляем всем в комнате
    io.to(roomId).emit('chat-message', message);
  });

  // Participant state updates
  socket.on('participant-update', ({ roomId, update }) => {
    socket.to(roomId).emit('participant-update', update);
  });

  // Отключение
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    
    const roomId = socket.data.roomId;
    const peerId = socket.data.peerId;
    
    if (roomId && peerId && rooms.has(roomId)) {
      const room = rooms.get(roomId);
      room.delete(peerId);
      
      if (room.size === 0) {
        rooms.delete(roomId);
        chatHistory.delete(roomId); // Очищаем историю чата
        console.log(`Room ${roomId} deleted (empty)`);
      } else {
        socket.to(roomId).emit('user-left', { peerId });
        console.log(`Room ${roomId} now has ${room.size} participants`);
      }
    }
  });
});

// Статические файлы (production)
app.use(express.static(path.join(__dirname, 'dist')));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Получаем IP адрес для отображения
function getLocalIP() {
  const os = require('os');
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const interface of interfaces[name]) {
      if (interface.family === 'IPv4' && !interface.internal) {
        return interface.address;
      }
    }
  }
  return 'localhost';
}

const localIP = getLocalIP();

httpServer.listen(port, '0.0.0.0', () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   MeetFlow Server запущен!                               ║
║                                                           ║
║   Протокол:         ${protocol.toUpperCase().padEnd(38)}║
║   HTTP Server:      ${protocol}://0.0.0.0:${port}${' '.repeat(Math.max(0, 24 - String(port).length))}║
║   PeerJS Server:    ${protocol}://0.0.0.0:${port}/peerjs${' '.repeat(Math.max(0, 18 - String(port).length))}║
║   Socket.IO:        ${protocol}://0.0.0.0:${port}${' '.repeat(Math.max(0, 24 - String(port).length))}║
║                                                           ║
║   Для доступа из локальной сети:                         ║
║   ${protocol}://${localIP}:${port}${' '.repeat(Math.max(0, 50 - protocol.length - localIP.length - String(port).length))}║
║                                                           ║
║   SSL:              ${hasSSL ? '✅ Включен' : '❌ Выключен'}${' '.repeat(37)}║
║                                                           ║
║   Комнаты активны:  ${rooms.size}${' '.repeat(41)}║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
  `);
  
  if (!hasSSL) {
    console.log('💡 Для включения HTTPS:');
    console.log('   1. Запустите: ./generate-cert.sh (Linux/macOS) или generate-cert.bat (Windows)');
    console.log('   2. Перезапустите сервер: node server.js');
    console.log('');
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  httpServer.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
