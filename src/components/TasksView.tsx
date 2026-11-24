import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { apiRequest } from '../lib/api.ts';
import {
  formatDateShort,
  getPriorityLabel,
  getPriorityTextClass,
  getRelativeDeadlineText,
  getTodayLocalDateStr,
} from '../lib/format.ts';
import { ConfirmModal } from './ConfirmModal.tsx';
import type { Priority, Subject, Task } from '../types/planner.ts';

type TaskFilter = 'all' | 'pending' | 'overdue' | 'completed';

export function TasksView() {
  const todayStr = getTodayLocalDateStr();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [filter, setFilter] = useState<TaskFilter>('all');
  const [subjectFilter, setSubjectFilter] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [dueDate, setDueDate] = useState(todayStr);
  const [priority, setPriority] = useState<Priority>('medium');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setError('');
      const params = new URLSearchParams();
      params.set('filter', filter);
      if (subjectFilter) params.set('subjectId', subjectFilter);
      if (search.trim()) params.set('search', search.trim());

      const [tasksRes, subjRes] = await Promise.all([
        apiRequest<{ tasks: Task[] }>(`/api/tasks?${params.toString()}`),
        apiRequest<{ subjects: Subject[] }>('/api/subjects'),
      ]);
      setTasks(tasksRes.tasks);
      setSubjects(subjRes.subjects);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load assignments.');
    } finally {
      setLoading(false);
    }
  }, [filter, subjectFilter, search]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  function openCreateModal() {
    setEditingTask(null);
    setTitle('');
    setDescription('');
    setSubjectId(subjects[0] ? String(subjects[0].id) : '');
    setDueDate(todayStr);
    setPriority('medium');
    setFormError('');
    setModalOpen(true);
  }

  function openEditModal(task: Task) {
    setEditingTask(task);
    setTitle(task.title);
    setDescription(task.description || '');
    setSubjectId(task.subject_id ? String(task.subject_id) : '');
    setDueDate(task.due_date);
    setPriority(task.priority);
    setFormError('');
    setModalOpen(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError('');

    if (title.trim().length < 2) {
      setFormError('Assignment title must be at least 2 characters.');
      return;
    }
    if (!dueDate) {
      setFormError('Please select a deadline date.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim(),
        subject_id: subjectId ? Number(subjectId) : null,
        due_date: dueDate,
        priority,
      };

      if (editingTask) {
        await apiRequest(`/api/tasks/${editingTask.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        await apiRequest('/api/tasks', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }

      setModalOpen(false);
      await loadData();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save assignment.');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(taskId: number) {
    try {
      await apiRequest(`/api/tasks/${taskId}/toggle`, { method: 'PATCH' });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update task status.');
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiRequest(`/api/tasks/${deleteTarget.id}`, { method: 'DELETE' });
      setDeleteTarget(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete assignment.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
            Tasks &amp; Assignments
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Track assignment deadlines, set priorities, and stay ahead of overdue work.
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-violet-600 px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-95 whitespace-nowrap shrink-0"
        >
          <Plus className="h-4 w-4" />
          Add Assignment
        </button>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="flex flex-col justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 lg:flex-row lg:items-center dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
          {(
            [
              { id: 'all', label: 'All' },
              { id: 'pending', label: 'Pending' },
              { id: 'overdue', label: 'Overdue' },
              { id: 'completed', label: 'Completed' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                filter === tab.id
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <select
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value)}
            aria-label="Filter by subject"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <option value="">All Subjects</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search assignments..."
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pr-3 pl-9 text-xs text-slate-900 outline-none focus:border-blue-600 sm:w-56 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/50 dark:text-rose-300">
          {error}
        </div>
      )}

      {/* Assignments List */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {loading ? (
          <div className="space-y-3 p-6">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-14 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800"
              />
            ))}
          </div>
        ) : tasks.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              No assignments match the current filter.
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Create a new assignment or adjust your search and filter criteria.
            </p>
            <button
              type="button"
              onClick={openCreateModal}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Assignment
            </button>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {tasks.map((task) => {
              const isOverdue = Boolean(task.is_overdue) && task.status === 'pending';
              const isCompleted = task.status === 'completed';

              return (
                <li
                  key={task.id}
                  className="flex flex-col justify-between gap-4 px-5 py-4 transition-colors hover:bg-slate-50/70 sm:flex-row sm:items-center dark:hover:bg-slate-800/40"
                >
                  <div className="flex items-start gap-3.5 min-w-0">
                    <button
                      type="button"
                      onClick={() => void handleToggle(task.id)}
                      className="mt-0.5 shrink-0 text-slate-400 transition-colors hover:text-blue-600 dark:hover:text-blue-400"
                      aria-label={isCompleted ? 'Reopen assignment' : 'Complete assignment'}
                    >
                      {isCompleted ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <Circle className="h-5 w-5" />
                      )}
                    </button>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3
                          className={`text-sm font-semibold ${
                            isCompleted
                              ? 'line-through text-slate-400 dark:text-slate-500'
                              : 'text-slate-900 dark:text-white'
                          }`}
                        >
                          {task.title}
                        </h3>
                        {isOverdue && (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 dark:text-rose-400">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            Overdue
                          </span>
                        )}
                      </div>

                      {task.description && (
                        <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                          {task.description}
                        </p>
                      )}

                      <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                        {task.subject_name && (
                          <>
                            <span
                              className="inline-block h-2 w-2 rounded-full"
                              style={{ backgroundColor: task.subject_color || '#2563EB' }}
                            />
                            <span>{task.subject_name}</span>
                            <span aria-hidden="true">·</span>
                          </>
                        )}
                        <span className={`font-medium ${getPriorityTextClass(task.priority)}`}>
                          {getPriorityLabel(task.priority)}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          Due {formatDateShort(task.due_date)}
                        </span>
                        {!isCompleted && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span
                              className={
                                isOverdue ? 'font-medium text-rose-600 dark:text-rose-400' : ''
                              }
                            >
                              {getRelativeDeadlineText(task.due_date, todayStr)}
                            </span>
                          </>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                    <button
                      type="button"
                      onClick={() => openEditModal(task)}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                      aria-label={`Edit ${task.title}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(task)}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/60 dark:hover:text-rose-400"
                      aria-label={`Delete ${task.title}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Add / Edit Task Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4 dark:border-slate-800">
              <h3 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
                {editingTask ? 'Edit Assignment' : 'Add Assignment'}
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
                  Assignment Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Lab Report 3 — Binary Search Trees"
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Subject (optional)
                </label>
                <select
                  value={subjectId}
                  onChange={(e) => setSubjectId(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
                  <option value="">General / Unassigned</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Deadline Date
                  </label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 font-mono text-sm text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    required
                  />
                </div>
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
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Details (optional)
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Submission portal, grading rubric notes..."
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
                  {saving ? 'Saving...' : editingTask ? 'Save Changes' : 'Create Assignment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Delete Assignment"
        message={`Are you sure you want to delete "${deleteTarget?.title}"?`}
        confirmLabel="Delete Assignment"
        loading={deleting}
        onConfirm={() => void handleDeleteConfirm()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
