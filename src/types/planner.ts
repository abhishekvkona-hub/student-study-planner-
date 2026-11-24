export type ThemePreference = 'light' | 'dark';
export type Priority = 'high' | 'medium' | 'low';
export type ScheduleStatus = 'planned' | 'completed' | 'missed';
export type TaskStatus = 'pending' | 'completed';
export type SessionType = 'pomodoro' | 'custom' | 'break';
export type NavTab =
  | 'dashboard'
  | 'subjects'
  | 'schedule'
  | 'tasks'
  | 'timer'
  | 'progress'
  | 'notes';

export interface User {
  id: number;
  name: string;
  email: string;
  daily_goal_hours: number;
  weekly_goal_hours: number;
  theme_preference: ThemePreference;
}

export interface Subject {
  id: number;
  user_id: number;
  name: string;
  code: string;
  instructor: string;
  color: string;
  priority: Priority;
  target_hours_per_week: number;
  created_at: string;
  week_logged_minutes?: number;
  total_logged_minutes?: number;
  pending_tasks?: number;
  notes_count?: number;
}

export interface StudySchedule {
  id: number;
  user_id: number;
  subject_id: number;
  title: string;
  schedule_date: string;
  start_time: string;
  duration_minutes: number;
  status: ScheduleStatus;
  notes: string;
  created_at: string;
  subject_name?: string;
  subject_color?: string;
  subject_code?: string;
}

export interface Task {
  id: number;
  user_id: number;
  subject_id: number | null;
  title: string;
  description: string;
  due_date: string;
  priority: Priority;
  status: TaskStatus;
  completed_at: string | null;
  created_at: string;
  subject_name?: string | null;
  subject_color?: string | null;
  subject_code?: string | null;
  is_overdue?: number;
}

export interface StudySession {
  id: number;
  user_id: number;
  subject_id: number | null;
  session_type: SessionType;
  duration_minutes: number;
  session_date: string;
  notes: string;
  completed_at: string;
  subject_name?: string | null;
  subject_color?: string | null;
}

export interface Note {
  id: number;
  user_id: number;
  subject_id: number | null;
  title: string;
  content: string;
  is_pinned: number;
  updated_at: string;
  created_at: string;
  subject_name?: string | null;
  subject_color?: string | null;
  subject_code?: string | null;
}

export interface ProgressReport {
  id: number;
  user_id: number;
  report_date: string;
  week_start: string;
  total_study_minutes: number;
  tasks_completed: number;
  sessions_completed: number;
  completion_rate: number;
  updated_at: string;
}

export interface DashboardData {
  today: string;
  kpis: {
    totalSubjects: number;
    todayStudyMinutes: number;
    todayStudyHours: number;
    pendingAssignments: number;
    overdueAssignments: number;
    completedTasks: number;
    totalTasks: number;
    weeklyStudyHours: number;
    weeklyGoalHours: number;
    weeklyProgressPct: number;
  };
  todaySchedules: StudySchedule[];
  upcomingTasks: Task[];
  weeklySeries: Array<{
    date: string;
    minutes: number;
    hours: number;
  }>;
}

export interface ProgressData {
  today: string;
  weekStart: string;
  summary: {
    weekMinutes: number;
    weekHours: number;
    weeklyGoalHours: number;
    dailyGoalHours: number;
    tasksCompleted: number;
    tasksTotal: number;
    tasksOverdue: number;
    schedulesCompleted: number;
    schedulesTotal: number;
    overallCompletionPct: number;
  };
  dailyStats: Array<{
    date: string;
    minutes: number;
    hours: number;
    sessions: number;
  }>;
  subjectBreakdown: Array<{
    id: number;
    name: string;
    code: string;
    color: string;
    priority: Priority;
    target_hours_per_week: number;
    week_minutes: number;
    total_minutes: number;
    completed_tasks: number;
    total_tasks: number;
  }>;
  reports: ProgressReport[];
}
