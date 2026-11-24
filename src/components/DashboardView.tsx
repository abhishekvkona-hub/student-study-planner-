import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  BookMarked,
  CalendarClock,
  CheckCircle2,
  Circle,
  Clock,
  AlertCircle,
  Play,
} from 'lucide-react';
import type { ChartConfiguration } from 'chart.js';
import { apiRequest } from '../lib/api.ts';
import {
  formatDateShort,
  formatMinutesAsDuration,
  formatWeekdayShort,
  getPriorityLabel,
  getPriorityTextClass,
  getRelativeDeadlineText,
} from '../lib/format.ts';
import { ChartCanvas } from './ChartCanvas.tsx';
import type { DashboardData, NavTab, ThemePreference, User } from '../types/planner.ts';

interface DashboardViewProps {
  user: User;
  theme: ThemePreference;
  onNavigate: (tab: NavTab) => void;
}

export function DashboardView({ user, theme, onNavigate }: DashboardViewProps) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const loadDashboard = useCallback(async () => {
    try {
      setError('');
      const res = await apiRequest<DashboardData>('/api/dashboard');
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load dashboard.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  async function handleToggleTask(taskId: number) {
    setTogglingId(taskId);
    try {
      await apiRequest(`/api/tasks/${taskId}/toggle`, { method: 'PATCH' });
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update task.');
    } finally {
      setTogglingId(null);
    }
  }

  async function handleToggleSchedule(scheduleId: number, currentStatus: string) {
    const nextStatus = currentStatus === 'completed' ? 'planned' : 'completed';
    try {
      await apiRequest(`/api/schedules/${scheduleId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update schedule.');
    }
  }

  const weeklyChartConfig = useMemo<ChartConfiguration>(() => {
    const isDark = theme === 'dark';
    const labels = (data?.weeklySeries || []).map((d) => formatWeekdayShort(d.date));
    const hours = (data?.weeklySeries || []).map((d) => d.hours);
    const goalLine = (data?.weeklySeries || []).map(() => user.daily_goal_hours);

    return {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Study Hours',
            data: hours,
            backgroundColor: isDark ? 'rgba(99, 102, 241, 0.85)' : 'rgba(37, 99, 235, 0.88)',
            borderRadius: 6,
            maxBarThickness: 36,
          },
          {
            type: 'line',
            label: 'Daily Goal',
            data: goalLine,
            borderColor: isDark ? '#a78bfa' : '#7c3aed',
            borderWidth: 2,
            borderDash: [5, 5],
            pointRadius: 0,
            fill: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: 'top',
            align: 'end',
            labels: {
              color: isDark ? '#94a3b8' : '#475569',
              boxWidth: 12,
              font: { family: 'DM Sans', size: 12 },
            },
          },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y} hrs`,
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: isDark ? '#94a3b8' : '#64748b', font: { family: 'DM Sans', size: 12 } },
          },
          y: {
            beginAtZero: true,
            grid: { color: isDark ? 'rgba(148,163,184,0.12)' : 'rgba(15,23,42,0.06)' },
            ticks: {
              color: isDark ? '#94a3b8' : '#64748b',
              font: { family: 'JetBrains Mono', size: 11 },
              callback: (v) => `${v}h`,
            },
          },
        },
      },
    };
  }, [data, theme, user.daily_goal_hours]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-24 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
            />
          ))}
        </div>
        <div className="h-72 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" />
      </div>
    );
  }

  const kpis = data?.kpis;

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/50 dark:text-rose-300">
          {error}
        </div>
      )}

      {/* Welcome Banner */}
      <section className="flex flex-col justify-between gap-4 rounded-xl border border-slate-200 bg-white p-6 sm:flex-row sm:items-center dark:border-slate-800 dark:bg-slate-900">
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {data?.today ? formatDateShort(data.today) : 'Today'} · Daily Goal{' '}
            <span className="font-mono tabular-nums">{user.daily_goal_hours}h</span>
          </p>
          <h2 className="font-display mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Welcome back, {user.name}
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {kpis && kpis.overdueAssignments > 0
              ? `You have ${kpis.overdueAssignments} overdue assignment${kpis.overdueAssignments === 1 ? '' : 's'} and ${kpis.pendingAssignments} total pending tasks.`
              : 'Your study plan is on track. Start a focus session or review today’s timetable.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => onNavigate('timer')}
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-violet-600 px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-95 whitespace-nowrap shrink-0"
          >
            <Play className="h-4 w-4" />
            Start Focus Timer
          </button>
          <button
            type="button"
            onClick={() => onNavigate('schedule')}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 whitespace-nowrap shrink-0"
          >
            Plan Schedule
          </button>
        </div>
      </section>

      {/* 4-Column KPI Strip */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>Total Subjects</span>
            <BookMarked className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          </div>
          <p className="font-mono mt-3 text-3xl font-bold tabular-nums text-slate-900 dark:text-white">
            {kpis?.totalSubjects ?? 0}
          </p>
          <button
            type="button"
            onClick={() => onNavigate('subjects')}
            className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
          >
            Manage subjects <ArrowRight className="h-3 w-3" />
          </button>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>Today&apos;s Study Hours</span>
            <Clock className="h-4 w-4 text-violet-600 dark:text-violet-400" />
          </div>
          <p className="font-mono mt-3 text-3xl font-bold tabular-nums text-slate-900 dark:text-white">
            {formatMinutesAsDuration(kpis?.todayStudyMinutes ?? 0)}
          </p>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Target: <span className="font-mono tabular-nums">{user.daily_goal_hours}h</span> today
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>Pending Assignments</span>
            <AlertCircle
              className={`h-4 w-4 ${
                (kpis?.overdueAssignments ?? 0) > 0
                  ? 'text-rose-600 dark:text-rose-400'
                  : 'text-amber-600 dark:text-amber-400'
              }`}
            />
          </div>
          <p className="font-mono mt-3 text-3xl font-bold tabular-nums text-slate-900 dark:text-white">
            {kpis?.pendingAssignments ?? 0}
          </p>
          <p
            className={`mt-2 text-xs font-medium ${
              (kpis?.overdueAssignments ?? 0) > 0
                ? 'text-rose-600 dark:text-rose-400'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            {(kpis?.overdueAssignments ?? 0) > 0
              ? `${kpis?.overdueAssignments} overdue`
              : 'No overdue tasks'}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>Completed Tasks</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <p className="font-mono mt-3 text-3xl font-bold tabular-nums text-slate-900 dark:text-white">
            {kpis?.completedTasks ?? 0}
          </p>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Out of <span className="font-mono tabular-nums">{kpis?.totalTasks ?? 0}</span> total
            tasks
          </p>
        </div>
      </section>

      {/* Weekly Progress Bar + Chart */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <h3 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
              Weekly Study Progress
            </h3>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              Logged focus hours over the past 7 days compared against your daily goal.
            </p>
          </div>
          <div className="text-left sm:text-right">
            <p className="font-mono text-lg font-semibold tabular-nums text-slate-900 dark:text-white">
              {kpis?.weeklyStudyHours ?? 0}h / {kpis?.weeklyGoalHours ?? user.weekly_goal_hours}h
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              <span className="font-mono tabular-nums">{kpis?.weeklyProgressPct ?? 0}%</span> of
              weekly goal reached
            </p>
          </div>
        </div>

        <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div
            className="h-full rounded-full bg-gradient-to-r from-blue-600 to-violet-600 transition-all duration-300"
            style={{ width: `${kpis?.weeklyProgressPct ?? 0}%` }}
          />
        </div>

        <div className="mt-6">
          <ChartCanvas config={weeklyChartConfig} className="h-64 w-full" />
        </div>
      </section>

      {/* Today's Schedule + Upcoming Tasks Split */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Today's Schedule */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-200 pb-4 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                Today&apos;s Study Schedule
              </h3>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('schedule')}
              className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400 whitespace-nowrap shrink-0"
            >
              View Calendar
            </button>
          </div>

          {!data?.todaySchedules.length ? (
            <div className="py-10 text-center">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                No study sessions scheduled for today yet.
              </p>
              <button
                type="button"
                onClick={() => onNavigate('schedule')}
                className="mt-3 rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Add Study Block
              </button>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.todaySchedules.map((sc) => (
                <li key={sc.id} className="flex items-center justify-between gap-4 py-3.5">
                  <div className="flex items-start gap-3 min-w-0">
                    <button
                      type="button"
                      onClick={() => void handleToggleSchedule(sc.id, sc.status)}
                      className="mt-0.5 text-slate-400 transition-colors hover:text-blue-600 dark:hover:text-blue-400"
                      aria-label={
                        sc.status === 'completed'
                          ? 'Mark schedule planned'
                          : 'Mark schedule completed'
                      }
                    >
                      {sc.status === 'completed' ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <Circle className="h-5 w-5" />
                      )}
                    </button>
                    <div className="min-w-0">
                      <p
                        className={`truncate text-sm font-medium ${
                          sc.status === 'completed'
                            ? 'line-through text-slate-400 dark:text-slate-500'
                            : 'text-slate-900 dark:text-slate-100'
                        }`}
                      >
                        {sc.title}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                        <span
                          className="inline-block h-2 w-2 rounded-full"
                          style={{ backgroundColor: sc.subject_color || '#2563EB' }}
                        />
                        <span>{sc.subject_name}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">{sc.start_time}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          {formatMinutesAsDuration(sc.duration_minutes)}
                        </span>
                      </p>
                    </div>
                  </div>
                  <span
                    className={`text-xs font-medium whitespace-nowrap shrink-0 ${
                      sc.status === 'completed'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : sc.status === 'missed'
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-blue-600 dark:text-blue-400'
                    }`}
                  >
                    {sc.status === 'completed'
                      ? 'Completed'
                      : sc.status === 'missed'
                        ? 'Missed'
                        : 'Planned'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Upcoming Assignments */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-200 pb-4 dark:border-slate-800">
            <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              Upcoming &amp; Overdue Assignments
            </h3>
            <button
              type="button"
              onClick={() => onNavigate('tasks')}
              className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400 whitespace-nowrap shrink-0"
            >
              All Assignments
            </button>
          </div>

          {!data?.upcomingTasks.length ? (
            <div className="py-10 text-center">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                No pending assignments right now.
              </p>
              <button
                type="button"
                onClick={() => onNavigate('tasks')}
                className="mt-3 rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Add Assignment
              </button>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.upcomingTasks.map((task) => {
                const isOverdue = data.today ? task.due_date < data.today : false;
                return (
                  <li key={task.id} className="flex items-center justify-between gap-4 py-3.5">
                    <div className="flex items-start gap-3 min-w-0">
                      <button
                        type="button"
                        disabled={togglingId === task.id}
                        onClick={() => void handleToggleTask(task.id)}
                        className="mt-0.5 text-slate-400 transition-colors hover:text-blue-600 disabled:opacity-50 dark:hover:text-blue-400"
                        aria-label={`Mark ${task.title} complete`}
                      >
                        <Circle className="h-5 w-5" />
                      </button>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                          {task.title}
                        </p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                          {task.subject_name && (
                            <>
                              <span>{task.subject_name}</span>
                              <span aria-hidden="true">·</span>
                            </>
                          )}
                          <span className={getPriorityTextClass(task.priority)}>
                            {getPriorityLabel(task.priority)}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">
                            {formatDateShort(task.due_date)}
                          </span>
                        </p>
                      </div>
                    </div>
                    <span
                      className={`text-xs font-medium whitespace-nowrap shrink-0 ${
                        isOverdue
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {data.today ? getRelativeDeadlineText(task.due_date, data.today) : ''}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
