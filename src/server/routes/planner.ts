import { Router } from 'express';
import type { Response } from 'express';
import { db, getTodayDateStr, getWeekStartDateStr, recalculateProgressReport } from '../db.ts';
import { requireAuth } from '../security.ts';
import type { AuthRequest } from '../security.ts';

const router = Router();
router.use(requireAuth);

const VALID_PRIORITIES = new Set(['high', 'medium', 'low']);
const VALID_SCHEDULE_STATUS = new Set(['planned', 'completed', 'missed']);
const VALID_SESSION_TYPES = new Set(['pomodoro', 'custom', 'break']);
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_REGEX = /^\d{2}:\d{2}$/;

function verifySubjectOwnership(userId: number, subjectId: number | null): boolean {
  if (subjectId === null) return true;
  const row = db
    .prepare('SELECT id FROM subjects WHERE id = ? AND user_id = ?')
    .get(subjectId, userId);
  return Boolean(row);
}

function getLast7Dates(todayStr: string): string[] {
  const [y, m, d] = todayStr.split('-').map(Number);
  const dates: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const dt = new Date(y, (m || 1) - 1, (d || 1) - i);
    const yy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const dd = String(dt.getDate()).padStart(2, '0');
    dates.push(`${yy}-${mm}-${dd}`);
  }
  return dates;
}

// ---------------- DASHBOARD ----------------
router.get('/dashboard', (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const today = getTodayDateStr();
    const weekStart = getWeekStartDateStr(today);

    const subjectCountRow = db
      .prepare('SELECT COUNT(*) AS count FROM subjects WHERE user_id = ?')
      .get(userId) as { count: number };

    const todayStudyRow = db
      .prepare(
        `SELECT COALESCE(SUM(CASE WHEN session_type != 'break' THEN duration_minutes ELSE 0 END), 0) AS minutes
         FROM study_sessions
         WHERE user_id = ? AND session_date = ?`
      )
      .get(userId, today) as { minutes: number };

    const weekStudyRow = db
      .prepare(
        `SELECT COALESCE(SUM(CASE WHEN session_type != 'break' THEN duration_minutes ELSE 0 END), 0) AS minutes
         FROM study_sessions
         WHERE user_id = ? AND session_date >= ? AND session_date <= ?`
      )
      .get(userId, weekStart, today) as { minutes: number };

    const taskStats = db
      .prepare(
        `SELECT
           SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_count,
           SUM(CASE WHEN status = 'pending' AND due_date < ? THEN 1 ELSE 0 END) AS overdue_count,
           SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_count,
           COUNT(*) AS total_count
         FROM tasks
         WHERE user_id = ?`
      )
      .get(today, userId) as {
      pending_count: number | null;
      overdue_count: number | null;
      completed_count: number | null;
      total_count: number;
    };

    const todaySchedules = db
      .prepare(
        `SELECT sc.*, s.name AS subject_name, s.color AS subject_color, s.code AS subject_code
         FROM study_schedules sc
         INNER JOIN subjects s ON s.id = sc.subject_id
         WHERE sc.user_id = ? AND sc.schedule_date = ?
         ORDER BY sc.start_time ASC`
      )
      .all(userId, today);

    const upcomingTasks = db
      .prepare(
        `SELECT t.*, s.name AS subject_name, s.color AS subject_color
         FROM tasks t
         LEFT JOIN subjects s ON s.id = t.subject_id
         WHERE t.user_id = ? AND t.status = 'pending'
         ORDER BY t.due_date ASC, CASE t.priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END ASC
         LIMIT 6`
      )
      .all(userId);

    const last7Dates = getLast7Dates(today);
    const weeklyRows = db
      .prepare(
        `SELECT session_date,
                COALESCE(SUM(CASE WHEN session_type != 'break' THEN duration_minutes ELSE 0 END), 0) AS minutes
         FROM study_sessions
         WHERE user_id = ? AND session_date >= ? AND session_date <= ?
         GROUP BY session_date`
      )
      .all(userId, last7Dates[0], last7Dates[6]) as Array<{ session_date: string; minutes: number }>;

    const minutesMap = new Map<string, number>();
    for (const r of weeklyRows) {
      minutesMap.set(r.session_date, Number(r.minutes || 0));
    }

    const weeklySeries = last7Dates.map((d) => ({
      date: d,
      minutes: minutesMap.get(d) || 0,
      hours: Math.round(((minutesMap.get(d) || 0) / 60) * 100) / 100,
    }));

    const weeklyMinutes = Number(weekStudyRow.minutes || 0);
    const weeklyGoalMinutes = (req.user!.weekly_goal_hours || 20) * 60;
    const weeklyProgressPct =
      weeklyGoalMinutes > 0 ? Math.min(100, Math.round((weeklyMinutes / weeklyGoalMinutes) * 100)) : 0;

    res.json({
      today,
      kpis: {
        totalSubjects: Number(subjectCountRow.count || 0),
        todayStudyMinutes: Number(todayStudyRow.minutes || 0),
        todayStudyHours: Math.round((Number(todayStudyRow.minutes || 0) / 60) * 100) / 100,
        pendingAssignments: Number(taskStats.pending_count || 0),
        overdueAssignments: Number(taskStats.overdue_count || 0),
        completedTasks: Number(taskStats.completed_count || 0),
        totalTasks: Number(taskStats.total_count || 0),
        weeklyStudyHours: Math.round((weeklyMinutes / 60) * 100) / 100,
        weeklyGoalHours: req.user!.weekly_goal_hours,
        weeklyProgressPct,
      },
      todaySchedules,
      upcomingTasks,
      weeklySeries,
    });
  } catch (err) {
    console.error('Dashboard fetch error:', err);
    res.status(500).json({ error: 'Failed to load dashboard summary.' });
  }
});

