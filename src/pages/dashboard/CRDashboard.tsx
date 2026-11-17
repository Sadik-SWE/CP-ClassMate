import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  BookPlus,
  ShieldCheck,
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
import type { CourseDTO } from '../../shared/types';

export function CRDashboard() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [courses, setCourses] = useState<CourseDTO[]>([]);
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
        const res = await coursesApi.listMyCourses({ page: 1, limit: 50 });
        if (!active) return;
        setCourses(res.data.courses);
      } catch (err) {
        if (!active) return;
        const msg =
          err instanceof ApiClientError
            ? err.message
            : 'Unable to load CR courses.';
        showToast(msg, 'error');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [refreshKey, showToast]);

  const assignedCRCourses = courses.filter((c) => c.isAssignedCR);
  const otherEnrolledCourses = courses.filter((c) => !c.isAssignedCR);

  return (
    <DashboardLayout
      title="Class Representative Workspace"
      subtitle={`Course-scoped coordination for ${user?.name || 'Class Rep'}`}
      breadcrumb="CR Workspace"
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
            className="inline-flex items-center px-4 py-2 rounded-lg bg-[#1D9BA6] hover:bg-[#17838c] text-white text-sm font-medium whitespace-nowrap shrink-0"
          >
            My Profile
          </Link>
        </div>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card padding="sm">
          <p className="text-xs font-medium text-slate-500">CR Assigned Courses</p>
          <p className="font-display text-2xl font-bold text-[#1D9BA6] mt-1 tabular-nums">
            {loading ? '—' : assignedCRCourses.length}
          </p>
        </Card>
        <Card padding="sm">
          <p className="text-xs font-medium text-slate-500">Total Enrolled Courses</p>
          <p className="font-display text-2xl font-bold text-[#162B4D] mt-1 tabular-nums">
            {loading ? '—' : courses.length}
          </p>
        </Card>
        <Card padding="sm">
          <p className="text-xs font-medium text-slate-500">Represented Students</p>
          <p className="font-display text-2xl font-bold text-[#2563EB] mt-1 tabular-nums">
            {loading
              ? '—'
              : assignedCRCourses.reduce((acc, c) => acc + c.enrollmentCount, 0)}
          </p>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <div className="flex items-center justify-between gap-4 mb-5">
            <div>
              <h2 className="font-display text-lg font-semibold text-[#162B4D] flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-[#1D9BA6]" aria-hidden="true" />
                Assigned CR Courses
              </h2>
              <p className="text-sm text-slate-600">
                You hold Class Representative coordination permissions strictly for these
                courses
              </p>
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <CardSkeleton rows={2} />
              <CardSkeleton rows={2} />
            </div>
          ) : assignedCRCourses.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title="No active CR assignments"
              description="An administrator can assign you as a Class Representative to one or more courses."
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {assignedCRCourses.map((course) => (
                <div
                  key={course.id}
                  className="rounded-xl border border-[#1D9BA6]/35 bg-[#1D9BA6]/[0.03] p-4 flex flex-col justify-between gap-4"
                >
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="font-mono font-semibold text-[#12737c]">
                        {course.courseCode} · CR Scope
                      </span>
                      <span className="text-slate-500">{course.semester}</span>
                    </div>
                    <h3 className="font-display text-base font-semibold text-[#162B4D]">
                      {course.courseName}
                    </h3>
                    <p className="text-xs text-slate-600 mt-1">
                      Faculty:{' '}
                      {course.faculty.length > 0
                        ? course.faculty.map((f) => f.name).join(', ')
                        : 'Unassigned'}
                    </p>
                  </div>

                  <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-200/70">
                    <span className="text-xs text-slate-600 flex items-center gap-1.5 tabular-nums">
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
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1D9BA6] hover:bg-[#17838c] text-white text-xs font-medium whitespace-nowrap shrink-0"
                      >
                        Manage Course
                        <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {otherEnrolledCourses.length > 0 && (
          <Card>
            <h2 className="font-display text-lg font-semibold text-[#162B4D] mb-1">
              Other Enrolled Courses (Student Scope)
            </h2>
            <p className="text-sm text-slate-600 mb-4">
              Courses where you participate with standard student access
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {otherEnrolledCourses.map((course) => (
                <div
                  key={course.id}
                  className="rounded-xl border border-slate-200 p-4 flex items-center justify-between gap-4"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-mono font-semibold text-[#2563EB]">
                      {course.courseCode}
                    </p>
                    <p className="font-medium text-[#162B4D] truncate">
                      {course.courseName}
                    </p>
                    <p className="text-xs text-slate-500">{course.semester}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setSelectedCourseId(course.id)}
                    >
                      Roster
                    </Button>
                    <Link
                      to={`/courses/${course.id}`}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#2563EB] hover:bg-[#1d4ed8] text-white text-xs font-medium whitespace-nowrap shrink-0"
                    >
                      Open
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        <AnnouncementFeed
          manageableCourses={assignedCRCourses}
          canCreate={assignedCRCourses.length > 0}
          title="Course Announcements"
          subtitle="Publish or update announcements for your assigned CR courses."
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
