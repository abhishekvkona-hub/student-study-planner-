import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'study_planner.db');
export const db = new DatabaseSync(dbPath);

db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA journal_mode = WAL;');

export function initDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      recovery_question TEXT NOT NULL,
      recovery_answer_hash TEXT NOT NULL,
      daily_goal_hours REAL NOT NULL DEFAULT 4.0,
      weekly_goal_hours REAL NOT NULL DEFAULT 20.0,
      theme_preference TEXT NOT NULL DEFAULT 'light' CHECK(theme_preference IN ('light', 'dark')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS subjects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      code TEXT NOT NULL DEFAULT '',
      instructor TEXT NOT NULL DEFAULT '',
      color TEXT NOT NULL DEFAULT '#2563EB',
      priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('high', 'medium', 'low')),
      target_hours_per_week REAL NOT NULL DEFAULT 4.0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS study_schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      schedule_date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL DEFAULT 60,
      status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned', 'completed', 'missed')),
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      due_date TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('high', 'medium', 'low')),
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'completed')),
      completed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS study_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
      session_type TEXT NOT NULL DEFAULT 'pomodoro' CHECK(session_type IN ('pomodoro', 'custom', 'break')),
      duration_minutes INTEGER NOT NULL,
      session_date TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      completed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      is_pinned INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS progress_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      report_date TEXT NOT NULL,
      week_start TEXT NOT NULL,
      total_study_minutes INTEGER NOT NULL DEFAULT 0,
      tasks_completed INTEGER NOT NULL DEFAULT 0,
      sessions_completed INTEGER NOT NULL DEFAULT 0,
      completion_rate REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, report_date)
    );

    CREATE INDEX IF NOT EXISTS idx_subjects_user ON subjects(user_id);
    CREATE INDEX IF NOT EXISTS idx_schedules_user_date ON study_schedules(user_id, schedule_date);
    CREATE INDEX IF NOT EXISTS idx_tasks_user_due ON tasks(user_id, due_date, status);
    CREATE INDEX IF NOT EXISTS idx_sessions_user_date ON study_sessions(user_id, session_date);
    CREATE INDEX IF NOT EXISTS idx_notes_user ON notes(user_id, subject_id);
    CREATE INDEX IF NOT EXISTS idx_progress_user_date ON progress_reports(user_id, report_date);
  `);
}

export function getTodayDateStr(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getWeekStartDateStr(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  const day = dt.getDay(); // 0 = Sunday, 1 = Monday
  const diff = day === 0 ? -6 : 1 - day; // Monday start
  dt.setDate(dt.getDate() + diff);
  const wy = dt.getFullYear();
  const wm = String(dt.getMonth() + 1).padStart(2, '0');
  const wd = String(dt.getDate()).padStart(2, '0');
  return `${wy}-${wm}-${wd}`;
}

export function recalculateProgressReport(userId: number, dateStr: string): void {
  const weekStart = getWeekStartDateStr(dateStr);

  const sessionAgg = db
    .prepare(
      `SELECT COALESCE(SUM(CASE WHEN session_type != 'break' THEN duration_minutes ELSE 0 END), 0) AS total_minutes,
              COUNT(CASE WHEN session_type != 'break' THEN 1 END) AS session_count
       FROM study_sessions
       WHERE user_id = ? AND session_date = ?`
    )
    .get(userId, dateStr) as { total_minutes: number; session_count: number };

  const taskAgg = db
    .prepare(
      `SELECT COUNT(*) AS completed_count
       FROM tasks
       WHERE user_id = ? AND status = 'completed' AND substr(completed_at, 1, 10) = ?`
    )
    .get(userId, dateStr) as { completed_count: number };

  const overallTaskAgg = db
    .prepare(
      `SELECT COUNT(*) AS total_tasks,
              SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_tasks
       FROM tasks
       WHERE user_id = ?`
    )
    .get(userId) as { total_tasks: number; completed_tasks: number };

  const scheduleAgg = db
    .prepare(
      `SELECT COUNT(*) AS total_schedules,
              SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_schedules
       FROM study_schedules
       WHERE user_id = ? AND schedule_date <= ?`
    )
    .get(userId, dateStr) as { total_schedules: number; completed_schedules: number };

  const totalItems = (overallTaskAgg.total_tasks || 0) + (scheduleAgg.total_schedules || 0);
  const completedItems = (overallTaskAgg.completed_tasks || 0) + (scheduleAgg.completed_schedules || 0);
  const completionRate = totalItems > 0 ? Math.round((completedItems / totalItems) * 1000) / 10 : 0;

  db.prepare(
    `INSERT INTO progress_reports (
      user_id, report_date, week_start, total_study_minutes, tasks_completed, sessions_completed, completion_rate, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id, report_date) DO UPDATE SET
      week_start = excluded.week_start,
      total_study_minutes = excluded.total_study_minutes,
      tasks_completed = excluded.tasks_completed,
      sessions_completed = excluded.sessions_completed,
      completion_rate = excluded.completion_rate,
      updated_at = datetime('now')`
  ).run(
    userId,
    dateStr,
    weekStart,
    Number(sessionAgg.total_minutes || 0),
    Number(taskAgg.completed_count || 0),
    Number(sessionAgg.session_count || 0),
    completionRate
  );
}
