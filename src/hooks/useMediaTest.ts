import { useState, useEffect } from 'react';

interface MediaTestResult {
  camera: boolean;
  microphone: boolean;
  error?: string;
  isSecureContext: boolean;
}

export function useMediaTest() {
  const [result, setResult] = useState<MediaTestResult | null>(null);
  const [testing, setTesting] = useState(true);

  useEffect(() => {
    const testMedia = async () => {
      setTesting(true);
      const res: MediaTestResult = {
        camera: false,
        microphone: false,
        isSecureContext: window.isSecureContext,
      };

      // Проверка secure context
      if (!window.isSecureContext) {
        res.error = 'Небезопасный контекст (HTTP). Камера и микрофон могут быть заблокированы.';
        setResult(res);
        setTesting(false);
        return;
      }

      // Тест камеры
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        stream.getTracks().forEach(t => t.stop());
        res.camera = true;
      } catch (e: any) {
        res.error = `Камера: ${e.message || 'Недоступна'}`;
      }

      // Тест микрофона
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(t => t.stop());
        res.microphone = true;
      } catch (e: any) {
        if (!res.error) res.error = `Микрофон: ${e.message || 'Недоступен'}`;
      }

      setResult(res);
      setTesting(false);
    };

    testMedia();
  }, []);

  return { result, testing };
}
