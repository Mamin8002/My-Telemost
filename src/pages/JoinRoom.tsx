import { useState, useRef, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Video, Mic, MicOff, Camera, CameraOff, ArrowRight, Shield } from 'lucide-react';
import { useMeetingStore } from '../store/meetingStore';

export default function JoinRoom() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const getMeeting = useMeetingStore((s) => s.getMeeting);
  const meeting = roomId ? getMeeting(roomId) : undefined;

  const [name, setName] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [stream]);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const toggleCamera = async () => {
    if (!isVideoOn) {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: !isMuted });
        setStream(mediaStream);
        setIsVideoOn(true);
      } catch {
        setError('Не удалось получить доступ к камере');
      }
    } else {
      if (stream) {
        stream.getVideoTracks().forEach((track) => track.stop());
        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length > 0) {
          const audioStream = new MediaStream(audioTracks);
          setStream(audioStream);
        } else {
          setStream(null);
        }
      }
      setIsVideoOn(false);
    }
  };

  const toggleMic = async () => {
    if (!isMuted) {
      if (stream) {
        stream.getAudioTracks().forEach((track) => (track.enabled = false));
      }
      setIsMuted(true);
    } else {
      if (!stream || stream.getAudioTracks().length === 0) {
        try {
          const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          if (stream) {
            const combined = new MediaStream([
              ...stream.getTracks(),
              ...audioStream.getTracks(),
            ]);
            setStream(combined);
          } else {
            setStream(audioStream);
          }
        } catch {
          setError('Не удалось получить доступ к микрофону');
          return;
        }
      } else {
        stream.getAudioTracks().forEach((track) => (track.enabled = true));
      }
      setIsMuted(false);
    }
  };

  const handleJoin = () => {
    if (!name.trim()) {
      setError('Введите ваше имя');
      return;
    }
    if (!roomId) {
      setError('Неверный код комнаты');
      return;
    }
    navigate(`/room/${roomId}?name=${encodeURIComponent(name)}&muted=${isMuted}&video=${isVideoOn}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl"></div>
      </div>

      <div className="relative w-full max-w-lg">
        <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-8 shadow-2xl border border-white/20">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-r from-purple-500 to-blue-500 rounded-2xl mb-3">
              <Video className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white">Присоединиться к встрече</h1>
            {meeting && (
              <p className="text-gray-300 mt-1">{meeting.title}</p>
            )}
            <p className="text-gray-400 text-sm mt-1">Комната: {roomId}</p>
          </div>

          {error && (
            <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3 mb-4 text-red-200 text-sm">
              {error}
            </div>
          )}

          {/* Video Preview */}
          <div className="relative aspect-video bg-slate-800 rounded-xl overflow-hidden mb-6 border border-white/10">
            {isVideoOn && stream ? (
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="w-full h-full object-cover mirror"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <div className="w-20 h-20 bg-purple-500/30 rounded-full flex items-center justify-center">
                  <span className="text-3xl text-purple-300 font-bold">
                    {name ? name[0].toUpperCase() : '?'}
                  </span>
                </div>
              </div>
            )}
            {isMuted && (
              <div className="absolute bottom-3 right-3 bg-red-500/80 rounded-full p-1.5">
                <MicOff className="w-4 h-4 text-white" />
              </div>
            )}
          </div>

          {/* Name Input */}
          <input
            type="text"
            placeholder="Ваше имя"
            value={name}
            onChange={(e) => { setName(e.target.value); setError(''); }}
            className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 mb-4"
            autoFocus
          />

          {/* Controls */}
          <div className="flex items-center justify-center gap-4 mb-6">
            <button
              onClick={toggleMic}
              className={`w-14 h-14 rounded-full flex items-center justify-center transition ${
                isMuted
                  ? 'bg-red-500/20 border-2 border-red-500 text-red-400'
                  : 'bg-white/10 border-2 border-white/20 text-white hover:bg-white/20'
              }`}
            >
              {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
            </button>
            <button
              onClick={toggleCamera}
              className={`w-14 h-14 rounded-full flex items-center justify-center transition ${
                !isVideoOn
                  ? 'bg-red-500/20 border-2 border-red-500 text-red-400'
                  : 'bg-white/10 border-2 border-white/20 text-white hover:bg-white/20'
              }`}
            >
              {!isVideoOn ? <CameraOff className="w-6 h-6" /> : <Camera className="w-6 h-6" />}
            </button>
          </div>

          {/* Join Button */}
          <button
            onClick={handleJoin}
            className="w-full py-3.5 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-semibold rounded-xl hover:from-purple-700 hover:to-blue-700 transition-all shadow-lg hover:shadow-purple-500/25 flex items-center justify-center gap-2"
          >
            Присоединиться
            <ArrowRight className="w-5 h-5" />
          </button>

          {/* Security Note */}
          <div className="flex items-center justify-center gap-2 mt-4 text-gray-400 text-xs">
            <Shield className="w-3.5 h-3.5" />
            <span>Соединение защищено сквозным шифрованием</span>
          </div>
        </div>
      </div>
    </div>
  );
}
