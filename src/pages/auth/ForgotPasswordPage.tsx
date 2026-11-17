import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { authApi, ApiClientError } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';

export function ForgotPasswordPage() {
  const { showToast } = useToast();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    try {
      await authApi.forgotPassword(email.trim());
      setSubmitted(true);
      showToast('If an account exists, a reset link has been generated.', 'info');
    } catch (err) {
      const msg =
        err instanceof ApiClientError ? err.message : 'Unable to process request.';
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
            Reset your password
          </h1>
        </div>

        <Card>
          {submitted ? (
            <div className="space-y-4 text-sm text-slate-600">
              <p>
                If an active account matches <span className="font-medium text-[#162B4D]">{email}</span>,
                a password reset link has been generated (printed to the server log in
                development).
              </p>
              <Link
                to="/login"
                className="inline-block text-sm font-semibold text-[#2563EB] hover:underline"
              >
                Back to Sign In
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="forgot-email"
                  className="block text-sm font-medium text-[#162B4D] mb-1.5"
                >
                  University Email
                </label>
                <input
                  id="forgot-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@classmate.edu"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#162B4D] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
                />
              </div>
              <Button type="submit" className="w-full" loading={submitting}>
                Send Reset Link
              </Button>
              <div className="text-center pt-2">
                <Link
                  to="/login"
                  className="text-sm font-medium text-slate-600 hover:text-[#162B4D]"
                >
                  Return to Sign In
                </Link>
              </div>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
