import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { authApi, ApiClientError } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const initialToken = searchParams.get('token') || '';
  const [token, setToken] = useState(initialToken);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!token.trim()) {
      setErrorMsg('Reset token is required.');
      return;
    }
    if (password.length < 8) {
      setErrorMsg('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      await authApi.resetPassword(token.trim(), password);
      showToast('Password updated. Please sign in with your new password.', 'success');
      navigate('/login', { replace: true });
    } catch (err) {
      const msg =
        err instanceof ApiClientError ? err.message : 'Unable to reset password.';
      setErrorMsg(msg);
      showToast(msg, 'error');
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
            Set a new password
          </h1>
        </div>

        <Card>
          <form onSubmit={handleSubmit} className="space-y-4">
            {errorMsg && (
              <div
                role="alert"
                className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700"
              >
                {errorMsg}
              </div>
            )}

            {!initialToken && (
              <div>
                <label
                  htmlFor="reset-token"
                  className="block text-sm font-medium text-[#162B4D] mb-1.5"
                >
                  Reset Token
                </label>
                <input
                  id="reset-token"
                  type="text"
                  required
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono text-[#162B4D] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
                />
              </div>
            )}

            <div>
              <label
                htmlFor="reset-password"
                className="block text-sm font-medium text-[#162B4D] mb-1.5"
              >
                New Password
              </label>
              <input
                id="reset-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#162B4D] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
              />
            </div>

            <div>
              <label
                htmlFor="reset-confirm"
                className="block text-sm font-medium text-[#162B4D] mb-1.5"
              >
                Confirm New Password
              </label>
              <input
                id="reset-confirm"
                type="password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#162B4D] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
              />
            </div>

            <Button type="submit" className="w-full" loading={submitting}>
              Update Password
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
