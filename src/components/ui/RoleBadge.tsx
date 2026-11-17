import React from 'react';
import type { EffectiveRole } from '../../shared/types';

interface RoleBadgeProps {
  role: EffectiveRole;
  compact?: boolean;
}

const ROLE_STYLES: Record<
  EffectiveRole,
  { code: string; label: string; bg: string; text: string; border: string }
> = {
  STUDENT: {
    code: 'S',
    label: 'Student',
    bg: 'bg-[#2563EB]/10',
    text: 'text-[#1d4ed8]',
    border: 'border-[#2563EB]/25',
  },
  CR: {
    code: 'CR',
    label: 'Class Rep',
    bg: 'bg-[#1D9BA6]/12',
    text: 'text-[#12737c]',
    border: 'border-[#1D9BA6]/30',
  },
  FACULTY: {
    code: 'F',
    label: 'Faculty',
    bg: 'bg-[#6D5BD0]/12',
    text: 'text-[#5542b8]',
    border: 'border-[#6D5BD0]/30',
  },
  ADMIN: {
    code: 'A',
    label: 'Admin',
    bg: 'bg-[#D98E2B]/14',
    text: 'text-[#9e6212]',
    border: 'border-[#D98E2B]/35',
  },
};

export function RoleBadge({ role, compact = false }: RoleBadgeProps) {
  const cfg = ROLE_STYLES[role];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-semibold whitespace-nowrap shrink-0 ${cfg.bg} ${cfg.text} ${cfg.border}`}
    >
      <span className="font-mono">{cfg.code}</span>
      {!compact && <span>{cfg.label}</span>}
    </span>
  );
}
