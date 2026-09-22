// Утилита для шумоподавления аудио через Web Audio API

export class AudioProcessor {
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private destinationNode: MediaStreamAudioDestinationNode | null = null;
  private highPassFilter: BiquadFilterNode | null = null;
  private lowPassFilter: BiquadFilterNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private gainNode: GainNode | null = null;

  async processStream(stream: MediaStream): Promise<MediaStream> {
    try {
      // Создаем AudioContext
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Получаем аудиотрек из потока
      const audioTrack = stream.getAudioTracks()[0];
      if (!audioTrack) {
        console.warn('No audio track found in stream');
        return stream;
      }

      // Создаем source node из входящего потока
      this.sourceNode = this.audioContext.createMediaStreamSource(stream);

      // Создаем фильтры для шумоподавления
      
      // 1. High-pass фильтр - убирает низкочастотный шум (гул, вибрация)
      this.highPassFilter = this.audioContext.createBiquadFilter();
      this.highPassFilter.type = 'highpass';
      this.highPassFilter.frequency.value = 80; // Обрезаем ниже 80 Гц
      this.highPassFilter.Q.value = 0.7;

      // 2. Low-pass фильтр - убирает высокочастотный шум (шипение)
      this.lowPassFilter = this.audioContext.createBiquadFilter();
      this.lowPassFilter.type = 'lowpass';
      this.lowPassFilter.frequency.value = 8000; // Обрезаем выше 8 кГц
      this.lowPassFilter.Q.value = 0.7;

      // 3. Компрессор - выравнивает громкость, убирает тихие шумы
      this.compressor = this.audioContext.createDynamicsCompressor();
      this.compressor.threshold.value = -50; // Порог срабатывания в дБ
      this.compressor.knee.value = 40; // Плавность срабатывания
      this.compressor.ratio.value = 12; // Степень компрессии
      this.compressor.attack.value = 0.003; // Время атаки
      this.compressor.release.value = 0.25; // Время восстановления

      // 4. Gain node для дополнительной регулировки
      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.value = 1.5; // Усиливаем сигнал

      // Создаем destination node для получения обработанного потока
      this.destinationNode = this.audioContext.createMediaStreamDestination();

      // Подключаем цепочку обработки:
      // source -> highpass -> lowpass -> compressor -> gain -> destination
      this.sourceNode
        .connect(this.highPassFilter)
        .connect(this.lowPassFilter)
        .connect(this.compressor)
        .connect(this.gainNode)
        .connect(this.destinationNode);

      // Создаем новый MediaStream с обработанным аудио и оригинальным видео
      const processedStream = new MediaStream();
      
      // Добавляем обработанный аудиотрек
      const processedAudioTrack = this.destinationNode.stream.getAudioTracks()[0];
      if (processedAudioTrack) {
        processedStream.addTrack(processedAudioTrack);
      }

      // Добавляем оригинальные видеотреки (если есть)
      stream.getVideoTracks().forEach(track => {
        processedStream.addTrack(track);
      });

      console.log('✅ Audio processing enabled with noise suppression');
      return processedStream;

    } catch (error) {
      console.error('❌ Error setting up audio processing:', error);
      // Возвращаем оригинальный поток при ошибке
      return stream;
    }
  }

  stop() {
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.sourceNode = null;
    this.destinationNode = null;
    this.highPassFilter = null;
    this.lowPassFilter = null;
    this.compressor = null;
    this.gainNode = null;
  }
}