// ---------------- SUBJECTS ----------------
router.get('/subjects', (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const today = getTodayDateStr();
    const weekStart = getWeekStartDateStr(today);

    const rows = db
      .prepare(
        `SELECT s.*,
          COALESCE((
            SELECT SUM(ss.duration_minutes)
            FROM study_sessions ss
            WHERE ss.subject_id = s.id AND ss.user_id = s.user_id
              AND ss.session_type != 'break'
              AND ss.session_date >= ? AND ss.session_date <= ?
          ), 0) AS week_logged_minutes,
          COALESCE((
            SELECT SUM(ss.duration_minutes)
            FROM study_sessions ss
            WHERE ss.subject_id = s.id AND ss.user_id = s.user_id
              AND ss.session_type != 'break'
          ), 0) AS total_logged_minutes,
          (SELECT COUNT(*) FROM tasks t WHERE t.subject_id = s.id AND t.user_id = s.user_id AND t.status = 'pending') AS pending_tasks,
          (SELECT COUNT(*) FROM notes n WHERE n.subject_id = s.id AND n.user_id = s.user_id) AS notes_count
        FROM subjects s
        WHERE s.user_id = ?
        ORDER BY CASE s.priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END ASC, s.created_at DESC`
      )
      .all(weekStart, today, userId);

    res.json({ subjects: rows });
  } catch (err) {
    console.error('Get subjects error:', err);
    res.status(500).json({ error: 'Failed to fetch subjects.' });
  }
});

