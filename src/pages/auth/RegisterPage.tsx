import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { useAuth, resolveDashboardPath } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { ApiClientError } from '../../services/api';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';

export function RegisterPage() {
  const { user, dashboardPath, register } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [accountType, setAccountType] = useState<'STUDENT' | 'FACULTY'>('STUDENT');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [department, setDepartment] = useState('Computer Science & Engineering');
  const [studentId, setStudentId] = useState('');
  const [batch, setBatch] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pendingFacultySuccess, setPendingFacultySuccess] = useState(false);

  useEffect(() => {
    if (user) {
      navigate(dashboardPath, { replace: true });
    }
  }, [user, dashboardPath, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (name.trim().length < 2) {
      setErrorMsg('Please enter your full name (at least 2 characters).');
      return;
    }
    if (!email.trim().includes('@')) {
      setErrorMsg('Please enter a valid university email address.');
      return;
    }
    if (password.length < 8) {
      setErrorMsg('Password must be at least 8 characters long.');
      return;
    }
    if (department.trim().length < 2) {
      setErrorMsg('Department is required.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await register({
        name: name.trim(),
        email: email.trim(),
        password,
        department: department.trim(),
        batch: accountType === 'STUDENT' && batch.trim() ? batch.trim() : undefined,
        studentId:
          accountType === 'STUDENT' && studentId.trim() ? studentId.trim() : undefined,
        accountType,
      });

      if (result.requiresApproval) {
        setPendingFacultySuccess(true);
        showToast('Faculty account created. Awaiting administrator approval.', 'info');
      } else {
        showToast('Account registered. Welcome to ClassMate.', 'success');
        navigate(resolveDashboardPath(result.user), { replace: true });
      }
    } catch (err) {
      const message =
        err instanceof ApiClientError
          ? err.message
          : 'Registration failed. Please check your details.';
      setErrorMsg(message);
      showToast(message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (pendingFacultySuccess) {
    return (
      <div className="min-h-screen bg-[#F3F6FB] flex flex-col justify-center py-10 px-4 sm:px-6">
        <div className="max-w-md w-full mx-auto">
          <Card className="text-center space-y-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" aria-hidden="true" />
            </div>
            <h1 className="font-display text-xl font-semibold text-[#162B4D]">
              Faculty Account Pending Approval
            </h1>
            <p className="text-sm text-slate-600 leading-relaxed">
              Your registration for <span className="font-medium text-[#162B4D]">{email}</span>{' '}
              has been submitted. An administrator must approve and activate your faculty
              account before you can sign in.
            </p>
            <div className="pt-2">
              <Link
                to="/login"
                className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-[#2563EB] text-white text-sm font-medium hover:bg-[#1d4ed8]"
              >
                Return to Sign In
              </Link>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F3F6FB] flex flex-col justify-center py-10 px-4 sm:px-6">
      <div className="max-w-lg w-full mx-auto space-y-6">
        <div className="text-center">
          <Link
            to="/"
            className="font-display text-2xl font-bold tracking-tight text-[#162B4D] inline-block mb-2"
          >
            ClassMate
          </Link>
          <h1 className="font-display text-xl font-semibold text-[#162B4D]">
            Create your academic account
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Admin and Class Representative assignments are managed by administrators
          </p>
        </div>

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
              <span className="block text-sm font-medium text-[#162B4D] mb-1.5">
                Account Type
              </span>
              <div className="grid grid-cols-2 gap-2 p-1 rounded-lg bg-[#F3F6FB] border border-slate-200">
                <button
                  type="button"
                  onClick={() => setAccountType('STUDENT')}
                  className={`py-2 px-3 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                    accountType === 'STUDENT'
                      ? 'bg-white text-[#2563EB] shadow-xs'
                      : 'text-slate-600 hover:text-[#162B4D]'
                  }`}
                >
                  Student
                </button>
                <button
                  type="button"
                  onClick={() => setAccountType('FACULTY')}
                  className={`py-2 px-3 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                    accountType === 'FACULTY'
                      ? 'bg-white text-[#6D5BD0] shadow-xs'
                      : 'text-slate-600 hover:text-[#162B4D]'
                  }`}
                >
                  Faculty (Approval Req.)
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="reg-name"
                  className="block text-sm font-medium text-[#162B4D] mb-1.5"
                >
                  Full Name
                </label>
                <input
                  id="reg-name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nadia Karim"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#162B4D] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
                />
              </div>

              <div>
                <label
                  htmlFor="reg-email"
                  className="block text-sm font-medium text-[#162B4D] mb-1.5"
                >
                  University Email
                </label>
                <input
                  id="reg-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nadia@classmate.edu"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#162B4D] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="reg-department"
                  className="block text-sm font-medium text-[#162B4D] mb-1.5"
                >
                  Department
                </label>
                <input
                  id="reg-department"
                  type="text"
                  required
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#162B4D] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
                />
              </div>

              <div>
                <label
                  htmlFor="reg-password"
                  className="block text-sm font-medium text-[#162B4D] mb-1.5"
                >
                  Password (min 8 chars)
                </label>
                <input
                  id="reg-password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#162B4D] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
                />
              </div>
            </div>

            {accountType === 'STUDENT' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="reg-student-id"
                    className="block text-sm font-medium text-[#162B4D] mb-1.5"
                  >
                    Student ID (optional)
                  </label>
                  <input
                    id="reg-student-id"
                    type="text"
                    value={studentId}
                    onChange={(e) => setStudentId(e.target.value)}
                    placeholder="241-35-215"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#162B4D] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
                  />
                </div>
                <div>
                  <label
                    htmlFor="reg-batch"
                    className="block text-sm font-medium text-[#162B4D] mb-1.5"
                  >
                    Batch / Cohort (optional)
                  </label>
                  <input
                    id="reg-batch"
                    type="text"
                    value={batch}
                    onChange={(e) => setBatch(e.target.value)}
                    placeholder="Batch 41"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#162B4D] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
                  />
                </div>
              </div>
            )}

            {accountType === 'FACULTY' && (
              <p className="text-xs text-slate-600 bg-[#6D5BD0]/8 border border-[#6D5BD0]/20 rounded-lg p-3">
                Faculty accounts start in PENDING status and require an administrator to
                approve access before sign-in is enabled.
              </p>
            )}

            <Button type="submit" className="w-full" loading={submitting}>
              Create account
            </Button>
          </form>

          <p className="text-center text-sm text-slate-600 mt-5 pt-4 border-t border-slate-100">
            Already registered?{' '}
            <Link to="/login" className="font-semibold text-[#2563EB] hover:underline">
              Sign in
            </Link>
          </p>
        </Card>
      </div>
    </div>
  );
}
