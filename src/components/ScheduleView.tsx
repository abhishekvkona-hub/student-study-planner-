import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  Calendar as CalendarIcon,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
  Trash2,
  X,
  XCircle,
  Clock,
} from 'lucide-react';
import { apiRequest } from '../lib/api.ts';
import {
  formatDateShort,
  formatMinutesAsDuration,
  getTodayLocalDateStr,
} from '../lib/format.ts';
import { ConfirmModal } from './ConfirmModal.tsx';
import type { ScheduleStatus, StudySchedule, Subject } from '../types/planner.ts';

export function ScheduleView() {
  const todayStr = getTodayLocalDateStr();
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [currentMonth, setCurrentMonth] = useState(() => todayStr.slice(0, 7)); // YYYY-MM
  const [schedules, setSchedules] = useState<StudySchedule[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<StudySchedule | null>(null);
  const [subjectId, setSubjectId] = useState('');
  const [title, setTitle] = useState('');
  const [scheduleDate, setScheduleDate] = useState(todayStr);
  const [startTime, setStartTime] = useState('09:00');
  const [durationMinutes, setDurationMinutes] = useState('60');
  const [status, setStatus] = useState<ScheduleStatus>('planned');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [deleteTarget, setDeleteTarget] = useState<StudySchedule | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setError('');
      const [schedRes, subjRes] = await Promise.all([
        apiRequest<{ schedules: StudySchedule[] }>(`/api/schedules?month=${currentMonth}`),
        apiRequest<{ subjects: Subject[] }>('/api/subjects'),
      ]);
      setSchedules(schedRes.schedules);
      setSubjects(subjRes.subjects);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load study schedules.');
    } finally {
      setLoading(false);
    }
  }, [currentMonth]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const calendarDays = useMemo(() => {
    const [year, month] = currentMonth.split('-').map(Number);
    const firstDayOfMonth = new Date(year, month - 1, 1);
    const lastDayOfMonth = new Date(year, month, 0);
    const startWeekday = firstDayOfMonth.getDay(); // 0 = Sun
    const daysInMonth = lastDayOfMonth.getDate();

    const cells: Array<{ dateStr: string | null; dayNum: number | null }> = [];
    for (let i = 0; i < startWeekday; i++) {
      cells.push({ dateStr: null, dayNum: null });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dd = String(d).padStart(2, '0');
      cells.push({ dateStr: `${currentMonth}-${dd}`, dayNum: d });
    }
    return cells;
  }, [currentMonth]);

  const schedulesByDate = useMemo(() => {
    const map = new Map<string, StudySchedule[]>();
    for (const sc of schedules) {
      const list = map.get(sc.schedule_date) || [];
      list.push(sc);
      map.set(sc.schedule_date, list);
    }
    return map;
  }, [schedules]);

  const selectedDaySchedules = schedulesByDate.get(selectedDate) || [];

  function changeMonth(delta: number) {
    const [year, month] = currentMonth.split('-').map(Number);
    const dt = new Date(year, month - 1 + delta, 1);
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    setCurrentMonth(`${y}-${m}`);
  }

  function formatMonthTitle(ym: string): string {
    const [y, m] = ym.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    });
  }

  function openCreateModal(dateOverride?: string) {
    if (subjects.length === 0) {
      setError('Please create at least one subject first before scheduling study blocks.');
      return;
    }
    setEditingSchedule(null);
    setSubjectId(String(subjects[0].id));
    setTitle('');
    setScheduleDate(dateOverride || selectedDate);
    setStartTime('09:00');
    setDurationMinutes('60');
    setStatus('planned');
    setNotes('');
    setFormError('');
    setModalOpen(true);
  }

  function openEditModal(sc: StudySchedule) {
    setEditingSchedule(sc);
    setSubjectId(String(sc.subject_id));
    setTitle(sc.title);
    setScheduleDate(sc.schedule_date);
    setStartTime(sc.start_time);
    setDurationMinutes(String(sc.duration_minutes));
    setStatus(sc.status);
    setNotes(sc.notes || '');
    setFormError('');
    setModalOpen(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError('');

    const dur = Number(durationMinutes);
    if (!subjectId) {
      setFormError('Please select a subject.');
      return;
    }
    if (title.trim().length < 2) {
      setFormError('Please enter a study topic (at least 2 characters).');
      return;
    }
    if (Number.isNaN(dur) || dur < 10 || dur > 600) {
      setFormError('Duration must be between 10 and 600 minutes.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        subject_id: Number(subjectId),
        title: title.trim(),
        schedule_date: scheduleDate,
        start_time: startTime,
        duration_minutes: dur,
        status,
        notes: notes.trim(),
      };

      if (editingSchedule) {
        await apiRequest(`/api/schedules/${editingSchedule.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        await apiRequest('/api/schedules', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }

      setModalOpen(false);
      setSelectedDate(scheduleDate);
      if (scheduleDate.slice(0, 7) !== currentMonth) {
        setCurrentMonth(scheduleDate.slice(0, 7));
      } else {
        await loadData();
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save schedule.');
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusUpdate(id: number, nextStatus: ScheduleStatus) {
    try {
      await apiRequest(`/api/schedules/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update schedule status.');
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiRequest(`/api/schedules/${deleteTarget.id}`, { method: 'DELETE' });
      setDeleteTarget(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete schedule.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
            Study Schedule &amp; Calendar Timetable
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Select any date on the calendar to plan or update daily study blocks.
          </p>
        </div>
        <button
          type="button"
          onClick={() => openCreateModal()}
          className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-violet-600 px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-95 whitespace-nowrap shrink-0"
        >
          <Plus className="h-4 w-4" />
          Add Study Block
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/50 dark:text-rose-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Calendar Grid */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-7 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-200 pb-4 dark:border-slate-800">
            <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              {formatMonthTitle(currentMonth)}
            </h3>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => changeMonth(-1)}
                className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                aria-label="Previous month"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setCurrentMonth(todayStr.slice(0, 7));
                  setSelectedDate(todayStr);
                }}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => changeMonth(1)}
                className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                aria-label="Next month"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-7 gap-1 text-center text-xs font-medium text-slate-500 dark:text-slate-400">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d} className="py-1.5">
                {d}
              </div>
            ))}
          </div>

          <div className="mt-1 grid grid-cols-7 gap-1.5">
            {calendarDays.map((cell, idx) => {
              if (!cell.dateStr || !cell.dayNum) {
                return <div key={`empty-${idx}`} className="h-16 rounded-lg" />;
              }
              const dayItems = schedulesByDate.get(cell.dateStr) || [];
              const isSelected = cell.dateStr === selectedDate;
              const isToday = cell.dateStr === todayStr;

              return (
                <button
                  key={cell.dateStr}
                  type="button"
                  onClick={() => setSelectedDate(cell.dateStr!)}
                  className={`flex h-16 flex-col items-start justify-between rounded-lg border p-2 text-left transition-colors ${
                    isSelected
                      ? 'border-blue-600 bg-blue-50/80 dark:border-blue-500 dark:bg-blue-950/40'
                      : 'border-slate-200/80 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700'
                  }`}
                >
                  <span
                    className={`font-mono text-xs font-semibold tabular-nums ${
                      isToday
                        ? 'text-blue-600 dark:text-blue-400'
                        : 'text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {cell.dayNum}
                  </span>
                  {dayItems.length > 0 && (
                    <div className="flex w-full items-center gap-1 overflow-hidden">
                      {dayItems.slice(0, 3).map((item) => (
                        <span
                          key={item.id}
                          className="h-1.5 w-3 rounded-full"
                          style={{ backgroundColor: item.subject_color || '#2563EB' }}
                        />
                      ))}
                      {dayItems.length > 3 && (
                        <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400">
                          +{dayItems.length - 3}
                        </span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* Selected Day Timetable */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-200 pb-4 dark:border-slate-800">
            <div>
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                {formatDateShort(selectedDate)}
              </h3>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                <span className="font-mono tabular-nums">{selectedDaySchedules.length}</span>{' '}
                scheduled study block{selectedDaySchedules.length === 1 ? '' : 's'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => openCreateModal(selectedDate)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 whitespace-nowrap shrink-0"
            >
              <Plus className="h-3.5 w-3.5" />
              Add for Day
            </button>
          </div>

          {loading ? (
            <div className="mt-4 space-y-3">
              {[1, 2].map((i) => (
                <div
                  key={i}
                  className="h-20 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800"
                />
              ))}
            </div>
          ) : selectedDaySchedules.length === 0 ? (
            <div className="py-12 text-center">
              <CalendarIcon className="mx-auto h-8 w-8 text-slate-400" />
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                No study blocks planned for this day.
              </p>
              <button
                type="button"
                onClick={() => openCreateModal(selectedDate)}
                className="mt-3 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-medium text-white hover:bg-blue-700"
              >
                Schedule Study Block
              </button>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {selectedDaySchedules.map((sc) => (
                <li key={sc.id} className="py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: sc.subject_color || '#2563EB' }}
                        />
                        <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                          {sc.subject_name}
                        </span>
                        <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
                          ·
                        </span>
                        <span className="inline-flex items-center gap-1 font-mono text-xs tabular-nums text-slate-600 dark:text-slate-400">
                          <Clock className="h-3 w-3" />
                          {sc.start_time} ({formatMinutesAsDuration(sc.duration_minutes)})
                        </span>
                      </div>

                      <h4 className="mt-1.5 text-sm font-semibold text-slate-900 dark:text-white">
                        {sc.title}
                      </h4>
                      {sc.notes && (
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          {sc.notes}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => openEditModal(sc)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                        aria-label={`Edit ${sc.title}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(sc)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/60 dark:hover:text-rose-400"
                        aria-label={`Delete ${sc.title}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        void handleStatusUpdate(
                          sc.id,
                          sc.status === 'completed' ? 'planned' : 'completed'
                        )
                      }
                      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                        sc.status === 'completed'
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
                      }`}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {sc.status === 'completed' ? 'Completed' : 'Mark Completed'}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void handleStatusUpdate(
                          sc.id,
                          sc.status === 'missed' ? 'planned' : 'missed'
                        )
                      }
                      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                        sc.status === 'missed'
                          ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
                      }`}
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      Missed
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Add / Edit Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4 dark:border-slate-800">
              <h3 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
                {editingSchedule ? 'Edit Study Block' : 'Schedule Study Block'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              {formError && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/50 dark:text-rose-300">
                  {formError}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Subject
                </label>
                <select
                  value={subjectId}
                  onChange={(e) => setSubjectId(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  required
                >
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} {s.code ? `(${s.code})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Study Topic
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Chapter 4 Graph Traversal Practice"
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  required
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Date
                  </label>
                  <input
                    type="date"
                    value={scheduleDate}
                    onChange={(e) => setScheduleDate(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Start Time
                  </label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Duration (min)
                  </label>
                  <input
                    type="number"
                    min="10"
                    max="600"
                    step="5"
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm tabular-nums text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Notes (optional)
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Key chapters, problem sets, or goals for this block..."
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 whitespace-nowrap shrink-0"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap shrink-0"
                >
                  {saving ? 'Saving...' : editingSchedule ? 'Save Changes' : 'Save Schedule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Delete Study Block"
        message={`Remove "${deleteTarget?.title}" from your study schedule?`}
        confirmLabel="Delete Block"
        loading={deleting}
        onConfirm={() => void handleDeleteConfirm()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