router.post('/subjects', (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
    const instructor = typeof req.body?.instructor === 'string' ? req.body.instructor.trim() : '';
    const color = typeof req.body?.color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(req.body.color)
      ? req.body.color
      : '#2563EB';
    const priority = VALID_PRIORITIES.has(req.body?.priority) ? req.body.priority : 'medium';
    const targetHours = Number(req.body?.target_hours_per_week ?? 4);

    if (name.length < 2) {
      res.status(400).json({ error: 'Subject name must be at least 2 characters.' });
      return;
    }
    if (Number.isNaN(targetHours) || targetHours < 0.5 || targetHours > 80) {
      res.status(400).json({ error: 'Weekly study hours must be between 0.5 and 80.' });
      return;
    }

    const result = db
      .prepare(
        `INSERT INTO subjects (user_id, name, code, instructor, color, priority, target_hours_per_week)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(userId, name, code, instructor, color, priority, targetHours);

    const created = db
      .prepare('SELECT * FROM subjects WHERE id = ? AND user_id = ?')
      .get(Number(result.lastInsertRowid), userId);

    res.status(201).json({ subject: created });
  } catch (err) {
    console.error('Create subject error:', err);
    res.status(500).json({ error: 'Failed to create subject.' });
  }
});

router.put('/subjects/:id', (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const subjectId = Number(req.params.id);
    if (!Number.isInteger(subjectId) || subjectId <= 0) {
      res.status(400).json({ error: 'Invalid subject ID.' });
      return;
    }

    const existing = db
      .prepare('SELECT * FROM subjects WHERE id = ? AND user_id = ?')
      .get(subjectId, userId);
    if (!existing) {
      res.status(404).json({ error: 'Subject not found.' });
      return;
    }

    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
    const instructor = typeof req.body?.instructor === 'string' ? req.body.instructor.trim() : '';
    const color = typeof req.body?.color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(req.body.color)
      ? req.body.color
      : '#2563EB';
    const priority = VALID_PRIORITIES.has(req.body?.priority) ? req.body.priority : 'medium';
    const targetHours = Number(req.body?.target_hours_per_week ?? 4);

    if (name.length < 2) {
      res.status(400).json({ error: 'Subject name must be at least 2 characters.' });
      return;
    }
    if (Number.isNaN(targetHours) || targetHours < 0.5 || targetHours > 80) {
      res.status(400).json({ error: 'Weekly study hours must be between 0.5 and 80.' });
      return;
    }

    db.prepare(
      `UPDATE subjects
       SET name = ?, code = ?, instructor = ?, color = ?, priority = ?, target_hours_per_week = ?
       WHERE id = ? AND user_id = ?`
    ).run(name, code, instructor, color, priority, targetHours, subjectId, userId);

    const updated = db
      .prepare('SELECT * FROM subjects WHERE id = ? AND user_id = ?')
      .get(subjectId, userId);

    res.json({ subject: updated });
  } catch (err) {
    console.error('Update subject error:', err);
    res.status(500).json({ error: 'Failed to update subject.' });
  }
});

router.delete('/subjects/:id', (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const subjectId = Number(req.params.id);
    if (!Number.isInteger(subjectId) || subjectId <= 0) {
      res.status(400).json({ error: 'Invalid subject ID.' });
      return;
    }

    const result = db
      .prepare('DELETE FROM subjects WHERE id = ? AND user_id = ?')
      .run(subjectId, userId);

    if (result.changes === 0) {
      res.status(404).json({ error: 'Subject not found.' });
      return;
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('Delete subject error:', err);
    res.status(500).json({ error: 'Failed to delete subject.' });
  }
});

// ---------------- STUDY SCHEDULES ----------------
router.get('/schedules', (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const date = typeof req.query.date === 'string' && DATE_REGEX.test(req.query.date) ? req.query.date : null;
    const month = typeof req.query.month === 'string' && /^\d{4}-\d{2}$/.test(req.query.month) ? req.query.month : null;

    let sql = `
      SELECT sc.*, s.name AS subject_name, s.color AS subject_color, s.code AS subject_code
      FROM study_schedules sc
      INNER JOIN subjects s ON s.id = sc.subject_id
      WHERE sc.user_id = ?
    `;
    const params: (string | number)[] = [userId];

    if (date) {
      sql += ' AND sc.schedule_date = ?';
      params.push(date);
    } else if (month) {
      sql += ' AND substr(sc.schedule_date, 1, 7) = ?';
      params.push(month);
    }

    sql += ' ORDER BY sc.schedule_date ASC, sc.start_time ASC';
    const schedules = db.prepare(sql).all(...params);
    res.json({ schedules });
  } catch (err) {
    console.error('Get schedules error:', err);
    res.status(500).json({ error: 'Failed to fetch study schedules.' });
  }
});

router.post('/schedules', (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const subjectId = Number(req.body?.subject_id);
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    const scheduleDate = typeof req.body?.schedule_date === 'string' ? req.body.schedule_date.trim() : '';
    const startTime = typeof req.body?.start_time === 'string' ? req.body.start_time.trim() : '';
    const durationMinutes = Number(req.body?.duration_minutes ?? 60);
    const status = VALID_SCHEDULE_STATUS.has(req.body?.status) ? req.body.status : 'planned';
    const notes = typeof req.body?.notes === 'string' ? req.body.notes.trim() : '';

    if (!Number.isInteger(subjectId) || subjectId <= 0 || !verifySubjectOwnership(userId, subjectId)) {
      res.status(400).json({ error: 'Please select a valid subject.' });
      return;
    }
    if (title.length < 2) {
      res.status(400).json({ error: 'Please enter a study topic (at least 2 characters).' });
      return;
    }
    if (!DATE_REGEX.test(scheduleDate)) {
      res.status(400).json({ error: 'Please select a valid schedule date.' });
      return;
    }
    if (!TIME_REGEX.test(startTime)) {
      res.status(400).json({ error: 'Please enter a valid start time (HH:MM).' });
      return;
    }
    if (Number.isNaN(durationMinutes) || durationMinutes < 10 || durationMinutes > 600) {
      res.status(400).json({ error: 'Study duration must be between 10 and 600 minutes.' });
      return;
    }

    const result = db
      .prepare(
        `INSERT INTO study_schedules (user_id, subject_id, title, schedule_date, start_time, duration_minutes, status, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(userId, subjectId, title, scheduleDate, startTime, durationMinutes, status, notes);

    recalculateProgressReport(userId, scheduleDate);

    const created = db
      .prepare(
        `SELECT sc.*, s.name AS subject_name, s.color AS subject_color, s.code AS subject_code
         FROM study_schedules sc
         INNER JOIN subjects s ON s.id = sc.subject_id
         WHERE sc.id = ? AND sc.user_id = ?`
      )
      .get(Number(result.lastInsertRowid), userId);

    res.status(201).json({ schedule: created });
  } catch (err) {
    console.error('Create schedule error:', err);
    res.status(500).json({ error: 'Failed to create study schedule.' });
  }
});

router.put('/schedules/:id', (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const scheduleId = Number(req.params.id);
    if (!Number.isInteger(scheduleId) || scheduleId <= 0) {
      res.status(400).json({ error: 'Invalid schedule ID.' });
      return;
    }

    const existing = db
      .prepare('SELECT * FROM study_schedules WHERE id = ? AND user_id = ?')
      .get(scheduleId, userId) as { schedule_date: string } | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Study schedule not found.' });
      return;
    }

    const subjectId = Number(req.body?.subject_id);
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    const scheduleDate = typeof req.body?.schedule_date === 'string' ? req.body.schedule_date.trim() : '';
    const startTime = typeof req.body?.start_time === 'string' ? req.body.start_time.trim() : '';
    const durationMinutes = Number(req.body?.duration_minutes ?? 60);
    const status = VALID_SCHEDULE_STATUS.has(req.body?.status) ? req.body.status : 'planned';
    const notes = typeof req.body?.notes === 'string' ? req.body.notes.trim() : '';

    if (!Number.isInteger(subjectId) || subjectId <= 0 || !verifySubjectOwnership(userId, subjectId)) {
      res.status(400).json({ error: 'Please select a valid subject.' });
      return;
    }
    if (title.length < 2) {
      res.status(400).json({ error: 'Please enter a study topic.' });
      return;
    }
    if (!DATE_REGEX.test(scheduleDate) || !TIME_REGEX.test(startTime)) {
      res.status(400).json({ error: 'Please provide valid date and time.' });
      return;
    }
    if (Number.isNaN(durationMinutes) || durationMinutes < 10 || durationMinutes > 600) {
      res.status(400).json({ error: 'Study duration must be between 10 and 600 minutes.' });
      return;
    }

    db.prepare(
      `UPDATE study_schedules
       SET subject_id = ?, title = ?, schedule_date = ?, start_time = ?, duration_minutes = ?, status = ?, notes = ?
       WHERE id = ? AND user_id = ?`
    ).run(subjectId, title, scheduleDate, startTime, durationMinutes, status, notes, scheduleId, userId);

    recalculateProgressReport(userId, existing.schedule_date);
    if (scheduleDate !== existing.schedule_date) {
      recalculateProgressReport(userId, scheduleDate);
    }

    const updated = db
      .prepare(
        `SELECT sc.*, s.name AS subject_name, s.color AS subject_color, s.code AS subject_code
         FROM study_schedules sc
         INNER JOIN subjects s ON s.id = sc.subject_id
         WHERE sc.id = ? AND sc.user_id = ?`
      )
      .get(scheduleId, userId);

    res.json({ schedule: updated });
  } catch (err) {
    console.error('Update schedule error:', err);
    res.status(500).json({ error: 'Failed to update study schedule.' });
  }
});

