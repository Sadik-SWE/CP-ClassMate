import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-6">
      {Icon && (
        <div className="w-11 h-11 rounded-xl bg-[#F3F6FB] border border-slate-200/80 flex items-center justify-center text-[#162B4D] mb-4">
          <Icon className="w-5 h-5" aria-hidden="true" />
        </div>
      )}
      <h3 className="text-base font-semibold text-[#162B4D] mb-1.5">{title}</h3>
      <p className="text-sm text-slate-600 max-w-md mb-5">{description}</p>
      {action}
    </div>
  );
}
