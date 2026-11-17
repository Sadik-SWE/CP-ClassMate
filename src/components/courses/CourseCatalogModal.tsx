import React, { useEffect, useState } from 'react';
import { BookPlus, Check, Search, Users } from 'lucide-react';
import { ApiClientError, coursesApi } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { Modal } from '../ui/Modal';
import { ConfirmModal } from '../ui/ConfirmModal';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { CardSkeleton } from '../ui/Skeleton';
import type { CourseDTO, PaginationMeta } from '../../shared/types';

interface CourseCatalogModalProps {
  open: boolean;
  onClose: () => void;
  onEnrollmentChange: () => void;
}

export function CourseCatalogModal({
  open,
  onClose,
  onEnrollmentChange,
}: CourseCatalogModalProps) {
  const { showToast } = useToast();
  const [courses, setCourses] = useState<CourseDTO[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [busyCourseId, setBusyCourseId] = useState<string | null>(null);
  const [dropCandidate, setDropCandidate] = useState<CourseDTO | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    (async () => {
      await Promise.resolve();
      if (!active) return;
      setLoading(true);
      try {
        const res = await coursesApi.listCatalog({
          page,
          limit: 8,
          search: search.trim() || undefined,
        });
        if (!active) return;
        setCourses(res.data.courses);
        setMeta(res.meta);
      } catch (err) {
        if (!active) return;
        const msg =
          err instanceof ApiClientError
            ? err.message
            : 'Unable to load course catalog.';
        showToast(msg, 'error');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [open, page, search, showToast]);

  const handleEnroll = async (course: CourseDTO) => {
    setBusyCourseId(course.id);
    try {
      const res = await coursesApi.selfEnroll(course.id);
      setCourses((prev) =>
        prev.map((c) => (c.id === course.id ? res.data.course : c))
      );
      showToast(`Enrolled in ${course.courseCode}.`, 'success');
      onEnrollmentChange();
    } catch (err) {
      const msg =
        err instanceof ApiClientError ? err.message : 'Could not enroll in course.';
      showToast(msg, 'error');
    } finally {
      setBusyCourseId(null);
    }
  };

  const handleConfirmDrop = async () => {
    if (!dropCandidate) return;
    setBusyCourseId(dropCandidate.id);
    try {
      const res = await coursesApi.selfDrop(dropCandidate.id);
      setCourses((prev) =>
        prev.map((c) => (c.id === dropCandidate.id ? res.data.course : c))
      );
      showToast(`Dropped ${dropCandidate.courseCode}.`, 'info');
      setDropCandidate(null);
      onEnrollmentChange();
    } catch (err) {
      const msg =
        err instanceof ApiClientError ? err.message : 'Could not drop course.';
      showToast(msg, 'error');
    } finally {
      setBusyCourseId(null);
    }
  };

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="Course Catalog & Self-Enrollment"
        subtitle="Enroll in active semester courses to access notes, announcements, and presentation topics."
        maxWidth="xl"
      >
        <div className="mb-4 relative">
          <Search
            className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
            aria-hidden="true"
          />
          <input
            type="search"
            aria-label="Search course catalog"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search by course code, title, or department..."
            className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 text-sm text-[#162B4D] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
          />
        </div>

        {loading ? (
          <div className="space-y-3">
            <CardSkeleton rows={2} />
            <CardSkeleton rows={2} />
          </div>
        ) : courses.length === 0 ? (
          <EmptyState
            icon={BookPlus}
            title="No matching active courses"
            description="Try a different search keyword or ask your department admin to publish courses."
          />
        ) : (
          <div className="space-y-3">
            {courses.map((course) => (
              <div
                key={course.id}
                className="rounded-xl border border-slate-200 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="font-mono font-semibold text-[#2563EB]">
                      {course.courseCode}
                    </span>
                    <span>·</span>
                    <span>{course.semester}</span>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1 tabular-nums">
                      <Users className="w-3.5 h-3.5" aria-hidden="true" />
                      {course.enrollmentCount}
                    </span>
                  </div>
                  <h3 className="font-display text-base font-semibold text-[#162B4D] mt-0.5">
                    {course.courseName}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {course.department}
                    {course.faculty.length > 0
                      ? ` · Faculty: ${course.faculty.map((f) => f.name).join(', ')}`
                      : ''}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {course.isEnrolled ? (
                    course.isAssignedCR ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1D9BA6]/10 text-[#12737c] text-xs font-medium whitespace-nowrap">
                        <Check className="w-3.5 h-3.5" aria-hidden="true" />
                        Assigned CR
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        variant="secondary"
                        loading={busyCourseId === course.id}
                        onClick={() => setDropCandidate(course)}
                      >
                        Drop Course
                      </Button>
                    )
                  ) : (
                    <Button
                      size="sm"
                      variant="primary"
                      loading={busyCourseId === course.id}
                      onClick={() => handleEnroll(course)}
                    >
                      Self-Enroll
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {meta && meta.totalPages > 1 && (
          <div className="flex items-center justify-between mt-5 pt-4 border-t border-slate-100 text-xs text-slate-600">
            <span className="tabular-nums">
              Page {meta.page} of {meta.totalPages}
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
      </Modal>

      <ConfirmModal
        open={Boolean(dropCandidate)}
        onClose={() => setDropCandidate(null)}
        onConfirm={handleConfirmDrop}
        title="Drop Course Enrollment"
        description={`Are you sure you want to drop ${dropCandidate?.courseCode || 'this course'} (${dropCandidate?.courseName || ''})? You will lose access to its course materials until you re-enroll.`}
        confirmLabel="Drop Course"
        destructive
        loading={Boolean(dropCandidate && busyCourseId === dropCandidate.id)}
      />
    </>
  );
}