router.patch('/schedules/:id/status', (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const scheduleId = Number(req.params.id);
    const status = req.body?.status;

    if (!Number.isInteger(scheduleId) || scheduleId <= 0 || !VALID_SCHEDULE_STATUS.has(status)) {
      res.status(400).json({ error: 'Invalid schedule ID or status.' });
      return;
    }

    const existing = db
      .prepare('SELECT schedule_date FROM study_schedules WHERE id = ? AND user_id = ?')
      .get(scheduleId, userId) as { schedule_date: string } | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Study schedule not found.' });
      return;
    }

    db.prepare('UPDATE study_schedules SET status = ? WHERE id = ? AND user_id = ?').run(
      status,
      scheduleId,
      userId
    );
    recalculateProgressReport(userId, existing.schedule_date);

    const updated = db
      .prepare(
        `SELECT sc.*, s.name AS subject_name, s.color AS subject_color, s.code AS subject_code
         FROM study_schedules sc
         INNER JOIN subjects s ON s.id = sc.subject_id
         WHERE sc.id = ? AND sc.user_id = ?`
      )
      .get(scheduleId, userId);

    res.json({ schedule: updated });
  } catch (err) {
    console.error('Update schedule status error:', err);
    res.status(500).json({ error: 'Failed to update schedule status.' });
  }
});

router.delete('/schedules/:id', (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const scheduleId = Number(req.params.id);
    if (!Number.isInteger(scheduleId) || scheduleId <= 0) {
      res.status(400).json({ error: 'Invalid schedule ID.' });
      return;
    }

    const existing = db
      .prepare('SELECT schedule_date FROM study_schedules WHERE id = ? AND user_id = ?')
      .get(scheduleId, userId) as { schedule_date: string } | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Study schedule not found.' });
      return;
    }

    db.prepare('DELETE FROM study_schedules WHERE id = ? AND user_id = ?').run(scheduleId, userId);
    recalculateProgressReport(userId, existing.schedule_date);
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete schedule error:', err);
    res.status(500).json({ error: 'Failed to delete schedule.' });
  }
});

// ---------------- TASKS & ASSIGNMENTS ----------------
router.get('/tasks', (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const today = getTodayDateStr();
    const filter = typeof req.query.filter === 'string' ? req.query.filter : 'all';
    const subjectId = req.query.subjectId ? Number(req.query.subjectId) : null;
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';

    let sql = `
      SELECT t.*, s.name AS subject_name, s.color AS subject_color, s.code AS subject_code,
             CASE WHEN t.status = 'pending' AND t.due_date < ? THEN 1 ELSE 0 END AS is_overdue
      FROM tasks t
      LEFT JOIN subjects s ON s.id = t.subject_id
      WHERE t.user_id = ?
    `;
    const params: (string | number)[] = [today, userId];

    if (filter === 'pending') {
      sql += " AND t.status = 'pending'";
    } else if (filter === 'overdue') {
      sql += " AND t.status = 'pending' AND t.due_date < ?";
      params.push(today);
    } else if (filter === 'completed') {
      sql += " AND t.status = 'completed'";
    }

    if (subjectId && Number.isInteger(subjectId) && subjectId > 0) {
      sql += ' AND t.subject_id = ?';
      params.push(subjectId);
    }

    if (search) {
      sql += ' AND (t.title LIKE ? OR t.description LIKE ?)';
      const like = `%${search}%`;
      params.push(like, like);
    }

    sql +=
      " ORDER BY CASE t.status WHEN 'pending' THEN 0 ELSE 1 END ASC, t.due_date ASC, CASE t.priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END ASC";

    const tasks = db.prepare(sql).all(...params);
    res.json({ tasks });
  } catch (err) {
    console.error('Get tasks error:', err);
    res.status(500).json({ error: 'Failed to fetch assignments.' });
  }
});

