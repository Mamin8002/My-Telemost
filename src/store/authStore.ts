import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { User } from '../types';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => boolean;
  register: (name: string, email: string, password: string) => boolean;
  logout: () => void;
  updateProfile: (data: Partial<User>) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      login: (email: string, _password: string) => {
        const users = JSON.parse(localStorage.getItem('vc_users') || '[]');
        const found = users.find((u: any) => u.email === email);
        if (found) {
          set({ user: found, isAuthenticated: true });
          return true;
        }
        return false;
      },
      register: (name: string, email: string, _password: string) => {
        const users = JSON.parse(localStorage.getItem('vc_users') || '[]');
        const exists = users.find((u: any) => u.email === email);
        if (exists) return false;
        const newUser: User = {
          id: crypto.randomUUID(),
          name,
          email,
          createdAt: new Date().toISOString(),
        };
        users.push(newUser);
        localStorage.setItem('vc_users', JSON.stringify(users));
        set({ user: newUser, isAuthenticated: true });
        return true;
      },
      logout: () => {
        set({ user: null, isAuthenticated: false });
      },
      updateProfile: (data: Partial<User>) => {
        const user = get().user;
        if (user) {
          const updated = { ...user, ...data };
          set({ user: updated });
          const users = JSON.parse(localStorage.getItem('vc_users') || '[]');
          const idx = users.findIndex((u: any) => u.id === user.id);
          if (idx !== -1) {
            users[idx] = updated;
            localStorage.setItem('vc_users', JSON.stringify(users));
          }
        }
      },
    }),
    { name: 'vc-auth' }
  )
);
