import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Mic, MicOff, Camera, CameraOff, MonitorUp, MonitorOff,
  MessageSquare, Users, PhoneOff, Circle, Copy, Check,
  Send, X, Shield, Clock
} from 'lucide-react';
import { useMeetingStore } from '../store/meetingStore';

interface ParticipantInfo {
  id: string;
  name: string;
  isMuted: boolean;
  isVideoOn: boolean;
  isScreenSharing: boolean;
  joinedAt: string;
}

interface ChatMsg {
  id: string;
  sender: string;
  text: string;
  time: string;
}

export default function VideoRoom() {
  const { roomId } = useParams<{ roomId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { startMeeting, endMeeting, getMeeting } = useMeetingStore();

  const myName = searchParams.get('name') || 'Гость';
  const startMuted = searchParams.get('muted') === 'true';
  const startVideo = searchParams.get('video') !== 'false';

  const [isMuted, setIsMuted] = useState(startMuted);
  const [isVideoOn, setIsVideoOn] = useState(startVideo);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const [chatMessage, setChatMessage] = useState('');
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [participants, setParticipants] = useState<ParticipantInfo[]>([]);
  const [copied, setCopied] = useState(false);
  const [duration, setDuration] = useState(0);
  const [elapsedTime, setElapsedTime] = useState('00:00');

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const bcRef = useRef<BroadcastChannel | null>(null);
  const myId = useRef(crypto.randomUUID());

  // Initialize
  useEffect(() => {
    if (!roomId) return;
    
    const meeting = getMeeting(roomId);
    if (meeting && meeting.status === 'scheduled') {
      startMeeting(roomId);
    }

    // Setup BroadcastChannel for local multi-tab demo
    const bc = new BroadcastChannel(`vc-room-${roomId}`);
    bcRef.current = bc;

    // Add self as participant
    const me: ParticipantInfo = {
      id: myId.current,
      name: myName,
      isMuted: startMuted,
      isVideoOn: startVideo,
      isScreenSharing: false,
      joinedAt: new Date().toISOString(),
    };
    setParticipants([me]);

    // Listen for other participants
    bc.onmessage = (event) => {
      const data = event.data;
      if (data.type === 'participant-join') {
        setParticipants((prev) => {
          if (prev.find((p) => p.id === data.participant.id)) return prev;
          return [...prev, data.participant];
        });
      } else if (data.type === 'participant-leave') {
        setParticipants((prev) => prev.filter((p) => p.id !== data.participantId));
      } else if (data.type === 'chat-message') {
        setMessages((prev) => [...prev, data.message]);
      } else if (data.type === 'participant-update') {
        setParticipants((prev) =>
          prev.map((p) =>
            p.id === data.participant.id ? { ...p, ...data.participant } : p
          )
        );
      }
    };

    // Announce self
    bc.postMessage({ type: 'participant-join', participant: me });

    // Timer
    const startTime = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      setDuration(elapsed);
      const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
      const secs = (elapsed % 60).toString().padStart(2, '0');
      setElapsedTime(`${mins}:${secs}`);
    }, 1000);

    return () => {
      bc.postMessage({ type: 'participant-leave', participantId: myId.current });
      bc.close();
      if (timerRef.current) clearInterval(timerRef.current);
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      endMeeting(roomId);
    };
  }, [roomId]);

  // Setup local media
  useEffect(() => {
    const setupMedia = async () => {
      try {
        const constraints: MediaStreamConstraints = {
          video: startVideo,
          audio: !startMuted,
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.log('Media not available:', err);
      }
    };
    setupMedia();
  }, []);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const toggleMute = useCallback(() => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((t) => (t.enabled = !newMuted));
    }
    bcRef.current?.postMessage({
      type: 'participant-update',
      participant: { id: myId.current, isMuted: newMuted },
    });
  }, [isMuted]);

  const toggleVideo = useCallback(() => {
    const newVideoOn = !isVideoOn;
    setIsVideoOn(newVideoOn);
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach((t) => (t.enabled = newVideoOn));
    }
    bcRef.current?.postMessage({
      type: 'participant-update',
      participant: { id: myId.current, isVideoOn: newVideoOn },
    });
  }, [isVideoOn]);

  const toggleScreenShare = useCallback(async () => {
    if (!isScreenSharing) {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
        });
        screenStreamRef.current = screenStream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = screenStream;
        }
        setIsScreenSharing(true);

        screenStream.getVideoTracks()[0].onended = () => {
          setIsScreenSharing(false);
          if (localStreamRef.current && localVideoRef.current) {
            localVideoRef.current.srcObject = localStreamRef.current;
          }
          screenStreamRef.current = null;
        };
      } catch (err) {
        console.log('Screen share cancelled:', err);
      }
    } else {
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((t) => t.stop());
        screenStreamRef.current = null;
      }
      if (localStreamRef.current && localVideoRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
      }
      setIsScreenSharing(false);
    }
    bcRef.current?.postMessage({
      type: 'participant-update',
      participant: { id: myId.current, isScreenSharing: !isScreenSharing },
    });
  }, [isScreenSharing]);

  const sendChatMessage = () => {
    if (!chatMessage.trim()) return;
    const msg: ChatMsg = {
      id: crypto.randomUUID(),
      sender: myName,
      text: chatMessage,
      time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
    };
    setMessages((prev) => [...prev, msg]);
    bcRef.current?.postMessage({ type: 'chat-message', message: msg });
    setChatMessage('');
  };

  const copyInviteLink = () => {
    const link = `${window.location.origin}/join/${roomId}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const leaveRoom = () => {
    navigate('/dashboard');
  };

  const meeting = roomId ? getMeeting(roomId) : undefined;

  return (
    <div className="h-screen bg-slate-900 flex flex-col overflow-hidden">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-800/80 backdrop-blur border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-r from-purple-500 to-blue-500 rounded-lg flex items-center justify-center">
            <Shield className="w-4 h-4 text-white" />
          </div>
          <div>
            <h2 className="text-white text-sm font-medium">
              {meeting?.title || 'Видеовстреча'}
            </h2>
            <p className="text-gray-400 text-xs">ID: {roomId}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-gray-300 text-sm">
            <Clock className="w-4 h-4" />
            {elapsedTime}
          </div>
          {isRecording && (
            <div className="flex items-center gap-1.5 text-red-400 text-sm animate-pulse">
              <Circle className="w-4 h-4" />
              REC
            </div>
          )}
          <button
            onClick={copyInviteLink}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 text-gray-300 rounded-lg hover:bg-white/20 transition text-xs"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Скопировано' : 'Пригласить'}
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Video Grid */}
        <div className="flex-1 p-4 flex items-center justify-center">
          <div className={`grid gap-3 w-full h-full ${
            participants.length === 1 ? 'grid-cols-1 max-w-3xl' :
            participants.length === 2 ? 'grid-cols-2' :
            participants.length <= 4 ? 'grid-cols-2' :
            'grid-cols-3'
          }`}>
            {/* My Video */}
            <div className="relative bg-slate-800 rounded-2xl overflow-hidden border border-white/10 group">
              {isVideoOn || isScreenSharing ? (
                <video
                  ref={localVideoRef}
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                  style={{ transform: isScreenSharing ? 'none' : 'scaleX(-1)' }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-900/50 to-blue-900/50">
                  <div className="w-24 h-24 bg-purple-500/30 rounded-full flex items-center justify-center">
                    <span className="text-4xl text-purple-200 font-bold">
                      {myName[0]?.toUpperCase()}
                    </span>
                  </div>
                </div>
              )}
              <div className="absolute bottom-3 left-3 flex items-center gap-2">
                <span className="px-2.5 py-1 bg-black/60 backdrop-blur rounded-lg text-white text-xs font-medium">
                  {myName} (Вы)
                </span>
                {isMuted && (
                  <span className="px-2 py-1 bg-red-500/80 rounded-lg text-white text-xs">
                    <MicOff className="w-3 h-3" />
                  </span>
                )}
              </div>
              {isScreenSharing && (
                <div className="absolute top-3 left-3 px-2.5 py-1 bg-blue-500/80 rounded-lg text-white text-xs font-medium">
                  Демонстрация экрана
                </div>
              )}
            </div>

            {/* Other Participants (simulated) */}
            {participants.filter(p => p.id !== myId.current).map((p) => (
              <div key={p.id} className="relative bg-slate-800 rounded-2xl overflow-hidden border border-white/10">
                {p.isVideoOn ? (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-900/50 to-purple-900/50">
                    <div className="w-24 h-24 bg-blue-500/30 rounded-full flex items-center justify-center">
                      <span className="text-4xl text-blue-200 font-bold">
                        {p.name[0]?.toUpperCase()}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-800 to-slate-700">
                    <div className="w-24 h-24 bg-gray-500/30 rounded-full flex items-center justify-center">
                      <span className="text-4xl text-gray-300 font-bold">
                        {p.name[0]?.toUpperCase()}
                      </span>
                    </div>
                  </div>
                )}
                <div className="absolute bottom-3 left-3 flex items-center gap-2">
                  <span className="px-2.5 py-1 bg-black/60 backdrop-blur rounded-lg text-white text-xs font-medium">
                    {p.name}
                  </span>
                  {p.isMuted && (
                    <span className="px-2 py-1 bg-red-500/80 rounded-lg text-white text-xs">
                      <MicOff className="w-3 h-3" />
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Side Panel */}
        {(showChat || showParticipants) && (
          <div className="w-80 bg-slate-800/90 backdrop-blur border-l border-white/10 flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <h3 className="text-white font-medium text-sm">
                {showChat ? 'Чат' : 'Участники'}
              </h3>
              <button
                onClick={() => { setShowChat(false); setShowParticipants(false); }}
                className="text-gray-400 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {showChat && (
              <>
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {messages.length === 0 ? (
                    <p className="text-center text-gray-500 text-sm mt-8">
                      Сообщений пока нет
                    </p>
                  ) : (
                    messages.map((msg) => (
                      <div key={msg.id} className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-purple-300">{msg.sender}</span>
                          <span className="text-xs text-gray-500">{msg.time}</span>
                        </div>
                        <p className="text-sm text-gray-200 bg-white/5 rounded-lg px-3 py-2">
                          {msg.text}
                        </p>
                      </div>
                    ))
                  )}
                  <div ref={chatEndRef} />
                </div>
                <div className="p-3 border-t border-white/10">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={chatMessage}
                      onChange={(e) => setChatMessage(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && sendChatMessage()}
                      placeholder="Сообщение..."
                      className="flex-1 px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-purple-500"
                    />
                    <button
                      onClick={sendChatMessage}
                      className="w-9 h-9 bg-purple-600 rounded-lg flex items-center justify-center text-white hover:bg-purple-700 transition"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </>
            )}

            {showParticipants && (
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {participants.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between px-3 py-2.5 bg-white/5 rounded-xl"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-purple-500/30 rounded-full flex items-center justify-center">
                        <span className="text-sm text-purple-200 font-medium">
                          {p.name[0]?.toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="text-white text-sm font-medium">
                          {p.name} {p.id === myId.current && <span className="text-gray-400 text-xs">(Вы)</span>}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {p.isMuted && <MicOff className="w-3.5 h-3.5 text-red-400" />}
                      {p.isVideoOn && <Camera className="w-3.5 h-3.5 text-green-400" />}
                      {p.isScreenSharing && <MonitorUp className="w-3.5 h-3.5 text-blue-400" />}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom Controls */}
      <div className="flex items-center justify-center gap-2 sm:gap-3 px-4 py-3 bg-slate-800/80 backdrop-blur border-t border-white/10">
        <button
          onClick={toggleMute}
          className={`w-12 h-12 rounded-full flex items-center justify-center transition ${
            isMuted
              ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
              : 'bg-white/10 text-white hover:bg-white/20'
          }`}
          title={isMuted ? 'Включить микрофон' : 'Выключить микрофон'}
        >
          {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </button>

        <button
          onClick={toggleVideo}
          className={`w-12 h-12 rounded-full flex items-center justify-center transition ${
            !isVideoOn
              ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
              : 'bg-white/10 text-white hover:bg-white/20'
          }`}
          title={isVideoOn ? 'Выключить камеру' : 'Включить камеру'}
        >
          {!isVideoOn ? <CameraOff className="w-5 h-5" /> : <Camera className="w-5 h-5" />}
        </button>

        <button
          onClick={toggleScreenShare}
          className={`w-12 h-12 rounded-full flex items-center justify-center transition ${
            isScreenSharing
              ? 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'
              : 'bg-white/10 text-white hover:bg-white/20'
          }`}
          title={isScreenSharing ? 'Остановить демонстрацию' : 'Демонстрация экрана'}
        >
          {isScreenSharing ? <MonitorOff className="w-5 h-5" /> : <MonitorUp className="w-5 h-5" />}
        </button>

        <button
          onClick={() => setIsRecording(!isRecording)}
          className={`w-12 h-12 rounded-full flex items-center justify-center transition ${
            isRecording
              ? 'bg-red-500 text-white hover:bg-red-600 animate-pulse'
              : 'bg-white/10 text-white hover:bg-white/20'
          }`}
          title={isRecording ? 'Остановить запись' : 'Начать запись'}
        >
          <Circle className="w-5 h-5" />
        </button>

        <div className="w-px h-8 bg-white/20 mx-1 hidden sm:block"></div>

        <button
          onClick={() => { setShowChat(!showChat); setShowParticipants(false); }}
          className={`w-12 h-12 rounded-full flex items-center justify-center transition relative ${
            showChat
              ? 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30'
              : 'bg-white/10 text-white hover:bg-white/20'
          }`}
          title="Чат"
        >
          <MessageSquare className="w-5 h-5" />
          {messages.length > 0 && !showChat && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-purple-500 rounded-full text-xs text-white flex items-center justify-center">
              {messages.length > 9 ? '9+' : messages.length}
            </span>
          )}
        </button>

        <button
          onClick={() => { setShowParticipants(!showParticipants); setShowChat(false); }}
          className={`w-12 h-12 rounded-full flex items-center justify-center transition ${
            showParticipants
              ? 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30'
              : 'bg-white/10 text-white hover:bg-white/20'
          }`}
          title="Участники"
        >
          <Users className="w-5 h-5" />
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-white/20 rounded-full text-xs text-white flex items-center justify-center">
            {participants.length}
          </span>
        </button>

        <div className="w-px h-8 bg-white/20 mx-1 hidden sm:block"></div>

        <button
          onClick={leaveRoom}
          className="px-5 h-12 bg-red-600 text-white rounded-full flex items-center gap-2 hover:bg-red-700 transition font-medium"
          title="Покинуть встречу"
        >
          <PhoneOff className="w-5 h-5" />
          <span className="hidden sm:inline">Выйти</span>
        </button>
      </div>
    </div>
  );
}
