import { useState } from 'react';
import type { FormEvent } from 'react';
import { BookOpen, Eye, EyeOff, Moon, Sun, ArrowLeft } from 'lucide-react';
import { apiRequest, setAuthToken } from '../lib/api.ts';
import type { ThemePreference, User } from '../types/planner.ts';

type AuthMode = 'login' | 'register' | 'forgot';

const RECOVERY_QUESTIONS = [
  'What was the name of your first school?',
  'What city were you born in?',
  'What is your favorite academic subject?',
  'What is the name of your favorite childhood teacher?',
  'What was the title of the first book you loved?',
];

interface AuthViewProps {
  theme: ThemePreference;
  onToggleTheme: () => void;
  onAuthenticated: (user: User) => void;
}

export function AuthView({ theme, onToggleTheme, onAuthenticated }: AuthViewProps) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [heroImgFailed, setHeroImgFailed] = useState(false);

  // Shared fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Register fields
  const [name, setName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [recoveryQuestion, setRecoveryQuestion] = useState(RECOVERY_QUESTIONS[0]);
  const [recoveryAnswer, setRecoveryAnswer] = useState('');

  // Forgot password fields
  const [forgotStep, setForgotStep] = useState<1 | 2>(1);
  const [fetchedQuestion, setFetchedQuestion] = useState('');
  const [forgotAnswer, setForgotAnswer] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  function switchMode(next: AuthMode) {
    setMode(next);
    setError('');
    setSuccessMsg('');
    setForgotStep(1);
  }

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (!email.trim() || !password) {
      setError('Please enter both your email address and password.');
      return;
    }

    setLoading(true);
    try {
      const res = await apiRequest<{ user: User; token: string }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), password }),
      });
      setAuthToken(res.token);
      onAuthenticated(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed.');
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (name.trim().length < 2) {
      setError('Please enter your full name (at least 2 characters).');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (recoveryAnswer.trim().length < 2) {
      setError('Please provide an answer to your recovery question.');
      return;
    }

    setLoading(true);
    try {
      const res = await apiRequest<{ user: User; token: string }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          password,
          recoveryQuestion,
          recoveryAnswer: recoveryAnswer.trim(),
        }),
      });
      setAuthToken(res.token);
      onAuthenticated(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotLookup(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (!email.trim()) {
      setError('Please enter your account email address.');
      return;
    }

    setLoading(true);
    try {
      const res = await apiRequest<{ recoveryQuestion: string }>(
        '/api/auth/forgot-password/question',
        {
          method: 'POST',
          body: JSON.stringify({ email: email.trim() }),
        }
      );
      setFetchedQuestion(res.recoveryQuestion);
      setForgotStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not find that account.');
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotReset(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (!forgotAnswer.trim()) {
      setError('Please enter your security recovery answer.');
      return;
    }
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters long.');
      return;
    }

    setLoading(true);
    try {
      const res = await apiRequest<{ message: string }>('/api/auth/forgot-password/reset', {
        method: 'POST',
        body: JSON.stringify({
          email: email.trim(),
          recoveryAnswer: forgotAnswer.trim(),
          newPassword,
        }),
      });
      setSuccessMsg(res.message || 'Password updated. Please sign in.');
      setMode('login');
      setPassword('');
      setForgotAnswer('');
      setNewPassword('');
      setForgotStep(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reset password.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto grid min-h-screen max-w-[1440px] grid-cols-1 lg:grid-cols-12">
        {/* Left Editorial Panel */}
        <div className="relative hidden overflow-hidden bg-slate-900 lg:col-span-5 lg:flex lg:flex-col lg:justify-between">
          {!heroImgFailed ? (
            <img
              src="/src/assets/images/study_workspace_hero_1795507768110.jpg"
              alt="Minimalist student study desk with open notebook and laptop by natural daylight window"
              referrerPolicy="no-referrer"
              onError={() => setHeroImgFailed(true)}
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-blue-900 via-indigo-950 to-slate-950" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/45 to-slate-950/35" />

          <div className="relative z-10 flex items-center justify-between p-10">
            <div className="flex items-center gap-2.5 text-white">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white">
                <BookOpen className="h-5 w-5" />
              </div>
              <span className="font-display text-lg font-bold tracking-tight whitespace-nowrap">
                ScholarPlan
              </span>
            </div>
          </div>

          <div className="relative z-10 p-10 text-white">
            <h1 className="font-display text-3xl leading-tight font-bold tracking-tight text-balance">
              Structured focus for every semester.
            </h1>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-slate-200">
              Organize subjects, plan daily study blocks, stay ahead of assignment deadlines, run
              Pomodoro focus timers, and monitor weekly academic progress in one workspace.
            </p>
            <div className="mt-8 grid grid-cols-2 gap-6 border-t border-white/15 pt-6 text-xs text-slate-200">
              <div>
                <p className="font-semibold text-white">Schedule & Deadlines</p>
                <p className="mt-1 text-slate-300">
                  Calendar timetable paired with overdue alerts.
                </p>
              </div>
              <div>
                <p className="font-semibold text-white">Pomodoro & Analytics</p>
                <p className="mt-1 text-slate-300">
                  Logged focus hours mapped against subject goals.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Form Panel */}
        <div className="flex flex-col justify-between px-6 py-8 sm:px-12 lg:col-span-7 lg:px-20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 lg:hidden">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
                <BookOpen className="h-4 w-4" />
              </div>
              <span className="font-display text-base font-bold text-slate-900 dark:text-white">
                ScholarPlan
              </span>
            </div>
            <div className="ml-auto">
              <button
                type="button"
                onClick={onToggleTheme}
                className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
                aria-label="Toggle light or dark theme"
              >
                {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
              </button>
            </div>
          </div>

          <div className="mx-auto my-8 w-full max-w-md">
            {/* Segmented Switcher */}
            {mode !== 'forgot' ? (
              <div className="mb-8 grid grid-cols-2 gap-1 rounded-lg bg-slate-200/70 p-1 dark:bg-slate-800">
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className={`rounded-md py-2 text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                    mode === 'login'
                      ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => switchMode('register')}
                  className={`rounded-md py-2 text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                    mode === 'register'
                      ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  Create Account
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => switchMode('login')}
                className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Sign In
              </button>
            )}

            <h2 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              {mode === 'login' && 'Welcome back'}
              {mode === 'register' && 'Create your student account'}
              {mode === 'forgot' && 'Reset your password'}
            </h2>
            <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
              {mode === 'login' && 'Sign in to access your study schedule, tasks, and notes.'}
              {mode === 'register' &&
                'Set up your personal academic workspace and recovery question.'}
              {mode === 'forgot' &&
                (forgotStep === 1
                  ? 'Enter your registered email to verify your recovery question.'
                  : 'Answer your security question and choose a new password.')}
            </p>

            {error && (
              <div
                role="alert"
                className="mt-5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/50 dark:text-rose-300"
              >
                {error}
              </div>
            )}

            {successMsg && (
              <div
                role="status"
                className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/50 dark:text-emerald-300"
              >
                {successMsg}
              </div>
            )}

            {mode === 'login' && (
              <form onSubmit={handleLogin} className="mt-6 space-y-4">
                <div>
                  <label
                    htmlFor="login-email"
                    className="block text-sm font-medium text-slate-700 dark:text-slate-300"
                  >
                    Email Address
                  </label>
                  <input
                    id="login-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="student@university.edu"
                    className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    required
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="login-password"
                      className="block text-sm font-medium text-slate-700 dark:text-slate-300"
                    >
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => switchMode('forgot')}
                      className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative mt-1.5">
                    <input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pr-10 pl-3.5 text-sm text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute top-1/2 right-3 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="mt-2 w-full rounded-lg bg-gradient-to-r from-blue-600 to-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-95 disabled:opacity-50"
                >
                  {loading ? 'Signing In...' : 'Sign In'}
                </button>
              </form>
            )}

            {mode === 'register' && (
              <form onSubmit={handleRegister} className="mt-6 space-y-4">
                <div>
                  <label
                    htmlFor="reg-name"
                    className="block text-sm font-medium text-slate-700 dark:text-slate-300"
                  >
                    Full Name
                  </label>
                  <input
                    id="reg-name"
                    type="text"
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Maya Patel"
                    className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    required
                  />
                </div>

                <div>
                  <label
                    htmlFor="reg-email"
                    className="block text-sm font-medium text-slate-700 dark:text-slate-300"
                  >
                    Email Address
                  </label>
                  <input
                    id="reg-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="student@university.edu"
                    className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="reg-password"
                      className="block text-sm font-medium text-slate-700 dark:text-slate-300"
                    >
                      Password
                    </label>
                    <input
                      id="reg-password"
                      type="password"
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Min. 8 characters"
                      className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      required
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="reg-confirm"
                      className="block text-sm font-medium text-slate-700 dark:text-slate-300"
                    >
                      Confirm Password
                    </label>
                    <input
                      id="reg-confirm"
                      type="password"
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter password"
                      className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="reg-question"
                    className="block text-sm font-medium text-slate-700 dark:text-slate-300"
                  >
                    Password Recovery Question
                  </label>
                  <select
                    id="reg-question"
                    value={recoveryQuestion}
                    onChange={(e) => setRecoveryQuestion(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  >
                    {RECOVERY_QUESTIONS.map((q) => (
                      <option key={q} value={q}>
                        {q}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="reg-answer"
                    className="block text-sm font-medium text-slate-700 dark:text-slate-300"
                  >
                    Recovery Answer
                  </label>
                  <input
                    id="reg-answer"
                    type="text"
                    value={recoveryAnswer}
                    onChange={(e) => setRecoveryAnswer(e.target.value)}
                    placeholder="Used if you forget your password"
                    className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="mt-2 w-full rounded-lg bg-gradient-to-r from-blue-600 to-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-95 disabled:opacity-50"
                >
                  {loading ? 'Creating Account...' : 'Create Student Account'}
                </button>
              </form>
            )}

            {mode === 'forgot' && forgotStep === 1 && (
              <form onSubmit={handleForgotLookup} className="mt-6 space-y-4">
                <div>
                  <label
                    htmlFor="forgot-email"
                    className="block text-sm font-medium text-slate-700 dark:text-slate-300"
                  >
                    Registered Email Address
                  </label>
                  <input
                    id="forgot-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="student@university.edu"
                    className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading ? 'Looking up account...' : 'Continue'}
                </button>
              </form>
            )}

            {mode === 'forgot' && forgotStep === 2 && (
              <form onSubmit={handleForgotReset} className="mt-6 space-y-4">
                <div className="rounded-lg border border-slate-200 bg-slate-100/70 p-3.5 dark:border-slate-800 dark:bg-slate-900">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Security Question
                  </p>
                  <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">
                    {fetchedQuestion}
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="forgot-answer"
                    className="block text-sm font-medium text-slate-700 dark:text-slate-300"
                  >
                    Your Answer
                  </label>
                  <input
                    id="forgot-answer"
                    type="text"
                    value={forgotAnswer}
                    onChange={(e) => setForgotAnswer(e.target.value)}
                    placeholder="Enter your recovery answer"
                    className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    required
                  />
                </div>

                <div>
                  <label
                    htmlFor="forgot-new-password"
                    className="block text-sm font-medium text-slate-700 dark:text-slate-300"
                  >
                    New Password
                  </label>
                  <input
                    id="forgot-new-password"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Minimum 8 characters"
                    className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-lg bg-gradient-to-r from-blue-600 to-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-95 disabled:opacity-50"
                >
                  {loading ? 'Updating Password...' : 'Reset Password'}
                </button>
              </form>
            )}
          </div>

          <p className="text-center text-xs text-slate-500 dark:text-slate-500">
            ScholarPlan · Student Study Organizer
          </p>
        </div>
      </div>
    </div>
  );
}