router.post('/tasks', (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const rawSubj = req.body?.subject_id;
    const subjectId = rawSubj === null || rawSubj === '' || rawSubj === undefined ? null : Number(rawSubj);
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';
    const dueDate = typeof req.body?.due_date === 'string' ? req.body.due_date.trim() : '';
    const priority = VALID_PRIORITIES.has(req.body?.priority) ? req.body.priority : 'medium';

    if (subjectId !== null && (!Number.isInteger(subjectId) || !verifySubjectOwnership(userId, subjectId))) {
      res.status(400).json({ error: 'Invalid subject selected.' });
      return;
    }
    if (title.length < 2) {
      res.status(400).json({ error: 'Assignment title must be at least 2 characters.' });
      return;
    }
    if (!DATE_REGEX.test(dueDate)) {
      res.status(400).json({ error: 'Please select a valid due date.' });
      return;
    }

    const result = db
      .prepare(
        `INSERT INTO tasks (user_id, subject_id, title, description, due_date, priority, status)
         VALUES (?, ?, ?, ?, ?, ?, 'pending')`
      )
      .run(userId, subjectId, title, description, dueDate, priority);

    recalculateProgressReport(userId, getTodayDateStr());

    const today = getTodayDateStr();
    const created = db
      .prepare(
        `SELECT t.*, s.name AS subject_name, s.color AS subject_color, s.code AS subject_code,
                CASE WHEN t.status = 'pending' AND t.due_date < ? THEN 1 ELSE 0 END AS is_overdue
         FROM tasks t
         LEFT JOIN subjects s ON s.id = t.subject_id
         WHERE t.id = ? AND t.user_id = ?`
      )
      .get(today, Number(result.lastInsertRowid), userId);

    res.status(201).json({ task: created });
  } catch (err) {
    console.error('Create task error:', err);
    res.status(500).json({ error: 'Failed to create assignment.' });
  }
});

router.put('/tasks/:id', (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const taskId = Number(req.params.id);
    if (!Number.isInteger(taskId) || taskId <= 0) {
      res.status(400).json({ error: 'Invalid assignment ID.' });
      return;
    }

    const existing = db
      .prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?')
      .get(taskId, userId);
    if (!existing) {
      res.status(404).json({ error: 'Assignment not found.' });
      return;
    }

    const rawSubj = req.body?.subject_id;
    const subjectId = rawSubj === null || rawSubj === '' || rawSubj === undefined ? null : Number(rawSubj);
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';
    const dueDate = typeof req.body?.due_date === 'string' ? req.body.due_date.trim() : '';
    const priority = VALID_PRIORITIES.has(req.body?.priority) ? req.body.priority : 'medium';

    if (subjectId !== null && (!Number.isInteger(subjectId) || !verifySubjectOwnership(userId, subjectId))) {
      res.status(400).json({ error: 'Invalid subject selected.' });
      return;
    }
    if (title.length < 2) {
      res.status(400).json({ error: 'Assignment title must be at least 2 characters.' });
      return;
    }
    if (!DATE_REGEX.test(dueDate)) {
      res.status(400).json({ error: 'Please select a valid due date.' });
      return;
    }

    db.prepare(
      `UPDATE tasks
       SET subject_id = ?, title = ?, description = ?, due_date = ?, priority = ?
       WHERE id = ? AND user_id = ?`
    ).run(subjectId, title, description, dueDate, priority, taskId, userId);

    const today = getTodayDateStr();
    const updated = db
      .prepare(
        `SELECT t.*, s.name AS subject_name, s.color AS subject_color, s.code AS subject_code,
                CASE WHEN t.status = 'pending' AND t.due_date < ? THEN 1 ELSE 0 END AS is_overdue
         FROM tasks t
         LEFT JOIN subjects s ON s.id = t.subject_id
         WHERE t.id = ? AND t.user_id = ?`
      )
      .get(today, taskId, userId);

    res.json({ task: updated });
  } catch (err) {
    console.error('Update task error:', err);
    res.status(500).json({ error: 'Failed to update assignment.' });
  }
});

router.patch('/tasks/:id/toggle', (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const taskId = Number(req.params.id);
    if (!Number.isInteger(taskId) || taskId <= 0) {
      res.status(400).json({ error: 'Invalid assignment ID.' });
      return;
    }

    const existing = db
      .prepare('SELECT status, completed_at FROM tasks WHERE id = ? AND user_id = ?')
      .get(taskId, userId) as { status: string; completed_at: string | null } | undefined;

    if (!existing) {
      res.status(404).json({ error: 'Assignment not found.' });
      return;
    }

    const nextStatus = existing.status === 'completed' ? 'pending' : 'completed';
    const today = getTodayDateStr();
    const completedAt = nextStatus === 'completed' ? new Date().toISOString() : null;

    db.prepare('UPDATE tasks SET status = ?, completed_at = ? WHERE id = ? AND user_id = ?').run(
      nextStatus,
      completedAt,
      taskId,
      userId
    );

    recalculateProgressReport(userId, today);
    if (existing.completed_at) {
      const prevDate = existing.completed_at.slice(0, 10);
      if (DATE_REGEX.test(prevDate) && prevDate !== today) {
        recalculateProgressReport(userId, prevDate);
      }
    }

    const updated = db
      .prepare(
        `SELECT t.*, s.name AS subject_name, s.color AS subject_color, s.code AS subject_code,
                CASE WHEN t.status = 'pending' AND t.due_date < ? THEN 1 ELSE 0 END AS is_overdue
         FROM tasks t
         LEFT JOIN subjects s ON s.id = t.subject_id
         WHERE t.id = ? AND t.user_id = ?`
      )
      .get(today, taskId, userId);

    res.json({ task: updated });
  } catch (err) {
    console.error('Toggle task error:', err);
    res.status(500).json({ error: 'Failed to update assignment status.' });
  }
});

