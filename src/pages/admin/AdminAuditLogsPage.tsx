import React, { useEffect, useState } from 'react';
import { ClipboardList, Search } from 'lucide-react';
import { adminApi, ApiClientError } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Table, type TableColumn } from '../../components/ui/Table';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import type { AuditLogDTO, PaginationMeta } from '../../shared/types';

export function AdminAuditLogsPage() {
  const { showToast } = useToast();

  const [logs, setLogs] = useState<AuditLogDTO[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [loading, setLoading] = useState(true);

  const [actionFilter, setActionFilter] = useState('');
  const [actorFilter, setActorFilter] = useState('');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [page, setPage] = useState(1);
  const [selectedLog, setSelectedLog] = useState<AuditLogDTO | null>(null);

  useEffect(() => {
    let active = true;
    adminApi
      .listAuditLogs({
        page,
        limit: 15,
        action: actionFilter.trim() || undefined,
        actorEmail: actorFilter.trim() || undefined,
        sortOrder,
      })
      .then((res) => {
        if (!active) return;
        setLogs(res.data.logs);
        setMeta(res.meta);
      })
      .catch((err) => {
        if (!active) return;
        const msg =
          err instanceof ApiClientError ? err.message : 'Unable to load audit logs.';
        showToast(msg, 'error');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [page, actionFilter, actorFilter, sortOrder, showToast]);

  const columns: TableColumn<AuditLogDTO>[] = [
    {
      key: 'timestamp',
      header: 'Timestamp',
      render: (row) => (
        <span className="font-mono text-xs text-slate-600 whitespace-nowrap tabular-nums">
          {new Date(row.createdAt).toLocaleString()}
        </span>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      render: (row) => (
        <span className="font-mono text-xs font-semibold text-[#162B4D]">
          {row.action}
        </span>
      ),
    },
    {
      key: 'actor',
      header: 'Actor',
      render: (row) => (
        <div className="text-xs">
          <p className="font-medium text-[#162B4D]">{row.actorEmail}</p>
          <p className="text-slate-500">{row.actorRole}</p>
        </div>
      ),
    },
    {
      key: 'target',
      header: 'Target',
      render: (row) => (
        <span className="text-xs font-mono text-slate-600">
          {row.targetType}
          {row.targetId ? `:${row.targetId.slice(-6)}` : ''}
        </span>
      ),
    },
    {
      key: 'details',
      header: 'Metadata',
      align: 'right',
      render: (row) => (
        <Button size="sm" variant="ghost" onClick={() => setSelectedLog(row)}>
          Inspect
        </Button>
      ),
    },
  ];

  return (
    <DashboardLayout
      title="Security & Activity Audit Logs"
      subtitle="Immutable trail of logins, role changes, course modifications, and security events"
      breadcrumb="Admin / Audit Logs"
    >
      <Card padding="sm" className="mb-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="relative">
            <Search
              className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
              aria-hidden="true"
            />
            <input
              type="search"
              aria-label="Filter by action"
              value={actionFilter}
              onChange={(e) => {
                setActionFilter(e.target.value);
                setPage(1);
              }}
              placeholder="Filter action (e.g. AUTH_LOGIN, COURSE)..."
              className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 text-sm text-[#162B4D] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
            />
          </div>

          <input
            type="search"
            aria-label="Filter by actor email"
            value={actorFilter}
            onChange={(e) => {
              setActorFilter(e.target.value);
              setPage(1);
            }}
            placeholder="Filter by actor email..."
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#162B4D] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
          />

          <select
            aria-label="Sort order"
            value={sortOrder}
            onChange={(e) => {
              setSortOrder(e.target.value as 'asc' | 'desc');
              setPage(1);
            }}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#162B4D]"
          >
            <option value="desc">Newest First</option>
            <option value="asc">Oldest First</option>
          </select>
        </div>
      </Card>

      <Table
        columns={columns}
        data={logs}
        keyExtractor={(l) => l.id}
        loading={loading}
        meta={meta}
        onPageChange={setPage}
        emptyState={
          <EmptyState
            icon={ClipboardList}
            title="No audit log entries found"
            description="System events such as logins, role changes, and course updates will appear here."
          />
        }
      />

      <Modal
        open={Boolean(selectedLog)}
        onClose={() => setSelectedLog(null)}
        title={selectedLog?.action || 'Audit Entry'}
        subtitle={
          selectedLog
            ? `${selectedLog.actorEmail} · ${new Date(selectedLog.createdAt).toLocaleString()}`
            : undefined
        }
      >
        {selectedLog && (
          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-[#F3F6FB] border border-slate-200/70">
              <div>
                <p className="text-slate-500">Actor Role</p>
                <p className="font-semibold text-[#162B4D]">{selectedLog.actorRole}</p>
              </div>
              <div>
                <p className="text-slate-500">Target</p>
                <p className="font-mono text-[#162B4D]">
                  {selectedLog.targetType} / {selectedLog.targetId || '—'}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Request ID</p>
                <p className="font-mono text-[#162B4D] truncate">
                  {selectedLog.requestId || '—'}
                </p>
              </div>
              <div>
                <p className="text-slate-500">IP Address</p>
                <p className="font-mono text-[#162B4D]">{selectedLog.ip || '—'}</p>
              </div>
            </div>
            <div>
              <p className="font-semibold text-[#162B4D] mb-1">Event Metadata</p>
              <pre className="rounded-lg bg-slate-900 text-slate-100 p-3 overflow-x-auto font-mono text-[11px]">
                {JSON.stringify(selectedLog.metadata || {}, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </Modal>
    </DashboardLayout>
  );
}
