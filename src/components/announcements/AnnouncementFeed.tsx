import React, { useEffect, useState } from 'react';
import {
  Edit3,
  Megaphone,
  Pin,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { announcementsApi, ApiClientError } from '../../services/api';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { ConfirmModal } from '../ui/ConfirmModal';
import { EmptyState } from '../ui/EmptyState';
import { CardSkeleton } from '../ui/Skeleton';
import {
  AnnouncementScope,
  UserRole,
  type AnnouncementDTO,
  type CourseDTO,
  type PaginationMeta,
} from '../../shared/types';

interface AnnouncementFeedProps {
  courseId?: string;
  manageableCourses?: CourseDTO[];
  canCreate?: boolean;
  title?: string;
  subtitle?: string;
}

export function AnnouncementFeed({
  courseId,
  manageableCourses = [],
  canCreate = false,
  title = 'Course Announcements',
  subtitle = 'Pinned notices appear first, followed by the latest updates.',
}: AnnouncementFeedProps) {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [announcements, setAnnouncements] = useState<AnnouncementDTO[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  // Create / Edit modal state
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<AnnouncementDTO | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formScope, setFormScope] = useState<AnnouncementScope>(
    courseId ? AnnouncementScope.COURSE : AnnouncementScope.COURSE
  );
  const [formCourseId, setFormCourseId] = useState(courseId || '');
  const [formPinned, setFormPinned] = useState(false);
  const [saving, setSaving] = useState(false);

  // Withdraw confirm modal state
  const [withdrawTarget, setWithdrawTarget] = useState<AnnouncementDTO | null>(
    null
  );
  const [withdrawing, setWithdrawing] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      await Promise.resolve();
      if (!active) return;
      setLoading(true);
      try {
        const res = await announcementsApi.list({
          page,
          limit: 6,
          courseId,
          search: search.trim() || undefined,
        });
        if (!active) return;
        setAnnouncements(res.data.announcements);
        setMeta(res.meta);
      } catch (err) {
        if (!active) return;
        const msg =
          err instanceof ApiClientError
            ? err.message
            : 'Unable to load announcements.';
        showToast(msg, 'error');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [courseId, page, search, refreshKey, showToast]);

  const openCreateModal = () => {
    setEditing(null);
    setFormTitle('');
    setFormContent('');
    setFormScope(AnnouncementScope.COURSE);
    setFormCourseId(courseId || manageableCourses[0]?.id || '');
    setFormPinned(false);
    setEditorOpen(true);
  };

  const openEditModal = (item: AnnouncementDTO) => {
    setEditing(item);
    setFormTitle(item.title);
    // Strip basic HTML tags into editable plain text while preserving paragraphs
    const plain = item.content
      .replace(/<\/p>\s*<p>/gi, '\n\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '');
    setFormContent(plain);
    setFormScope(item.scope);
    setFormCourseId(item.courseId || '');
    setFormPinned(item.pinned);
    setEditorOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim() || !formContent.trim()) {
      showToast('Title and content are required.', 'error');
      return;
    }
    if (!editing && formScope === AnnouncementScope.COURSE && !formCourseId) {
      showToast('Select a target course for this announcement.', 'error');
      return;
    }

    setSaving(true);
    try {
      if (editing) {
        await announcementsApi.update(editing.id, {
          title: formTitle.trim(),
          content: formContent.trim(),
          pinned: formPinned,
        });
        showToast('Announcement updated.', 'success');
      } else {
        await announcementsApi.create({
          title: formTitle.trim(),
          content: formContent.trim(),
          scope: formScope,
          courseId: formScope === AnnouncementScope.COURSE ? formCourseId : null,
          pinned: formPinned,
        });
        showToast('Announcement published and members notified.', 'success');
      }
      setEditorOpen(false);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      const msg =
        err instanceof ApiClientError
          ? err.message
          : 'Could not save announcement.';
      showToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleWithdrawConfirm = async () => {
    if (!withdrawTarget) return;
    setWithdrawing(true);
    try {
      await announcementsApi.withdraw(withdrawTarget.id);
      showToast('Announcement withdrawn.', 'info');
      setWithdrawTarget(null);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      const msg =
        err instanceof ApiClientError
          ? err.message
          : 'Could not withdraw announcement.';
      showToast(msg, 'error');
    } finally {
      setWithdrawing(false);
    }
  };

  const canModifyItem = (item: AnnouncementDTO): boolean => {
    if (!user) return false;
    if (user.role === UserRole.ADMIN) return true;
    if (item.author.id === user.id) return true;
    if (item.courseId) {
      const targetCourse = manageableCourses.find((c) => c.id === item.courseId);
      if (targetCourse && (targetCourse.isCourseFaculty || targetCourse.isAssignedCR)) {
        return true;
      }
      if (user.crCourseIds.includes(item.courseId)) return true;
    }
    return false;
  };

  return (
    <>
      <Card>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
          <div>
            <h2 className="font-display text-lg font-semibold text-[#162B4D]">
              {title}
            </h2>
            <p className="text-sm text-slate-600">{subtitle}</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative w-full sm:w-56">
              <Search
                className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                aria-hidden="true"
              />
              <input
                type="search"
                aria-label="Search announcements"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search notices..."
                className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 text-sm text-[#162B4D] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
              />
            </div>
            {canCreate && (courseId || manageableCourses.length > 0) && (
              <Button size="sm" variant="primary" onClick={openCreateModal}>
                <Plus className="w-4 h-4" aria-hidden="true" />
                Post Announcement
              </Button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">
            <CardSkeleton rows={2} />
            <CardSkeleton rows={2} />
          </div>
        ) : announcements.length === 0 ? (
          <EmptyState
            icon={Megaphone}
            title="No announcements published"
            description="Important course schedules, room changes, and deadlines will appear here."
          />
        ) : (
          <div className="space-y-3">
            {announcements.map((item) => {
              const manageable = canModifyItem(item);
              return (
                <article
                  key={item.id}
                  className={`rounded-xl border p-4 transition-colors ${
                    item.pinned
                      ? 'border-[#2563EB]/35 bg-[#2563EB]/[0.025]'
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap text-xs text-slate-500 mb-1">
                        {item.pinned && (
                          <span className="inline-flex items-center gap-1 font-semibold text-[#2563EB]">
                            <Pin className="w-3.5 h-3.5" aria-hidden="true" />
                            Pinned
                          </span>
                        )}
                        <span className="font-mono font-semibold text-[#162B4D]">
                          {item.scope === AnnouncementScope.ALL_ENROLLED
                            ? 'All Enrolled Courses'
                            : item.courseCode || 'Course Notice'}
                        </span>
                        <span>·</span>
                        <span>{item.author.name}</span>
                        <span>·</span>
                        <time
                          dateTime={item.createdAt}
                          className="tabular-nums"
                        >
                          {new Date(item.createdAt).toLocaleDateString()}
                        </time>
                      </div>
                      <h3 className="font-display text-base font-semibold text-[#162B4D]">
                        {item.title}
                      </h3>
                      <div
                        className="mt-1.5 text-sm text-slate-600 leading-relaxed prose prose-sm max-w-none [&_p]:mb-1.5 last:[&_p]:mb-0"
                        dangerouslySetInnerHTML={{ __html: item.content }}
                      />
                    </div>

                    {manageable && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => openEditModal(item)}
                          title="Edit announcement"
                          aria-label="Edit announcement"
                          className="p-2 rounded-lg text-slate-500 hover:text-[#2563EB] hover:bg-slate-100 cursor-pointer"
                        >
                          <Edit3 className="w-4 h-4" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setWithdrawTarget(item)}
                          title="Withdraw announcement"
                          aria-label="Withdraw announcement"
                          className="p-2 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" aria-hidden="true" />
                        </button>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {meta && meta.totalPages > 1 && (
          <div className="flex items-center justify-between mt-5 pt-4 border-t border-slate-100 text-xs text-slate-600">
            <span className="tabular-nums">
              Page {meta.page} of {meta.totalPages} ({meta.total} total)
            </span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={meta.page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={meta.page >= meta.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Modal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={editing ? 'Edit Announcement' : 'Post Announcement'}
        subtitle="Published announcements notify relevant course members immediately."
      >
        <form onSubmit={handleSave} className="space-y-4">
          {!editing && !courseId && (
            <div>
              <label className="block text-sm font-medium text-[#162B4D] mb-1">
                Target Scope
              </label>
              <select
                value={formScope}
                onChange={(e) => setFormScope(e.target.value as AnnouncementScope)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#162B4D] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
              >
                <option value={AnnouncementScope.COURSE}>Specific Course</option>
                <option value={AnnouncementScope.ALL_ENROLLED}>
                  All My Managed / Enrolled Students
                </option>
              </select>
            </div>
          )}

          {!editing && !courseId && formScope === AnnouncementScope.COURSE && (
            <div>
              <label className="block text-sm font-medium text-[#162B4D] mb-1">
                Course
              </label>
              <select
                value={formCourseId}
                onChange={(e) => setFormCourseId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#162B4D] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
                required
              >
                <option value="">Select a course...</option>
                {manageableCourses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.courseCode} — {c.courseName}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label
              htmlFor="ann-title"
              className="block text-sm font-medium text-[#162B4D] mb-1"
            >
              Title
            </label>
            <input
              id="ann-title"
              type="text"
              required
              minLength={3}
              maxLength={200}
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              placeholder="e.g., Week 5 Lab Submission Deadline"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#162B4D] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
            />
          </div>

          <div>
            <label
              htmlFor="ann-content"
              className="block text-sm font-medium text-[#162B4D] mb-1"
            >
              Message
            </label>
            <textarea
              id="ann-content"
              required
              rows={5}
              minLength={5}
              maxLength={5000}
              value={formContent}
              onChange={(e) => setFormContent(e.target.value)}
              placeholder="Write announcement details for students..."
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#162B4D] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-[#162B4D] cursor-pointer">
            <input
              type="checkbox"
              checked={formPinned}
              onChange={(e) => setFormPinned(e.target.checked)}
              className="rounded border-slate-300 text-[#2563EB] focus:ring-[#2563EB]"
            />
            Pin this announcement to the top of the feed
          </label>

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setEditorOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={saving}>
              {editing ? 'Save Changes' : 'Publish Announcement'}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={Boolean(withdrawTarget)}
        onClose={() => setWithdrawTarget(null)}
        onConfirm={handleWithdrawConfirm}
        title="Withdraw Announcement"
        description={`Withdraw "${withdrawTarget?.title || ''}"? It will no longer appear in active student feeds.`}
        confirmLabel="Withdraw"
        destructive
        loading={withdrawing}
      />
    </>
  );
}
