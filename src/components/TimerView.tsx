import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Pause, Play, RotateCcw, Trash2, Clock } from 'lucide-react';
import { apiRequest } from '../lib/api.ts';
import {
  formatDateShort,
  formatMinutesAsDuration,
  getTodayLocalDateStr,
} from '../lib/format.ts';
import { ConfirmModal } from './ConfirmModal.tsx';
import type { SessionType, StudySession, Subject } from '../types/planner.ts';

type TimerPreset = 'pomodoro' | 'short_break' | 'long_break' | 'custom';

const PRESET_MINUTES: Record<TimerPreset, number> = {
  pomodoro: 25,
  short_break: 5,
  long_break: 15,
  custom: 45,
};

function playCompletionChime(): void {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.18);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.6);
  } catch {
    // Ignore audio context restrictions
  }
}

export function TimerView() {
  const [preset, setPreset] = useState<TimerPreset>('pomodoro');
  const [customMinutes, setCustomMinutes] = useState(45);
  const [totalSeconds, setTotalSeconds] = useState(25 * 60);
  const [remainingSeconds, setRemainingSeconds] = useState(25 * 60);
  const [isRunning, setIsRunning] = useState(false);

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [sessionNotes, setSessionNotes] = useState('');

  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [totals, setTotals] = useState({
    todayMinutes: 0,
    allTimeMinutes: 0,
    totalFocusSessions: 0,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<StudySession | null>(null);
  const [deleting, setDeleting] = useState(false);

  const completionHandledRef = useRef(false);

  const loadData = useCallback(async () => {
    try {
      setError('');
      const [sessRes, subjRes] = await Promise.all([
        apiRequest<{
          sessions: StudySession[];
          totals: { todayMinutes: number; allTimeMinutes: number; totalFocusSessions: number };
        }>('/api/sessions'),
        apiRequest<{ subjects: Subject[] }>('/api/subjects'),
      ]);
      setSessions(sessRes.sessions);
      setTotals(sessRes.totals);
      setSubjects(subjRes.subjects);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load study sessions.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const saveSessionRecord = useCallback(
    async (minutesToSave: number, autoCompleted: boolean) => {
      if (minutesToSave < 1) return;
      setSaving(true);
      setError('');
      setStatusMessage('');

      const sessionType: SessionType =
        preset === 'short_break' || preset === 'long_break'
          ? 'break'
          : preset === 'custom'
            ? 'custom'
            : 'pomodoro';

      try {
        await apiRequest('/api/sessions', {
          method: 'POST',
          body: JSON.stringify({
            subject_id: selectedSubjectId ? Number(selectedSubjectId) : null,
            session_type: sessionType,
            duration_minutes: minutesToSave,
            session_date: getTodayLocalDateStr(),
            notes: sessionNotes.trim(),
          }),
        });
        setStatusMessage(
          autoCompleted
            ? `Completed and saved ${minutesToSave} minute ${sessionType === 'break' ? 'break' : 'study'} session.`
            : `Saved ${minutesToSave} minute study session.`
        );
        setSessionNotes('');
        await loadData();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save study session.');
      } finally {
        setSaving(false);
      }
    },
    [loadData, preset, selectedSubjectId, sessionNotes]
  );

  useEffect(() => {
    if (!isRunning) return;

    const timerId = window.setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          window.clearInterval(timerId);
          setIsRunning(false);
          if (!completionHandledRef.current) {
            completionHandledRef.current = true;
            playCompletionChime();
            const mins = Math.max(1, Math.round(totalSeconds / 60));
            void saveSessionRecord(mins, true);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(timerId);
  }, [isRunning, saveSessionRecord, totalSeconds]);

  function selectPreset(nextPreset: TimerPreset) {
    setIsRunning(false);
    completionHandledRef.current = false;
    setPreset(nextPreset);
    setStatusMessage('');
    const mins = nextPreset === 'custom' ? customMinutes : PRESET_MINUTES[nextPreset];
    const secs = mins * 60;
    setTotalSeconds(secs);
    setRemainingSeconds(secs);
  }

  function handleCustomMinutesChange(val: number) {
    const clamped = Math.max(1, Math.min(180, val || 1));
    setCustomMinutes(clamped);
    if (preset === 'custom' && !isRunning) {
      setTotalSeconds(clamped * 60);
      setRemainingSeconds(clamped * 60);
    }
  }

  function handleStartPause() {
    if (remainingSeconds === 0) {
      completionHandledRef.current = false;
      setRemainingSeconds(totalSeconds);
    }
    setStatusMessage('');
    setIsRunning((r) => !r);
  }

  function handleReset() {
    setIsRunning(false);
    completionHandledRef.current = false;
    setRemainingSeconds(totalSeconds);
    setStatusMessage('');
  }

  async function handleSaveElapsed() {
    const elapsedSeconds = totalSeconds - remainingSeconds;
    const elapsedMinutes = Math.round(elapsedSeconds / 60);
    if (elapsedMinutes < 1) {
      setError('Study for at least 1 minute before saving a session.');
      return;
    }
    setIsRunning(false);
    await saveSessionRecord(elapsedMinutes, false);
    setRemainingSeconds(totalSeconds);
    completionHandledRef.current = false;
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiRequest(`/api/sessions/${deleteTarget.id}`, { method: 'DELETE' });
      setDeleteTarget(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete study session.');
    } finally {
      setDeleting(false);
    }
  }

  const minsDisplay = String(Math.floor(remainingSeconds / 60)).padStart(2, '0');
  const secsDisplay = String(remainingSeconds % 60).padStart(2, '0');
  const progressRatio = totalSeconds > 0 ? (totalSeconds - remainingSeconds) / totalSeconds : 0;
  const elapsedMinutes = Math.floor((totalSeconds - remainingSeconds) / 60);

  const radius = 92;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - progressRatio);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
          Pomodoro &amp; Focus Timer
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Use focused 25-minute intervals and 5-minute breaks, and save every completed session to
          your study log.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/50 dark:text-rose-300">
          {error}
        </div>
      )}

      {statusMessage && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/50 dark:text-emerald-300">
          {statusMessage}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Timer Card */}
        <section className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-7 dark:border-slate-800 dark:bg-slate-900">
          {/* Preset Segmented Bar */}
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 sm:grid-cols-4 dark:bg-slate-800">
            {(
              [
                { id: 'pomodoro', label: 'Focus (25m)' },
                { id: 'short_break', label: 'Break (5m)' },
                { id: 'long_break', label: 'Long (15m)' },
                { id: 'custom', label: 'Custom' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => selectPreset(tab.id)}
                className={`rounded-md px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  preset === tab.id
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {preset === 'custom' && (
            <div className="mt-4 flex items-center justify-center gap-3">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                Minutes:
              </label>
              <input
                type="number"
                min="1"
                max="180"
                disabled={isRunning}
                value={customMinutes}
                onChange={(e) => handleCustomMinutesChange(Number(e.target.value))}
                className="w-24 rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-mono text-sm tabular-nums text-slate-900 outline-none focus:border-blue-600 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
          )}

          {/* Circular Countdown */}
          <div className="my-8 flex flex-col items-center justify-center">
            <div className="relative flex h-56 w-56 items-center justify-center">
              <svg className="h-full w-full -rotate-90" viewBox="0 0 216 216">
                <circle
                  cx="108"
                  cy="108"
                  r={radius}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="8"
                  className="text-slate-100 dark:text-slate-800"
                />
                <circle
                  cx="108"
                  cy="108"
                  r={radius}
                  fill="none"
                  stroke={preset === 'short_break' || preset === 'long_break' ? '#7C3AED' : '#2563EB'}
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  className="transition-[stroke-dashoffset] duration-300"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-mono text-5xl font-bold tracking-tight tabular-nums text-slate-900 dark:text-white">
                  {minsDisplay}:{secsDisplay}
                </span>
                <span className="mt-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                  {preset === 'short_break'
                    ? 'Short Break'
                    : preset === 'long_break'
                      ? 'Long Break'
                      : 'Focus Session'}
                </span>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={handleStartPause}
                className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-violet-600 px-6 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-95 whitespace-nowrap shrink-0"
              >
                {isRunning ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                {isRunning ? 'Pause' : remainingSeconds < totalSeconds ? 'Resume' : 'Start'}
              </button>

              <button
                type="button"
                onClick={handleReset}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 whitespace-nowrap shrink-0"
              >
                <RotateCcw className="h-4 w-4" />
                Reset
              </button>

              {elapsedMinutes >= 1 && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleSaveElapsed()}
                  className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-900/60 dark:bg-emerald-950/50 dark:text-emerald-300 whitespace-nowrap shrink-0"
                >
                  <Check className="h-4 w-4" />
                  Save ({elapsedMinutes}m)
                </button>
              )}
            </div>
          </div>

          {/* Subject & Session Note Linking */}
          <div className="grid grid-cols-1 gap-4 border-t border-slate-200 pt-5 sm:grid-cols-2 dark:border-slate-800">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                Link to Subject
              </label>
              <select
                value={selectedSubjectId}
                onChange={(e) => setSelectedSubjectId(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                <option value="">General Study</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                Session Topic Note (optional)
              </label>
              <input
                type="text"
                value={sessionNotes}
                onChange={(e) => setSessionNotes(e.target.value)}
                placeholder="e.g. Problem Set 4 review"
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
          </div>
        </section>

        {/* Totals & Recent Sessions */}
        <section className="space-y-6 lg:col-span-5">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <p className="text-xs text-slate-500 dark:text-slate-400">Today</p>
              <p className="font-mono mt-1.5 text-xl font-bold tabular-nums text-slate-900 dark:text-white">
                {formatMinutesAsDuration(totals.todayMinutes)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <p className="text-xs text-slate-500 dark:text-slate-400">All Time</p>
              <p className="font-mono mt-1.5 text-xl font-bold tabular-nums text-slate-900 dark:text-white">
                {formatMinutesAsDuration(totals.allTimeMinutes)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <p className="text-xs text-slate-500 dark:text-slate-400">Sessions</p>
              <p className="font-mono mt-1.5 text-xl font-bold tabular-nums text-slate-900 dark:text-white">
                {totals.totalFocusSessions}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3.5 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                  Completed Study Sessions
                </h3>
              </div>
            </div>

            {loading ? (
              <div className="mt-4 space-y-2.5">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-12 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800"
                  />
                ))}
              </div>
            ) : sessions.length === 0 ? (
              <p className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">
                No study sessions recorded yet. Start the timer to log your first session.
              </p>
            ) : (
              <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
                {sessions.map((ss) => (
                  <li key={ss.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                        {ss.subject_name || 'General Study'}
                        {ss.notes ? ` — ${ss.notes}` : ''}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                        <span>
                          {ss.session_type === 'break'
                            ? 'Break'
                            : ss.session_type === 'custom'
                              ? 'Custom Focus'
                              : 'Pomodoro'}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          {formatMinutesAsDuration(ss.duration_minutes)}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          {formatDateShort(ss.session_date)}
                        </span>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(ss)}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/60 dark:hover:text-rose-400 shrink-0"
                      aria-label="Delete study session"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Delete Study Session"
        message="Remove this recorded study session from your history and daily statistics?"
        confirmLabel="Delete Session"
        loading={deleting}
        onConfirm={() => void handleDeleteConfirm()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
