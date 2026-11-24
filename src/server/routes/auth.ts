import { Router } from 'express';
import type { Request, Response } from 'express';
import { db } from '../db.ts';
import {
  clearSessionCookie,
  createUserSession,
  extractTokenFromRequest,
  hashSecret,
  requireAuth,
  revokeAllUserSessions,
  revokeSessionToken,
  setSessionCookie,
  verifySecret,
} from '../security.ts';
import type { AuthRequest } from '../security.ts';

const router = Router();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface UserRow {
  id: number;
  name: string;
  email: string;
  password_hash: string;
  recovery_question: string;
  recovery_answer_hash: string;
  daily_goal_hours: number;
  weekly_goal_hours: number;
  theme_preference: 'light' | 'dark';
}

function sanitizeUser(row: UserRow) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    daily_goal_hours: row.daily_goal_hours,
    weekly_goal_hours: row.weekly_goal_hours,
    theme_preference: row.theme_preference,
  };
}

router.post('/register', (req: Request, res: Response) => {
  try {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const recoveryQuestion =
      typeof req.body?.recoveryQuestion === 'string' ? req.body.recoveryQuestion.trim() : '';
    const recoveryAnswer =
      typeof req.body?.recoveryAnswer === 'string' ? req.body.recoveryAnswer.trim().toLowerCase() : '';

    if (name.length < 2) {
      res.status(400).json({ error: 'Please enter your full name (at least 2 characters).' });
      return;
    }
    if (!EMAIL_REGEX.test(email)) {
      res.status(400).json({ error: 'Please enter a valid email address.' });
      return;
    }
    if (password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters long.' });
      return;
    }
    if (recoveryQuestion.length < 5) {
      res.status(400).json({ error: 'Please choose or enter a security recovery question.' });
      return;
    }
    if (recoveryAnswer.length < 2) {
      res.status(400).json({ error: 'Please provide an answer to your recovery question.' });
      return;
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      res.status(409).json({ error: 'An account with this email already exists. Please sign in.' });
      return;
    }

    const passwordHash = hashSecret(password);
    const recoveryAnswerHash = hashSecret(recoveryAnswer);

    const insertResult = db
      .prepare(
        `INSERT INTO users (name, email, password_hash, recovery_question, recovery_answer_hash)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(name, email, passwordHash, recoveryQuestion, recoveryAnswerHash);

    const userId = Number(insertResult.lastInsertRowid);
    const createdUser = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as unknown as UserRow;
    const { token, expiresAt } = createUserSession(userId);
    setSessionCookie(req, res, token, expiresAt);

    res.status(201).json({
      user: sanitizeUser(createdUser),
      token,
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Could not create student account. Please try again.' });
  }
});

router.post('/login', (req: Request, res: Response) => {
  try {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!EMAIL_REGEX.test(email) || !password) {
      res.status(400).json({ error: 'Please enter both your email address and password.' });
      return;
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined;
    if (!user || !verifySecret(password, user.password_hash)) {
      res.status(401).json({ error: 'Incorrect email or password.' });
      return;
    }

    const { token, expiresAt } = createUserSession(user.id);
    setSessionCookie(req, res, token, expiresAt);

    res.json({
      user: sanitizeUser(user),
      token,
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Unable to sign in right now. Please try again.' });
  }
});

router.post('/logout', (req: Request, res: Response) => {
  try {
    const { token } = extractTokenFromRequest(req);
    if (token) {
      revokeSessionToken(token);
    }
    clearSessionCookie(req, res);
    res.json({ ok: true });
  } catch (err) {
    console.error('Logout error:', err);
    res.status(500).json({ error: 'Failed to sign out cleanly.' });
  }
});

router.get('/me', requireAuth, (req: AuthRequest, res: Response) => {
  res.json({ user: req.user });
});

router.patch('/preferences', requireAuth, (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const name =
      typeof req.body?.name === 'string' && req.body.name.trim().length >= 2
        ? req.body.name.trim()
        : req.user!.name;

    const dailyGoal =
      req.body?.daily_goal_hours !== undefined
        ? Number(req.body.daily_goal_hours)
        : req.user!.daily_goal_hours;

    const weeklyGoal =
      req.body?.weekly_goal_hours !== undefined
        ? Number(req.body.weekly_goal_hours)
        : req.user!.weekly_goal_hours;

    const themePreference =
      req.body?.theme_preference === 'dark' || req.body?.theme_preference === 'light'
        ? req.body.theme_preference
        : req.user!.theme_preference;

    if (Number.isNaN(dailyGoal) || dailyGoal < 0.5 || dailyGoal > 16) {
      res.status(400).json({ error: 'Daily study goal must be between 0.5 and 16 hours.' });
      return;
    }
    if (Number.isNaN(weeklyGoal) || weeklyGoal < 1 || weeklyGoal > 100) {
      res.status(400).json({ error: 'Weekly study goal must be between 1 and 100 hours.' });
      return;
    }

    db.prepare(
      `UPDATE users
       SET name = ?, daily_goal_hours = ?, weekly_goal_hours = ?, theme_preference = ?
       WHERE id = ?`
    ).run(name, dailyGoal, weeklyGoal, themePreference, userId);

    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as unknown as UserRow;
    res.json({ user: sanitizeUser(updated) });
  } catch (err) {
    console.error('Update preferences error:', err);
    res.status(500).json({ error: 'Failed to save preferences.' });
  }
});

router.post('/forgot-password/question', (req: Request, res: Response) => {
  try {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (!EMAIL_REGEX.test(email)) {
      res.status(400).json({ error: 'Please enter a valid email address.' });
      return;
    }

    const user = db
      .prepare('SELECT recovery_question FROM users WHERE email = ?')
      .get(email) as { recovery_question: string } | undefined;

    if (!user) {
      res.status(404).json({ error: 'No student account found for that email address.' });
      return;
    }

    res.json({ recoveryQuestion: user.recovery_question });
  } catch (err) {
    console.error('Forgot password question error:', err);
    res.status(500).json({ error: 'Unable to look up account recovery question.' });
  }
});

router.post('/forgot-password/reset', (req: Request, res: Response) => {
  try {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const recoveryAnswer =
      typeof req.body?.recoveryAnswer === 'string' ? req.body.recoveryAnswer.trim().toLowerCase() : '';
    const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';

    if (!EMAIL_REGEX.test(email)) {
      res.status(400).json({ error: 'Please enter a valid email address.' });
      return;
    }
    if (!recoveryAnswer) {
      res.status(400).json({ error: 'Please enter your security recovery answer.' });
      return;
    }
    if (newPassword.length < 8) {
      res.status(400).json({ error: 'New password must be at least 8 characters long.' });
      return;
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined;
    if (!user) {
      res.status(404).json({ error: 'No student account found for that email address.' });
      return;
    }

    if (!verifySecret(recoveryAnswer, user.recovery_answer_hash)) {
      res.status(401).json({ error: 'Recovery answer does not match our records.' });
      return;
    }

    const newPasswordHash = hashSecret(newPassword);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newPasswordHash, user.id);
    revokeAllUserSessions(user.id);

    res.json({ ok: true, message: 'Password updated successfully. You can now sign in.' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Could not reset password. Please try again.' });
  }
});

export default router;
