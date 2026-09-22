import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import {
  Mic, MicOff, Camera, CameraOff, MonitorUp, MonitorOff,
  MessageSquare, Users, PhoneOff, Circle, Copy, Check,
  Send, X, Shield, Clock, Wifi, WifiOff, AlertCircle, CheckCircle, XCircle
} from 'lucide-react';
import { useMeetingStore } from '../store/meetingStore';
import { getSocketUrl } from '../utils/serverConfig';
import { generateUUID } from '../utils/uuid';
import { useMediaTest } from '../hooks/useMediaTest';
import { AudioProcessor } from '../utils/audioProcessor';

// Оптимизированный компонент для удаленного видео
const RemoteVideoTile = memo(({ stream, name, peerId, onClick }: { 
  stream: MediaStream; 
  name: string; 
  peerId: string;
  onClick: () => void;
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div 
      className="relative bg-slate-800 rounded-2xl overflow-hidden border border-white/10 min-h-[200px] cursor-pointer hover:border-purple-500/50 transition-all group"
      onClick={onClick}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className="w-full h-full object-cover"
      />
      <div className="absolute bottom-3 left-3">
        <span className="px-2.5 py-1 bg-black/60 backdrop-blur rounded-lg text-white text-xs font-medium">
          {name}
        </span>
      </div>
      <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="px-2 py-1 bg-black/60 backdrop-blur rounded-lg text-white text-xs">
          Нажмите для увеличения
        </div>
      </div>
    </div>
  );
});

RemoteVideoTile.displayName = 'RemoteVideoTile';

interface ParticipantInfo {
  peerId: string;
  name: string;
  isMuted: boolean;
  isVideoOn: boolean;
  isScreenSharing: boolean;
}

interface ChatMsg {
  id: string;
  sender: string;
  text: string;
  time: string;
}

interface RemoteStream {
  peerId: string;
  stream: MediaStream;
  name: string;
}

