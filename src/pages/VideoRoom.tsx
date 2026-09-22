import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import Peer, { DataConnection, MediaConnection } from 'peerjs';
import {
  Mic, MicOff, Camera, CameraOff, MonitorUp, MonitorOff,
  MessageSquare, Users, PhoneOff, Circle, Copy, Check,
  Send, X, Shield, Clock, Wifi, WifiOff
} from 'lucide-react';
import { useMeetingStore } from '../store/meetingStore';

interface ParticipantInfo {
  peerId: string;
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
  const [remoteStreams, setRemoteStreams] = useState<RemoteStream[]>([]);
  const [copied, setCopied] = useState(false);
  const [elapsedTime, setElapsedTime] = useState('00:00');
  const [isConnected, setIsConnected] = useState(false);
  const [role, setRole] = useState<'host' | 'guest' | 'connecting'>('connecting');

  const peerRef = useRef<Peer | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const connectionsRef = useRef<Map<string, DataConnection>>(new Map());
  const mediaConnectionsRef = useRef<Map<string, MediaConnection>>(new Map());
  const myPeerIdRef = useRef('');
  const isHostRef = useRef(false);
  const participantsRef = useRef<ParticipantInfo[]>([]);
  const localStreamReadyRef = useRef(false);

  const hostPeerId = `meetflow-${roomId}`;

  // Keep ref in sync
  useEffect(() => {
    participantsRef.current = participants;
  }, [participants]);

  const broadcastToAll = useCallback((data: any, excludePeerId?: string) => {
    connectionsRef.current.forEach((conn, peerId) => {
      if (peerId !== excludePeerId) {
        try {
          conn.send(data);
        } catch (e) {
          console.error('Failed to send to:', peerId, e);
        }
      }
    });
  }, []);

  const callPeer = useCallback((targetPeerId: string, stream: MediaStream) => {
    if (!peerRef.current || peerRef.current.destroyed) return;
    
    const existingCall = mediaConnectionsRef.current.get(targetPeerId);
    if (existingCall) return;

    try {
      const call = peerRef.current.call(targetPeerId, stream);
      if (call) {
        call.on('stream', (remoteStream) => {
          const participantName = participantsRef.current.find(p => p.peerId === targetPeerId)?.name || 'Участник';
          setRemoteStreams((prev) => {
            const filtered = prev.filter((s) => s.peerId !== targetPeerId);
            return [...filtered, { peerId: targetPeerId, stream: remoteStream, name: participantName }];
          });
        });
        call.on('close', () => {
          setRemoteStreams((prev) => prev.filter((s) => s.peerId !== targetPeerId));
        });
        call.on('error', (err) => {
          console.error('Call error with', targetPeerId, err);
        });
        mediaConnectionsRef.current.set(targetPeerId, call);
      }
    } catch (err) {
      console.error('Failed to call:', targetPeerId, err);
    }
  }, []);

  const callAllParticipants = useCallback((stream: MediaStream) => {
    participantsRef.current.forEach((p) => {
      if (p.peerId !== myPeerIdRef.current) {
        callPeer(p.peerId, stream);
      }
    });
  }, [callPeer]);

