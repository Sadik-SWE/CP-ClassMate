import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Award, Bell, CheckCheck, FileText, Megaphone, Presentation } from 'lucide-react';
import { notificationsApi } from '../../services/api';
import { NotificationType, type NotificationDTO } from '../../shared/types';

function getNotificationIcon(type: NotificationType) {
  switch (type) {
    case NotificationType.ANNOUNCEMENT:
      return Megaphone;
    case NotificationType.TOPIC:
      return Presentation;
    case NotificationType.QUIZ:
      return Award;
    case NotificationType.RESOURCE:
    default:
      return FileText;
  }
}

function formatTimeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationDTO[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const loadNotifications = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await notificationsApi.list({ page: 1, limit: 15 });
      setNotifications(res.data.notifications);
      setUnreadCount(res.data.unreadCount);
    } catch {
      void 0;
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      await Promise.resolve();
      if (!active) return;
      await loadNotifications(true);
    })();
    const interval = window.setInterval(() => {
      void loadNotifications(true);
    }, 45_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [loadNotifications]);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const handleToggle = () => {
    const next = !open;
    setOpen(next);
    if (next) {
      loadNotifications(false);
    }
  };

  const handleItemClick = async (item: NotificationDTO) => {
    if (!item.readAt) {
      try {
        await notificationsApi.markRead(item.id);
        setNotifications((prev) =>
          prev.map((n) =>
            n.id === item.id ? { ...n, readAt: new Date().toISOString() } : n
          )
        );
        setUnreadCount((c) => Math.max(0, c - 1));
      } catch {
        void 0;
      }
    }
    setOpen(false);
    if (item.link) {
      navigate(item.link);
    }
  };

  const handleMarkAllRead = async () => {
    if (unreadCount === 0) return;
    setMarkingAll(true);
    try {
      await notificationsApi.markAllRead();
      const nowIso = new Date().toISOString();
      setNotifications((prev) => prev.map((n) => ({ ...n, readAt: n.readAt || nowIso })));
      setUnreadCount(0);
    } catch {
      void 0;
    } finally {
      setMarkingAll(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={handleToggle}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
        aria-expanded={open}
        className="relative inline-flex items-center justify-center w-9 h-9 rounded-lg border border-slate-200 bg-white text-[#162B4D] hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB] cursor-pointer transition-colors"
      >
        <Bell className="w-4 h-4" aria-hidden="true" />
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#2563EB] text-white text-[11px] font-semibold leading-[18px] text-center tabular-nums">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Recent notifications"
          className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl bg-white border border-slate-200 shadow-xl z-40 overflow-hidden"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200/80">
            <div>
              <h2 className="text-sm font-semibold text-[#162B4D]">
                Notifications
              </h2>
              <p className="text-xs text-slate-500 tabular-nums">
                {unreadCount} unread
              </p>
            </div>
            <button
              type="button"
              onClick={handleMarkAllRead}
              disabled={unreadCount === 0 || markingAll}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[#2563EB] hover:text-[#1d4ed8] disabled:text-slate-400 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap shrink-0"
            >
              <CheckCheck className="w-3.5 h-3.5" aria-hidden="true" />
              Mark all read
            </button>
          </div>

          <div className="max-h-96 overflow-y-auto divide-y divide-slate-100">
            {loading ? (
              <div className="p-4 space-y-3">
                <div className="h-10 bg-slate-100 rounded-lg animate-pulse" />
                <div className="h-10 bg-slate-100 rounded-lg animate-pulse" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-slate-500">
                No notifications yet. Course announcements, notes, and topics will appear here.
              </div>
            ) : (
              notifications.map((item) => {
                const Icon = getNotificationIcon(item.type);
                const unread = !item.readAt;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleItemClick(item)}
                    className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-colors cursor-pointer ${
                      unread
                        ? 'bg-[#2563EB]/[0.04] hover:bg-[#2563EB]/[0.08]'
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    <div
                      className={`mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        unread
                          ? 'bg-[#2563EB]/10 text-[#2563EB]'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      <Icon className="w-4 h-4" aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p
                          className={`text-xs leading-snug ${
                            unread
                              ? 'font-semibold text-[#162B4D]'
                              : 'font-medium text-slate-700'
                          }`}
                        >
                          {item.title}
                        </p>
                        {unread && (
                          <span
                            className="w-2 h-2 rounded-full bg-[#2563EB] shrink-0 mt-1"
                            aria-label="Unread"
                          />
                        )}
                      </div>
                      <p className="text-xs text-slate-600 mt-0.5 line-clamp-2">
                        {item.message}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-1 tabular-nums">
                        {formatTimeAgo(item.createdAt)}
                      </p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
