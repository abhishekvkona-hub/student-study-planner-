import type { Priority } from '../types/planner.ts';

export const SUBJECT_COLOR_OPTIONS = [
  { label: 'Royal Blue', value: '#2563EB' },
  { label: 'Violet', value: '#7C3AED' },
  { label: 'Indigo', value: '#4F46E5' },
  { label: 'Sky Blue', value: '#0284C7' },
  { label: 'Teal', value: '#0D9488' },
  { label: 'Rose', value: '#E11D48' },
];

export function formatMinutesAsDuration(totalMinutes: number): string {
  const mins = Math.max(0, Math.round(totalMinutes));
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  if (hrs === 0) return `${rem}m`;
  if (rem === 0) return `${hrs}h`;
  return `${hrs}h ${rem}m`;
}

export function formatMinutesAsHoursDecimal(totalMinutes: number): string {
  const hrs = totalMinutes / 60;
  return `${hrs.toFixed(1)}h`;
}

export function formatDateShort(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatWeekdayShort(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('en-US', { weekday: 'short' });
}

export function getTodayLocalDateStr(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getRelativeDeadlineText(dueDateStr: string, todayStr: string): string {
  const [ty, tm, td] = todayStr.split('-').map(Number);
  const [dy, dm, dd] = dueDateStr.split('-').map(Number);
  const todayDt = new Date(ty, (tm || 1) - 1, td || 1);
  const dueDt = new Date(dy, (dm || 1) - 1, dd || 1);
  const diffDays = Math.round((dueDt.getTime() - todayDt.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < -1) return `${Math.abs(diffDays)} days overdue`;
  if (diffDays === -1) return '1 day overdue';
  if (diffDays === 0) return 'Due today';
  if (diffDays === 1) return 'Due tomorrow';
  return `In ${diffDays} days`;
}

export function getPriorityLabel(priority: Priority): string {
  if (priority === 'high') return 'High Priority';
  if (priority === 'low') return 'Low Priority';
  return 'Medium Priority';
}

export function getPriorityTextClass(priority: Priority): string {
  if (priority === 'high') return 'text-rose-600 dark:text-rose-400';
  if (priority === 'low') return 'text-slate-500 dark:text-slate-400';
  return 'text-blue-600 dark:text-blue-400';
}
