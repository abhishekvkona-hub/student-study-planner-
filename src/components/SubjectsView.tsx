import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { BookOpen, Pencil, Plus, Trash2, X } from 'lucide-react';
import { apiRequest } from '../lib/api.ts';
import {
  formatMinutesAsHoursDecimal,
  getPriorityLabel,
  getPriorityTextClass,
  SUBJECT_COLOR_OPTIONS,
} from '../lib/format.ts';
import { ConfirmModal } from './ConfirmModal.tsx';
import type { Priority, Subject } from '../types/planner.ts';

export function SubjectsView() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [instructor, setInstructor] = useState('');
  const [color, setColor] = useState('#2563EB');
  const [priority, setPriority] = useState<Priority>('medium');
  const [targetHours, setTargetHours] = useState('4');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<Subject | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadSubjects = useCallback(async () => {
    try {
      setError('');
      const res = await apiRequest<{ subjects: Subject[] }>('/api/subjects');
      setSubjects(res.subjects);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load subjects.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSubjects();
  }, [loadSubjects]);

  function openCreateModal() {
    setEditingSubject(null);
    setName('');
    setCode('');
    setInstructor('');
    setColor('#2563EB');
    setPriority('medium');
    setTargetHours('4');
    setFormError('');
    setModalOpen(true);
  }

  function openEditModal(subject: Subject) {
    setEditingSubject(subject);
    setName(subject.name);
    setCode(subject.code || '');
    setInstructor(subject.instructor || '');
    setColor(subject.color || '#2563EB');
    setPriority(subject.priority);
    setTargetHours(String(subject.target_hours_per_week));
    setFormError('');
    setModalOpen(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError('');

    const trimmedName = name.trim();
    const hoursNum = Number(targetHours);

    if (trimmedName.length < 2) {
      setFormError('Subject name must be at least 2 characters.');
      return;
    }
    if (Number.isNaN(hoursNum) || hoursNum < 0.5 || hoursNum > 80) {
      setFormError('Weekly study hours must be between 0.5 and 80.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: trimmedName,
        code: code.trim(),
        instructor: instructor.trim(),
        color,
        priority,
        target_hours_per_week: hoursNum,
      };

      if (editingSubject) {
        await apiRequest(`/api/subjects/${editingSubject.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        await apiRequest('/api/subjects', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }

      setModalOpen(false);
      await loadSubjects();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save subject.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiRequest(`/api/subjects/${deleteTarget.id}`, { method: 'DELETE' });
      setDeleteTarget(null);
      await loadSubjects();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete subject.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
            Subjects &amp; Courses
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Assign weekly study targets and priorities for each course.
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-violet-600 px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-95 whitespace-nowrap shrink-0"
        >
          <Plus className="h-4 w-4" />
          Add Subject
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/50 dark:text-rose-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-44 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
            />
          ))}
        </div>
      ) : subjects.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-14 text-center dark:border-slate-800 dark:bg-slate-900">
          <BookOpen className="mx-auto h-10 w-10 text-blue-600 dark:text-blue-400" />
          <h3 className="font-display mt-3 text-base font-semibold text-slate-900 dark:text-white">
            No subjects added yet
          </h3>
          <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">
            Add your courses to organize study blocks, assignments, notes, and Pomodoro focus hours.
          </p>
          <button
            type="button"
            onClick={openCreateModal}
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Add First Subject
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {subjects.map((subject) => {
            const weekMinutes = Number(subject.week_logged_minutes || 0);
            const targetMinutes = subject.target_hours_per_week * 60;
            const pct =
              targetMinutes > 0 ? Math.min(100, Math.round((weekMinutes / targetMinutes) * 100)) : 0;

            return (
              <article
                key={subject.id}
                className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className="h-3 w-3 shrink-0 rounded-full"
                        style={{ backgroundColor: subject.color }}
                      />
                      <h3 className="font-display truncate text-base font-semibold text-slate-900 dark:text-white">
                        {subject.name}
                      </h3>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => openEditModal(subject)}
                        className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                        aria-label={`Edit ${subject.name}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(subject)}
                        className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/60 dark:hover:text-rose-400"
                        aria-label={`Delete ${subject.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                    {subject.code && (
                      <>
                        <span className="font-mono">{subject.code}</span>
                        <span aria-hidden="true">·</span>
                      </>
                    )}
                    {subject.instructor && (
                      <>
                        <span>{subject.instructor}</span>
                        <span aria-hidden="true">·</span>
                      </>
                    )}
                    <span className={`font-medium ${getPriorityTextClass(subject.priority)}`}>
                      {getPriorityLabel(subject.priority)}
                    </span>
                  </p>
                </div>

                <div className="mt-5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-600 dark:text-slate-400">Weekly Study Progress</span>
                    <span className="font-mono font-medium tabular-nums text-slate-900 dark:text-slate-100">
                      {formatMinutesAsHoursDecimal(weekMinutes)} / {subject.target_hours_per_week}h
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{ width: `${pct}%`, backgroundColor: subject.color }}
                    />
                  </div>
                  <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    <span>
                      <span className="font-mono font-medium tabular-nums text-slate-900 dark:text-slate-200">
                        {subject.pending_tasks ?? 0}
                      </span>{' '}
                      pending tasks
                    </span>
                    <span>
                      <span className="font-mono font-medium tabular-nums text-slate-900 dark:text-slate-200">
                        {subject.notes_count ?? 0}
                      </span>{' '}
                      notes
                    </span>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Add / Edit Subject Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="subject-modal-title"
        >
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4 dark:border-slate-800">
              <h3
                id="subject-modal-title"
                className="font-display text-lg font-semibold text-slate-900 dark:text-white"
              >
                {editingSubject ? 'Edit Subject' : 'Add New Subject'}
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
                  Subject Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Data Structures & Algorithms"
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  required
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Course Code (optional)
                  </label>
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="e.g. CS 201"
                    className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Instructor (optional)
                  </label>
                  <input
                    type="text"
                    value={instructor}
                    onChange={(e) => setInstructor(e.target.value)}
                    placeholder="e.g. Prof. Rivera"
                    className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Priority Level
                  </label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as Priority)}
                    className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <option value="high">High Priority</option>
                    <option value="medium">Medium Priority</option>
                    <option value="low">Low Priority</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Weekly Target Hours
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0.5"
                    max="80"
                    value={targetHours}
                    onChange={(e) => setTargetHours(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 font-mono text-sm tabular-nums text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    required
                  />
                </div>
              </div>

              <div>
                <span className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Color Accent
                </span>
                <div className="mt-2 flex flex-wrap items-center gap-2.5">
                  {SUBJECT_COLOR_OPTIONS.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setColor(c.value)}
                      className={`flex h-8 w-8 items-center justify-center rounded-lg border-2 transition-transform ${
                        color === c.value
                          ? 'scale-110 border-slate-900 dark:border-white'
                          : 'border-transparent'
                      }`}
                      style={{ backgroundColor: c.value }}
                      title={c.label}
                      aria-label={c.label}
                    />
                  ))}
                </div>
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
                  {saving ? 'Saving...' : editingSubject ? 'Save Changes' : 'Create Subject'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Delete Subject"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? Associated study schedules for this subject will also be removed, while notes and tasks will remain unlinked.`}
        confirmLabel="Delete Subject"
        loading={deleting}
        onConfirm={() => void handleDeleteConfirm()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
