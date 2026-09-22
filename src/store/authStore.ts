import { create } from 'zustand';
import { User } from '../types';
import { generateUUID } from '../utils/uuid';

interface UserWithPassword extends User {
  password: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => boolean;
  register: (name: string, email: string, password: string) => boolean;
  logout: () => void;
  updateProfile: (data: Partial<User>) => void;
}

// Простое хеширование пароля (не для production!)
const hashPassword = (password: string): string => {
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
};

export const useAuthStore = create<AuthState>()((set, get) => ({
  user: null,
  isAuthenticated: false,
  login: (email: string, password: string) => {
    const users: UserWithPassword[] = JSON.parse(localStorage.getItem('vc_users') || '[]');
    const found = users.find((u) => u.email === email);
    
    if (found && found.password === hashPassword(password)) {
      const { password: _, ...userWithoutPassword } = found;
      set({ user: userWithoutPassword, isAuthenticated: true });
      return true;
    }
    return false;
  },
  register: (name: string, email: string, password: string) => {
    const users: UserWithPassword[] = JSON.parse(localStorage.getItem('vc_users') || '[]');
    const exists = users.find((u) => u.email === email);
    
    if (exists) return false;
    
    const newUser: UserWithPassword = {
      id: generateUUID(),
      name,
      email,
      password: hashPassword(password),
      createdAt: new Date().toISOString(),
    };
    
    users.push(newUser);
    localStorage.setItem('vc_users', JSON.stringify(users));
    
    const { password: _, ...userWithoutPassword } = newUser;
    set({ user: userWithoutPassword, isAuthenticated: true });
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
      
      const users: UserWithPassword[] = JSON.parse(localStorage.getItem('vc_users') || '[]');
      const idx = users.findIndex((u) => u.id === user.id);
      
      if (idx !== -1) {
        users[idx] = { ...users[idx], ...data };
        localStorage.setItem('vc_users', JSON.stringify(users));
      }
    }
  },
}));

// Восстановление сессии при загрузке
const savedAuth = localStorage.getItem('vc-auth');
if (savedAuth) {
  try {
    const parsed = JSON.parse(savedAuth);
    if (parsed.state?.user) {
      useAuthStore.setState({
        user: parsed.state.user,
        isAuthenticated: true
      });
    }
  } catch (e) {
    console.error('Failed to restore auth session:', e);
  }
}
