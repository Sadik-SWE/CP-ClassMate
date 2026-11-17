import React, { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import {
  BookOpen,
  Bot,
  ClipboardList,
  GraduationCap,
  HelpCircle,
  LayoutDashboard,
  LogOut,
  Menu,
  ShieldCheck,
  Sparkles,
  UserCircle,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { RoleBadge } from '../ui/RoleBadge';
import { Button } from '../ui/Button';
import { NotificationBell } from '../notifications/NotificationBell';
import type { EffectiveRole } from '../../shared/types';

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  end?: boolean;
}

function getNavItems(effectiveRole: EffectiveRole): NavItem[] {
  switch (effectiveRole) {
    case 'ADMIN':
      return [
        { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true },
        { to: '/admin/users', label: 'Users', icon: Users },
        { to: '/admin/courses', label: 'Courses', icon: BookOpen },
        { to: '/quizzes', label: 'Quizzes & Bank', icon: HelpCircle },
        { to: '/study-assistant', label: 'AI Assistant', icon: Bot },
        { to: '/admin/audit-logs', label: 'Audit Logs', icon: ClipboardList },
        { to: '/profile', label: 'My Profile', icon: UserCircle },
      ];
    case 'FACULTY':
      return [
        { to: '/faculty', label: 'Faculty Overview', icon: LayoutDashboard, end: true },
        { to: '/quizzes', label: 'Quizzes & Review', icon: HelpCircle },
        { to: '/study-assistant', label: 'AI Assistant', icon: Bot },
        { to: '/profile', label: 'My Profile', icon: UserCircle },
      ];
    case 'CR':
      return [
        { to: '/cr', label: 'CR Workspace', icon: LayoutDashboard, end: true },
        { to: '/student', label: 'Student View', icon: GraduationCap, end: true },
        { to: '/collaboration', label: 'Teams & Matching', icon: Sparkles },
        { to: '/quizzes', label: 'Quizzes & Bank', icon: HelpCircle },
        { to: '/study-assistant', label: 'AI Assistant', icon: Bot },
        { to: '/profile', label: 'My Profile', icon: UserCircle },
      ];
    case 'STUDENT':
    default:
      return [
        { to: '/student', label: 'Student Overview', icon: LayoutDashboard, end: true },
        { to: '/collaboration', label: 'Teams & Matching', icon: Sparkles },
        { to: '/quizzes', label: 'Quizzes & Bank', icon: HelpCircle },
        { to: '/study-assistant', label: 'AI Study Assistant', icon: Bot },
        { to: '/profile', label: 'My Profile', icon: UserCircle },
      ];
  }
}

interface DashboardLayoutProps {
  title: string;
  subtitle?: string;
  breadcrumb: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

export function DashboardLayout({
  title,
  subtitle,
  breadcrumb,
  actions,
  children,
}: DashboardLayoutProps) {
  const { user, effectiveRole, logout } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const role: EffectiveRole = effectiveRole || 'STUDENT';
  const navItems = getNavItems(role);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await logout();
      showToast('Signed out of ClassMate.', 'info');
      navigate('/login');
    } catch {
      showToast('Could not complete sign out.', 'error');
    } finally {
      setSigningOut(false);
    }
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-white border-r border-slate-200/85">
      <div className="px-5 py-5 border-b border-slate-200/80 flex items-center justify-between">
        <Link
          to="/"
          className="font-display text-lg font-bold tracking-tight text-[#162B4D] whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB] rounded"
        >
          ClassMate
        </Link>
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          aria-label="Close navigation menu"
          className="lg:hidden p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="px-4 py-4 border-b border-slate-100">
        <div className="flex items-center justify-between gap-2 mb-1">
          <p className="text-sm font-semibold text-[#162B4D] truncate">
            {user?.name || 'Member'}
          </p>
          <RoleBadge role={role} compact />
        </div>
        <p className="text-xs text-slate-500 truncate">{user?.department}</p>
      </div>

      <nav aria-label="Workspace navigation" className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB] ${
                  isActive
                    ? 'bg-[#2563EB]/10 text-[#2563EB]'
                    : 'text-slate-600 hover:text-[#162B4D] hover:bg-slate-100/80'
                }`
              }
            >
              <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-200/80 space-y-3">
        <div className="flex items-center justify-between text-xs text-slate-500 px-1">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-[#1D9BA6]" aria-hidden="true" />
            Role Access
          </span>
          <RoleBadge role={role} />
        </div>
        <Button
          variant="secondary"
          size="sm"
          className="w-full"
          loading={signingOut}
          onClick={handleSignOut}
        >
          <LogOut className="w-4 h-4" aria-hidden="true" />
          Sign out
        </Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F3F6FB] text-[#162B4D] flex">
      {/* Desktop sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 sticky top-0 h-screen">
        {sidebarContent}
      </aside>

      {/* Mobile slide-over sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <div
            className="fixed inset-0 bg-[#162B4D]/40"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative z-50 w-72 max-w-[85vw] h-full">
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Main viewport */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-20 bg-white/95 backdrop-blur-xs border-b border-slate-200/85 px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden p-2 -ml-2 rounded-lg text-[#162B4D] hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB]"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm text-slate-500 min-w-0">
              <span className="hidden sm:inline whitespace-nowrap">ClassMate</span>
              <span className="hidden sm:inline" aria-hidden="true">/</span>
              <span className="font-medium text-[#162B4D] truncate">{breadcrumb}</span>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <NotificationBell />
            {actions}
          </div>
        </header>

        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 sm:py-8 max-w-7xl w-full mx-auto">
          <div className="mb-6">
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#162B4D]">
              {title}
            </h1>
            {subtitle && (
              <p className="text-sm sm:text-base text-slate-600 mt-1">{subtitle}</p>
            )}
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
