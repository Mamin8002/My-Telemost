import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Video, Plus, Clock, Users, Settings, LogOut, Calendar,
  Copy, Check, Monitor, Shield, User, Edit2
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useMeetingStore } from '../store/meetingStore';

export default function Dashboard() {
  const navigate = useNavigate();
  const { user, logout, updateProfile } = useAuthStore();
  const { createMeeting, getUserMeetings } = useMeetingStore();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [meetingTitle, setMeetingTitle] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'meetings' | 'settings'>('meetings');
  const [editName, setEditName] = useState(user?.name || '');
  const [editing, setEditing] = useState(false);

  const meetings = user ? getUserMeetings(user.id) : [];

  const handleCreateMeeting = () => {
    if (!meetingTitle.trim() || !user) return;
    const meeting = createMeeting(meetingTitle, user.id, user.name);
    setMeetingTitle('');
    setShowCreateModal(false);
    navigate(`/room/${meeting.roomId}`);
  };

  const handleCopyLink = (roomId: string) => {
    const link = `${window.location.origin}/join/${roomId}`;
    navigator.clipboard.writeText(link);
    setCopiedId(roomId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleSaveProfile = () => {
    updateProfile({ name: editName });
    setEditing(false);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <header className="border-b border-white/10 bg-white/5 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-blue-500 rounded-xl flex items-center justify-center">
              <Video className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-white">MeetFlow</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 text-gray-300">
              <div className="w-8 h-8 bg-purple-500/30 rounded-full flex items-center justify-center">
                <User className="w-4 h-4 text-purple-300" />
              </div>
              <span className="text-sm">{user?.name}</span>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-3 py-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline text-sm">Выйти</span>
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-purple-500/20 rounded-xl flex items-center justify-center">
                <Calendar className="w-6 h-6 text-purple-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{meetings.length}</p>
                <p className="text-sm text-gray-400">Всего встреч</p>
              </div>
            </div>
          </div>
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-green-500/20 rounded-xl flex items-center justify-center">
                <Users className="w-6 h-6 text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">
                  {meetings.reduce((acc, m) => acc + m.participants.length, 0)}
                </p>
                <p className="text-sm text-gray-400">Участников</p>
              </div>
            </div>
          </div>
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center">
                <Clock className="w-6 h-6 text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">
                  {Math.round(meetings.reduce((acc, m) => acc + (m.duration || 0), 0) / 60)} мин
                </p>
                <p className="text-sm text-gray-400">Общее время</p>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex flex-wrap gap-3 mb-8">
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-medium rounded-xl hover:from-purple-700 hover:to-blue-700 transition-all shadow-lg hover:shadow-purple-500/25"
          >
            <Plus className="w-5 h-5" />
            Новая встреча
          </button>
          <button
            onClick={() => {
              const code = prompt('Введите код комнаты:');
              if (code) navigate(`/join/${code}`);
            }}
            className="flex items-center gap-2 px-5 py-3 bg-white/10 border border-white/20 text-white font-medium rounded-xl hover:bg-white/20 transition"
          >
            <Monitor className="w-5 h-5" />
            Присоединиться
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-white/5 rounded-xl p-1 w-fit">
          <button
            onClick={() => setActiveTab('meetings')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              activeTab === 'meetings'
                ? 'bg-white/10 text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <span className="flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Встречи
            </span>
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              activeTab === 'settings'
                ? 'bg-white/10 text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <span className="flex items-center gap-2">
              <Settings className="w-4 h-4" />
              Настройки
            </span>
          </button>
        </div>

        {/* Content */}
        {activeTab === 'meetings' && (
          <div className="space-y-3">
            {meetings.length === 0 ? (
              <div className="text-center py-16">
                <Video className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                <h3 className="text-xl text-gray-400 mb-2">Нет встреч</h3>
                <p className="text-gray-500">Создайте первую встречу, чтобы начать</p>
              </div>
            ) : (
              meetings.map((meeting) => (
                <div
                  key={meeting.id}
                  className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl p-5 hover:bg-white/10 transition"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h3 className="text-white font-medium">{meeting.title}</h3>
                      <div className="flex items-center gap-3 mt-1 text-sm text-gray-400">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          {formatDate(meeting.createdAt)}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs ${
                            meeting.status === 'active'
                              ? 'bg-green-500/20 text-green-400'
                              : meeting.status === 'ended'
                              ? 'bg-gray-500/20 text-gray-400'
                              : 'bg-blue-500/20 text-blue-400'
                          }`}
                        >
                          {meeting.status === 'active'
                            ? 'Активна'
                            : meeting.status === 'ended'
                            ? 'Завершена'
                            : 'Запланирована'}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleCopyLink(meeting.roomId)}
                        className="flex items-center gap-1.5 px-3 py-2 bg-white/10 text-gray-300 rounded-lg hover:bg-white/20 hover:text-white transition text-sm"
                      >
                        {copiedId === meeting.roomId ? (
                          <>
                            <Check className="w-4 h-4 text-green-400" />
                            Скопировано
                          </>
                        ) : (
                          <>
                            <Copy className="w-4 h-4" />
                            Копировать ссылку
                          </>
                        )}
                      </button>
                      {meeting.status !== 'ended' && (
                        <button
                          onClick={() => navigate(`/room/${meeting.roomId}`)}
                          className="flex items-center gap-1.5 px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition text-sm"
                        >
                          <Video className="w-4 h-4" />
                          Войти
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="max-w-2xl">
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 space-y-6">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <User className="w-5 h-5" />
                Профиль
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="text-sm text-gray-400 mb-1 block">Имя</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      disabled={!editing}
                      className="flex-1 px-4 py-2.5 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50 transition"
                    />
                    {editing ? (
                      <button
                        onClick={handleSaveProfile}
                        className="px-4 py-2 bg-green-600 text-white rounded-xl hover:bg-green-700 transition text-sm"
                      >
                        Сохранить
                      </button>
                    ) : (
                      <button
                        onClick={() => setEditing(true)}
                        className="px-4 py-2 bg-white/10 text-white rounded-xl hover:bg-white/20 transition text-sm flex items-center gap-1"
                      >
                        <Edit2 className="w-4 h-4" />
                        Изменить
                      </button>
                    )}
                  </div>
                </div>
                <div>
                  <label className="text-sm text-gray-400 mb-1 block">Email</label>
                  <input
                    type="email"
                    value={user?.email}
                    disabled
                    className="w-full px-4 py-2.5 bg-white/10 border border-white/20 rounded-xl text-gray-400 opacity-50"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-400 mb-1 block">Дата регистрации</label>
                  <input
                    type="text"
                    value={user ? formatDate(user.createdAt) : ''}
                    disabled
                    className="w-full px-4 py-2.5 bg-white/10 border border-white/20 rounded-xl text-gray-400 opacity-50"
                  />
                </div>
              </div>

              <div className="border-t border-white/10 pt-6">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
                  <Shield className="w-5 h-5" />
                  Безопасность
                </h3>
                <div className="space-y-3 text-sm text-gray-300">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                    Сквозное шифрование включено
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                    WebRTC защищённое соединение
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                    Данные хранятся локально
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Create Meeting Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-white/20 rounded-2xl p-6 w-full max-w-md">
            <h3 className="text-xl font-bold text-white mb-4">Новая встреча</h3>
            <input
              type="text"
              placeholder="Название встречи"
              value={meetingTitle}
              onChange={(e) => setMeetingTitle(e.target.value)}
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 mb-4"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleCreateMeeting()}
            />
            <div className="flex gap-3">
              <button
                onClick={() => setShowCreateModal(false)}
                className="flex-1 py-3 bg-white/10 text-white rounded-xl hover:bg-white/20 transition"
              >
                Отмена
              </button>
              <button
                onClick={handleCreateMeeting}
                className="flex-1 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-medium rounded-xl hover:from-purple-700 hover:to-blue-700 transition"
              >
                Создать
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
