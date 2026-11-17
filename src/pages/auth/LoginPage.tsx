import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, Lock, Mail } from 'lucide-react';
import { useAuth, resolveDashboardPath } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { ApiClientError, healthApi } from '../../services/api';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { RoleBadge } from '../../components/ui/RoleBadge';
import type { EffectiveRole } from '../../shared/types';

interface DemoAccount {
  label: string;
  role: EffectiveRole;
  email: string;
  password: string;
}

const DEV_DEMO_ACCOUNTS: DemoAccount[] = [
  {
    label: 'Admin',
    role: 'ADMIN',
    email: 'admin@classmate.edu',
    password: 'Password123!',
  },
  {
    label: 'Faculty',
    role: 'FACULTY',
    email: 'mahmudul.faculty@classmate.edu',
    password: 'Password123!',
  },
  {
    label: 'Class Rep',
    role: 'CR',
    email: 'amina.cr@classmate.edu',
    password: 'Password123!',
  },
  {
    label: 'Student',
    role: 'STUDENT',
    email: 'nadia.student@classmate.edu',
    password: 'Password123!',
  },
];

export function LoginPage() {
  const { user, dashboardPath, login } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [missingSecrets, setMissingSecrets] = useState<string[]>([]);

  useEffect(() => {
    if (user) {
      navigate(dashboardPath, { replace: true });
    }
  }, [user, dashboardPath, navigate]);

  useEffect(() => {
    healthApi.checkReady().then((status) => {
      if (!status.ready && status.missingSecrets.length > 0) {
        setMissingSecrets(status.missingSecrets);
      }
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!email.trim() || !password) {
      setErrorMsg('Please enter both your university email and password.');
      return;
    }

    setSubmitting(true);
    try {
      const signedInUser = await login(email.trim(), password);
      showToast(`Welcome back, ${signedInUser.name}.`, 'success');
      navigate(resolveDashboardPath(signedInUser), { replace: true });
    } catch (err) {
      const message =
        err instanceof ApiClientError
          ? err.message
          : 'Unable to sign in right now. Please try again.';
      setErrorMsg(message);
      showToast(message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F3F6FB] flex flex-col justify-center py-10 px-4 sm:px-6">
      <div className="max-w-md w-full mx-auto space-y-6">
        <div className="text-center">
          <Link
            to="/"
            className="font-display text-2xl font-bold tracking-tight text-[#162B4D] inline-block mb-2"
          >
            ClassMate
          </Link>
          <h1 className="font-display text-xl font-semibold text-[#162B4D]">
            Sign in to your account
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Access your courses, profile, and role workspace
          </p>
        </div>

        {missingSecrets.length > 0 && (
          <div
            role="alert"
            className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 flex items-start gap-3"
          >
            <AlertTriangle className="w-5 h-5 text-[#D98E2B] shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <p className="font-semibold">Database or Auth secrets not configured</p>
              <p className="mt-1 text-xs leading-relaxed">
                Add <span className="font-mono">{missingSecrets.join(', ')}</span> in the AI
                Studio Secrets panel, then run <span className="font-mono">npm run seed</span>.
              </p>
            </div>
          </div>
        )}

        <Card>
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {errorMsg && (
              <div
                role="alert"
                className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700"
              >
                {errorMsg}
              </div>
            )}

            <div>
              <label
                htmlFor="login-email"
                className="block text-sm font-medium text-[#162B4D] mb-1.5"
              >
                University Email
              </label>
              <div className="relative">
                <Mail
                  className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                  aria-hidden="true"
                />
                <input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@classmate.edu"
                  className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 text-sm text-[#162B4D] placeholder:text-slate-400 focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="login-password"
                  className="block text-sm font-medium text-[#162B4D]"
                >
                  Password
                </label>
                <Link
                  to="/forgot-password"
                  className="text-xs font-medium text-[#2563EB] hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Lock
                  className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                  aria-hidden="true"
                />
                <input
                  id="login-password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 text-sm text-[#162B4D] placeholder:text-slate-400 focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
                />
              </div>
            </div>

            <Button type="submit" className="w-full" loading={submitting}>
              Sign in
            </Button>
          </form>

          <p className="text-center text-sm text-slate-600 mt-5 pt-4 border-t border-slate-100">
            New to ClassMate?{' '}
            <Link to="/register" className="font-semibold text-[#2563EB] hover:underline">
              Create an account
            </Link>
          </p>
        </Card>

        {import.meta.env.DEV && (
          <Card padding="sm" className="bg-white/90">
            <div className="flex items-center justify-between mb-2.5">
              <h2 className="text-xs font-semibold text-[#162B4D]">
                Demo accounts (development only)
              </h2>
              <span className="text-xs font-mono text-slate-500">Password123!</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {DEV_DEMO_ACCOUNTS.map((acct) => (
                <button
                  key={acct.email}
                  type="button"
                  onClick={() => {
                    setEmail(acct.email);
                    setPassword(acct.password);
                    setErrorMsg(null);
                  }}
                  className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-[#F3F6FB]/70 hover:bg-[#F3F6FB] px-3 py-2 text-left transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB]"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[#162B4D]">{acct.label}</p>
                    <p className="text-[11px] text-slate-500 truncate font-mono">
                      {acct.email}
                    </p>
                  </div>
                  <RoleBadge role={acct.role} compact />
                </button>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
