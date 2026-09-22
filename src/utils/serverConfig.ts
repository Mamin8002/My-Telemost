// Утилита для определения URL сервера
export const getServerUrl = () => {
  // В production используем текущий хост
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol;
    const hostname = window.location.hostname;
    const port = window.location.port || (protocol === 'https:' ? '443' : '80');
    
    // Если порт стандартный, не добавляем его
    if (port === '80' || port === '443') {
      return `${protocol}//${hostname}`;
    }
    
    return `${protocol}//${hostname}:${port}`;
  }
  
  // Fallback для разработки
  return 'http://localhost:3000';
};

export const getSocketUrl = () => {
  return getServerUrl();
};

export const getPeerServerConfig = () => {
  const url = new URL(getServerUrl());
  return {
    host: url.hostname,
    port: url.port || (url.protocol === 'https:' ? 443 : 80),
    path: '/peerjs',
    secure: url.protocol === 'https:'
  };
};
