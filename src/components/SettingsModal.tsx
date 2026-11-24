import { useState } from 'react';
import type { FormEvent } from 'react';
import { X, Sun, Moon } from 'lucide-react';
import { apiRequest } from '../lib/api.ts';
import type { ThemePreference, User } from '../types/planner.ts';

interface SettingsModalProps {
  open: boolean;
  user: User;
  onClose: () => void;
  onUpdated: (user: User) => void;
}

export function SettingsModal({ open, user, onClose, onUpdated }: SettingsModalProps) {
  const [name, setName] = useState(user.name);
  const [dailyGoal, setDailyGoal] = useState(String(user.daily_goal_hours));
  const [weeklyGoal, setWeeklyGoal] = useState(String(user.weekly_goal_hours));
  const [theme, setTheme] = useState<ThemePreference>(user.theme_preference);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    const trimmedName = name.trim();
    const dailyVal = Number(dailyGoal);
    const weeklyVal = Number(weeklyGoal);

    if (trimmedName.length < 2) {
      setError('Please enter a name with at least 2 characters.');
      return;
    }
    if (Number.isNaN(dailyVal) || dailyVal < 0.5 || dailyVal > 16) {
      setError('Daily study goal must be between 0.5 and 16 hours.');
      return;
    }
    if (Number.isNaN(weeklyVal) || weeklyVal < 1 || weeklyVal > 100) {
      setError('Weekly study goal must be between 1 and 100 hours.');
      return;
    }

    setSaving(true);
    try {
      const res = await apiRequest<{ user: User }>('/api/auth/preferences', {
        method: 'PATCH',
        body: JSON.stringify({
          name: trimmedName,
          daily_goal_hours: dailyVal,
          weekly_goal_hours: weeklyVal,
          theme_preference: theme,
        }),
      });
      onUpdated(res.user);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save preferences.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
    >
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 pb-4 dark:border-slate-800">
          <div>
            <h2
              id="settings-modal-title"
              className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100"
            >
              Student Profile & Study Goals
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {user.email}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
            aria-label="Close settings"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/50 dark:text-rose-300">
              {error}
            </div>
          )}

          <div>
            <label
              htmlFor="settings-name"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              Full Name
            </label>
            <input
              id="settings-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              required
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="settings-daily-goal"
                className="block text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Daily Study Goal (hours)
              </label>
              <input
                id="settings-daily-goal"
                type="number"
                step="0.5"
                min="0.5"
                max="16"
                value={dailyGoal}
                onChange={(e) => setDailyGoal(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 font-mono text-sm tabular-nums text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                required
              />
            </div>

            <div>
              <label
                htmlFor="settings-weekly-goal"
                className="block text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Weekly Study Goal (hours)
              </label>
              <input
                id="settings-weekly-goal"
                type="number"
                step="1"
                min="1"
                max="100"
                value={weeklyGoal}
                onChange={(e) => setWeeklyGoal(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 font-mono text-sm tabular-nums text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                required
              />
            </div>
          </div>

          <div>
            <span className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Appearance Theme
            </span>
            <div className="mt-1.5 grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
              <button
                type="button"
                onClick={() => setTheme('light')}
                className={`flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                  theme === 'light'
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                <Sun className="h-4 w-4" />
                Light Mode
              </button>
              <button
                type="button"
                onClick={() => setTheme('dark')}
                className={`flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                  theme === 'dark'
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                <Moon className="h-4 w-4" />
                Dark Mode
              </button>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="whitespace-nowrap shrink-0 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="whitespace-nowrap shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
