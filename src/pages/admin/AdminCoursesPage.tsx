import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Plus, Search, UserPlus } from 'lucide-react';
import { adminApi, coursesApi, ApiClientError } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Table, type TableColumn } from '../../components/ui/Table';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { ConfirmModal } from '../../components/ui/ConfirmModal';
import {
  CourseStatus,
  UserRole,
  UserStatus,
  type CourseDTO,
  type CourseUserSummary,
  type PaginationMeta,
  type PublicUser,
} from '../../shared/types';

export function AdminCoursesPage() {
  const { showToast } = useToast();

  const [courses, setCourses] = useState<CourseDTO[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);

  const [facultyOptions, setFacultyOptions] = useState<PublicUser[]>([]);
  const [studentOptions, setStudentOptions] = useState<PublicUser[]>([]);

  // Create / Edit Modal state
  const [courseModalOpen, setCourseModalOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<CourseDTO | null>(null);
  const [courseCode, setCourseCode] = useState('');
  const [courseName, setCourseName] = useState('');
  const [department, setDepartment] = useState('Computer Science & Engineering');
  const [semester, setSemester] = useState('Fall 2026');
  const [courseStatus, setCourseStatus] = useState<CourseStatus>(CourseStatus.ACTIVE);
  const [selectedFacultyIds, setSelectedFacultyIds] = useState<string[]>([]);
  const [selectedCrIds, setSelectedCrIds] = useState<string[]>([]);
  const [savingCourse, setSavingCourse] = useState(false);

  // Roster & CR management modal
  const [rosterCourse, setRosterCourse] = useState<CourseDTO | null>(null);
  const [rosterStudents, setRosterStudents] = useState<CourseUserSummary[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [studentToEnroll, setStudentToEnroll] = useState('');
  const [dropTarget, setDropTarget] = useState<CourseUserSummary | null>(null);
  const [mutatingRoster, setMutatingRoster] = useState(false);

  useEffect(() => {
    let active = true;
    adminApi
      .listCourses({
        page,
        limit: 10,
        search: search.trim() || undefined,
        status: statusFilter || undefined,
      })
      .then((res) => {
        if (!active) return;
        setCourses(res.data.courses);
        setMeta(res.meta);
      })
      .catch((err) => {
        if (!active) return;
        const msg =
          err instanceof ApiClientError ? err.message : 'Unable to load courses.';
        showToast(msg, 'error');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [page, search, statusFilter, refreshKey, showToast]);

  useEffect(() => {
    let active = true;
    Promise.all([
      adminApi.listUsers({
        role: UserRole.FACULTY,
        status: UserStatus.ACTIVE,
        limit: 100,
      }),
      adminApi.listUsers({
        role: UserRole.STUDENT,
        status: UserStatus.ACTIVE,
        limit: 100,
      }),
    ])
      .then(([facRes, stuRes]) => {
        if (!active) return;
        setFacultyOptions(facRes.data.users);
        setStudentOptions(stuRes.data.users);
      })
      .catch((err) => {
        if (!active) return;
        if (err instanceof ApiClientError) {
          showToast(err.message, 'error');
        }
      });
    return () => {
      active = false;
    };
  }, [showToast]);

  const openCreateModal = () => {
    setEditingCourse(null);
    setCourseCode('');
    setCourseName('');
    setDepartment('Computer Science & Engineering');
    setSemester('Fall 2026');
    setCourseStatus(CourseStatus.ACTIVE);
    setSelectedFacultyIds([]);
    setSelectedCrIds([]);
    setCourseModalOpen(true);
  };

  const openEditModal = (course: CourseDTO) => {
    setEditingCourse(course);
    setCourseCode(course.courseCode);
    setCourseName(course.courseName);
    setDepartment(course.department);
    setSemester(course.semester);
    setCourseStatus(course.status);
    setSelectedFacultyIds(course.faculty.map((f) => f.id));
    setSelectedCrIds(course.crs.map((c) => c.id));
    setCourseModalOpen(true);
  };

  const handleSaveCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!courseCode.trim() || !courseName.trim()) {
      showToast('Course code and name are required.', 'error');
      return;
    }

    setSavingCourse(true);
    try {
      if (editingCourse) {
        await adminApi.updateCourse(editingCourse.id, {
          courseCode: courseCode.trim(),
          courseName: courseName.trim(),
          department: department.trim(),
          semester: semester.trim(),
          status: courseStatus,
          facultyIds: selectedFacultyIds,
          crUserIds: selectedCrIds,
        });
        showToast('Course updated successfully.', 'success');
      } else {
        await adminApi.createCourse({
          courseCode: courseCode.trim(),
          courseName: courseName.trim(),
          department: department.trim(),
          semester: semester.trim(),
          status: courseStatus,
          facultyIds: selectedFacultyIds,
          crUserIds: selectedCrIds,
        });
        showToast('Course created successfully.', 'success');
      }
      setCourseModalOpen(false);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      const msg =
        err instanceof ApiClientError ? err.message : 'Unable to save course.';
      showToast(msg, 'error');
    } finally {
      setSavingCourse(false);
    }
  };

  const openRosterModal = async (course: CourseDTO) => {
    setRosterCourse(course);
    setRosterLoading(true);
    setStudentToEnroll('');
    try {
      const res = await coursesApi.getCourseRoster(course.id);
      setRosterCourse(res.data.course);
      setRosterStudents(res.data.students);
    } catch (err) {
      const msg =
        err instanceof ApiClientError ? err.message : 'Unable to load roster.';
      showToast(msg, 'error');
      setRosterCourse(null);
    } finally {
      setRosterLoading(false);
    }
  };

  const refreshOpenRoster = async (courseId: string) => {
    const rosterRes = await coursesApi.getCourseRoster(courseId);
    setRefreshKey((k) => k + 1);
    setRosterCourse(rosterRes.data.course);
    setRosterStudents(rosterRes.data.students);
  };

  const handleEnrollStudent = async () => {
    if (!rosterCourse || !studentToEnroll) return;
    setMutatingRoster(true);
    try {
      await adminApi.manageEnrollment(rosterCourse.id, studentToEnroll, 'ENROLL');
      showToast('Student enrolled in course.', 'success');
      setStudentToEnroll('');
      await refreshOpenRoster(rosterCourse.id);
    } catch (err) {
      const msg =
        err instanceof ApiClientError ? err.message : 'Unable to enroll student.';
      showToast(msg, 'error');
    } finally {
      setMutatingRoster(false);
    }
  };

  const handleToggleCR = async (studentId: string, isCurrentlyCR: boolean) => {
    if (!rosterCourse) return;
    setMutatingRoster(true);
    try {
      await adminApi.assignCR(
        rosterCourse.id,
        studentId,
        isCurrentlyCR ? 'REMOVE' : 'ADD'
      );
      showToast(
        isCurrentlyCR
          ? 'Removed Class Representative assignment.'
          : 'Assigned as Class Representative.',
        'success'
      );
      await refreshOpenRoster(rosterCourse.id);
    } catch (err) {
      const msg =
        err instanceof ApiClientError ? err.message : 'Unable to update CR.';
      showToast(msg, 'error');
    } finally {
      setMutatingRoster(false);
    }
  };

  const confirmDropStudent = async () => {
    if (!rosterCourse || !dropTarget) return;
    setMutatingRoster(true);
    try {
      await adminApi.manageEnrollment(rosterCourse.id, dropTarget.id, 'DROP');
      showToast(`Removed ${dropTarget.name} from ${rosterCourse.courseCode}.`, 'success');
      setDropTarget(null);
      await refreshOpenRoster(rosterCourse.id);
    } catch (err) {
      const msg =
        err instanceof ApiClientError ? err.message : 'Unable to drop student.';
      showToast(msg, 'error');
    } finally {
      setMutatingRoster(false);
    }
  };

  const toggleMultiId = (list: string[], id: string, setter: (val: string[]) => void) => {
    if (list.includes(id)) {
      setter(list.filter((item) => item !== id));
    } else {
      setter([...list, id]);
    }
  };

  const columns: TableColumn<CourseDTO>[] = [
    {
      key: 'course',
      header: 'Course',
      render: (row) => (
        <div className="min-w-[200px]">
          <p className="font-mono text-xs font-semibold text-[#2563EB]">
            {row.courseCode}
          </p>
          <p className="font-semibold text-[#162B4D]">{row.courseName}</p>
          <p className="text-xs text-slate-500">
            {row.department} · {row.semester}
          </p>
        </div>
      ),
    },
    {
      key: 'faculty',
      header: 'Faculty',
      render: (row) => (
        <span className="text-xs text-slate-700">
          {row.faculty.length > 0
            ? row.faculty.map((f) => f.name).join(', ')
            : 'Unassigned'}
        </span>
      ),
    },
    {
      key: 'crs',
      header: 'Class Reps',
      render: (row) => (
        <span className="text-xs font-medium text-[#12737c]">
          {row.crs.length > 0 ? row.crs.map((c) => c.name).join(', ') : 'None'}
        </span>
      ),
    },
    {
      key: 'enrolled',
      header: 'Enrolled',
      align: 'right',
      render: (row) => (
        <span className="font-mono text-xs tabular-nums">{row.enrollmentCount}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <span
          className={`inline-block rounded-md border px-2 py-0.5 text-xs font-semibold ${
            row.status === CourseStatus.ACTIVE
              ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
              : 'text-slate-600 bg-slate-100 border-slate-200'
          }`}
        >
          {row.status}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => (
        <div className="inline-flex items-center justify-end gap-2">
          <Link
            to={`/courses/${row.id}`}
            className="inline-flex items-center px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-[#162B4D] whitespace-nowrap shrink-0"
          >
            Open
          </Link>
          <Button size="sm" variant="secondary" onClick={() => openRosterModal(row)}>
            CR & Roster
          </Button>
          <Button size="sm" variant="ghost" onClick={() => openEditModal(row)}>
            Edit
          </Button>
        </div>
      ),
    },
  ];

  const enrolledIdsSet = new Set(rosterStudents.map((s) => s.id));
  const unenrolledStudents = studentOptions.filter((s) => !enrolledIdsSet.has(s.id));

  return (
    <DashboardLayout
      title="Course Management"
      subtitle="Create courses, assign faculty instructors, appoint Class Representatives, and manage student enrollments"
      breadcrumb="Admin / Courses"
      actions={
        <Button onClick={openCreateModal}>
          <Plus className="w-4 h-4" aria-hidden="true" />
          New Course
        </Button>
      }
    >
      <Card padding="sm" className="mb-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="relative sm:col-span-2">
            <Search
              className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
              aria-hidden="true"
            />
            <input
              type="search"
              aria-label="Search courses"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search by course code, title, or department..."
              className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 text-sm text-[#162B4D] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
            />
          </div>
          <select
            aria-label="Filter by course status"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#162B4D]"
          >
            <option value="">All Statuses</option>
            <option value={CourseStatus.ACTIVE}>Active</option>
            <option value={CourseStatus.ARCHIVED}>Archived</option>
          </select>
        </div>
      </Card>

      <Table
        columns={columns}
        data={courses}
        keyExtractor={(c) => c.id}
        loading={loading}
        meta={meta}
        onPageChange={setPage}
        emptyState={
          <EmptyState
            icon={BookOpen}
            title="No courses found"
            description="Create a new academic course or clear your search filters."
            action={
              <Button size="sm" onClick={openCreateModal}>
                Create Course
              </Button>
            }
          />
        }
      />

      {/* Create / Edit Course Modal */}
      <Modal
        open={courseModalOpen}
        onClose={() => setCourseModalOpen(false)}
        title={editingCourse ? `Edit ${editingCourse.courseCode}` : 'Create New Course'}
        subtitle="Configure course details, faculty instructors, and assigned Class Representatives"
        maxWidth="xl"
      >
        <form onSubmit={handleSaveCourse} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="course-code"
                className="block text-sm font-medium text-[#162B4D] mb-1"
              >
                Course Code
              </label>
              <input
                id="course-code"
                type="text"
                required
                value={courseCode}
                onChange={(e) => setCourseCode(e.target.value)}
                placeholder="CSE-301"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono uppercase"
              />
            </div>
            <div>
              <label
                htmlFor="course-semester"
                className="block text-sm font-medium text-[#162B4D] mb-1"
              >
                Semester
              </label>
              <input
                id="course-semester"
                type="text"
                required
                value={semester}
                onChange={(e) => setSemester(e.target.value)}
                placeholder="Fall 2026"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="course-name"
              className="block text-sm font-medium text-[#162B4D] mb-1"
            >
              Course Name
            </label>
            <input
              id="course-name"
              type="text"
              required
              value={courseName}
              onChange={(e) => setCourseName(e.target.value)}
              placeholder="Software Engineering & System Design"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="course-dept"
                className="block text-sm font-medium text-[#162B4D] mb-1"
              >
                Department
              </label>
              <input
                id="course-dept"
                type="text"
                required
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label
                htmlFor="course-status"
                className="block text-sm font-medium text-[#162B4D] mb-1"
              >
                Status
              </label>
              <select
                id="course-status"
                value={courseStatus}
                onChange={(e) => setCourseStatus(e.target.value as CourseStatus)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                <option value={CourseStatus.ACTIVE}>ACTIVE</option>
                <option value={CourseStatus.ARCHIVED}>ARCHIVED</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-[#162B4D] mb-1.5">
                Assign Faculty ({selectedFacultyIds.length})
              </p>
              <div className="border border-slate-200 rounded-lg max-h-40 overflow-y-auto divide-y divide-slate-100">
                {facultyOptions.length === 0 ? (
                  <p className="p-3 text-xs text-slate-500">No active faculty available</p>
                ) : (
                  facultyOptions.map((f) => (
                    <label
                      key={f.id}
                      className="flex items-center gap-2.5 px-3 py-2 text-xs hover:bg-slate-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedFacultyIds.includes(f.id)}
                        onChange={() =>
                          toggleMultiId(
                            selectedFacultyIds,
                            f.id,
                            setSelectedFacultyIds
                          )
                        }
                      />
                      <span className="truncate font-medium text-[#162B4D]">
                        {f.name}
                      </span>
                    </label>
                  ))
                )}
              </div>
            </div>

            <div>
              <p className="text-sm font-medium text-[#162B4D] mb-1.5">
                Assign Class Reps ({selectedCrIds.length})
              </p>
              <div className="border border-slate-200 rounded-lg max-h-40 overflow-y-auto divide-y divide-slate-100">
                {studentOptions.length === 0 ? (
                  <p className="p-3 text-xs text-slate-500">No active students available</p>
                ) : (
                  studentOptions.map((s) => (
                    <label
                      key={s.id}
                      className="flex items-center gap-2.5 px-3 py-2 text-xs hover:bg-slate-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedCrIds.includes(s.id)}
                        onChange={() =>
                          toggleMultiId(selectedCrIds, s.id, setSelectedCrIds)
                        }
                      />
                      <span className="truncate font-medium text-[#162B4D]">
                        {s.name}
                      </span>
                    </label>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <Button
              variant="secondary"
              onClick={() => setCourseModalOpen(false)}
              disabled={savingCourse}
            >
              Cancel
            </Button>
            <Button type="submit" loading={savingCourse}>
              {editingCourse ? 'Save Changes' : 'Create Course'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Roster & CR Assignment Modal */}
      <Modal
        open={Boolean(rosterCourse)}
        onClose={() => setRosterCourse(null)}
        title={
          rosterCourse
            ? `${rosterCourse.courseCode} · CR & Enrollments`
            : 'Course Roster'
        }
        subtitle={rosterCourse?.courseName}
        maxWidth="xl"
      >
        {rosterLoading || !rosterCourse ? (
          <p className="text-sm text-slate-500 py-4">Loading course roster...</p>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-col sm:flex-row gap-2">
              <select
                aria-label="Select student to enroll"
                value={studentToEnroll}
                onChange={(e) => setStudentToEnroll(e.target.value)}
                className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#162B4D]"
              >
                <option value="">Select active student to enroll...</option>
                {unenrolledStudents.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.studentId || s.email})
                  </option>
                ))}
              </select>
              <Button
                onClick={handleEnrollStudent}
                disabled={!studentToEnroll || mutatingRoster}
                loading={mutatingRoster}
              >
                <UserPlus className="w-4 h-4" aria-hidden="true" />
                Enroll Student
              </Button>
            </div>

            <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-80 overflow-y-auto">
              {rosterStudents.length === 0 ? (
                <p className="p-4 text-sm text-slate-500 text-center">
                  No students enrolled in this course yet.
                </p>
              ) : (
                rosterStudents.map((student) => {
                  const isCR = rosterCourse.crs.some((c) => c.id === student.id);
                  return (
                    <div
                      key={student.id}
                      className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-sm"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-[#162B4D]">
                            {student.name}
                          </span>
                          {isCR && (
                            <span className="rounded border border-[#1D9BA6]/30 bg-[#1D9BA6]/10 px-1.5 py-0.5 text-[11px] font-mono font-semibold text-[#12737c]">
                              CR
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500">
                          {student.email} {student.studentId ? `· ${student.studentId}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant={isCR ? 'secondary' : 'teal'}
                          disabled={mutatingRoster}
                          onClick={() => handleToggleCR(student.id, isCR)}
                        >
                          {isCR ? 'Remove CR' : 'Assign CR'}
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          disabled={mutatingRoster}
                          onClick={() => setDropTarget(student)}
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </Modal>

      <ConfirmModal
        open={Boolean(dropTarget)}
        onClose={() => setDropTarget(null)}
        onConfirm={confirmDropStudent}
        title="Remove Student From Course"
        description={`Remove ${dropTarget?.name} from ${rosterCourse?.courseCode}? If they are currently an assigned CR for this course, their CR assignment for this course will also be removed.`}
        confirmLabel="Remove Student"
        destructive
        loading={mutatingRoster}
      />
    </DashboardLayout>
  );
}
