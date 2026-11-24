import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { FileText, Pin, Plus, Search, Trash2, Check } from 'lucide-react';
import { apiRequest } from '../lib/api.ts';
import { ConfirmModal } from './ConfirmModal.tsx';
import type { Note, Subject } from '../types/planner.ts';

export function NotesView() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectFilter, setSubjectFilter] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Active editor state
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [title, setTitle] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [content, setContent] = useState('');
  const [isPinned, setIsPinned] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState('');

  const [deleteTarget, setDeleteTarget] = useState<Note | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setError('');
      const params = new URLSearchParams();
      if (subjectFilter) params.set('subjectId', subjectFilter);
      if (search.trim()) params.set('search', search.trim());

      const [notesRes, subjRes] = await Promise.all([
        apiRequest<{ notes: Note[] }>(`/api/notes?${params.toString()}`),
        apiRequest<{ subjects: Subject[] }>('/api/subjects'),
      ]);
      setNotes(notesRes.notes);
      setSubjects(subjRes.subjects);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load study notes.');
    } finally {
      setLoading(false);
    }
  }, [subjectFilter, search]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  function selectNoteForEdit(note: Note) {
    setIsCreatingNew(false);
    setSelectedNote(note);
    setTitle(note.title);
    setSubjectId(note.subject_id ? String(note.subject_id) : '');
    setContent(note.content || '');
    setIsPinned(Boolean(note.is_pinned));
    setSavedNotice('');
    setError('');
  }

  function startNewNote() {
    setSelectedNote(null);
    setIsCreatingNew(true);
    setTitle('');
    setSubjectId(subjectFilter || (subjects[0] ? String(subjects[0].id) : ''));
    setContent('');
    setIsPinned(false);
    setSavedNotice('');
    setError('');
  }

  async function handleSaveNote(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSavedNotice('');

    if (!title.trim()) {
      setError('Please enter a note title.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        subject_id: subjectId ? Number(subjectId) : null,
        content,
        is_pinned: isPinned,
      };

      if (selectedNote && !isCreatingNew) {
        const res = await apiRequest<{ note: Note }>(`/api/notes/${selectedNote.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        setSelectedNote(res.note);
        setSavedNotice('Note saved');
      } else {
        const res = await apiRequest<{ note: Note }>('/api/notes', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setIsCreatingNew(false);
        setSelectedNote(res.note);
        setSavedNotice('Note created');
      }

      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save note.');
    } finally {
      setSaving(false);
    }
  }

  async function handleTogglePin(note: Note) {
    try {
      const res = await apiRequest<{ note: Note }>(`/api/notes/${note.id}/pin`, {
        method: 'PATCH',
      });
      if (selectedNote?.id === note.id) {
        setSelectedNote(res.note);
        setIsPinned(Boolean(res.note.is_pinned));
      }
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update pin status.');
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiRequest(`/api/notes/${deleteTarget.id}`, { method: 'DELETE' });
      if (selectedNote?.id === deleteTarget.id) {
        setSelectedNote(null);
        setIsCreatingNew(false);
        setTitle('');
        setContent('');
      }
      setDeleteTarget(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete note.');
    } finally {
      setDeleting(false);
    }
  }

  const showEditor = isCreatingNew || selectedNote !== null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
            Study Notes
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Write, organize by subject, pin key summaries, and search your personal notes.
          </p>
        </div>

        <button
          type="button"
          onClick={startNewNote}
          className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-violet-600 px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-95 whitespace-nowrap shrink-0"
        >
          <Plus className="h-4 w-4" />
          New Note
        </button>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800 dark:bg-slate-900">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search notes by title or content..."
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pr-3 pl-9 text-sm text-slate-900 outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>

        <select
          value={subjectFilter}
          onChange={(e) => setSubjectFilter(e.target.value)}
          aria-label="Filter notes by subject"
          className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-700 outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
        >
          <option value="">All Subjects</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/50 dark:text-rose-300">
          {error}
        </div>
      )}

      {/* Split Notes List + Editor */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Notes List */}
        <section className="rounded-xl border border-slate-200 bg-white lg:col-span-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
            <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Saved Notes (<span className="font-mono tabular-nums">{notes.length}</span>)
            </h3>
          </div>

          {loading ? (
            <div className="space-y-3 p-4">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-16 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800"
                />
              ))}
            </div>
          ) : notes.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <FileText className="mx-auto h-8 w-8 text-slate-400" />
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                No study notes found.
              </p>
              <button
                type="button"
                onClick={startNewNote}
                className="mt-3 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-medium text-white hover:bg-blue-700"
              >
                Create First Note
              </button>
            </div>
          ) : (
            <ul className="max-h-[540px] divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
              {notes.map((note) => {
                const isActive = selectedNote?.id === note.id && !isCreatingNew;
                return (
                  <li key={note.id}>
                    <div
                      className={`flex items-start justify-between gap-2 px-5 py-4 transition-colors ${
                        isActive
                          ? 'bg-blue-50/80 dark:bg-blue-950/35'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => selectNoteForEdit(note)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className="flex items-center gap-2">
                          {Boolean(note.is_pinned) && (
                            <Pin className="h-3.5 w-3.5 shrink-0 text-violet-600 dark:text-violet-400" />
                          )}
                          <h4 className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                            {note.title}
                          </h4>
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">
                          {note.content || 'Empty note'}
                        </p>
                        <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500">
                          <span>{note.subject_name || 'General'}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">
                            {note.updated_at.slice(0, 10)}
                          </span>
                        </p>
                      </button>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => void handleTogglePin(note)}
                          className={`rounded-md p-1.5 transition-colors ${
                            note.is_pinned
                              ? 'text-violet-600 hover:bg-violet-50 dark:text-violet-400 dark:hover:bg-violet-950/40'
                              : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800'
                          }`}
                          aria-label={note.is_pinned ? 'Unpin note' : 'Pin note'}
                        >
                          <Pin className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(note)}
                          className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/60 dark:hover:text-rose-400"
                          aria-label={`Delete ${note.title}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Note Editor */}
        <section className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-7 dark:border-slate-800 dark:bg-slate-900">
          {!showEditor ? (
            <div className="flex h-full min-h-[360px] flex-col items-center justify-center text-center">
              <FileText className="h-10 w-10 text-slate-300 dark:text-slate-600" />
              <h3 className="font-display mt-3 text-base font-semibold text-slate-900 dark:text-white">
                Select a note or create a new one
              </h3>
              <p className="mt-1 max-w-sm text-xs text-slate-500 dark:text-slate-400">
                Keep lecture summaries, exam review formulas, and reading notes organized by course.
              </p>
              <button
                type="button"
                onClick={startNewNote}
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700"
              >
                <Plus className="h-3.5 w-3.5" />
                Write New Note
              </button>
            </div>
          ) : (
            <form onSubmit={handleSaveNote} className="flex h-full flex-col space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Note title..."
                  className="font-display flex-1 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-base font-semibold text-slate-900 outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  required
                />

                <select
                  value={subjectId}
                  onChange={(e) => setSubjectId(e.target.value)}
                  aria-label="Note subject"
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <option value="">General</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <textarea
                rows={13}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Write your lecture notes, formulas, key definitions, or study checklist..."
                className="w-full flex-1 resize-y rounded-lg border border-slate-200 bg-white p-3.5 text-sm leading-relaxed text-slate-900 outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
                <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={isPinned}
                    onChange={(e) => setIsPinned(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                  />
                  Pin note to top
                </label>

                <div className="flex items-center gap-3">
                  {savedNotice && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                      <Check className="h-3.5 w-3.5" />
                      {savedNotice}
                    </span>
                  )}
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap shrink-0"
                  >
                    {saving ? 'Saving...' : 'Save Note'}
                  </button>
                </div>
              </div>
            </form>
          )}
        </section>
      </div>

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Delete Note"
        message={`Are you sure you want to permanently delete "${deleteTarget?.title}"?`}
        confirmLabel="Delete Note"
        loading={deleting}
        onConfirm={() => void handleDeleteConfirm()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
