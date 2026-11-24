import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { db } from './db.ts';

export const SESSION_COOKIE_NAME = 'sp_session';
const SESSION_TTL_DAYS = 14;

export interface AuthenticatedUser {
  id: number;
  name: string;
  email: string;
  daily_goal_hours: number;
  weekly_goal_hours: number;
  theme_preference: 'light' | 'dark';
}

export interface AuthRequest extends Request {
  user?: AuthenticatedUser;
  authMethod?: 'bearer' | 'cookie';
}

export function hashSecret(secret: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(secret, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifySecret(secret: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  if (!salt || !keyHex) return false;
  const keyBuf = Buffer.from(keyHex, 'hex');
  const derivedBuf = crypto.scryptSync(secret, salt, 64);
  if (keyBuf.length !== derivedBuf.length) return false;
  return crypto.timingSafeEqual(keyBuf, derivedBuf);
}

export function hashSessionToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function createUserSession(userId: number): { token: string; expiresAt: Date } {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  db.prepare(
    `INSERT INTO user_sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)`
  ).run(userId, tokenHash, expiresAt.toISOString());
  return { token, expiresAt };
}

export function revokeSessionToken(token: string): void {
  const tokenHash = hashSessionToken(token);
  db.prepare(`DELETE FROM user_sessions WHERE token_hash = ?`).run(tokenHash);
}

export function revokeAllUserSessions(userId: number): void {
  db.prepare(`DELETE FROM user_sessions WHERE user_id = ?`).run(userId);
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;
  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx === -1) continue;
    const key = pair.slice(0, idx).trim();
    const val = pair.slice(idx + 1).trim();
    if (key) {
      try {
        cookies[key] = decodeURIComponent(val);
      } catch {
        cookies[key] = val;
      }
    }
  }
  return cookies;
}

export function setSessionCookie(req: Request, res: Response, token: string, expiresAt: Date): void {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    `Expires=${expiresAt.toUTCString()}`,
  ];
  if (isHttps) {
    parts.push('SameSite=None', 'Secure', 'Partitioned');
  } else {
    parts.push('SameSite=Lax');
  }
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function clearSessionCookie(req: Request, res: Response): void {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
  ];
  if (isHttps) {
    parts.push('SameSite=None', 'Secure', 'Partitioned');
  } else {
    parts.push('SameSite=Lax');
  }
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function extractTokenFromRequest(req: Request): { token: string | null; method: 'bearer' | 'cookie' | null } {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice('Bearer '.length).trim();
    if (token) return { token, method: 'bearer' };
  }
  const cookies = parseCookies(req.headers.cookie);
  const cookieToken = cookies[SESSION_COOKIE_NAME];
  if (cookieToken) {
    return { token: cookieToken, method: 'cookie' };
  }
  return { token: null, method: null };
}

function isMutatingMethod(method: string): boolean {
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase());
}

function verifyCsrfForCookie(req: Request): boolean {
  const requestedWith = req.headers['x-requested-with'];
  if (requestedWith === 'ScholarPlan') {
    return true;
  }
  const origin = req.headers.origin;
  const host = (req.headers['x-forwarded-host'] as string | undefined) || req.headers.host;
  if (origin && host) {
    try {
      const originHost = new URL(origin).host;
      return originHost === host;
    } catch {
      return false;
    }
  }
  return false;
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const { token, method } = extractTokenFromRequest(req);
  if (!token || !method) {
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return;
  }

  if (method === 'cookie' && isMutatingMethod(req.method) && !verifyCsrfForCookie(req)) {
    res.status(403).json({ error: 'Invalid request origin.' });
    return;
  }

  const tokenHash = hashSessionToken(token);
  const row = db
    .prepare(
      `SELECT u.id, u.name, u.email, u.daily_goal_hours, u.weekly_goal_hours, u.theme_preference, s.expires_at
       FROM user_sessions s
       INNER JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?`
    )
    .get(tokenHash) as (AuthenticatedUser & { expires_at: string }) | undefined;

  if (!row) {
    res.status(401).json({ error: 'Session expired or invalid. Please sign in again.' });
    return;
  }

  if (new Date(row.expires_at).getTime() <= Date.now()) {
    db.prepare(`DELETE FROM user_sessions WHERE token_hash = ?`).run(tokenHash);
    res.status(401).json({ error: 'Session expired. Please sign in again.' });
    return;
  }

  req.user = {
    id: row.id,
    name: row.name,
    email: row.email,
    daily_goal_hours: row.daily_goal_hours,
    weekly_goal_hours: row.weekly_goal_hours,
    theme_preference: row.theme_preference,
  };
  req.authMethod = method;
  next();
}
