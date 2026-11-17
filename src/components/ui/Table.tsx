import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { PaginationMeta } from '../../shared/types';
import { Button } from './Button';
import { TableSkeleton } from './Skeleton';

export interface TableColumn<T> {
  key: string;
  header: string;
  align?: 'left' | 'right';
  render: (row: T) => React.ReactNode;
}

interface TableProps<T> {
  columns: TableColumn<T>[];
  data: T[];
  keyExtractor: (row: T) => string;
  loading?: boolean;
  emptyState?: React.ReactNode;
  meta?: PaginationMeta | null;
  onPageChange?: (page: number) => void;
}

export function Table<T>({
  columns,
  data,
  keyExtractor,
  loading = false,
  emptyState,
  meta,
  onPageChange,
}: TableProps<T>) {
  if (loading) {
    return (
      <div className="rounded-xl bg-white border border-slate-200/85 overflow-hidden">
        <TableSkeleton columns={columns.length} rows={6} />
      </div>
    );
  }

  if (data.length === 0 && emptyState) {
    return (
      <div className="rounded-xl bg-white border border-slate-200/85 overflow-hidden">
        {emptyState}
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-white border border-slate-200/85 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200/80 bg-[#F3F6FB]/70">
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={`px-4 py-3 text-xs font-semibold text-slate-600 whitespace-nowrap ${
                    col.align === 'right' ? 'text-right' : 'text-left'
                  }`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.map((row) => (
              <tr
                key={keyExtractor(row)}
                className="hover:bg-[#F3F6FB]/50 transition-colors"
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`px-4 py-3 text-sm text-[#162B4D] align-middle ${
                      col.align === 'right' ? 'text-right tabular-nums' : 'text-left'
                    }`}
                  >
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {meta && meta.totalPages > 1 && onPageChange && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-slate-200/80 bg-[#F3F6FB]/40 text-xs text-slate-600">
          <span className="tabular-nums">
            Page {meta.page} of {meta.totalPages} ({meta.total} total records)
          </span>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={meta.page <= 1}
              onClick={() => onPageChange(meta.page - 1)}
            >
              <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
              Previous
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={meta.page >= meta.totalPages}
              onClick={() => onPageChange(meta.page + 1)}
            >
              Next
              <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
