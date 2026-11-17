import React, { useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { coursesApi, ApiClientError } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { Modal } from '../ui/Modal';
import { EmptyState } from '../ui/EmptyState';
import { SkeletonLine } from '../ui/Skeleton';
import type { CourseDTO, CourseUserSummary } from '../../shared/types';

interface CourseRosterModalProps {
  courseId: string | null;
  onClose: () => void;
}

export function CourseRosterModal({ courseId, onClose }: CourseRosterModalProps) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [course, setCourse] = useState<CourseDTO | null>(null);
  const [students, setStudents] = useState<CourseUserSummary[]>([]);

  useEffect(() => {
    if (!courseId) return;
    let active = true;
    (async () => {
      await Promise.resolve();
      if (!active) return;
      setLoading(true);
      try {
        const res = await coursesApi.getCourseRoster(courseId);
        if (!active) return;
        setCourse(res.data.course);
        setStudents(res.data.students);
      } catch (err) {
        if (!active) return;
        const msg =
          err instanceof ApiClientError ? err.message : 'Unable to load course roster.';
        showToast(msg, 'error');
        onClose();
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [courseId, onClose, showToast]);

  return (
    <Modal
      open={Boolean(courseId)}
      onClose={onClose}
      title={course ? `${course.courseCode} · ${course.courseName}` : 'Course Roster'}
      subtitle={course ? `${course.department} · ${course.semester}` : undefined}
      maxWidth="xl"
    >
      {loading ? (
        <div className="space-y-3 py-2">
          <SkeletonLine className="h-5 w-1/2" />
          <SkeletonLine className="h-10 w-full" />
          <SkeletonLine className="h-10 w-full" />
          <SkeletonLine className="h-10 w-full" />
        </div>
      ) : !course ? null : (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div className="rounded-lg bg-[#F3F6FB] p-3.5 border border-slate-200/70">
              <p className="text-xs font-semibold text-slate-500 mb-1">Course Faculty</p>
              {course.faculty.length === 0 ? (
                <p className="text-slate-500">No faculty assigned</p>
              ) : (
                <ul className="space-y-1">
                  {course.faculty.map((f) => (
                    <li key={f.id} className="font-medium text-[#162B4D]">
                      {f.name}{' '}
                      <span className="text-xs font-normal text-slate-500">
                        ({f.email})
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-lg bg-[#F3F6FB] p-3.5 border border-slate-200/70">
              <p className="text-xs font-semibold text-slate-500 mb-1">
                Assigned Class Representatives
              </p>
              {course.crs.length === 0 ? (
                <p className="text-slate-500">No CR assigned</p>
              ) : (
                <ul className="space-y-1">
                  {course.crs.map((cr) => (
                    <li key={cr.id} className="font-medium text-[#12737c]">
                      {cr.name}{' '}
                      <span className="text-xs font-normal text-slate-500">
                        ({cr.studentId || cr.email})
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-[#162B4D]">
                Enrolled Students
              </h3>
              <span className="text-xs font-mono text-slate-500 tabular-nums">
                {students.length} enrolled
              </span>
            </div>

            {students.length === 0 ? (
              <EmptyState
                icon={Users}
                title="No enrolled students"
                description="Students enrolled in this course will appear here."
              />
            ) : (
              <div className="border border-slate-200 rounded-lg overflow-hidden divide-y divide-slate-100 max-h-72 overflow-y-auto">
                {students.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between gap-4 px-3.5 py-2.5 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-[#162B4D] truncate">{s.name}</p>
                      <p className="text-xs text-slate-500 truncate">{s.email}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-mono text-slate-600 tabular-nums">
                        {s.studentId || '—'}
                      </p>
                      <p className="text-xs text-slate-500">{s.department}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
