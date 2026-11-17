import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  BookPlus,
  CalendarClock,
  Search,
  Sparkles,
  Users,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { coursesApi, ApiClientError } from '../../services/api';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { CardSkeleton } from '../../components/ui/Skeleton';
import { CourseRosterModal } from '../../components/courses/CourseRosterModal';
import { CourseCatalogModal } from '../../components/courses/CourseCatalogModal';
import { AnnouncementFeed } from '../../components/announcements/AnnouncementFeed';
import type { CourseDTO, PaginationMeta } from '../../shared/types';

export function StudentDashboard() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [courses, setCourses] = useState<CourseDTO[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [catalogOpen, setCatalogOpen] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      await Promise.resolve();
      if (!active) return;
      setLoading(true);
      try {
        const res = await coursesApi.listMyCourses({
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
          err instanceof ApiClientError ? err.message : 'Could not load courses.';
        showToast(msg, 'error');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [page, search, refreshKey, showToast]);

  const skillCount = user?.profile?.skills?.length ?? 0;
  const interestCount = user?.profile?.interests?.length ?? 0;
  const slotCount = user?.availability?.length ?? 0;

  return (
    <DashboardLayout
      title={`Welcome, ${user?.name || 'Student'}`}
      subtitle={`${user?.department || 'Department'} ${user?.batch ? `· ${user.batch}` : ''}`}
      breadcrumb="Student Dashboard"
      actions={
        <div className="flex items-center gap-2">
          <Link
            to="/collaboration?tab=matching"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-[#162B4D] text-sm font-medium whitespace-nowrap shrink-0"
          >
            <Sparkles className="w-4 h-4 text-[#2563EB]" aria-hidden="true" />
            AI Team Matching
          </Link>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setCatalogOpen(true)}
          >
            <BookPlus className="w-4 h-4" aria-hidden="true" />
            Browse Courses
          </Button>
          <Link
            to="/profile"
            className="inline-flex items-center px-4 py-2 rounded-lg bg-[#2563EB] hover:bg-[#1d4ed8] text-white text-sm font-medium whitespace-nowrap shrink-0"
          >
            Edit Profile
          </Link>
        </div>
      }
    >
      {/* Summary metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card padding="sm">
          <p className="text-xs font-medium text-slate-500">Enrolled Courses</p>
          <p className="font-display text-2xl font-bold text-[#162B4D] mt-1 tabular-nums">
            {loading ? '—' : (meta?.total ?? courses.length)}
          </p>
        </Card>
        <Card padding="sm">
          <p className="text-xs font-medium text-slate-500">Skills & Interests</p>
          <p className="font-display text-2xl font-bold text-[#2563EB] mt-1 tabular-nums">
            {skillCount} skills · {interestCount} interests
          </p>
        </Card>
        <Card padding="sm">
          <p className="text-xs font-medium text-slate-500">Weekly Availability</p>
          <p className="font-display text-2xl font-bold text-[#1D9BA6] mt-1 tabular-nums">
            {slotCount} {slotCount === 1 ? 'slot' : 'slots'}
          </p>
        </Card>
      </div>

      {/* Course list */}
      <Card>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
          <div>
            <h2 className="font-display text-lg font-semibold text-[#162B4D]">
              My Enrolled Courses
            </h2>
            <p className="text-sm text-slate-600">
              View course details, instructors, class representatives, and classmate rosters
            </p>
          </div>
          <div className="relative w-full sm:w-64">
            <Search
              className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
              aria-hidden="true"
            />
            <input
              type="search"
              aria-label="Search enrolled courses"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search code or title..."
              className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 text-sm text-[#162B4D] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
            />
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <CardSkeleton rows={2} />
            <CardSkeleton rows={2} />
          </div>
        ) : courses.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="No enrolled courses found"
            description="Once an administrator enrolls you in courses for the active semester, they will appear here."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {courses.map((course) => (
              <div
                key={course.id}
                className="rounded-xl border border-slate-200 p-4 flex flex-col justify-between gap-4 hover:border-slate-300 transition-colors"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-500 mb-1.5">
                    <span className="font-mono font-semibold text-[#2563EB]">
                      {course.courseCode}
                    </span>
                    <span>{course.semester}</span>
                  </div>
                  <h3 className="font-display text-base font-semibold text-[#162B4D]">
                    {course.courseName}
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">{course.department}</p>

                  <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-600 space-y-1">
                    <p>
                      <span className="font-medium text-[#162B4D]">Faculty:</span>{' '}
                      {course.faculty.length > 0
                        ? course.faculty.map((f) => f.name).join(', ')
                        : 'Unassigned'}
                    </p>
                    <p>
                      <span className="font-medium text-[#162B4D]">Class Rep:</span>{' '}
                      {course.crs.length > 0
                        ? course.crs.map((c) => c.name).join(', ')
                        : 'Unassigned'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 pt-2">
                  <span className="text-xs text-slate-500 flex items-center gap-1.5 tabular-nums">
                    <Users className="w-3.5 h-3.5" aria-hidden="true" />
                    {course.enrollmentCount} students
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setSelectedCourseId(course.id)}
                    >
                      Roster
                    </Button>
                    <Link
                      to={`/courses/${course.id}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#2563EB] hover:bg-[#1d4ed8] text-white text-xs font-medium whitespace-nowrap shrink-0"
                    >
                      Open Course
                      <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                    </Link>
                  </div>
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
      </Card>

      {/* Profile prompt if availability or skills are empty */}
      {(skillCount === 0 || slotCount === 0) && (
        <Card className="mt-6 bg-white">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <CalendarClock className="w-5 h-5 text-[#1D9BA6] shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <h3 className="text-sm font-semibold text-[#162B4D]">
                  Complete your skills and study availability
                </h3>
                <p className="text-sm text-slate-600">
                  Keeping your profile up to date prepares your account for course team
                  matching.
                </p>
              </div>
            </div>
            <Link
              to="/profile"
              className="inline-flex items-center justify-center px-4 py-2 rounded-lg border border-slate-300 text-sm font-medium text-[#162B4D] hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              Update Profile
            </Link>
          </div>
        </Card>
      )}

      <div className="mt-6">
        <AnnouncementFeed
          title="Recent Announcements"
          subtitle="Notices from your enrolled courses. Pinned updates stay at the top."
        />
      </div>

      <CourseRosterModal
        courseId={selectedCourseId}
        onClose={() => setSelectedCourseId(null)}
      />

      <CourseCatalogModal
        open={catalogOpen}
        onClose={() => setCatalogOpen(false)}
        onEnrollmentChange={() => setRefreshKey((k) => k + 1)}
      />
    </DashboardLayout>
  );
}
