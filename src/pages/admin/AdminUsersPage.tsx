import React, { useEffect, useState } from 'react';
import { Search, Users } from 'lucide-react';
import { adminApi, ApiClientError } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Table, type TableColumn } from '../../components/ui/Table';
import { EmptyState } from '../../components/ui/EmptyState';
import { RoleBadge } from '../../components/ui/RoleBadge';
import { ConfirmModal } from '../../components/ui/ConfirmModal';
import {
  UserRole,
  UserStatus,
  type EffectiveRole,
  type PaginationMeta,
  type PublicUser,
} from '../../shared/types';

function getEffective(u: PublicUser): EffectiveRole {
  if (u.role === UserRole.ADMIN) return 'ADMIN';
  if (u.role === UserRole.FACULTY) return 'FACULTY';
  if (u.crCourseIds && u.crCourseIds.length > 0) return 'CR';
  return 'STUDENT';
}

export function AdminUsersPage() {
  const { user: currentUser } = useAuth();
  const { showToast } = useToast();

  const [users, setUsers] = useState<PublicUser[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);

  const [pendingRoleChange, setPendingRoleChange] = useState<{
    user: PublicUser;
    newRole: UserRole;
  } | null>(null);
  const [pendingStatusChange, setPendingStatusChange] = useState<{
    user: PublicUser;
    newStatus: UserStatus;
  } | null>(null);
  const [mutating, setMutating] = useState(false);

  useEffect(() => {
    let active = true;
    adminApi
      .listUsers({
        page,
        limit: 12,
        search: search.trim() || undefined,
        role: roleFilter || undefined,
        status: statusFilter || undefined,
      })
      .then((res) => {
        if (!active) return;
        setUsers(res.data.users);
        setMeta(res.meta);
      })
      .catch((err) => {
        if (!active) return;
        const msg =
          err instanceof ApiClientError ? err.message : 'Unable to load users.';
        showToast(msg, 'error');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [page, search, roleFilter, statusFilter, refreshKey, showToast]);

  const confirmRoleChange = async () => {
    if (!pendingRoleChange) return;
    setMutating(true);
    try {
      await adminApi.changeUserRole(
        pendingRoleChange.user.id,
        pendingRoleChange.newRole
      );
      showToast(
        `Updated ${pendingRoleChange.user.name} role to ${pendingRoleChange.newRole}.`,
        'success'
      );
      setPendingRoleChange(null);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      const msg =
        err instanceof ApiClientError ? err.message : 'Failed to update user role.';
      showToast(msg, 'error');
    } finally {
      setMutating(false);
    }
  };

  const confirmStatusChange = async () => {
    if (!pendingStatusChange) return;
    setMutating(true);
    try {
      await adminApi.changeUserStatus(
        pendingStatusChange.user.id,
        pendingStatusChange.newStatus
      );
      showToast(
        `Updated ${pendingStatusChange.user.name} status to ${pendingStatusChange.newStatus}.`,
        'success'
      );
      setPendingStatusChange(null);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      const msg =
        err instanceof ApiClientError ? err.message : 'Failed to update status.';
      showToast(msg, 'error');
    } finally {
      setMutating(false);
    }
  };

  const columns: TableColumn<PublicUser>[] = [
    {
      key: 'user',
      header: 'User',
      render: (row) => (
        <div className="min-w-[180px]">
          <p className="font-semibold text-[#162B4D]">{row.name}</p>
          <p className="text-xs text-slate-500">
            {row.email}
            {row.studentId ? ` · ${row.studentId}` : ''}
          </p>
        </div>
      ),
    },
    {
      key: 'department',
      header: 'Department',
      render: (row) => (
        <div className="text-xs">
          <p className="text-[#162B4D] font-medium">{row.department}</p>
          {row.batch && <p className="text-slate-500">{row.batch}</p>}
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role & Scope',
      render: (row) => (
        <div className="flex items-center gap-2">
          <RoleBadge role={getEffective(row)} />
          {row.crCourseIds.length > 0 && (
            <span className="text-xs font-mono text-[#12737c] tabular-nums">
              ({row.crCourseIds.length} CR)
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => {
        const style =
          row.status === UserStatus.ACTIVE
            ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
            : row.status === UserStatus.PENDING
              ? 'text-amber-800 bg-amber-50 border-amber-200'
              : 'text-rose-700 bg-rose-50 border-rose-200';
        return (
          <span
            className={`inline-block rounded-md border px-2 py-0.5 text-xs font-semibold ${style}`}
          >
            {row.status}
          </span>
        );
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => {
        const isSelf = currentUser?.id === row.id;
        return (
          <div className="inline-flex items-center justify-end gap-2">
            <select
              aria-label={`Change role for ${row.name}`}
              disabled={isSelf}
              value={row.role}
              onChange={(e) => {
                const newRole = e.target.value as UserRole;
                if (newRole !== row.role) {
                  setPendingRoleChange({ user: row, newRole });
                }
              }}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-[#162B4D] disabled:opacity-50"
            >
              <option value={UserRole.STUDENT}>STUDENT</option>
              <option value={UserRole.FACULTY}>FACULTY</option>
              <option value={UserRole.ADMIN}>ADMIN</option>
            </select>

            {row.status !== UserStatus.ACTIVE ? (
              <Button
                size="sm"
                variant="primary"
                disabled={isSelf}
                onClick={() =>
                  setPendingStatusChange({ user: row, newStatus: UserStatus.ACTIVE })
                }
              >
                {row.status === UserStatus.PENDING ? 'Approve' : 'Activate'}
              </Button>
            ) : (
              <Button
                size="sm"
                variant="danger"
                disabled={isSelf}
                onClick={() =>
                  setPendingStatusChange({
                    user: row,
                    newStatus: UserStatus.SUSPENDED,
                  })
                }
              >
                Suspend
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <DashboardLayout
      title="User Management"
      subtitle="Search accounts, approve pending faculty, update roles, and manage account status"
      breadcrumb="Admin / Users"
    >
      <Card padding="sm" className="mb-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="relative lg:col-span-2">
            <Search
              className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
              aria-hidden="true"
            />
            <input
              type="search"
              aria-label="Search users"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search by name, email, student ID, or department..."
              className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 text-sm text-[#162B4D] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
            />
          </div>

          <select
            aria-label="Filter by role"
            value={roleFilter}
            onChange={(e) => {
              setRoleFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#162B4D]"
          >
            <option value="">All Roles</option>
            <option value="STUDENT">Student (S)</option>
            <option value="CR">Class Rep (CR)</option>
            <option value="FACULTY">Faculty (F)</option>
            <option value="ADMIN">Admin (A)</option>
          </select>

          <select
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#162B4D]"
          >
            <option value="">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="PENDING">Pending Approval</option>
            <option value="SUSPENDED">Suspended</option>
          </select>
        </div>
      </Card>

      <Table
        columns={columns}
        data={users}
        keyExtractor={(u) => u.id}
        loading={loading}
        meta={meta}
        onPageChange={setPage}
        emptyState={
          <EmptyState
            icon={Users}
            title="No users match your filters"
            description="Try adjusting your search text, role filter, or status filter."
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setSearch('');
                  setRoleFilter('');
                  setStatusFilter('');
                  setPage(1);
                }}
              >
                Reset Filters
              </Button>
            }
          />
        }
      />

      <ConfirmModal
        open={Boolean(pendingRoleChange)}
        onClose={() => setPendingRoleChange(null)}
        onConfirm={confirmRoleChange}
        title="Confirm Role Change"
        description={`Change ${pendingRoleChange?.user.name}'s platform role from ${pendingRoleChange?.user.role} to ${pendingRoleChange?.newRole}? Any course CR assignments will be cleared if moving away from STUDENT.`}
        confirmLabel="Change Role"
        loading={mutating}
      />

      <ConfirmModal
        open={Boolean(pendingStatusChange)}
        onClose={() => setPendingStatusChange(null)}
        onConfirm={confirmStatusChange}
        title={
          pendingStatusChange?.newStatus === UserStatus.SUSPENDED
            ? 'Suspend Account'
            : 'Activate Account'
        }
        description={
          pendingStatusChange?.newStatus === UserStatus.SUSPENDED
            ? `Suspend ${pendingStatusChange?.user.name} (${pendingStatusChange?.user.email})? They will immediately lose access to ClassMate.`
            : `Set ${pendingStatusChange?.user.name} (${pendingStatusChange?.user.email}) to ACTIVE?`
        }
        confirmLabel={
          pendingStatusChange?.newStatus === UserStatus.SUSPENDED
            ? 'Suspend User'
            : 'Activate User'
        }
        destructive={pendingStatusChange?.newStatus === UserStatus.SUSPENDED}
        loading={mutating}
      />
    </DashboardLayout>
  );
}