export default function VideoRoom() {
  const { roomId } = useParams<{ roomId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { startMeeting, endMeeting, getMeeting } = useMeetingStore();
  const { result: mediaTest, testing: mediaTesting } = useMediaTest();

  const myName = searchParams.get('name') || 'Гость';
  const startMuted = searchParams.get('muted') === 'true';
  const startVideo = searchParams.get('video') !== 'false';

  const [isMuted, setIsMuted] = useState(startMuted);
  const [isVideoOn, setIsVideoOn] = useState(startVideo);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [chatMessage, setChatMessage] = useState('');
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [participants, setParticipants] = useState<ParticipantInfo[]>([]);
  const [remoteStreams, setRemoteStreams] = useState<RemoteStream[]>([]);
  const [copied, setCopied] = useState(false);
  const [elapsedTime, setElapsedTime] = useState('00:00');
  const [isConnected, setIsConnected] = useState(false);
  const [mediaError, setMediaError] = useState<string>('');
  const [localStreamReady, setLocalStreamReady] = useState(false);
  const [expandedVideo, setExpandedVideo] = useState<string | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const processedStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const myPeerIdRef = useRef('');
  const participantsRef = useRef<ParticipantInfo[]>([]);
  const audioProcessorRef = useRef<AudioProcessor | null>(null);

  const ICE_SERVERS = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
      {
        urls: 'turn:openrelay.metered.ca:80',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      },
      {
        urls: 'turn:openrelay.metered.ca:443',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      },
      {
        urls: 'turn:openrelay.metered.ca:443?transport=tcp',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      },
    ]
  };

  useEffect(() => {
    participantsRef.current = participants;
  }, [participants]);

  const createPeerConnection = useCallback((targetPeerId: string) => {
    const pc = new RTCPeerConnection({
      ...ICE_SERVERS,
      iceTransportPolicy: 'all',
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require'
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('🧊 ICE candidate for:', targetPeerId);
        if (socketRef.current) {
          socketRef.current.emit('signal-ice-candidate', {
            roomId,
            targetPeerId,
            candidate: event.candidate
          });
        }
      }
    };

    // Добавляем треки из обработанного потока (с шумоподавлением)
    const streamToSend = processedStreamRef.current || localStreamRef.current;
    if (streamToSend) {
      streamToSend.getTracks().forEach((track) => {
        pc.addTrack(track, streamToSend);
      });
    }

    pc.ontrack = (event) => {
      console.log('🎬 Received track from:', targetPeerId, 'kind:', event.track.kind);
      
      if (event.streams && event.streams[0]) {
        const stream = event.streams[0];
        const participantName = participantsRef.current.find(p => p.peerId === targetPeerId)?.name || 'Участник';
        
        setRemoteStreams((prev) => {
          const existing = prev.find(s => s.peerId === targetPeerId);
          
          // Проверяем, действительно ли нужно обновлять
          if (existing && existing.stream === stream) {
            return prev; // Нет изменений
          }
          
          if (existing) {
            return prev.map(s => s.peerId === targetPeerId ? { ...s, stream } : s);
          } else {
            return [...prev, { peerId: targetPeerId, stream, name: participantName }];
          }
        });
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log('🔌 ICE state:', pc.iceConnectionState, 'for:', targetPeerId);
      if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'closed') {
        setRemoteStreams((prev) => prev.filter((s) => s.peerId !== targetPeerId));
        setParticipants((prev) => prev.filter((p) => p.peerId !== targetPeerId));
      }
    };

    peerConnectionsRef.current.set(targetPeerId, pc);
    return pc;
  }, [roomId]);

  useEffect(() => {
    if (!roomId) return;

    const meeting = getMeeting(roomId);
    if (meeting && meeting.status === 'scheduled') {
      startMeeting(roomId);
    }

    myPeerIdRef.current = `peer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const socket = io(getSocketUrl(), {
      transports: ['websocket', 'polling']
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('✅ Connected to signaling server');
      setIsConnected(true);

      const savedMessages = JSON.parse(localStorage.getItem(`chat-${roomId}`) || '[]');
      if (savedMessages.length > 0) {
        setMessages(savedMessages);
      }

      socket.emit('join-room', {
        roomId,
        peerId: myPeerIdRef.current,
        userName: myName
      });
    });

    socket.on('connect_error', (error) => {
      console.error('❌ Connection error:', error);
      setIsConnected(false);
    });

    socket.on('room-users', (existingUsers: any[]) => {
      console.log('👥 Existing users:', existingUsers.length);
      
      const me: ParticipantInfo = {
        peerId: myPeerIdRef.current,
        name: myName,
        isMuted: startMuted,
        isVideoOn: startVideo,
        isScreenSharing: false,
      };
      
      const others = existingUsers.map((u: any) => ({
        peerId: u.peerId,
        name: u.userName,
        isMuted: false,
        isVideoOn: true,
        isScreenSharing: false,
      }));
      
      setParticipants([me, ...others]);

      const waitForStreamAndConnect = () => {
        if (localStreamRef.current) {
          others.forEach((user: any, index: number) => {
            setTimeout(() => {
              const pc = createPeerConnection(user.peerId);
              
              localStreamRef.current!.getTracks().forEach((track) => {
                pc.addTrack(track, localStreamRef.current!);
              });
              
              pc.createOffer().then((offer) => {
                pc.setLocalDescription(offer);
                socket.emit('signal-offer', {
                  roomId,
                  targetPeerId: user.peerId,
                  offer
                });
              }).catch(err => {
                console.error('❌ Error creating offer:', err);
              });
            }, index * 200);
          });
        } else {
          setTimeout(waitForStreamAndConnect, 100);
        }
      };
      waitForStreamAndConnect();
    });

    socket.on('user-joined', ({ peerId, userName }: { peerId: string; userName: string }) => {
      console.log('👋 User joined:', userName);
      
      setParticipants((prev) => {
        if (prev.find((p) => p.peerId === peerId)) return prev;
        return [...prev, {
          peerId,
          name: userName,
          isMuted: false,
          isVideoOn: true,
          isScreenSharing: false,
        }];
      });
      
      const waitForStreamAndConnect = () => {
        if (localStreamRef.current) {
          const pc = createPeerConnection(peerId);
          
          localStreamRef.current!.getTracks().forEach((track) => {
            pc.addTrack(track, localStreamRef.current!);
          });
          
          pc.createOffer().then((offer) => {
            pc.setLocalDescription(offer);
            socket.emit('signal-offer', {
              roomId,
              targetPeerId: peerId,
              offer
            });
          }).catch(err => {
            console.error('❌ Error creating offer:', err);
          });
        } else {
          setTimeout(waitForStreamAndConnect, 100);
        }
      };
      waitForStreamAndConnect();
    });

    socket.on('signal-offer', async ({ fromPeerId, offer }: { fromPeerId: string; offer: RTCSessionDescriptionInit }) => {
      console.log('📨 Received offer from:', fromPeerId);
      
      let pc = peerConnectionsRef.current.get(fromPeerId);
      if (!pc) {
        pc = createPeerConnection(fromPeerId);
        
        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach((track) => {
            pc!.addTrack(track, localStreamRef.current!);
          });
        }
      }

      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      
      const pendingCandidates = pendingCandidatesRef.current.get(fromPeerId);
      if (pendingCandidates && pendingCandidates.length > 0) {
        for (const candidate of pendingCandidates) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (e) {
            console.error('❌ Error applying buffered candidate:', e);
          }
        }
        pendingCandidatesRef.current.delete(fromPeerId);
      }
      
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      
      socket.emit('signal-answer', {
        roomId,
        targetPeerId: fromPeerId,
        answer
      });
    });

    socket.on('signal-answer', async ({ fromPeerId, answer }: { fromPeerId: string; answer: RTCSessionDescriptionInit }) => {
      console.log('📨 Received answer from:', fromPeerId);
      
      const pc = peerConnectionsRef.current.get(fromPeerId);
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        
        const pendingCandidates = pendingCandidatesRef.current.get(fromPeerId);
        if (pendingCandidates && pendingCandidates.length > 0) {
          for (const candidate of pendingCandidates) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (e) {
              console.error('❌ Error applying buffered candidate:', e);
            }
          }
          pendingCandidatesRef.current.delete(fromPeerId);
        }
      }
    });

    socket.on('signal-ice-candidate', async ({ fromPeerId, candidate }: { fromPeerId: string; candidate: RTCIceCandidateInit }) => {
      const pc = peerConnectionsRef.current.get(fromPeerId);
      if (pc) {
        if (pc.remoteDescription) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } else {
          if (!pendingCandidatesRef.current.has(fromPeerId)) {
            pendingCandidatesRef.current.set(fromPeerId, []);
          }
          pendingCandidatesRef.current.get(fromPeerId)!.push(candidate);
        }
      }
    });

    socket.on('chat-message', (message: ChatMsg) => {
      setMessages((prev) => {
        // Проверяем, есть ли уже такое сообщение (защита от дублирования)
        if (prev.find(m => m.id === message.id)) {
          return prev;
        }
        
        // Сохраняем в localStorage
        const savedMessages = JSON.parse(localStorage.getItem(`chat-${roomId}`) || '[]');
        if (!savedMessages.find((m: ChatMsg) => m.id === message.id)) {
          savedMessages.push(message);
          localStorage.setItem(`chat-${roomId}`, JSON.stringify(savedMessages));
        }
        
        return [...prev, message];
      });
    });

    socket.on('chat-history', (history: ChatMsg[]) => {
      setMessages(history);
    });

    socket.on('user-left', ({ peerId }: { peerId: string }) => {
      console.log('👋 User left:', peerId);
      
      setParticipants((prev) => prev.filter((p) => p.peerId !== peerId));
      setRemoteStreams((prev) => prev.filter((s) => s.peerId !== peerId));
      
      const pc = peerConnectionsRef.current.get(peerId);
      if (pc) {
        pc.close();
        peerConnectionsRef.current.delete(peerId);
      }
    });

    const startTime = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
      const secs = (elapsed % 60).toString().padStart(2, '0');
      setElapsedTime(`${mins}:${secs}`);
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      
      peerConnectionsRef.current.forEach((pc) => pc.close());
      
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (audioProcessorRef.current) {
        audioProcessorRef.current.stop();
      }
      
      socket.disconnect();
      if (roomId) endMeeting(roomId);
    };
  }, [roomId]);

  useEffect(() => {
    const setupMedia = async () => {
      try {
        const constraints: MediaStreamConstraints = {
          video: startVideo,
          audio: !startMuted,
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        localStreamRef.current = stream;
        
        // Применяем шумоподавление к аудио
        if (!startMuted && stream.getAudioTracks().length > 0) {
          try {
            audioProcessorRef.current = new AudioProcessor();
            const processedStream = await audioProcessorRef.current.processStream(stream);
            processedStreamRef.current = processedStream;
            console.log('✅ Noise suppression enabled');
          } catch (err) {
            console.warn('⚠️ Could not enable noise suppression, using original stream:', err);
            processedStreamRef.current = stream;
          }
        } else {
          processedStreamRef.current = stream;
        }
        
        setLocalStreamReady(true);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      } catch (err: any) {
        console.error('❌ Media error:', err);
        setMediaError(err.message || 'Не удалось получить доступ к камере/микрофону');
      }
    };
    setupMedia();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const toggleMute = useCallback(() => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((t) => (t.enabled = !newMuted));
    }
    socketRef.current?.emit('participant-update', {
      roomId,
      update: { peerId: myPeerIdRef.current, isMuted: newMuted }
    });
  }, [isMuted, roomId]);

  const toggleVideo = useCallback(() => {
    const newVideoOn = !isVideoOn;
    setIsVideoOn(newVideoOn);
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach((t) => (t.enabled = newVideoOn));
    }
    socketRef.current?.emit('participant-update', {
      roomId,
      update: { peerId: myPeerIdRef.current, isVideoOn: newVideoOn }
    });
  }, [isVideoOn, roomId]);

  const toggleScreenShare = useCallback(async () => {
    if (!isScreenSharing) {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        screenStreamRef.current = screenStream;
        const screenTrack = screenStream.getVideoTracks()[0];

        peerConnectionsRef.current.forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
          if (sender && screenTrack) {
            sender.replaceTrack(screenTrack);
          }
        });

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = screenStream;
        }
        setIsScreenSharing(true);

        screenTrack.onended = () => {
          stopScreenShare();
        };

        socketRef.current?.emit('participant-update', {
          roomId,
          update: { peerId: myPeerIdRef.current, isScreenSharing: true }
        });
      } catch (err) {
        console.log('Screen share cancelled');
      }
    } else {
      stopScreenShare();
    }
  }, [isScreenSharing, roomId]);

  const stopScreenShare = () => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
    }
    if (localStreamRef.current && localVideoRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
      const cameraTrack = localStreamRef.current.getVideoTracks()[0];
      if (cameraTrack) {
        peerConnectionsRef.current.forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
          if (sender) sender.replaceTrack(cameraTrack);
        });
      }
    }
    setIsScreenSharing(false);
    socketRef.current?.emit('participant-update', {
      roomId,
      update: { peerId: myPeerIdRef.current, isScreenSharing: false }
    });
  };

  const sendChatMessage = () => {
    if (!chatMessage.trim()) return;
    const msg: ChatMsg = {
      id: generateUUID(),
      sender: myName,
      text: chatMessage,
      time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
    };
    // Не добавляем локально - сервер разошлет всем, включая нас
    socketRef.current?.emit('chat-message', { roomId, message: msg });
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
  const totalParticipants = participants.length;

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
          <div className={`flex items-center gap-1.5 text-xs ${isConnected ? 'text-green-400' : 'text-red-400'}`}>
            {isConnected ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
            {isConnected ? 'Подключено' : 'Нет связи'}
          </div>
          <button
            onClick={() => setShowDiagnostics(!showDiagnostics)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 text-gray-300 rounded-lg hover:bg-white/20 transition text-xs"
          >
            <AlertCircle className="w-3.5 h-3.5" />
            Диагностика
          </button>
          {isRecording && (
            <div className="flex items-center gap-1.5 text-red-400 text-sm animate-pulse">
              <Circle className="w-4 h-4 fill-current" />
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

      {/* Media Error Banner */}
      {mediaError && (
        <div className="bg-yellow-500/20 border-b border-yellow-500/50 px-4 py-3">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-yellow-200 text-sm font-medium">Проблема с камерой/микрофоном</p>
              <p className="text-yellow-300/80 text-xs mt-1">{mediaError}</p>
              <p className="text-yellow-300/80 text-xs mt-2">
                💡 <strong>Решение:</strong> Используйте HTTPS или localhost. 
                <button 
                  onClick={() => setShowDiagnostics(true)}
                  className="underline ml-1 hover:text-yellow-200"
                >
                  Подробнее
                </button>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Diagnostics Panel */}
      {showDiagnostics && (
        <div className="bg-slate-800/95 border-b border-white/10 px-4 py-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white font-medium text-sm">Диагностика подключения</h3>
            <button onClick={() => setShowDiagnostics(false)} className="text-gray-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                {isConnected ? <CheckCircle className="w-4 h-4 text-green-400" /> : <XCircle className="w-4 h-4 text-red-400" />}
                <span className="text-gray-300">Сервер сигнализации</span>
              </div>
              <div className="flex items-center gap-2">
                {mediaTest?.isSecureContext ? <CheckCircle className="w-4 h-4 text-green-400" /> : <XCircle className="w-4 h-4 text-red-400" />}
                <span className="text-gray-300">Безопасный контекст (HTTPS)</span>
              </div>
              <div className="flex items-center gap-2">
                {mediaTest?.camera ? <CheckCircle className="w-4 h-4 text-green-400" /> : <XCircle className="w-4 h-4 text-red-400" />}
                <span className="text-gray-300">Камера</span>
              </div>
              <div className="flex items-center gap-2">
                {mediaTest?.microphone ? <CheckCircle className="w-4 h-4 text-green-400" /> : <XCircle className="w-4 h-4 text-red-400" />}
                <span className="text-gray-300">Микрофон</span>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                {localStreamRef.current ? <CheckCircle className="w-4 h-4 text-green-400" /> : <XCircle className="w-4 h-4 text-red-400" />}
                <span className="text-gray-300">Локальный видеопоток</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-300">Участники: {participants.length}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-300">Видеопотоки: {remoteStreams.length}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-300">PeerConnections: {peerConnectionsRef.current.size}</span>
              </div>
            </div>
          </div>
          {mediaTest?.error && (
            <div className="mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              <p className="text-red-300 text-xs">{mediaTest.error}</p>
            </div>
          )}
          {!mediaTest?.isSecureContext && (
            <div className="mt-3 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
              <p className="text-blue-300 text-xs font-medium mb-1">💡 Как включить HTTPS:</p>
              <p className="text-blue-300/80 text-xs">1. Запустите: <code className="bg-black/30 px-1 rounded">./generate-cert.sh</code></p>
              <p className="text-blue-300/80 text-xs">2. Перезапустите сервер: <code className="bg-black/30 px-1 rounded">node server.js</code></p>
              <p className="text-blue-300/80 text-xs">3. Откройте: <code className="bg-black/30 px-1 rounded">https://ВАШ_IP:3000</code></p>
            </div>
          )}
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Video Grid - все участники включая локального */}
        <div className="flex-1 p-4 flex items-center justify-center">
          <div className={`grid gap-3 w-full h-full ${
            totalParticipants === 1 ? 'grid-cols-1 max-w-3xl' :
            totalParticipants === 2 ? 'grid-cols-1 sm:grid-cols-2 max-w-5xl' :
            totalParticipants <= 4 ? 'grid-cols-2' :
            totalParticipants <= 6 ? 'grid-cols-3' :
            'grid-cols-4'
          }`}>
            {/* My Video */}
            <div 
              className="relative bg-slate-800 rounded-2xl overflow-hidden border border-white/10 group min-h-[200px] cursor-pointer hover:border-purple-500/50 transition-all"
              onClick={() => setExpandedVideo('local')}
            >
              {(isVideoOn || isScreenSharing) && localStreamReady ? (
                <video
                  ref={localVideoRef}
                  autoPlay
                  muted
                  playsInline
                  className={`w-full h-full object-cover ${isScreenSharing ? '' : 'scale-x-[-1]'}`}
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
                  <span className="px-2 py-1 bg-red-500/80 rounded-lg">
                    <MicOff className="w-3 h-3 text-white" />
                  </span>
                )}
              </div>
              {isScreenSharing && (
                <div className="absolute top-3 left-3 px-2.5 py-1 bg-blue-500/80 rounded-lg text-white text-xs font-medium">
                  📺 Демонстрация экрана
                </div>
              )}
              <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="px-2 py-1 bg-black/60 backdrop-blur rounded-lg text-white text-xs">
                  Нажмите для увеличения
                </div>
              </div>
            </div>

            {/* Remote Participants */}
            {remoteStreams.map((remote) => (
              <RemoteVideoTile
                key={remote.peerId}
                stream={remote.stream}
                name={remote.name}
                peerId={remote.peerId}
                onClick={() => setExpandedVideo(remote.peerId)}
              />
            ))}

            {/* Participants without video */}
            {participants
              .filter((p) => p.peerId !== myPeerIdRef.current)
              .filter((p) => !remoteStreams.find((s) => s.peerId === p.peerId))
              .map((p) => (
                <div key={p.peerId} className="relative bg-slate-800 rounded-2xl overflow-hidden border border-white/10 min-h-[200px]">
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-800 to-slate-700">
                    <div className="w-24 h-24 bg-gray-500/30 rounded-full flex items-center justify-center">
                      <span className="text-4xl text-gray-300 font-bold">
                        {p.name[0]?.toUpperCase()}
                      </span>
                    </div>
                  </div>
                  <div className="absolute bottom-3 left-3 flex items-center gap-2">
                    <span className="px-2.5 py-1 bg-black/60 backdrop-blur rounded-lg text-white text-xs font-medium">
                      {p.name}
                    </span>
                    {p.isMuted && (
                      <span className="px-2 py-1 bg-red-500/80 rounded-lg">
                        <MicOff className="w-3 h-3 text-white" />
                      </span>
                    )}
                  </div>
                </div>
              ))}

            {/* Если нет удаленных участников, показываем заглушку */}
            {remoteStreams.length === 0 && participants.filter(p => p.peerId !== myPeerIdRef.current).length === 0 && (
              <div className="relative bg-slate-800/50 rounded-2xl overflow-hidden border border-white/10 min-h-[200px] flex items-center justify-center">
                <div className="text-center">
                  <Users className="w-16 h-16 text-gray-600 mx-auto mb-3" />
                  <p className="text-gray-400 text-sm">Ожидание участников...</p>
                  <p className="text-gray-500 text-xs mt-1">Поделитесь ссылкой для приглашения</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Side Panel */}
        {(showChat || showParticipants) && (
          <div className="w-80 bg-slate-800/90 backdrop-blur border-l border-white/10 flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <h3 className="text-white font-medium text-sm">
                {showChat ? `Чат (${messages.length})` : `Участники (${participants.length})`}
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
                    key={p.peerId}
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
                          {p.name} {p.peerId === myPeerIdRef.current && <span className="text-gray-400 text-xs">(Вы)</span>}
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
          disabled={!localStreamRef.current}
          className={`w-12 h-12 rounded-full flex items-center justify-center transition ${
            !localStreamRef.current ? 'bg-gray-500/20 text-gray-500 cursor-not-allowed' :
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
          disabled={!localStreamRef.current}
          className={`w-12 h-12 rounded-full flex items-center justify-center transition ${
            !localStreamRef.current ? 'bg-gray-500/20 text-gray-500 cursor-not-allowed' :
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

      {/* Expanded Video Modal */}
      {expandedVideo && (
        <div 
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
          onClick={() => setExpandedVideo(null)}
        >
          <div className="relative w-full h-full max-w-7xl max-h-[90vh]">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setExpandedVideo(null);
              }}
              className="absolute top-4 right-4 z-10 w-12 h-12 bg-white/10 hover:bg-white/20 backdrop-blur rounded-full flex items-center justify-center text-white transition"
            >
              <X className="w-6 h-6" />
            </button>
            
            <div className="w-full h-full bg-slate-800 rounded-2xl overflow-hidden">
              {expandedVideo === 'local' ? (
                <video
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-full object-contain"
                  ref={(el) => {
                    if (el && localStreamRef.current) {
                      el.srcObject = localStreamRef.current;
                    }
                  }}
                  style={{ transform: isScreenSharing ? 'none' : 'scaleX(-1)' }}
                />
              ) : (
                <video
                  autoPlay
                  playsInline
                  className="w-full h-full object-contain"
                  ref={(el) => {
                    if (el) {
                      const remote = remoteStreams.find(s => s.peerId === expandedVideo);
                      if (remote) {
                        el.srcObject = remote.stream;
                      }
                    }
                  }}
                />
              )}
              
              <div className="absolute bottom-6 left-6">
                <span className="px-4 py-2 bg-black/60 backdrop-blur rounded-lg text-white text-sm font-medium">
                  {expandedVideo === 'local' ? `${myName} (Вы)` : remoteStreams.find(s => s.peerId === expandedVideo)?.name}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
