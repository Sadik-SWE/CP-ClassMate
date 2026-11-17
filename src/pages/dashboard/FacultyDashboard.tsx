import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, Users } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { coursesApi, ApiClientError } from '../../services/api';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { CardSkeleton } from '../../components/ui/Skeleton';
import { CourseRosterModal } from '../../components/courses/CourseRosterModal';
import { AnnouncementFeed } from '../../components/announcements/AnnouncementFeed';
import type { CourseDTO } from '../../shared/types';

export function FacultyDashboard() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [courses, setCourses] = useState<CourseDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    coursesApi
      .listMyCourses({ page: 1, limit: 50 })
      .then((res) => {
        if (!active) return;
        setCourses(res.data.courses);
      })
      .catch((err) => {
        if (!active) return;
        const msg =
          err instanceof ApiClientError
            ? err.message
            : 'Unable to load teaching courses.';
        showToast(msg, 'error');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [showToast]);

  const totalStudents = courses.reduce((sum, c) => sum + c.enrollmentCount, 0);

  return (
    <DashboardLayout
      title="Faculty Workspace"
      subtitle={`${user?.name || 'Faculty'} · ${user?.department || ''}`}
      breadcrumb="Faculty Dashboard"
      actions={
        <Link
          to="/profile"
          className="inline-flex items-center px-4 py-2 rounded-lg bg-[#6D5BD0] hover:bg-[#5b49bc] text-white text-sm font-medium whitespace-nowrap shrink-0"
        >
          My Profile
        </Link>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card padding="sm">
          <p className="text-xs font-medium text-slate-500">Assigned Courses</p>
          <p className="font-display text-2xl font-bold text-[#6D5BD0] mt-1 tabular-nums">
            {loading ? '—' : courses.length}
          </p>
        </Card>
        <Card padding="sm">
          <p className="text-xs font-medium text-slate-500">Total Enrolled Seats</p>
          <p className="font-display text-2xl font-bold text-[#162B4D] mt-1 tabular-nums">
            {loading ? '—' : totalStudents}
          </p>
        </Card>
        <Card padding="sm">
          <p className="text-xs font-medium text-slate-500">Assigned Class Reps</p>
          <p className="font-display text-2xl font-bold text-[#1D9BA6] mt-1 tabular-nums">
            {loading
              ? '—'
              : courses.reduce((sum, c) => sum + c.crs.length, 0)}
          </p>
        </Card>
      </div>

      <Card>
        <div className="mb-5">
          <h2 className="font-display text-lg font-semibold text-[#162B4D]">
            Your Teaching Courses
          </h2>
          <p className="text-sm text-slate-600">
            Access is scoped strictly to courses assigned to your faculty account
          </p>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <CardSkeleton rows={3} />
            <CardSkeleton rows={3} />
          </div>
        ) : courses.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="No courses assigned yet"
            description="An administrator will assign your courses for the current semester."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {courses.map((course) => (
              <div
                key={course.id}
                className="rounded-xl border border-slate-200 p-5 flex flex-col justify-between gap-4"
              >
                <div>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="font-mono font-semibold text-[#6D5BD0]">
                      {course.courseCode}
                    </span>
                    <span className="text-slate-500">{course.semester}</span>
                  </div>
                  <h3 className="font-display text-base font-semibold text-[#162B4D]">
                    {course.courseName}
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">{course.department}</p>

                  <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-600">
                    <span className="font-medium text-[#162B4D]">Class Reps:</span>{' '}
                    {course.crs.length > 0
                      ? course.crs.map((c) => c.name).join(', ')
                      : 'None assigned'}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 pt-2">
                  <span className="text-xs text-slate-600 flex items-center gap-1.5 tabular-nums">
                    <Users className="w-3.5 h-3.5" aria-hidden="true" />
                    {course.enrollmentCount} enrolled students
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
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#6D5BD0] hover:bg-[#5b49bc] text-white text-xs font-medium whitespace-nowrap shrink-0"
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
      </Card>

      <div className="mt-6">
        <AnnouncementFeed
          manageableCourses={courses}
          canCreate={courses.length > 0}
          title="Teaching Announcements"
          subtitle="Post notices to an individual course or broadcast to all your enrolled students."
        />
      </div>

      <CourseRosterModal
        courseId={selectedCourseId}
        onClose={() => setSelectedCourseId(null)}
      />
    </DashboardLayout>
  );
}
