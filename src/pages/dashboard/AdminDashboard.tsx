import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download } from 'lucide-react';
import { adminApi, ApiClientError } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { CardSkeleton } from '../../components/ui/Skeleton';
import { ConfirmModal } from '../../components/ui/ConfirmModal';
import {
  UserStatus,
  type AdminStatsDTO,
  type AuditLogDTO,
  type PublicUser,
} from '../../shared/types';

export function AdminDashboard() {
  const { showToast } = useToast();
  const [stats, setStats] = useState<AdminStatsDTO | null>(null);
  const [pendingFaculty, setPendingFaculty] = useState<PublicUser[]>([]);
  const [recentLogs, setRecentLogs] = useState<AuditLogDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [approveTarget, setApproveTarget] = useState<PublicUser | null>(null);
  const [approving, setApproving] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);

  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    Promise.all([
      adminApi.getStats(),
      adminApi.listUsers({
        role: 'FACULTY',
        status: UserStatus.PENDING,
        page: 1,
        limit: 10,
      }),
      adminApi.listAuditLogs({ page: 1, limit: 6, sortOrder: 'desc' }),
    ])
      .then(([statsRes, pendingRes, logsRes]) => {
        if (!active) return;
        setStats(statsRes.data.stats);
        setPendingFaculty(pendingRes.data.users);
        setRecentLogs(logsRes.data.logs);
      })
      .catch((err) => {
        if (!active) return;
        const msg =
          err instanceof ApiClientError
            ? err.message
            : 'Unable to load admin overview.';
        showToast(msg, 'error');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [refreshKey, showToast]);

  const handleApproveFaculty = async () => {
    if (!approveTarget) return;
    setApproving(true);
    try {
      await adminApi.changeUserStatus(approveTarget.id, UserStatus.ACTIVE);
      showToast(`Approved faculty account for ${approveTarget.name}.`, 'success');
      setApproveTarget(null);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      const msg =
        err instanceof ApiClientError ? err.message : 'Unable to approve account.';
      showToast(msg, 'error');
    } finally {
      setApproving(false);
    }
  };

  const handleExportMatchingCsv = async () => {
    setExportingCsv(true);
    try {
      await adminApi.exportMatchingResultsCsv();
      showToast('Exported AI matching results CSV.', 'success');
    } catch (err) {
      const msg =
        err instanceof ApiClientError
          ? err.message
          : 'Could not export matching results CSV.';
      showToast(msg, 'error');
    } finally {
      setExportingCsv(false);
    }
  };

  return (
    <DashboardLayout
      title="Administrator Overview"
      subtitle="Monitor platform activity, approve faculty registrations, and manage courses"
      breadcrumb="Admin Overview"
      actions={
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            loading={exportingCsv}
            onClick={handleExportMatchingCsv}
          >
            <Download className="w-4 h-4" aria-hidden="true" />
            Export Matching CSV
          </Button>
          <Link
            to="/admin/courses"
            className="inline-flex items-center px-4 py-2 rounded-lg bg-[#2563EB] hover:bg-[#1d4ed8] text-white text-sm font-medium whitespace-nowrap shrink-0"
          >
            Manage Courses
          </Link>
        </div>
      }
    >
      {loading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <CardSkeleton rows={1} />
            <CardSkeleton rows={1} />
            <CardSkeleton rows={1} />
            <CardSkeleton rows={1} />
          </div>
          <CardSkeleton rows={4} />
        </div>
      ) : (
        <div className="space-y-6">
          {/* KPI strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card padding="sm">
              <p className="text-xs font-medium text-slate-500">Total Users</p>
              <p className="font-display text-2xl font-bold text-[#162B4D] mt-1 tabular-nums">
                {stats?.users.total ?? 0}
              </p>
              <p className="text-xs text-slate-500 mt-1 tabular-nums">
                {stats?.users.active ?? 0} active · {stats?.users.suspended ?? 0} suspended
              </p>
            </Card>

            <Card padding="sm">
              <p className="text-xs font-medium text-slate-500">Pending Faculty</p>
              <p className="font-display text-2xl font-bold text-[#D98E2B] mt-1 tabular-nums">
                {stats?.users.pendingFaculty ?? 0}
              </p>
              <p className="text-xs text-slate-500 mt-1">Awaiting verification</p>
            </Card>

            <Card padding="sm">
              <p className="text-xs font-medium text-slate-500">Courses</p>
              <p className="font-display text-2xl font-bold text-[#2563EB] mt-1 tabular-nums">
                {stats?.courses.total ?? 0}
              </p>
              <p className="text-xs text-slate-500 mt-1 tabular-nums">
                {stats?.courses.active ?? 0} active · {stats?.courses.archived ?? 0} archived
              </p>
            </Card>

            <Card padding="sm">
              <p className="text-xs font-medium text-slate-500">Active Enrollments</p>
              <p className="font-display text-2xl font-bold text-[#1D9BA6] mt-1 tabular-nums">
                {stats?.enrollments.active ?? 0}
              </p>
              <p className="text-xs text-slate-500 mt-1 tabular-nums">
                {stats?.auditLogsTotal ?? 0} audit events logged
              </p>
            </Card>
          </div>

          {/* Role Distribution */}
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
              <h2 className="font-display text-lg font-semibold text-[#162B4D]">
                Role Distribution
              </h2>
              <Link
                to="/admin/users"
                className="text-sm font-medium text-[#2563EB] hover:underline"
              >
                Open User Directory
              </Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-3.5 rounded-lg bg-[#F3F6FB] border border-slate-200/70">
                <p className="text-xs text-slate-500">Students (S)</p>
                <p className="font-display text-xl font-bold text-[#2563EB] mt-1 tabular-nums">
                  {stats?.users.byRole.STUDENT ?? 0}
                </p>
              </div>
              <div className="p-3.5 rounded-lg bg-[#F3F6FB] border border-slate-200/70">
                <p className="text-xs text-slate-500">Class Reps (CR)</p>
                <p className="font-display text-xl font-bold text-[#1D9BA6] mt-1 tabular-nums">
                  {stats?.users.byRole.CR ?? 0}
                </p>
              </div>
              <div className="p-3.5 rounded-lg bg-[#F3F6FB] border border-slate-200/70">
                <p className="text-xs text-slate-500">Faculty (F)</p>
                <p className="font-display text-xl font-bold text-[#6D5BD0] mt-1 tabular-nums">
                  {stats?.users.byRole.FACULTY ?? 0}
                </p>
              </div>
              <div className="p-3.5 rounded-lg bg-[#F3F6FB] border border-slate-200/70">
                <p className="text-xs text-slate-500">Admins (A)</p>
                <p className="font-display text-xl font-bold text-[#D98E2B] mt-1 tabular-nums">
                  {stats?.users.byRole.ADMIN ?? 0}
                </p>
              </div>
            </div>
          </Card>

          {/* Platform Analytics: Uploads, Quiz Attempts & AI Usage */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <h2 className="font-display text-base font-semibold text-[#162B4D] mb-1">
                Resource Uploads & Ingestion
              </h2>
              <p className="text-xs text-slate-500 mb-4">GridFS stored files & AI index</p>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-600">Total Uploads</span>
                  <span className="font-semibold text-[#162B4D] tabular-nums">{stats?.uploads.total ?? 0}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-emerald-700">Ready (AI Indexed)</span>
                  <span className="font-semibold text-emerald-700 tabular-nums">{stats?.uploads.ready ?? 0}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-[#D98E2B]">Processing</span>
                  <span className="font-semibold text-[#D98E2B] tabular-nums">{stats?.uploads.processing ?? 0}</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-rose-600">Failed Ingestion</span>
                  <span className="font-semibold text-rose-600 tabular-nums">{stats?.uploads.failed ?? 0}</span>
                </div>
              </div>
            </Card>

            <Card>
              <h2 className="font-display text-base font-semibold text-[#162B4D] mb-1">
                Quiz Activity & Bank
              </h2>
              <p className="text-xs text-slate-500 mb-4">Practice sessions & approved questions</p>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-600">Approved Bank Questions</span>
                  <span className="font-semibold text-[#162B4D] tabular-nums">{stats?.quizAttempts.bankQuestions ?? 0}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-600">Total Practice Attempts</span>
                  <span className="font-semibold text-[#162B4D] tabular-nums">{stats?.quizAttempts.total ?? 0}</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-emerald-700">Submitted & Graded</span>
                  <span className="font-semibold text-emerald-700 tabular-nums">{stats?.quizAttempts.submitted ?? 0}</span>
                </div>
              </div>
            </Card>

            <Card>
              <h2 className="font-display text-base font-semibold text-[#162B4D] mb-1">
                AI Usage & Token Counts
              </h2>
              <p className="text-xs text-slate-500 mb-4">Gemini API calls & estimated tokens</p>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-600">Total AI Requests</span>
                  <span className="font-semibold text-[#6D5BD0] tabular-nums">{stats?.aiUsage.totalRequests ?? 0}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-600">Requests Today (UTC)</span>
                  <span className="font-semibold text-[#6D5BD0] tabular-nums">{stats?.aiUsage.todayRequests ?? 0}</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-slate-600">Estimated Token Count</span>
                  <span className="font-semibold text-[#1D9BA6] tabular-nums">{stats?.aiUsage.estimatedTokens ?? 0}</span>
                </div>
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Pending faculty queue */}
            <Card>
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display text-lg font-semibold text-[#162B4D]">
                  Pending Faculty Approvals
                </h2>
                <Link
                  to="/admin/users?status=PENDING"
                  className="text-xs font-medium text-[#2563EB] hover:underline"
                >
                  View all
                </Link>
              </div>

              {pendingFaculty.length === 0 ? (
                <p className="text-sm text-slate-500 py-4">
                  No pending faculty registrations right now.
                </p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {pendingFaculty.map((u) => (
                    <div
                      key={u.id}
                      className="py-3 flex items-center justify-between gap-4"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#162B4D] truncate">
                          {u.name}
                        </p>
                        <p className="text-xs text-slate-500 truncate">
                          {u.email} · {u.department}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => setApproveTarget(u)}
                      >
                        Approve
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Recent audit events */}
            <Card>
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display text-lg font-semibold text-[#162B4D]">
                  Recent Audit Events
                </h2>
                <Link
                  to="/admin/audit-logs"
                  className="text-xs font-medium text-[#2563EB] hover:underline"
                >
                  Full audit log
                </Link>
              </div>

              {recentLogs.length === 0 ? (
                <p className="text-sm text-slate-500 py-4">No audit entries yet.</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {recentLogs.map((log) => (
                    <div
                      key={log.id}
                      className="py-2.5 flex items-center justify-between gap-4 text-xs"
                    >
                      <div className="min-w-0">
                        <p className="font-mono font-medium text-[#162B4D] truncate">
                          {log.action}
                        </p>
                        <p className="text-slate-500 truncate">{log.actorEmail}</p>
                      </div>
                      <span className="font-mono text-slate-500 shrink-0 tabular-nums">
                        {new Date(log.createdAt).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      <ConfirmModal
        open={Boolean(approveTarget)}
        onClose={() => setApproveTarget(null)}
        onConfirm={handleApproveFaculty}
        title="Approve Faculty Account"
        description={`Activate ${approveTarget?.name} (${approveTarget?.email}) so they can sign in and access assigned faculty courses?`}
        confirmLabel="Approve & Activate"
        loading={approving}
      />
    </DashboardLayout>
  );
}
