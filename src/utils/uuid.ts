// Безопасная генерация UUID, работающая в любом контексте (HTTP/HTTPS)
export const generateUUID = (): string => {
  // Попытка использовать crypto.randomUUID если доступен
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  
  // Fallback: используем crypto.getRandomValues если доступен
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (crypto.getRandomValues(new Uint8Array(1))[0] & 15) >> (c === 'x' ? 0 : 4);
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }
  
  // Последний fallback: Math.random
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};
