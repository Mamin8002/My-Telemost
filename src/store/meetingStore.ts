import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Meeting } from '../types';
import { generateUUID } from '../utils/uuid';

interface MeetingState {
  meetings: Meeting[];
  createMeeting: (title: string, hostId: string, hostName: string) => Meeting;
  startMeeting: (roomId: string) => void;
  endMeeting: (roomId: string) => void;
  getMeeting: (roomId: string) => Meeting | undefined;
  getUserMeetings: (userId: string) => Meeting[];
}

export const useMeetingStore = create<MeetingState>()(
  persist(
    (set, get) => ({
      meetings: [],
      createMeeting: (title: string, hostId: string, hostName: string) => {
        const roomId = Math.random().toString(36).substring(2, 10);
        const meeting: Meeting = {
          id: generateUUID(),
          title,
          roomId,
          hostId,
          hostName,
          createdAt: new Date().toISOString(),
          participants: [],
          status: 'scheduled',
        };
        set((state) => ({ meetings: [...state.meetings, meeting] }));
        return meeting;
      },
      startMeeting: (roomId: string) => {
        set((state) => ({
          meetings: state.meetings.map((m) =>
            m.roomId === roomId
              ? { ...m, status: 'active' as const, startedAt: new Date().toISOString() }
              : m
          ),
        }));
      },
      endMeeting: (roomId: string) => {
        set((state) => ({
          meetings: state.meetings.map((m) =>
            m.roomId === roomId
              ? {
                  ...m,
                  status: 'ended' as const,
                  endedAt: new Date().toISOString(),
                  duration: m.startedAt
                    ? Math.floor(
                        (new Date().getTime() - new Date(m.startedAt).getTime()) / 1000
                      )
                    : 0,
                }
              : m
          ),
        }));
      },
      getMeeting: (roomId: string) => {
        return get().meetings.find((m) => m.roomId === roomId);
      },
      getUserMeetings: (userId: string) => {
        return get().meetings.filter((m) => m.hostId === userId);
      },
    }),
    { name: 'vc-meetings' }
  )
);
