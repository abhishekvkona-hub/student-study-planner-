import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ChartConfiguration } from 'chart.js';
import { apiRequest } from '../lib/api.ts';
import {
  formatDateShort,
  formatMinutesAsDuration,
  formatMinutesAsHoursDecimal,
  formatWeekdayShort,
} from '../lib/format.ts';
import { ChartCanvas } from './ChartCanvas.tsx';
import type { ProgressData, ThemePreference } from '../types/planner.ts';

interface ProgressViewProps {
  theme: ThemePreference;
}

export function ProgressView({ theme }: ProgressViewProps) {
  const [data, setData] = useState<ProgressData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadProgress = useCallback(async () => {
    try {
      setError('');
      const res = await apiRequest<ProgressData>('/api/progress');
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load progress reports.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProgress();
  }, [loadProgress]);

  const dailyBarConfig = useMemo<ChartConfiguration>(() => {
    const isDark = theme === 'dark';
    const labels = (data?.dailyStats || []).map((d) => formatWeekdayShort(d.date));
    const hours = (data?.dailyStats || []).map((d) => d.hours);
    const goalLine = (data?.dailyStats || []).map(() => data?.summary.dailyGoalHours ?? 4);

    return {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Logged Hours',
            data: hours,
            backgroundColor: isDark ? 'rgba(59, 130, 246, 0.85)' : 'rgba(37, 99, 235, 0.9)',
            borderRadius: 6,
            maxBarThickness: 36,
          },
          {
            type: 'line',
            label: 'Daily Goal',
            data: goalLine,
            borderColor: isDark ? '#c084fc' : '#7c3aed',
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
            position: 'top',
            align: 'end',
            labels: { color: isDark ? '#94a3b8' : '#475569', boxWidth: 12 },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: isDark ? '#94a3b8' : '#64748b' },
          },
          y: {
            beginAtZero: true,
            grid: { color: isDark ? 'rgba(148,163,184,0.12)' : 'rgba(15,23,42,0.06)' },
            ticks: {
              color: isDark ? '#94a3b8' : '#64748b',
              callback: (v) => `${v}h`,
            },
          },
        },
      },
    };
  }, [data, theme]);

  const subjectDoughnutConfig = useMemo<ChartConfiguration>(() => {
    const isDark = theme === 'dark';
    const subjectsWithTime = (data?.subjectBreakdown || []).filter((s) => s.total_minutes > 0);
    const labels =
      subjectsWithTime.length > 0 ? subjectsWithTime.map((s) => s.name) : ['No sessions yet'];
    const values =
      subjectsWithTime.length > 0
        ? subjectsWithTime.map((s) => Math.round((s.total_minutes / 60) * 100) / 100)
        : [1];
    const colors =
      subjectsWithTime.length > 0
        ? subjectsWithTime.map((s) => s.color || '#2563EB')
        : [isDark ? '#1e293b' : '#e2e8f0'];

    return {
      type: 'doughnut',
      data: {
        labels,
        datasets: [
          {
            data: values,
            backgroundColor: colors,
            borderWidth: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '66%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: isDark ? '#cbd5e1' : '#334155',
              boxWidth: 12,
              padding: 16,
            },
          },
          tooltip: {
            callbacks: {
              label: (ctx) =>
                subjectsWithTime.length > 0
                  ? `${ctx.label}: ${ctx.parsed} hrs`
                  : 'Log a study session to see subject breakdown',
            },
          },
        },
      },
    };
  }, [data, theme]);

  const subjectTargetConfig = useMemo<ChartConfiguration>(() => {
    const isDark = theme === 'dark';
    const items = data?.subjectBreakdown || [];
    const labels = items.map((s) => s.name);
    const logged = items.map((s) => Math.round((s.week_minutes / 60) * 100) / 100);
    const targets = items.map((s) => s.target_hours_per_week);

    return {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Logged This Week (h)',
            data: logged,
            backgroundColor: isDark ? 'rgba(99, 102, 241, 0.9)' : 'rgba(37, 99, 235, 0.9)',
            borderRadius: 4,
          },
          {
            label: 'Weekly Target (h)',
            data: targets,
            backgroundColor: isDark ? 'rgba(148, 163, 184, 0.25)' : 'rgba(148, 163, 184, 0.35)',
            borderRadius: 4,
          },
        ],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            align: 'end',
            labels: { color: isDark ? '#94a3b8' : '#475569', boxWidth: 12 },
          },
        },
        scales: {
          x: {
            beginAtZero: true,
            grid: { color: isDark ? 'rgba(148,163,184,0.12)' : 'rgba(15,23,42,0.06)' },
            ticks: { color: isDark ? '#94a3b8' : '#64748b', callback: (v) => `${v}h` },
          },
          y: {
            grid: { display: false },
            ticks: { color: isDark ? '#cbd5e1' : '#334155' },
          },
        },
      },
    };
  }, [data, theme]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
            />
          ))}
        </div>
        <div className="h-80 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" />
      </div>
    );
  }

  const summary = data?.summary;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
          Progress Tracking &amp; Reports
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Daily study statistics, weekly progress reports, and subject-wise goal attainment.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/50 dark:text-rose-300">
          {error}
        </div>
      )}

      {/* Summary Stats */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Last 7 Days Study Time
          </p>
          <p className="font-mono mt-2 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            {summary?.weekHours ?? 0}h
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Goal: <span className="font-mono tabular-nums">{summary?.weeklyGoalHours ?? 20}h</span>
            /week
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Overall Completion Rate
          </p>
          <p className="font-mono mt-2 text-2xl font-bold tabular-nums text-blue-600 dark:text-blue-400">
            {summary?.overallCompletionPct ?? 0}%
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Tasks &amp; study schedules combined
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Assignments Completed
          </p>
          <p className="font-mono mt-2 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            {summary?.tasksCompleted ?? 0} / {summary?.tasksTotal ?? 0}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {summary?.tasksOverdue ?? 0} overdue
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Schedules Completed
          </p>
          <p className="font-mono mt-2 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            {summary?.schedulesCompleted ?? 0} / {summary?.schedulesTotal ?? 0}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Planned study blocks finished
          </p>
        </div>
      </section>

      {/* Charts Row */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-7 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
            Daily Study Hours (7-Day Report)
          </h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Completed focus minutes converted to hours per day
          </p>
          <div className="mt-5">
            <ChartCanvas config={dailyBarConfig} className="h-64 w-full" />
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-5 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
            Study Time by Subject
          </h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            All-time distribution across your subjects
          </p>
          <div className="mt-5">
            <ChartCanvas config={subjectDoughnutConfig} className="h-64 w-full" />
          </div>
        </div>
      </section>

      {/* Subject-Wise Progress */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
          Subject-Wise Weekly Goal Comparison
        </h3>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          Actual weekly study hours compared with each subject&apos;s target hours
        </p>
        {data && data.subjectBreakdown.length > 0 ? (
          <div className="mt-5">
            <ChartCanvas config={subjectTargetConfig} className="h-64 w-full" />
          </div>
        ) : (
          <p className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
            Add subjects to compare weekly study targets against actual focus hours.
          </p>
        )}
      </section>

      {/* Saved Daily Progress Reports Table */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-200 px-6 py-4 dark:border-slate-800">
          <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
            Daily Progress Report History
          </h3>
        </div>
        {!data?.reports.length ? (
          <p className="px-6 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
            No daily reports generated yet. Complete tasks or study sessions to populate reports.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
                <tr>
                  <th className="px-6 py-3">Date</th>
                  <th className="px-6 py-3 text-right">Study Time</th>
                  <th className="px-6 py-3 text-right">Sessions</th>
                  <th className="px-6 py-3 text-right">Tasks Done</th>
                  <th className="px-6 py-3 text-right">Completion Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.reports.map((rep) => (
                  <tr key={rep.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <td className="px-6 py-3 font-mono text-xs tabular-nums text-slate-900 dark:text-slate-100">
                      {formatDateShort(rep.report_date)}
                    </td>
                    <td className="px-6 py-3 text-right font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300">
                      {formatMinutesAsDuration(rep.total_study_minutes)} (
                      {formatMinutesAsHoursDecimal(rep.total_study_minutes)})
                    </td>
                    <td className="px-6 py-3 text-right font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300">
                      {rep.sessions_completed}
                    </td>
                    <td className="px-6 py-3 text-right font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300">
                      {rep.tasks_completed}
                    </td>
                    <td className="px-6 py-3 text-right font-mono text-xs font-semibold tabular-nums text-blue-600 dark:text-blue-400">
                      {rep.completion_rate}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
