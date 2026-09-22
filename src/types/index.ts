export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  createdAt: string;
}

export interface Meeting {
  id: string;
  title: string;
  roomId: string;
  hostId: string;
  hostName: string;
  createdAt: string;
  startedAt?: string;
  endedAt?: string;
  participants: Participant[];
  status: 'scheduled' | 'active' | 'ended';
  duration?: number;
}

export interface Participant {
  id: string;
  name: string;
  joinedAt: string;
  isMuted: boolean;
  isVideoOn: boolean;
  isScreenSharing: boolean;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: string;
}

export interface RoomSettings {
  isMuted: boolean;
  isVideoOn: boolean;
  isScreenSharing: boolean;
  isRecording: boolean;
}
