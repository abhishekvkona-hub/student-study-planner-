import { useCallback, useEffect, useState } from 'react';
import {
  BarChart3,
  BookMarked,
  BookOpen,
  CalendarDays,
  CheckSquare,
  Clock,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Settings,
  Sun,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { apiRequest, setAuthToken } from './lib/api.ts';
import { AuthView } from './components/AuthView.tsx';
import { DashboardView } from './components/DashboardView.tsx';
import { SubjectsView } from './components/SubjectsView.tsx';
import { ScheduleView } from './components/ScheduleView.tsx';
import { TasksView } from './components/TasksView.tsx';
import { TimerView } from './components/TimerView.tsx';
import { ProgressView } from './components/ProgressView.tsx';
import { NotesView } from './components/NotesView.tsx';
import { SettingsModal } from './components/SettingsModal.tsx';
import type { NavTab, ThemePreference, User } from './types/planner.ts';

const NAV_ITEMS: Array<{ id: NavTab; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'subjects', label: 'Subjects', icon: BookMarked },
  { id: 'schedule', label: 'Study Schedule', icon: CalendarDays },
  { id: 'tasks', label: 'Assignments', icon: CheckSquare },
  { id: 'timer', label: 'Study Timer', icon: Clock },
  { id: 'progress', label: 'Progress', icon: BarChart3 },
  { id: 'notes', label: 'Notes', icon: FileText },
];

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [avatarImgFailed, setAvatarImgFailed] = useState(false);

  const [theme, setTheme] = useState<ThemePreference>(() => {
    if (typeof window !== 'undefined') {
      const saved = window.localStorage.getItem('sp_theme');
      if (saved === 'dark' || saved === 'light') return saved;
    }
    return 'light';
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try {
      window.localStorage.setItem('sp_theme', theme);
    } catch {
      // Ignore storage errors
    }
  }, [theme]);

  useEffect(() => {
    let active = true;
    async function hydrateSession() {
      try {
        const res = await apiRequest<{ user: User }>('/api/auth/me');
        if (active) {
          setUser(res.user);
          if (res.user.theme_preference === 'dark' || res.user.theme_preference === 'light') {
            setTheme(res.user.theme_preference);
          }
        }
      } catch {
        if (active) setUser(null);
      } finally {
        if (active) setBootstrapping(false);
      }
    }
    void hydrateSession();
    return () => {
      active = false;
    };
  }, []);

  const handleToggleTheme = useCallback(async () => {
    const nextTheme: ThemePreference = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    if (user) {
      try {
        const res = await apiRequest<{ user: User }>('/api/auth/preferences', {
          method: 'PATCH',
          body: JSON.stringify({ theme_preference: nextTheme }),
        });
        setUser(res.user);
      } catch {
        // Keep local toggle applied
      }
    }
  }, [theme, user]);

  async function handleLogout() {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } catch {
      // Clear client session regardless
    }
    setAuthToken(null);
    setUser(null);
    setActiveTab('dashboard');
  }

  function handleAuthenticated(loggedInUser: User) {
    setUser(loggedInUser);
    if (loggedInUser.theme_preference === 'dark' || loggedInUser.theme_preference === 'light') {
      setTheme(loggedInUser.theme_preference);
    }
    setActiveTab('dashboard');
  }

  function handleUserUpdated(updatedUser: User) {
    setUser(updatedUser);
    setTheme(updatedUser.theme_preference);
  }

  if (bootstrapping) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-600 dark:bg-slate-950 dark:text-slate-400">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white">
            <BookOpen className="h-5 w-5" />
          </div>
          <span className="font-display text-base font-semibold text-slate-900 dark:text-white">
            Loading ScholarPlan...
          </span>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <AuthView
        theme={theme}
        onToggleTheme={() => void handleToggleTheme()}
        onAuthenticated={handleAuthenticated}
      />
    );
  }

  const currentNav = NAV_ITEMS.find((item) => item.id === activeTab) || NAV_ITEMS[0];

  const sidebarContent = (
    <div className="flex h-full flex-col justify-between">
      <div>
        <div className="flex h-16 items-center justify-between border-b border-slate-200 px-5 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-violet-600 text-white">
              <BookOpen className="h-4 w-4" />
            </div>
            <span className="font-display text-base font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap">
              ScholarPlan
            </span>
          </div>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 lg:hidden dark:hover:bg-slate-800"
            aria-label="Close navigation menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="space-y-1 p-3" aria-label="Primary navigation">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveTab(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`flex w-full items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/70 dark:hover:text-slate-100'
                }`}
              >
                <Icon
                  className={`h-4 w-4 shrink-0 ${
                    active ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'
                  }`}
                />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      <div className="border-t border-slate-200 p-3 dark:border-slate-800">
        <button
          type="button"
          onClick={() => {
            setSettingsOpen(true);
            setMobileMenuOpen(false);
          }}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          {!avatarImgFailed ? (
            <img
              src="/src/assets/images/student_avatar_default_1795507767545.jpg"
              alt={user.name}
              referrerPolicy="no-referrer"
              onError={() => setAvatarImgFailed(true)}
              className="h-9 w-9 shrink-0 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white">
              {user.name.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
              {user.name}
            </p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">{user.email}</p>
          </div>
          <Settings className="h-4 w-4 shrink-0 text-slate-400" />
        </button>

        <button
          type="button"
          onClick={() => void handleLogout()}
          className="mt-1 flex w-full items-center gap-3 rounded-lg px-3.5 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:text-slate-400 dark:hover:bg-rose-950/50 dark:hover:text-rose-400 whitespace-nowrap"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="flex min-h-screen">
        {/* Desktop Sidebar */}
        <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white lg:block dark:border-slate-800 dark:bg-slate-900">
          <div className="sticky top-0 h-screen">{sidebarContent}</div>
        </aside>

        {/* Mobile Drawer */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-40 flex lg:hidden">
            <div
              className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs"
              onClick={() => setMobileMenuOpen(false)}
            />
            <aside className="relative z-50 w-72 max-w-[85vw] bg-white shadow-xl dark:bg-slate-900">
              {sidebarContent}
            </aside>
          </div>
        )}

        {/* Main Viewport */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white/95 px-4 backdrop-blur-xs sm:px-6 lg:px-8 dark:border-slate-800 dark:bg-slate-900/95">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden dark:text-slate-300 dark:hover:bg-slate-800"
                aria-label="Open navigation menu"
              >
                <Menu className="h-5 w-5" />
              </button>
              <div className="flex items-center gap-2 text-sm min-w-0">
                <span className="hidden text-slate-400 sm:inline dark:text-slate-500">
                  ScholarPlan
                </span>
                <span className="hidden text-slate-300 sm:inline dark:text-slate-700">/</span>
                <h1 className="font-display truncate text-base font-semibold text-slate-900 dark:text-white">
                  {currentNav.label}
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => void handleToggleTheme()}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 whitespace-nowrap shrink-0"
                aria-label="Toggle light or dark mode"
              >
                {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                <span className="hidden sm:inline">
                  {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 whitespace-nowrap shrink-0"
              >
                <Settings className="h-4 w-4" />
                <span className="hidden sm:inline">Study Goals</span>
              </button>
            </div>
          </header>

          <main className="mx-auto w-full max-w-[1200px] flex-1 p-4 sm:p-6 lg:p-8">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
              >
                {activeTab === 'dashboard' && (
                  <DashboardView user={user} theme={theme} onNavigate={setActiveTab} />
                )}
                {activeTab === 'subjects' && <SubjectsView />}
                {activeTab === 'schedule' && <ScheduleView />}
                {activeTab === 'tasks' && <TasksView />}
                {activeTab === 'timer' && <TimerView />}
                {activeTab === 'progress' && <ProgressView theme={theme} />}
                {activeTab === 'notes' && <NotesView />}
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </div>

      <SettingsModal
        open={settingsOpen}
        user={user}
        onClose={() => setSettingsOpen(false)}
        onUpdated={handleUserUpdated}
      />
    </div>
  );
}