router.delete('/tasks/:id', (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const taskId = Number(req.params.id);
    if (!Number.isInteger(taskId) || taskId <= 0) {
      res.status(400).json({ error: 'Invalid assignment ID.' });
      return;
    }

    const result = db.prepare('DELETE FROM tasks WHERE id = ? AND user_id = ?').run(taskId, userId);
    if (result.changes === 0) {
      res.status(404).json({ error: 'Assignment not found.' });
      return;
    }

    recalculateProgressReport(userId, getTodayDateStr());
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete task error:', err);
    res.status(500).json({ error: 'Failed to delete assignment.' });
  }
});

// ---------------- STUDY SESSIONS (TIMER) ----------------
router.get('/sessions', (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const today = getTodayDateStr();

    const sessions = db
      .prepare(
        `SELECT ss.*, s.name AS subject_name, s.color AS subject_color
         FROM study_sessions ss
         LEFT JOIN subjects s ON s.id = ss.subject_id
         WHERE ss.user_id = ?
         ORDER BY ss.completed_at DESC
         LIMIT 50`
      )
      .all(userId);

    const totals = db
      .prepare(
        `SELECT
           COALESCE(SUM(CASE WHEN session_type != 'break' AND session_date = ? THEN duration_minutes ELSE 0 END), 0) AS today_minutes,
           COALESCE(SUM(CASE WHEN session_type != 'break' THEN duration_minutes ELSE 0 END), 0) AS all_time_minutes,
           COUNT(CASE WHEN session_type != 'break' THEN 1 END) AS total_focus_sessions
         FROM study_sessions
         WHERE user_id = ?`
      )
      .get(today, userId) as {
      today_minutes: number;
      all_time_minutes: number;
      total_focus_sessions: number;
    };

    res.json({
      sessions,
      totals: {
        todayMinutes: Number(totals.today_minutes || 0),
        allTimeMinutes: Number(totals.all_time_minutes || 0),
        totalFocusSessions: Number(totals.total_focus_sessions || 0),
      },
    });
  } catch (err) {
    console.error('Get sessions error:', err);
    res.status(500).json({ error: 'Failed to load study sessions.' });
  }
});

router.post('/sessions', (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const rawSubj = req.body?.subject_id;
    const subjectId = rawSubj === null || rawSubj === '' || rawSubj === undefined ? null : Number(rawSubj);
    const sessionType = VALID_SESSION_TYPES.has(req.body?.session_type)
      ? req.body.session_type
      : 'pomodoro';
    const durationMinutes = Number(req.body?.duration_minutes);
    const sessionDate =
      typeof req.body?.session_date === 'string' && DATE_REGEX.test(req.body.session_date)
        ? req.body.session_date
        : getTodayDateStr();
    const notes = typeof req.body?.notes === 'string' ? req.body.notes.trim() : '';

    if (subjectId !== null && (!Number.isInteger(subjectId) || !verifySubjectOwnership(userId, subjectId))) {
      res.status(400).json({ error: 'Invalid subject selected.' });
      return;
    }
    if (Number.isNaN(durationMinutes) || durationMinutes < 1 || durationMinutes > 600) {
      res.status(400).json({ error: 'Session duration must be between 1 and 600 minutes.' });
      return;
    }

    const result = db
      .prepare(
        `INSERT INTO study_sessions (user_id, subject_id, session_type, duration_minutes, session_date, notes)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(userId, subjectId, sessionType, Math.round(durationMinutes), sessionDate, notes);

    recalculateProgressReport(userId, sessionDate);

    const created = db
      .prepare(
        `SELECT ss.*, s.name AS subject_name, s.color AS subject_color
         FROM study_sessions ss
         LEFT JOIN subjects s ON s.id = ss.subject_id
         WHERE ss.id = ? AND ss.user_id = ?`
      )
      .get(Number(result.lastInsertRowid), userId);

    res.status(201).json({ session: created });
  } catch (err) {
    console.error('Save session error:', err);
    res.status(500).json({ error: 'Failed to save study session.' });
  }
});

router.delete('/sessions/:id', (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const sessionId = Number(req.params.id);
    if (!Number.isInteger(sessionId) || sessionId <= 0) {
      res.status(400).json({ error: 'Invalid session ID.' });
      return;
    }

    const existing = db
      .prepare('SELECT session_date FROM study_sessions WHERE id = ? AND user_id = ?')
      .get(sessionId, userId) as { session_date: string } | undefined;

    if (!existing) {
      res.status(404).json({ error: 'Study session not found.' });
      return;
    }

    db.prepare('DELETE FROM study_sessions WHERE id = ? AND user_id = ?').run(sessionId, userId);
    recalculateProgressReport(userId, existing.session_date);
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete session error:', err);
    res.status(500).json({ error: 'Failed to delete study session.' });
  }
});

// ---------------- NOTES ----------------
router.get('/notes', (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const subjectId = req.query.subjectId ? Number(req.query.subjectId) : null;
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';

    let sql = `
      SELECT n.*, s.name AS subject_name, s.color AS subject_color, s.code AS subject_code
      FROM notes n
      LEFT JOIN subjects s ON s.id = n.subject_id
      WHERE n.user_id = ?
    `;
    const params: (string | number)[] = [userId];

    if (subjectId && Number.isInteger(subjectId) && subjectId > 0) {
      sql += ' AND n.subject_id = ?';
      params.push(subjectId);
    }

    if (search) {
      sql += ' AND (n.title LIKE ? OR n.content LIKE ?)';
      const like = `%${search}%`;
      params.push(like, like);
    }

    sql += ' ORDER BY n.is_pinned DESC, n.updated_at DESC';
    const notes = db.prepare(sql).all(...params);
    res.json({ notes });
  } catch (err) {
    console.error('Get notes error:', err);
    res.status(500).json({ error: 'Failed to fetch notes.' });
  }
});

router.post('/notes', (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const rawSubj = req.body?.subject_id;
    const subjectId = rawSubj === null || rawSubj === '' || rawSubj === undefined ? null : Number(rawSubj);
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    const content = typeof req.body?.content === 'string' ? req.body.content : '';
    const isPinned = req.body?.is_pinned ? 1 : 0;

    if (subjectId !== null && (!Number.isInteger(subjectId) || !verifySubjectOwnership(userId, subjectId))) {
      res.status(400).json({ error: 'Invalid subject selected.' });
      return;
    }
    if (title.length < 1) {
      res.status(400).json({ error: 'Please enter a note title.' });
      return;
    }

    const result = db
      .prepare(
        `INSERT INTO notes (user_id, subject_id, title, content, is_pinned)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(userId, subjectId, title, content, isPinned);

    const created = db
      .prepare(
        `SELECT n.*, s.name AS subject_name, s.color AS subject_color, s.code AS subject_code
         FROM notes n
         LEFT JOIN subjects s ON s.id = n.subject_id
         WHERE n.id = ? AND n.user_id = ?`
      )
      .get(Number(result.lastInsertRowid), userId);

    res.status(201).json({ note: created });
  } catch (err) {
    console.error('Create note error:', err);
    res.status(500).json({ error: 'Failed to save note.' });
  }
});