  // Initialize
  useEffect(() => {
    if (!roomId) return;

    const meeting = getMeeting(roomId);
    if (meeting && meeting.status === 'scheduled') {
      startMeeting(roomId);
    }

    // Step 1: Try to become host by registering with the room ID
    const hostPeer = new Peer(hostPeerId, {
      host: '0.peerjs.com',
      port: 443,
      secure: true,
      debug: 1,
    });

    peerRef.current = hostPeer;

    hostPeer.on('open', (id) => {
      myPeerIdRef.current = id;
      isHostRef.current = true;
      setRole('host');
      setIsConnected(true);
      console.log('I am the HOST. Peer ID:', id);

      // Add self
      const me: ParticipantInfo = {
        peerId: id,
        name: myName,
        isMuted: startMuted,
        isVideoOn: startVideo,
        isScreenSharing: false,
        joinedAt: new Date().toISOString(),
      };
      setParticipants([me]);
    });

    hostPeer.on('error', (err) => {
      console.error('Peer error:', err);
      
      if (err.type === 'unavailable-id') {
        // Host already exists, connect as guest
        console.log('Room already has a host, joining as guest');
        hostPeer.destroy();
        joinAsGuest();
      } else if (err.type === 'network' || err.type === 'server-error') {
        console.error('Network/server error:', err);
      } else if (err.type === 'peer-unavailable') {
        // Host left, try to become new host
        console.log('Host unavailable, trying to become host');
        hostPeer.destroy();
        tryBecomeHost();
      }
    });

    hostPeer.on('disconnected', () => {
      console.log('Disconnected, reconnecting...');
      if (!hostPeer.destroyed) {
        hostPeer.reconnect();
      }
    });

    // Handle incoming connections (as host)
    hostPeer.on('connection', (conn) => {
      console.log('Guest connected:', conn.peer);
      handleNewConnection(conn, hostPeer);
    });

    // Handle incoming calls (as host)
    hostPeer.on('call', (call) => {
      handleIncomingCall(call);
    });

    // Timer
    const startTime = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
      const secs = (elapsed % 60).toString().padStart(2, '0');
      setElapsedTime(`${mins}:${secs}`);
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      
      // Notify and cleanup
      connectionsRef.current.forEach((conn) => {
        try { conn.send({ type: 'leave', peerId: myPeerIdRef.current }); } catch {}
        conn.close();
      });
      mediaConnectionsRef.current.forEach((call) => call.close());
      
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      
      if (peerRef.current && !peerRef.current.destroyed) {
        peerRef.current.destroy();
      }
      if (roomId) endMeeting(roomId);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  const tryBecomeHost = () => {
    const peer = new Peer(hostPeerId, {
      host: '0.peerjs.com',
      port: 443,
      secure: true,
      debug: 1,
    });
    peerRef.current = peer;

    peer.on('open', (id) => {
      myPeerIdRef.current = id;
      isHostRef.current = true;
      setRole('host');
      setIsConnected(true);
      console.log('Became new HOST:', id);

      const me: ParticipantInfo = {
        peerId: id,
        name: myName,
        isMuted: startMuted,
        isVideoOn: startVideo,
        isScreenSharing: false,
        joinedAt: new Date().toISOString(),
      };
      setParticipants([me]);

      if (localStreamReadyRef.current && localStreamRef.current) {
        setTimeout(() => callAllParticipants(localStreamRef.current!), 500);
      }
    });

    peer.on('error', (err) => {
      console.error('Error becoming host:', err);
      if (err.type === 'unavailable-id') {
        peer.destroy();
        joinAsGuest();
      }
    });

    peer.on('connection', (conn) => handleNewConnection(conn, peer));
    peer.on('call', (call) => handleIncomingCall(call));
  };

  const joinAsGuest = () => {
    const guestId = `meetflow-guest-${roomId}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const guestPeer = new Peer(guestId, {
      host: '0.peerjs.com',
      port: 443,
      secure: true,
      debug: 1,
    });
    peerRef.current = guestPeer;

    guestPeer.on('open', (id) => {
      myPeerIdRef.current = id;
      isHostRef.current = false;
      setRole('guest');
      console.log('Guest peer opened:', id);

      // Connect to host
      const hostConn = guestPeer.connect(hostPeerId, { reliable: true, serialization: 'json' });
      
      hostConn.on('open', () => {
        console.log('Connected to host!');
        setIsConnected(true);
        connectionsRef.current.set(hostPeerId, hostConn);

        const me: ParticipantInfo = {
          peerId: id,
          name: myName,
          isMuted: startMuted,
          isVideoOn: startVideo,
          isScreenSharing: false,
          joinedAt: new Date().toISOString(),
        };
        setParticipants([me]);

        // Send join message to host
        hostConn.send({ type: 'join', participant: me });

        // Call host with our stream
        if (localStreamReadyRef.current && localStreamRef.current) {
          setTimeout(() => callPeer(hostPeerId, localStreamRef.current!), 500);
        }
      });

      hostConn.on('data', (data: any) => {
        handleHostMessage(data, guestPeer);
      });

      hostConn.on('close', () => {
        console.log('Host disconnected');
        setIsConnected(false);
        connectionsRef.current.delete(hostPeerId);
      });

      hostConn.on('error', (err) => {
        console.error('Host connection error:', err);
      });
    });

    guestPeer.on('error', (err) => {
      console.error('Guest peer error:', err);
      if (err.type === 'peer-unavailable') {
        // Host left, try to become host
        console.log('Host not found, trying to become host');
        guestPeer.destroy();
        tryBecomeHost();
      }
    });

    guestPeer.on('connection', (conn) => {
      // Other guests might connect directly in mesh
      handleNewConnection(conn, guestPeer);
    });

    guestPeer.on('call', (call) => {
      handleIncomingCall(call);
    });

    guestPeer.on('disconnected', () => {
      if (!guestPeer.destroyed) guestPeer.reconnect();
    });
  };

  const handleNewConnection = (conn: DataConnection, peer: Peer) => {
    connectionsRef.current.set(conn.peer, conn);

    conn.on('open', () => {
      console.log('Data connection opened with:', conn.peer);
    });

    conn.on('data', (data: any) => {
      handleDataMessage(data, conn, peer);
    });

    conn.on('close', () => {
      console.log('Connection closed:', conn.peer);
      connectionsRef.current.delete(conn.peer);
      mediaConnectionsRef.current.delete(conn.peer);
      setRemoteStreams((prev) => prev.filter((s) => s.peerId !== conn.peer));
      setParticipants((prev) => prev.filter((p) => p.peerId !== conn.peer));

      if (isHostRef.current) {
        broadcastToAll({ type: 'participant-left', peerId: conn.peer });
      }
    });

    conn.on('error', (err) => {
      console.error('Connection error:', conn.peer, err);
    });
  };

  const handleIncomingCall = (call: MediaConnection) => {
    console.log('Incoming call from:', call.peer);

    if (localStreamRef.current) {
      call.answer(localStreamRef.current);
    } else {
      call.answer(new MediaStream());
    }

    call.on('stream', (remoteStream) => {
      console.log('Received stream from:', call.peer);
      const participantName = participantsRef.current.find(p => p.peerId === call.peer)?.name || 'Участник';
      setRemoteStreams((prev) => {
        const filtered = prev.filter((s) => s.peerId !== call.peer);
        return [...filtered, { peerId: call.peer, stream: remoteStream, name: participantName }];
      });
    });

    call.on('close', () => {
      setRemoteStreams((prev) => prev.filter((s) => s.peerId !== call.peer));
    });

    call.on('error', (err) => {
      console.error('Call error:', call.peer, err);
    });

    mediaConnectionsRef.current.set(call.peer, call);
  };

  const handleHostMessage = (data: any, peer: Peer) => {
    if (data.type === 'participants-list') {
      const others = data.participants.filter((p: ParticipantInfo) => p.peerId !== myPeerIdRef.current);
      setParticipants((prev) => {
        const me = prev.find((p) => p.peerId === myPeerIdRef.current);
        return me ? [me, ...others] : others;
      });

      // Call all participants
      if (localStreamReadyRef.current && localStreamRef.current) {
        setTimeout(() => {
          data.participants.forEach((p: ParticipantInfo) => {
            if (p.peerId !== myPeerIdRef.current && p.peerId !== hostPeerId) {
              callPeer(p.peerId, localStreamRef.current!);
            }
          });
        }, 500);
      }
    } else if (data.type === 'new-participant') {
      setParticipants((prev) => {
        if (prev.find((p) => p.peerId === data.participant.peerId)) return prev;
        return [...prev, data.participant];
      });

      // Call new participant
      if (localStreamReadyRef.current && localStreamRef.current) {
        setTimeout(() => callPeer(data.participant.peerId, localStreamRef.current!), 300);
      }
    } else if (data.type === 'chat-message') {
      setMessages((prev) => [...prev, data.message]);
    } else if (data.type === 'participant-update') {
      setParticipants((prev) =>
        prev.map((p) =>
          p.peerId === data.participant.peerId ? { ...p, ...data.participant } : p
        )
      );
    } else if (data.type === 'participant-left') {
      setParticipants((prev) => prev.filter((p) => p.peerId !== data.peerId));
      setRemoteStreams((prev) => prev.filter((s) => s.peerId !== data.peerId));
      connectionsRef.current.delete(data.peerId);
      mediaConnectionsRef.current.delete(data.peerId);
    }
  };

  const handleDataMessage = (data: any, conn: DataConnection, peer: Peer) => {
    if (data.type === 'join') {
      setParticipants((prev) => {
        if (prev.find((p) => p.peerId === data.participant.peerId)) return prev;
        return [...prev, data.participant];
      });

      if (isHostRef.current) {
        // Broadcast new participant to all
        broadcastToAll({ type: 'new-participant', participant: data.participant }, conn.peer);

        // Send full list to newcomer
        conn.send({
          type: 'participants-list',
          participants: [...participantsRef.current, data.participant],
        });
      }

      // Call new participant
      if (localStreamReadyRef.current && localStreamRef.current) {
        setTimeout(() => callPeer(data.participant.peerId, localStreamRef.current!), 300);
      }
    } else if (data.type === 'chat-message') {
      setMessages((prev) => [...prev, data.message]);
      if (isHostRef.current) {
        broadcastToAll(data, conn.peer);
      }
    } else if (data.type === 'participant-update') {
      setParticipants((prev) =>
        prev.map((p) =>
          p.peerId === data.participant.peerId ? { ...p, ...data.participant } : p
        )
      );
      if (isHostRef.current) {
        broadcastToAll(data, conn.peer);
      }
    } else if (data.type === 'leave') {
      setParticipants((prev) => prev.filter((p) => p.peerId !== data.peerId));
      setRemoteStreams((prev) => prev.filter((s) => s.peerId !== data.peerId));
      connectionsRef.current.delete(data.peerId);
      mediaConnectionsRef.current.delete(data.peerId);
      if (isHostRef.current) {
        broadcastToAll({ type: 'participant-left', peerId: data.peerId });
      }
    }
  };

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
        localStreamReadyRef.current = true;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        // Call all existing participants once stream is ready
        setTimeout(() => {
          if (participantsRef.current.length > 1) {
            callAllParticipants(stream);
          }
        }, 1500);
      } catch (err) {
        console.log('Media not available:', err);
        // Create empty stream
        const emptyStream = new MediaStream();
        localStreamRef.current = emptyStream;
        localStreamReadyRef.current = true;
      }
    };
    setupMedia();
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    broadcastToAll({
      type: 'participant-update',
      participant: { peerId: myPeerIdRef.current, isMuted: newMuted },
    });
  }, [isMuted, broadcastToAll]);

  const toggleVideo = useCallback(() => {
    const newVideoOn = !isVideoOn;
    setIsVideoOn(newVideoOn);
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach((t) => (t.enabled = newVideoOn));
    }
    broadcastToAll({
      type: 'participant-update',
      participant: { peerId: myPeerIdRef.current, isVideoOn: newVideoOn },
    });
  }, [isVideoOn, broadcastToAll]);

  const toggleScreenShare = useCallback(async () => {
    if (!isScreenSharing) {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        screenStreamRef.current = screenStream;
        const screenTrack = screenStream.getVideoTracks()[0];

        // Replace video track in all connections
        mediaConnectionsRef.current.forEach((call) => {
          try {
            const pc = (call as any).peerConnection;
            if (pc) {
              const sender = pc.getSenders()?.find(
                (s: RTCRtpSender) => s.track?.kind === 'video'
              );
              if (sender && screenTrack) {
                sender.replaceTrack(screenTrack);
              }
            }
          } catch (e) {
            console.error('Failed to replace track:', e);
          }
        });

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = screenStream;
        }
        setIsScreenSharing(true);

        screenTrack.onended = () => {
          stopScreenShare();
        };

        broadcastToAll({
          type: 'participant-update',
          participant: { peerId: myPeerIdRef.current, isScreenSharing: true },
        });
      } catch (err) {
        console.log('Screen share cancelled');
      }
    } else {
      stopScreenShare();
    }
  }, [isScreenSharing, broadcastToAll]);

  const stopScreenShare = () => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
    }
    if (localStreamRef.current && localVideoRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
      const cameraTrack = localStreamRef.current.getVideoTracks()[0];
      if (cameraTrack) {
        mediaConnectionsRef.current.forEach((call) => {
          try {
            const pc = (call as any).peerConnection;
            if (pc) {
              const sender = pc.getSenders()?.find(
                (s: RTCRtpSender) => s.track?.kind === 'video'
              );
              if (sender) sender.replaceTrack(cameraTrack);
            }
          } catch (e) {}
        });
      }
    }
    setIsScreenSharing(false);
    broadcastToAll({
      type: 'participant-update',
      participant: { peerId: myPeerIdRef.current, isScreenSharing: false },
    });
  };

  const sendChatMessage = () => {
    if (!chatMessage.trim()) return;
    const msg: ChatMsg = {
      id: crypto.randomUUID(),
      sender: myName,
      text: chatMessage,
      time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
    };
    setMessages((prev) => [...prev, msg]);
    broadcastToAll({ type: 'chat-message', message: msg });
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
            <p className="text-gray-400 text-xs">
              ID: {roomId} {role === 'host' && '• Вы организатор'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-gray-300 text-sm">
            <Clock className="w-4 h-4" />
            {elapsedTime}
          </div>
          <div className={`flex items-center gap-1.5 text-xs ${isConnected ? 'text-green-400' : 'text-yellow-400'}`}>
            {isConnected ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
            {isConnected ? 'Подключено' : 'Подключение...'}
          </div>
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

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Video Grid */}
        <div className="flex-1 p-4 flex items-center justify-center">
          <div className={`grid gap-3 w-full h-full ${
            totalParticipants === 1 ? 'grid-cols-1 max-w-3xl' :
            totalParticipants === 2 ? 'grid-cols-1 max-w-3xl sm:grid-cols-2' :
            totalParticipants <= 4 ? 'grid-cols-2' :
            totalParticipants <= 6 ? 'grid-cols-3' :
            'grid-cols-4'
          }`}>
            {/* My Video */}
            <div className="relative bg-slate-800 rounded-2xl overflow-hidden border border-white/10 group min-h-[200px]">
              {(isVideoOn || isScreenSharing) ? (
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
            </div>

            {/* Remote Participants with video */}
            {remoteStreams.map((remote) => (
              <RemoteVideoTile key={remote.peerId} stream={remote.stream} name={remote.name} peerId={remote.peerId} />
            ))}

            {/* Participants without video stream */}
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

// Remote video component
function RemoteVideoTile({ stream, name, peerId }: { stream: MediaStream; name: string; peerId: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const videoTracks = stream.getVideoTracks();
  const hasVideo = videoTracks.length > 0 && videoTracks[0].enabled;

  if (!hasVideo) {
    return (
      <div className="relative bg-slate-800 rounded-2xl overflow-hidden border border-white/10 min-h-[200px]">
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-900/30 to-purple-900/30">
          <div className="w-24 h-24 bg-blue-500/30 rounded-full flex items-center justify-center">
            <span className="text-4xl text-blue-200 font-bold">
              {name[0]?.toUpperCase()}
            </span>
          </div>
        </div>
        <div className="absolute bottom-3 left-3 flex items-center gap-2">
          <span className="px-2.5 py-1 bg-black/60 backdrop-blur rounded-lg text-white text-xs font-medium">
            {name}
          </span>
          {!stream.getAudioTracks()[0]?.enabled && (
            <span className="px-2 py-1 bg-red-500/80 rounded-lg">
              <MicOff className="w-3 h-3 text-white" />
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="relative bg-slate-800 rounded-2xl overflow-hidden border border-white/10 min-h-[200px]">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className="w-full h-full object-cover"
      />
      <div className="absolute bottom-3 left-3 flex items-center gap-2">
        <span className="px-2.5 py-1 bg-black/60 backdrop-blur rounded-lg text-white text-xs font-medium">
          {name}
        </span>
        {!stream.getAudioTracks()[0]?.enabled && (
          <span className="px-2 py-1 bg-red-500/80 rounded-lg">
            <MicOff className="w-3 h-3 text-white" />
          </span>
        )}
      </div>
    </div>
  );
}
