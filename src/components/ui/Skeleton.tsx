import React from 'react';

export function SkeletonLine({ className = 'h-4 w-full' }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded bg-slate-200/80 ${className}`}
    />
  );
}

export function CardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div
      aria-busy="true"
      aria-label="Loading content"
      className="rounded-xl bg-white border border-slate-200/85 p-5 sm:p-6 space-y-3"
    >
      <SkeletonLine className="h-5 w-1/3" />
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonLine key={i} className="h-4 w-full" />
      ))}
    </div>
  );
}

export function TableSkeleton({
  columns = 5,
  rows = 5,
}: {
  columns?: number;
  rows?: number;
}) {
  return (
    <div aria-busy="true" aria-label="Loading table rows" className="divide-y divide-slate-100">
      {Array.from({ length: rows }).map((_, rowIdx) => (
        <div
          key={rowIdx}
          className="grid gap-4 px-5 py-3.5 items-center"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: columns }).map((__, colIdx) => (
            <SkeletonLine
              key={colIdx}
              className={colIdx === 0 ? 'h-4 w-4/5' : 'h-4 w-2/3'}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