router.put('/notes/:id', (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const noteId = Number(req.params.id);
    if (!Number.isInteger(noteId) || noteId <= 0) {
      res.status(400).json({ error: 'Invalid note ID.' });
      return;
    }

    const existing = db.prepare('SELECT id FROM notes WHERE id = ? AND user_id = ?').get(noteId, userId);
    if (!existing) {
      res.status(404).json({ error: 'Note not found.' });
      return;
    }

    const rawSubj = req.body?.subject_id;
    const subjectId = rawSubj === null || rawSubj === '' || rawSubj === undefined ? null : Number(rawSubj);
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    const content = typeof req.body?.content === 'string' ? req.body.content : '';
    const isPinned = req.body?.is_pinned ? 1 : 0;

    if (subjectId !== null && (!Number.isInteger(subjectId) || !verifySubjectOwnership(userId, subjectId))) {
      res.status(400).json({ error: 'Invalid subject selected.' });
      return;
    }
    if (title.length < 1) {
      res.status(400).json({ error: 'Please enter a note title.' });
      return;
    }

    db.prepare(
      `UPDATE notes
       SET subject_id = ?, title = ?, content = ?, is_pinned = ?, updated_at = datetime('now')
       WHERE id = ? AND user_id = ?`
    ).run(subjectId, title, content, isPinned, noteId, userId);

    const updated = db
      .prepare(
        `SELECT n.*, s.name AS subject_name, s.color AS subject_color, s.code AS subject_code
         FROM notes n
         LEFT JOIN subjects s ON s.id = n.subject_id
         WHERE n.id = ? AND n.user_id = ?`
      )
      .get(noteId, userId);

    res.json({ note: updated });
  } catch (err) {
    console.error('Update note error:', err);
    res.status(500).json({ error: 'Failed to update note.' });
  }
});

router.patch('/notes/:id/pin', (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const noteId = Number(req.params.id);
    if (!Number.isInteger(noteId) || noteId <= 0) {
      res.status(400).json({ error: 'Invalid note ID.' });
      return;
    }

    const existing = db
      .prepare('SELECT is_pinned FROM notes WHERE id = ? AND user_id = ?')
      .get(noteId, userId) as { is_pinned: number } | undefined;

    if (!existing) {
      res.status(404).json({ error: 'Note not found.' });
      return;
    }

    const nextPinned = existing.is_pinned ? 0 : 1;
    db.prepare("UPDATE notes SET is_pinned = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?").run(
      nextPinned,
      noteId,
      userId
    );

    const updated = db
      .prepare(
        `SELECT n.*, s.name AS subject_name, s.color AS subject_color, s.code AS subject_code
         FROM notes n
         LEFT JOIN subjects s ON s.id = n.subject_id
         WHERE n.id = ? AND n.user_id = ?`
      )
      .get(noteId, userId);

    res.json({ note: updated });
  } catch (err) {
    console.error('Pin note error:', err);
    res.status(500).json({ error: 'Failed to update note pin status.' });
  }
});

router.delete('/notes/:id', (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const noteId = Number(req.params.id);
    if (!Number.isInteger(noteId) || noteId <= 0) {
      res.status(400).json({ error: 'Invalid note ID.' });
      return;
    }

    const result = db.prepare('DELETE FROM notes WHERE id = ? AND user_id = ?').run(noteId, userId);
    if (result.changes === 0) {
      res.status(404).json({ error: 'Note not found.' });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete note error:', err);
    res.status(500).json({ error: 'Failed to delete note.' });
  }
});

// ---------------- PROGRESS & ANALYTICS ----------------
router.get('/progress', (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const today = getTodayDateStr();
    const weekStart = getWeekStartDateStr(today);
    const last7Dates = getLast7Dates(today);

    // Ensure today's progress report row is up to date
    recalculateProgressReport(userId, today);

    const dailyRows = db
      .prepare(
        `SELECT session_date,
                COALESCE(SUM(CASE WHEN session_type != 'break' THEN duration_minutes ELSE 0 END), 0) AS minutes,
                COUNT(CASE WHEN session_type != 'break' THEN 1 END) AS sessions
         FROM study_sessions
         WHERE user_id = ? AND session_date >= ? AND session_date <= ?
         GROUP BY session_date`
      )
      .all(userId, last7Dates[0], last7Dates[6]) as Array<{
      session_date: string;
      minutes: number;
      sessions: number;
    }>;

    const dailyMap = new Map<string, { minutes: number; sessions: number }>();
    for (const r of dailyRows) {
      dailyMap.set(r.session_date, {
        minutes: Number(r.minutes || 0),
        sessions: Number(r.sessions || 0),
      });
    }

    const dailyStats = last7Dates.map((d) => {
      const entry = dailyMap.get(d) || { minutes: 0, sessions: 0 };
      return {
        date: d,
        minutes: entry.minutes,
        hours: Math.round((entry.minutes / 60) * 100) / 100,
        sessions: entry.sessions,
      };
    });

    const subjectBreakdown = db
      .prepare(
        `SELECT s.id, s.name, s.code, s.color, s.priority, s.target_hours_per_week,
          COALESCE((
            SELECT SUM(ss.duration_minutes)
            FROM study_sessions ss
            WHERE ss.subject_id = s.id AND ss.user_id = s.user_id
              AND ss.session_type != 'break'
              AND ss.session_date >= ? AND ss.session_date <= ?
          ), 0) AS week_minutes,
          COALESCE((
            SELECT SUM(ss.duration_minutes)
            FROM study_sessions ss
            WHERE ss.subject_id = s.id AND ss.user_id = s.user_id
              AND ss.session_type != 'break'
          ), 0) AS total_minutes,
          (SELECT COUNT(*) FROM tasks t WHERE t.subject_id = s.id AND t.user_id = s.user_id AND t.status = 'completed') AS completed_tasks,
          (SELECT COUNT(*) FROM tasks t WHERE t.subject_id = s.id AND t.user_id = s.user_id) AS total_tasks
        FROM subjects s
        WHERE s.user_id = ?
        ORDER BY week_minutes DESC, s.name ASC`
      )
      .all(weekStart, today, userId);

    const taskTotals = db
      .prepare(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
                SUM(CASE WHEN status = 'pending' AND due_date < ? THEN 1 ELSE 0 END) AS overdue
         FROM tasks
         WHERE user_id = ?`
      )
      .get(today, userId) as { total: number; completed: number | null; overdue: number | null };

    const scheduleTotals = db
      .prepare(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed
         FROM study_schedules
         WHERE user_id = ?`
      )
      .get(userId) as { total: number; completed: number | null };

    const totalItems = Number(taskTotals.total || 0) + Number(scheduleTotals.total || 0);
    const completedItems = Number(taskTotals.completed || 0) + Number(scheduleTotals.completed || 0);
    const overallCompletionPct = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

    const weekMinutes = dailyStats.reduce((sum, item) => sum + item.minutes, 0);
    const reports = db
      .prepare(
        `SELECT * FROM progress_reports
         WHERE user_id = ?
         ORDER BY report_date DESC
         LIMIT 14`
      )
      .all(userId);

    res.json({
      today,
      weekStart,
      summary: {
        weekMinutes,
        weekHours: Math.round((weekMinutes / 60) * 100) / 100,
        weeklyGoalHours: req.user!.weekly_goal_hours,
        dailyGoalHours: req.user!.daily_goal_hours,
        tasksCompleted: Number(taskTotals.completed || 0),
        tasksTotal: Number(taskTotals.total || 0),
        tasksOverdue: Number(taskTotals.overdue || 0),
        schedulesCompleted: Number(scheduleTotals.completed || 0),
        schedulesTotal: Number(scheduleTotals.total || 0),
        overallCompletionPct,
      },
      dailyStats,
      subjectBreakdown,
      reports,
    });
  } catch (err) {
    console.error('Get progress error:', err);
    res.status(500).json({ error: 'Failed to load progress analytics.' });
  }
});

export default router;
