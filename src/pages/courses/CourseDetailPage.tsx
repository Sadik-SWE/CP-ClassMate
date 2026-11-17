import React, { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpen,
  Calendar,
  ClipboardCheck,
  Download,
  FileText,
  HelpCircle,
  Lock,
  Megaphone,
  Plus,
  Presentation,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Upload,
  Users,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  ApiClientError,
  coursesApi,
  presentationsApi,
  quizzesApi,
  resourcesApi,
} from '../../services/api';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { ConfirmModal } from '../../components/ui/ConfirmModal';
import { EmptyState } from '../../components/ui/EmptyState';
import { CardSkeleton } from '../../components/ui/Skeleton';
import { CourseRosterModal } from '../../components/courses/CourseRosterModal';
import { AnnouncementFeed } from '../../components/announcements/AnnouncementFeed';
import {
  PresentationAssigneeType,
  PresentationStatus,
  ResourceStatus,
  ResourceType,
  ResourceVisibility,
  UserRole,
  type CourseDTO,
  type CourseUserSummary,
  type LeaderboardEntryDTO,
  type PaginationMeta,
  type PresentationTopicDTO,
  type QuizQuestionPublicDTO,
  type ResourceDTO,
} from '../../shared/types';

type CourseTab = 'notes' | 'announcements' | 'topics' | 'quiz';

const VALID_TABS: CourseTab[] = ['notes', 'announcements', 'topics', 'quiz'];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getProgressBadgeStyle(status: PresentationStatus): {
  label: string;
  classes: string;
} {
  switch (status) {
    case PresentationStatus.PRESENTED:
      return {
        label: 'Presented',
        classes: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      };
    case PresentationStatus.IN_PROGRESS:
      return {
        label: 'In Progress',
        classes: 'bg-amber-50 text-[#b45309] border-amber-200',
      };
    case PresentationStatus.ASSIGNED:
    default:
      return {
        label: 'Assigned',
        classes: 'bg-slate-100 text-[#162B4D] border-slate-200',
      };
  }
}

export function CourseDetailPage() {
  const { courseId = '' } = useParams<{ courseId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, dashboardPath } = useAuth();
  const { showToast } = useToast();

  const rawTab = searchParams.get('tab') as CourseTab | null;
  const activeTab: CourseTab =
    rawTab && VALID_TABS.includes(rawTab) ? rawTab : 'notes';

  const setTab = (tab: CourseTab) => {
    setSearchParams({ tab }, { replace: true });
  };

  const [course, setCourse] = useState<CourseDTO | null>(null);
  const [courseLoading, setCourseLoading] = useState(true);
  const [courseError, setCourseError] = useState<string | null>(null);
  const [rosterOpen, setRosterOpen] = useState(false);

  // Notes / Resources state
  const [resources, setResources] = useState<ResourceDTO[]>([]);
  const [resMeta, setResMeta] = useState<PaginationMeta | null>(null);
  const [resPage, setResPage] = useState(1);
  const [resTypeFilter, setResTypeFilter] = useState<ResourceType | ''>('');
  const [resSearch, setResSearch] = useState('');
  const [resLoading, setResLoading] = useState(false);
  const [resRefreshKey, setResRefreshKey] = useState(0);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [deleteResTarget, setDeleteResTarget] = useState<ResourceDTO | null>(null);
  const [deletingRes, setDeletingRes] = useState(false);

  // Upload Resource modal state
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadDesc, setUploadDesc] = useState('');
  const [uploadType, setUploadType] = useState<ResourceType>(ResourceType.NOTES);
  const [uploadVisibility, setUploadVisibility] = useState<ResourceVisibility>(
    ResourceVisibility.COURSE
  );
  const [uploading, setUploading] = useState(false);

  // Presentation Topics state
  const [topics, setTopics] = useState<PresentationTopicDTO[]>([]);
  const [topicsMeta, setTopicsMeta] = useState<PaginationMeta | null>(null);
  const [topicsPage, setTopicsPage] = useState(1);
  const [topicStatusFilter, setTopicStatusFilter] = useState<
    PresentationStatus | ''
  >('');
  const [topicsLoading, setTopicsLoading] = useState(false);
  const [topicsRefreshKey, setTopicsRefreshKey] = useState(0);
  const [enrolledStudents, setEnrolledStudents] = useState<CourseUserSummary[]>([]);

  // Create Topic modal
  const [createTopicOpen, setCreateTopicOpen] = useState(false);
  const [topicTitle, setTopicTitle] = useState('');
  const [topicDesc, setTopicDesc] = useState('');
  const [topicDueDate, setTopicDueDate] = useState('');
  const [topicAssigneeType, setTopicAssigneeType] =
    useState<PresentationAssigneeType>(PresentationAssigneeType.COURSE);
  const [topicAssigneeUserId, setTopicAssigneeUserId] = useState('');
  const [topicAssigneeLabel, setTopicAssigneeLabel] = useState('');
  const [creatingTopic, setCreatingTopic] = useState(false);

  // Coordinate modal (CR / Faculty / Admin)
  const [coordTarget, setCoordTarget] = useState<PresentationTopicDTO | null>(
    null
  );
  const [coordSlot, setCoordSlot] = useState('');
  const [coordNotes, setCoordNotes] = useState('');
  const [savingCoord, setSavingCoord] = useState(false);

  // Progress modal (Faculty / Admin)
  const [progressTarget, setProgressTarget] =
    useState<PresentationTopicDTO | null>(null);
  const [progressStatus, setProgressStatus] = useState<PresentationStatus>(
    PresentationStatus.ASSIGNED
  );
  const [progressNotes, setProgressNotes] = useState('');
  const [savingProgress, setSavingProgress] = useState(false);

  // Delete topic confirm
  const [deleteTopicTarget, setDeleteTopicTarget] =
    useState<PresentationTopicDTO | null>(null);
  const [deletingTopic, setDeletingTopic] = useState(false);

  // Course Quiz tab preview state
  const [courseQuizQuestions, setCourseQuizQuestions] = useState<
    QuizQuestionPublicDTO[]
  >([]);
  const [courseQuizTotal, setCourseQuizTotal] = useState(0);
  const [courseLeaderboard, setCourseLeaderboard] = useState<
    LeaderboardEntryDTO[]
  >([]);
  const [courseQuizLoading, setCourseQuizLoading] = useState(false);

  useEffect(() => {
    if (!courseId) return;
    let active = true;
    (async () => {
      await Promise.resolve();
      if (!active) return;
      setCourseLoading(true);
      setCourseError(null);
      try {
        const res = await coursesApi.getCourseDetail(courseId);
        if (!active) return;
        setCourse(res.data.course);
      } catch (err) {
        if (!active) return;
        const msg =
          err instanceof ApiClientError
            ? err.message
            : 'Unable to load course details.';
        setCourseError(msg);
      } finally {
        if (active) setCourseLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [courseId]);

  const canManageResources = Boolean(
    user?.role === UserRole.ADMIN ||
      course?.isCourseFaculty ||
      course?.isAssignedCR
  );
  const canManageAnnouncements = canManageResources;
  const canManageTopics = Boolean(
    user?.role === UserRole.ADMIN || course?.isCourseFaculty
  );
  const canCoordinateTopics = canManageResources;

  // Load Resources when Notes tab is active
  useEffect(() => {
    if (!course || activeTab !== 'notes') return;
    let active = true;
    (async () => {
      await Promise.resolve();
      if (!active) return;
      setResLoading(true);
      try {
        const res = await resourcesApi.listByCourse(course.id, {
          page: resPage,
          limit: 10,
          type: resTypeFilter,
          search: resSearch.trim() || undefined,
        });
        if (!active) return;
        setResources(res.data.resources);
        setResMeta(res.meta);
      } catch (err) {
        if (!active) return;
        const msg =
          err instanceof ApiClientError
            ? err.message
            : 'Unable to load course resources.';
        showToast(msg, 'error');
      } finally {
        if (active) setResLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [course, activeTab, resPage, resTypeFilter, resSearch, resRefreshKey, showToast]);

  // Poll gently while any PDF is still PROCESSING AI text indexing
  useEffect(() => {
    if (
      activeTab !== 'notes' ||
      !resources.some((r) => r.status === ResourceStatus.PROCESSING)
    ) {
      return;
    }
    const timer = window.setTimeout(() => {
      setResRefreshKey((k) => k + 1);
    }, 3500);
    return () => window.clearTimeout(timer);
  }, [activeTab, resources]);

  // Load Topics when Topics tab is active
  useEffect(() => {
    if (!course || activeTab !== 'topics') return;
    let active = true;
    (async () => {
      await Promise.resolve();
      if (!active) return;
      setTopicsLoading(true);
      try {
        const res = await presentationsApi.listByCourse(course.id, {
          page: topicsPage,
          limit: 10,
          status: topicStatusFilter,
        });
        if (!active) return;
        setTopics(res.data.topics);
        setTopicsMeta(res.meta);
      } catch (err) {
        if (!active) return;
        const msg =
          err instanceof ApiClientError
            ? err.message
            : 'Unable to load presentation topics.';
        showToast(msg, 'error');
      } finally {
        if (active) setTopicsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [course, activeTab, topicsPage, topicStatusFilter, topicsRefreshKey, showToast]);

  // Load enrolled roster when Faculty/Admin opens Topics tab for student assignments
  useEffect(() => {
    if (!course || activeTab !== 'topics' || !canManageTopics) return;
    let active = true;
    coursesApi
      .getCourseRoster(course.id)
      .then((res) => {
        if (active) setEnrolledStudents(res.data.students);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [course, activeTab, canManageTopics]);

  // Load course quiz preview when Quiz tab is active
  useEffect(() => {
    if (!course || activeTab !== 'quiz') return;
    let active = true;
    (async () => {
      await Promise.resolve();
      if (!active) return;
      setCourseQuizLoading(true);
      try {
        const [qRes, lbRes] = await Promise.all([
          quizzesApi.listQuestions({ courseId: course.id, page: 1, limit: 6 }),
          quizzesApi.getLeaderboard({ courseId: course.id, limit: 5 }),
        ]);
        if (!active) return;
        setCourseQuizQuestions(qRes.data.questions);
        setCourseQuizTotal(qRes.meta?.total ?? qRes.data.questions.length);
        setCourseLeaderboard(lbRes.data.leaderboard);
      } catch (err) {
        if (!active) return;
        const msg =
          err instanceof ApiClientError
            ? err.message
            : 'Unable to load course quiz summary.';
        showToast(msg, 'error');
      } finally {
        if (active) setCourseQuizLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [course, activeTab, showToast]);

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!course || !uploadFile) {
      showToast('Select a file to upload.', 'error');
      return;
    }
    if (uploadFile.size > 20 * 1024 * 1024) {
      showToast('File size must be 20 MB or less.', 'error');
      return;
    }
    setUploading(true);
    try {
      const uploadRes = await resourcesApi.upload(course.id, {
        file: uploadFile,
        title: uploadTitle.trim(),
        description: uploadDesc.trim(),
        type: uploadType,
        visibility: uploadVisibility,
      });
      showToast(
        uploadRes.data.resource.status === ResourceStatus.PROCESSING
          ? 'PDF uploaded to GridFS and queued for AI chunk indexing.'
          : 'Resource uploaded and ready.',
        'success'
      );
      setUploadOpen(false);
      setUploadFile(null);
      setUploadTitle('');
      setUploadDesc('');
      setUploadType(ResourceType.NOTES);
      setUploadVisibility(ResourceVisibility.COURSE);
      setResRefreshKey((k) => k + 1);
    } catch (err) {
      const msg =
        err instanceof ApiClientError ? err.message : 'Resource upload failed.';
      showToast(msg, 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleRetryIngestion = async (resItem: ResourceDTO) => {
    setRetryingId(resItem.id);
    try {
      await resourcesApi.retryIngestion(resItem.id);
      showToast('PDF ingestion re-queued.', 'info');
      setResRefreshKey((k) => k + 1);
    } catch (err) {
      const msg =
        err instanceof ApiClientError
          ? err.message
          : 'Unable to retry PDF ingestion.';
      showToast(msg, 'error');
    } finally {
      setRetryingId(null);
    }
  };

  const handleDownloadResource = async (resItem: ResourceDTO) => {
    setDownloadingId(resItem.id);
    try {
      await resourcesApi.download(resItem.id, resItem.file.originalName);
    } catch (err) {
      const msg =
        err instanceof ApiClientError
          ? err.message
          : 'Could not download file.';
      showToast(msg, 'error');
    } finally {
      setDownloadingId(null);
    }
  };

  const handleConfirmDeleteResource = async () => {
    if (!deleteResTarget) return;
    setDeletingRes(true);
    try {
      await resourcesApi.remove(deleteResTarget.id);
      showToast('Resource deleted.', 'info');
      setDeleteResTarget(null);
      setResRefreshKey((k) => k + 1);
    } catch (err) {
      const msg =
        err instanceof ApiClientError
          ? err.message
          : 'Could not delete resource.';
      showToast(msg, 'error');
    } finally {
      setDeletingRes(false);
    }
  };

  const handleCreateTopic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!course) return;
    setCreatingTopic(true);
    try {
      await presentationsApi.create(course.id, {
        title: topicTitle.trim(),
        description: topicDesc.trim(),
        dueDate: topicDueDate,
        assigneeType: topicAssigneeType,
        assigneeUserId:
          topicAssigneeType === PresentationAssigneeType.STUDENT
            ? topicAssigneeUserId
            : null,
        assigneeLabel:
          topicAssigneeType === PresentationAssigneeType.TEAM
            ? topicAssigneeLabel.trim()
            : null,
      });
      showToast('Presentation topic assigned.', 'success');
      setCreateTopicOpen(false);
      setTopicTitle('');
      setTopicDesc('');
      setTopicDueDate('');
      setTopicAssigneeType(PresentationAssigneeType.COURSE);
      setTopicAssigneeUserId('');
      setTopicAssigneeLabel('');
      setTopicsRefreshKey((k) => k + 1);
    } catch (err) {
      const msg =
        err instanceof ApiClientError
          ? err.message
          : 'Could not assign presentation topic.';
      showToast(msg, 'error');
    } finally {
      setCreatingTopic(false);
    }
  };

  const openCoordModal = (topic: PresentationTopicDTO) => {
    setCoordTarget(topic);
    setCoordSlot(topic.presentationSlot || '');
    setCoordNotes(topic.coordinationNotes || '');
  };

  const handleSaveCoordination = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!coordTarget) return;
    setSavingCoord(true);
    try {
      await presentationsApi.coordinate(coordTarget.id, {
        presentationSlot: coordSlot.trim(),
        coordinationNotes: coordNotes.trim(),
      });
      showToast('Coordination details updated.', 'success');
      setCoordTarget(null);
      setTopicsRefreshKey((k) => k + 1);
    } catch (err) {
      const msg =
        err instanceof ApiClientError
          ? err.message
          : 'Could not update coordination details.';
      showToast(msg, 'error');
    } finally {
      setSavingCoord(false);
    }
  };

  const openProgressModal = (topic: PresentationTopicDTO) => {
    setProgressTarget(topic);
    setProgressStatus(topic.progress.status);
    setProgressNotes(topic.progress.facultyNotes || '');
  };

  const handleSaveProgress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!progressTarget) return;
    setSavingProgress(true);
    try {
      await presentationsApi.updateProgress(progressTarget.id, {
        status: progressStatus,
        facultyNotes: progressNotes.trim(),
      });
      showToast('Presentation progress updated.', 'success');
      setProgressTarget(null);
      setTopicsRefreshKey((k) => k + 1);
    } catch (err) {
      const msg =
        err instanceof ApiClientError
          ? err.message
          : 'Could not update progress.';
      showToast(msg, 'error');
    } finally {
      setSavingProgress(false);
    }
  };

  const handleConfirmDeleteTopic = async () => {
    if (!deleteTopicTarget) return;
    setDeletingTopic(true);
    try {
      await presentationsApi.remove(deleteTopicTarget.id);
      showToast('Presentation topic removed.', 'info');
      setDeleteTopicTarget(null);
      setTopicsRefreshKey((k) => k + 1);
    } catch (err) {
      const msg =
        err instanceof ApiClientError
          ? err.message
          : 'Could not delete topic.';
      showToast(msg, 'error');
    } finally {
      setDeletingTopic(false);
    }
  };

  return (
    <DashboardLayout
      title={course ? `${course.courseCode} · ${course.courseName}` : 'Course Workspace'}
      subtitle={
        course
          ? `${course.department} · ${course.semester}`
          : 'Course resources, announcements, and presentation coordination'
      }
      breadcrumb={course ? course.courseCode : 'Course Detail'}
      actions={
        <div className="flex items-center gap-2">
          <Link
            to={dashboardPath}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs sm:text-sm font-medium text-[#162B4D] whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            Dashboard
          </Link>
          {course && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setRosterOpen(true)}
            >
              <Users className="w-4 h-4" aria-hidden="true" />
              Roster ({course.enrollmentCount})
            </Button>
          )}
        </div>
      }
    >
      {courseLoading ? (
        <div className="space-y-4">
          <CardSkeleton rows={3} />
          <CardSkeleton rows={4} />
        </div>
      ) : courseError || !course ? (
        <Card>
          <EmptyState
            icon={BookOpen}
            title="Course unavailable"
            description={
              courseError ||
              'You do not have permission to view this course or it does not exist.'
            }
          />
          <div className="mt-4 text-center">
            <Link
              to={dashboardPath}
              className="inline-flex items-center px-4 py-2 rounded-lg bg-[#2563EB] text-white text-sm font-medium"
            >
              Return to Dashboard
            </Link>
          </div>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Course Meta & Tabs */}
          <Card padding="sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div className="text-xs text-slate-600 flex flex-wrap items-center gap-x-4 gap-y-1">
                <span>
                  <strong className="text-[#162B4D]">Faculty:</strong>{' '}
                  {course.faculty.length > 0
                    ? course.faculty.map((f) => f.name).join(', ')
                    : 'Unassigned'}
                </span>
                <span>
                  <strong className="text-[#162B4D]">Class Reps:</strong>{' '}
                  {course.crs.length > 0
                    ? course.crs.map((c) => c.name).join(', ')
                    : 'Unassigned'}
                </span>
              </div>
              <div className="text-xs font-medium text-slate-600 tabular-nums">
                {course.isCourseFaculty
                  ? 'Faculty Scope'
                  : course.isAssignedCR
                    ? 'CR Scope'
                    : user?.role === UserRole.ADMIN
                      ? 'Administrator Scope'
                      : 'Enrolled Student Scope'}
              </div>
            </div>

            <nav
              aria-label="Course sections"
              className="flex items-center gap-2 pt-3 overflow-x-auto"
            >
              {[
                { id: 'notes' as const, label: 'Notes & Files', icon: FileText },
                {
                  id: 'announcements' as const,
                  label: 'Announcements',
                  icon: Megaphone,
                },
                { id: 'topics' as const, label: 'Topics', icon: Presentation },
                { id: 'quiz' as const, label: 'Quiz', icon: HelpCircle },
              ].map((tab) => {
                const Icon = tab.icon;
                const selected = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setTab(tab.id)}
                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      selected
                        ? 'bg-[#2563EB] text-white'
                        : 'text-slate-600 hover:text-[#162B4D] hover:bg-slate-100'
                    }`}
                  >
                    <Icon className="w-4 h-4" aria-hidden="true" />
                    {tab.label}
                  </button>
                );
              })}
            </nav>
          </Card>

          {/* TAB 1: NOTES & RESOURCES */}
          {activeTab === 'notes' && (
            <Card>
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-5">
                <div>
                  <h2 className="font-display text-lg font-semibold text-[#162B4D]">
                    Course Notes & Materials
                  </h2>
                  <p className="text-sm text-slate-600">
                    Lecture notes, slides, and reference files stored securely per course
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="relative w-full sm:w-52">
                    <Search
                      className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                      aria-hidden="true"
                    />
                    <input
                      type="search"
                      aria-label="Search course resources"
                      value={resSearch}
                      onChange={(e) => {
                        setResSearch(e.target.value);
                        setResPage(1);
                      }}
                      placeholder="Search files..."
                      className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 text-sm text-[#162B4D] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
                    />
                  </div>
                  <select
                    aria-label="Filter by resource type"
                    value={resTypeFilter}
                    onChange={(e) => {
                      setResTypeFilter(e.target.value as ResourceType | '');
                      setResPage(1);
                    }}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#162B4D] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
                  >
                    <option value="">All Types</option>
                    <option value={ResourceType.NOTES}>Notes</option>
                    <option value={ResourceType.SLIDES}>Slides</option>
                    <option value={ResourceType.REFERENCE}>Reference</option>
                    <option value={ResourceType.ASSIGNMENT}>Assignment</option>
                    <option value={ResourceType.OTHER}>Other</option>
                  </select>
                  {canManageResources && (
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => setUploadOpen(true)}
                    >
                      <Upload className="w-4 h-4" aria-hidden="true" />
                      Upload Material
                    </Button>
                  )}
                </div>
              </div>

              {resLoading ? (
                <div className="space-y-3">
                  <CardSkeleton rows={2} />
                  <CardSkeleton rows={2} />
                </div>
              ) : resources.length === 0 ? (
                <EmptyState
                  icon={FileText}
                  title="No course materials uploaded yet"
                  description={
                    canManageResources
                      ? 'Upload PDF lecture notes, DOCX handouts, PPTX slides, or reference images (up to 20 MB).'
                      : 'Lecture notes and reference materials uploaded by your faculty or CR will appear here.'
                  }
                />
              ) : (
                <div className="space-y-3">
                  {resources.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-xl border border-slate-200 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap text-xs text-slate-500 mb-1">
                          <span className="font-mono font-semibold text-[#2563EB]">
                            {item.type}
                          </span>
                          {item.visibility === ResourceVisibility.PRIVATE && (
                            <span className="inline-flex items-center gap-1 font-medium text-[#b45309]">
                              <Lock className="w-3 h-3" aria-hidden="true" />
                              Private (Faculty & CR)
                            </span>
                          )}
                          <span>·</span>
                          <span className="tabular-nums">
                            {formatBytes(item.file.size)}
                          </span>
                          {item.pageCount ? (
                            <>
                              <span>·</span>
                              <span className="tabular-nums">
                                {item.pageCount} pages
                              </span>
                            </>
                          ) : null}
                          {item.chunkCount && item.chunkCount > 0 ? (
                            <>
                              <span>·</span>
                              <span className="tabular-nums text-[#1D9BA6] font-medium">
                                {item.chunkCount} AI chunks
                              </span>
                            </>
                          ) : null}
                          <span>·</span>
                          <span
                            className={`font-medium ${
                              item.status === ResourceStatus.READY
                                ? 'text-emerald-700'
                                : item.status === ResourceStatus.PROCESSING
                                  ? 'text-[#D98E2B]'
                                  : 'text-rose-600'
                            }`}
                          >
                            {item.status === ResourceStatus.READY
                              ? 'Ready'
                              : item.status === ResourceStatus.PROCESSING
                                ? 'Indexing...'
                                : 'Ingestion Failed'}
                          </span>
                        </div>
                        <h3 className="font-display text-base font-semibold text-[#162B4D]">
                          {item.title}
                        </h3>
                        {item.description && (
                          <p className="text-sm text-slate-600 mt-0.5">
                            {item.description}
                          </p>
                        )}
                        {item.status === ResourceStatus.FAILED && item.ingestionError && (
                          <p className="text-xs text-rose-600 mt-1">
                            {item.ingestionError}
                          </p>
                        )}
                        <p className="text-xs text-slate-500 mt-1.5">
                          {item.file.originalName} · Uploaded by {item.uploadedBy.name}{' '}
                          on {new Date(item.createdAt).toLocaleDateString()}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {item.status === ResourceStatus.READY &&
                          item.file.mimeType === 'application/pdf' && (
                            <Link
                              to={`/study-assistant?courseId=${course.id}&resourceId=${item.id}`}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#6D5BD0]/10 hover:bg-[#6D5BD0]/20 text-[#6D5BD0] text-xs font-semibold whitespace-nowrap"
                            >
                              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                              Study with AI
                            </Link>
                          )}
                        {item.status === ResourceStatus.FAILED &&
                          canManageResources &&
                          item.file.mimeType === 'application/pdf' && (
                            <Button
                              size="sm"
                              variant="teal"
                              loading={retryingId === item.id}
                              onClick={() => handleRetryIngestion(item)}
                            >
                              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                              Retry Indexing
                            </Button>
                          )}
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={item.status !== ResourceStatus.READY}
                          loading={downloadingId === item.id}
                          onClick={() => handleDownloadResource(item)}
                        >
                          <Download className="w-4 h-4" aria-hidden="true" />
                          Download
                        </Button>
                        {canManageResources && (
                          <Button
                            size="sm"
                            variant="danger"
                            aria-label={`Delete ${item.title}`}
                            onClick={() => setDeleteResTarget(item)}
                          >
                            <Trash2 className="w-4 h-4" aria-hidden="true" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {resMeta && resMeta.totalPages > 1 && (
                <div className="flex items-center justify-between mt-5 pt-4 border-t border-slate-100 text-xs text-slate-600">
                  <span className="tabular-nums">
                    Page {resMeta.page} of {resMeta.totalPages}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={resMeta.page <= 1}
                      onClick={() => setResPage((p) => p - 1)}
                    >
                      Previous
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={resMeta.page >= resMeta.totalPages}
                      onClick={() => setResPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          )}

          {/* TAB 2: ANNOUNCEMENTS */}
          {activeTab === 'announcements' && (
            <AnnouncementFeed
              courseId={course.id}
              manageableCourses={canManageAnnouncements ? [course] : []}
              canCreate={canManageAnnouncements}
              title={`${course.courseCode} Announcements`}
              subtitle="Course-specific notices and pinned reminders."
            />
          )}

          {/* TAB 3: PRESENTATION TOPICS */}
          {activeTab === 'topics' && (
            <Card>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
                <div>
                  <h2 className="font-display text-lg font-semibold text-[#162B4D]">
                    Presentation Topics & Progress
                  </h2>
                  <p className="text-sm text-slate-600">
                    Faculty assign topics and track progress; Class Reps coordinate presentation slots
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <select
                    aria-label="Filter topics by progress status"
                    value={topicStatusFilter}
                    onChange={(e) => {
                      setTopicStatusFilter(
                        e.target.value as PresentationStatus | ''
                      );
                      setTopicsPage(1);
                    }}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#162B4D] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
                  >
                    <option value="">All Statuses</option>
                    <option value={PresentationStatus.ASSIGNED}>Assigned</option>
                    <option value={PresentationStatus.IN_PROGRESS}>
                      In Progress
                    </option>
                    <option value={PresentationStatus.PRESENTED}>
                      Presented
                    </option>
                  </select>
                  {canManageTopics && (
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => setCreateTopicOpen(true)}
                    >
                      <Plus className="w-4 h-4" aria-hidden="true" />
                      Assign Topic
                    </Button>
                  )}
                </div>
              </div>

              {topicsLoading ? (
                <div className="space-y-3">
                  <CardSkeleton rows={2} />
                  <CardSkeleton rows={2} />
                </div>
              ) : topics.length === 0 ? (
                <EmptyState
                  icon={Presentation}
                  title="No presentation topics assigned yet"
                  description={
                    canManageTopics
                      ? 'Assign a presentation topic to the whole course, a team, or a specific enrolled student.'
                      : 'Presentation topics assigned by your course faculty will appear here.'
                  }
                />
              ) : (
                <div className="space-y-4">
                  {topics.map((topic) => {
                    const badge = getProgressBadgeStyle(topic.progress.status);
                    const assigneeSummary =
                      topic.assigneeType === PresentationAssigneeType.STUDENT
                        ? `Student: ${topic.assigneeUser?.name || 'Assigned Student'}`
                        : topic.assigneeType === PresentationAssigneeType.TEAM
                          ? `Team: ${topic.assigneeLabel || 'Project Team'}`
                          : 'Entire Course';

                    return (
                      <div
                        key={topic.id}
                        className="rounded-xl border border-slate-200 p-4 space-y-3"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap text-xs text-slate-500 mb-1">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-md border text-xs font-medium ${badge.classes}`}
                              >
                                {badge.label}
                              </span>
                              <span className="font-medium text-[#162B4D]">
                                {assigneeSummary}
                              </span>
                              <span>·</span>
                              <span className="inline-flex items-center gap-1 tabular-nums">
                                <Calendar
                                  className="w-3.5 h-3.5"
                                  aria-hidden="true"
                                />
                                Due {new Date(topic.dueDate).toLocaleDateString()}
                              </span>
                            </div>
                            <h3 className="font-display text-base font-semibold text-[#162B4D]">
                              {topic.title}
                            </h3>
                            <p className="text-sm text-slate-600 mt-1">
                              {topic.description}
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 shrink-0">
                            {canCoordinateTopics && (
                              <>
                                <Link
                                  to={`/study-assistant?tab=presentation&courseId=${course.id}&topicId=${topic.id}`}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#6D5BD0]/10 hover:bg-[#6D5BD0]/20 text-[#6D5BD0] text-xs font-semibold whitespace-nowrap"
                                >
                                  <Sparkles
                                    className="w-3.5 h-3.5"
                                    aria-hidden="true"
                                  />
                                  AI Brief
                                </Link>
                                <Button
                                  size="sm"
                                  variant="teal"
                                  onClick={() => openCoordModal(topic)}
                                >
                                  <SlidersHorizontal
                                    className="w-3.5 h-3.5"
                                    aria-hidden="true"
                                  />
                                  Coordinate
                                </Button>
                              </>
                            )}
                            {canManageTopics && (
                              <>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => openProgressModal(topic)}
                                >
                                  <ClipboardCheck
                                    className="w-3.5 h-3.5"
                                    aria-hidden="true"
                                  />
                                  Track Progress
                                </Button>
                                <Button
                                  size="sm"
                                  variant="danger"
                                  aria-label={`Delete ${topic.title}`}
                                  onClick={() => setDeleteTopicTarget(topic)}
                                >
                                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                                </Button>
                              </>
                            )}
                          </div>
                        </div>

                        {(topic.presentationSlot ||
                          topic.coordinationNotes ||
                          topic.progress.facultyNotes) && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 border-t border-slate-100 text-xs">
                            {(topic.presentationSlot ||
                              topic.coordinationNotes) && (
                              <div className="rounded-lg bg-[#1D9BA6]/[0.05] border border-[#1D9BA6]/20 p-3">
                                <p className="font-semibold text-[#12737c] mb-0.5">
                                  CR Coordination
                                </p>
                                {topic.presentationSlot && (
                                  <p className="text-[#162B4D] font-medium">
                                    Slot: {topic.presentationSlot}
                                  </p>
                                )}
                                {topic.coordinationNotes && (
                                  <p className="text-slate-600 mt-0.5">
                                    {topic.coordinationNotes}
                                  </p>
                                )}
                              </div>
                            )}
                            {topic.progress.facultyNotes && (
                              <div className="rounded-lg bg-[#6D5BD0]/[0.05] border border-[#6D5BD0]/20 p-3">
                                <p className="font-semibold text-[#5b49bc] mb-0.5">
                                  Faculty Progress Notes
                                </p>
                                <p className="text-slate-600">
                                  {topic.progress.facultyNotes}
                                </p>
                              </div>
                            )}
                          </div>
                        )}

                        {topic.aiBrief && (
                          <details className="rounded-lg border border-[#6D5BD0]/25 bg-[#6D5BD0]/[0.04] p-3 text-xs">
                            <summary className="cursor-pointer font-semibold text-[#5b49bc] flex items-center justify-between gap-2">
                              <span className="inline-flex items-center gap-1.5">
                                <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                                Saved Presentation Brief (AI-generated)
                              </span>
                              {topic.aiBrief.savedByName && (
                                <span className="text-[11px] font-normal text-slate-500">
                                  Saved by {topic.aiBrief.savedByName}
                                </span>
                              )}
                            </summary>
                            <div className="mt-3 space-y-2.5 text-slate-700">
                              <p>{topic.aiBrief.explanation}</p>
                              {topic.aiBrief.subtopics.length > 0 && (
                                <div>
                                  <p className="font-semibold text-[#162B4D]">
                                    Subtopics
                                  </p>
                                  <p>{topic.aiBrief.subtopics.join(' · ')}</p>
                                </div>
                              )}
                              {topic.aiBrief.outline.length > 0 && (
                                <div>
                                  <p className="font-semibold text-[#162B4D]">
                                    Outline
                                  </p>
                                  <ul className="list-disc pl-4 space-y-0.5">
                                    {topic.aiBrief.outline.map((o, oIdx) => (
                                      <li key={oIdx}>
                                        <strong>{o.section}:</strong>{' '}
                                        {o.keyPoints.join('; ')}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              <div>
                                <p className="font-semibold text-[#162B4D]">
                                  Conclusion
                                </p>
                                <p>{topic.aiBrief.conclusion}</p>
                              </div>
                            </div>
                          </details>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {topicsMeta && topicsMeta.totalPages > 1 && (
                <div className="flex items-center justify-between mt-5 pt-4 border-t border-slate-100 text-xs text-slate-600">
                  <span className="tabular-nums">
                    Page {topicsMeta.page} of {topicsMeta.totalPages}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={topicsMeta.page <= 1}
                      onClick={() => setTopicsPage((p) => p - 1)}
                    >
                      Previous
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={topicsMeta.page >= topicsMeta.totalPages}
                      onClick={() => setTopicsPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          )}

          {/* TAB 4: QUIZ */}
          {activeTab === 'quiz' && (
            <div className="space-y-6">
              <Card>
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-slate-200">
                  <div>
                    <h2 className="font-display text-lg font-semibold text-[#162B4D]">
                      {course.courseCode} Quiz Bank & Practice
                    </h2>
                    <p className="text-sm text-slate-600">
                      {courseQuizTotal} approved question(s) ready for timed practice. Answer keys remain hidden until quiz submission.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      to={`/quizzes?tab=practice&courseId=${course.id}`}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1D9BA6] hover:bg-[#17838c] text-white text-sm font-medium whitespace-nowrap"
                    >
                      Start Timed Practice
                    </Link>
                    <Link
                      to={`/quizzes?tab=bank&courseId=${course.id}`}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#2563EB] hover:bg-[#1d4ed8] text-white text-sm font-medium whitespace-nowrap"
                    >
                      Full Bank & Contribute
                    </Link>
                    {canManageTopics && (
                      <Link
                        to={`/quizzes?tab=review&courseId=${course.id}`}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#6D5BD0] hover:bg-[#5b49bc] text-white text-sm font-medium whitespace-nowrap"
                      >
                        Review Queue
                      </Link>
                    )}
                  </div>
                </div>

                {courseQuizLoading ? (
                  <div className="mt-5">
                    <CardSkeleton rows={3} />
                  </div>
                ) : courseQuizQuestions.length === 0 ? (
                  <div className="mt-4">
                    <EmptyState
                      icon={HelpCircle}
                      title="No approved questions in this course yet"
                      description="Contribute the first question for this course to build a peer quiz bank."
                      action={
                        <Link
                          to={`/quizzes?tab=bank&courseId=${course.id}`}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#2563EB] hover:bg-[#1d4ed8] text-white text-sm font-medium"
                        >
                          Contribute a Question
                        </Link>
                      }
                    />
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-5">
                    <div className="lg:col-span-8 space-y-3">
                      <h3 className="text-sm font-semibold text-[#162B4D]">
                        Recent Approved Questions
                      </h3>
                      {courseQuizQuestions.map((q) => (
                        <div
                          key={q.id}
                          className="rounded-xl border border-slate-200 p-4 space-y-2"
                        >
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="bg-slate-100 text-[#162B4D] px-2.5 py-0.5 rounded-full font-medium">
                              {q.topic}
                            </span>
                            <span className="text-slate-500">{q.difficulty}</span>
                            <span className="text-slate-400">·</span>
                            <span className="text-slate-500">{q.type}</span>
                          </div>
                          <p className="text-sm font-medium text-[#162B4D]">
                            {q.questionText}
                          </p>
                          <p className="text-xs text-slate-500">
                            Contributed by {q.contributor.name}
                          </p>
                        </div>
                      ))}
                    </div>

                    <div className="lg:col-span-4 space-y-3">
                      <h3 className="text-sm font-semibold text-[#162B4D]">
                        Course Top Contributors
                      </h3>
                      {courseLeaderboard.length === 0 ? (
                        <p className="text-xs text-slate-500 rounded-xl border border-slate-200 p-4">
                          No contributor credit awarded yet in this course.
                        </p>
                      ) : (
                        <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
                          {courseLeaderboard.map((entry) => (
                            <div
                              key={entry.userId}
                              className="p-3 flex items-center justify-between gap-2 text-xs"
                            >
                              <div className="min-w-0">
                                <p className="font-semibold text-[#162B4D] truncate">
                                  #{entry.rank} {entry.name}
                                </p>
                                <p className="text-slate-500">
                                  {entry.approvedQuestionsCount} approved
                                </p>
                              </div>
                              <span className="font-bold text-[#D98E2B] tabular-nums shrink-0">
                                {entry.totalPoints} pts
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            </div>
          )}
        </div>
      )}

      {/* Course Roster Modal */}
      <CourseRosterModal
        courseId={rosterOpen ? courseId : null}
        onClose={() => setRosterOpen(false)}
      />

      {/* Upload Resource Modal */}
      <Modal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        title="Upload Course Material"
        subtitle="Accepted formats: PDF, DOCX, PPTX, PNG, JPEG, GIF, WEBP (max 20 MB). Stored in GridFS."
      >
        <form onSubmit={handleUploadSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="res-title"
              className="block text-sm font-medium text-[#162B4D] mb-1"
            >
              Title
            </label>
            <input
              id="res-title"
              type="text"
              required
              minLength={2}
              maxLength={200}
              value={uploadTitle}
              onChange={(e) => setUploadTitle(e.target.value)}
              placeholder="e.g., Lecture 04 — Concurrency & Locking"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#162B4D] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="res-type"
                className="block text-sm font-medium text-[#162B4D] mb-1"
              >
                Material Type
              </label>
              <select
                id="res-type"
                value={uploadType}
                onChange={(e) => setUploadType(e.target.value as ResourceType)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#162B4D] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
              >
                <option value={ResourceType.NOTES}>Notes</option>
                <option value={ResourceType.SLIDES}>Slides</option>
                <option value={ResourceType.REFERENCE}>Reference</option>
                <option value={ResourceType.ASSIGNMENT}>Assignment</option>
                <option value={ResourceType.OTHER}>Other</option>
              </select>
            </div>
            <div>
              <label
                htmlFor="res-vis"
                className="block text-sm font-medium text-[#162B4D] mb-1"
              >
                Visibility
              </label>
              <select
                id="res-vis"
                value={uploadVisibility}
                onChange={(e) =>
                  setUploadVisibility(e.target.value as ResourceVisibility)
                }
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#162B4D] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
              >
                <option value={ResourceVisibility.COURSE}>
                  All Enrolled Students
                </option>
                <option value={ResourceVisibility.PRIVATE}>
                  Private (Faculty & Assigned CR Only)
                </option>
              </select>
            </div>
          </div>

          <div>
            <label
              htmlFor="res-desc"
              className="block text-sm font-medium text-[#162B4D] mb-1"
            >
              Description (optional)
            </label>
            <textarea
              id="res-desc"
              rows={2}
              maxLength={1000}
              value={uploadDesc}
              onChange={(e) => setUploadDesc(e.target.value)}
              placeholder="Summary of topics covered in this file..."
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#162B4D] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
            />
          </div>

          <div>
            <label
              htmlFor="res-file"
              className="block text-sm font-medium text-[#162B4D] mb-1"
            >
              File
            </label>
            <input
              id="res-file"
              type="file"
              required
              accept=".pdf,.docx,.pptx,.png,.jpg,.jpeg,.gif,.webp"
              onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
              className="block w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-[#2563EB]/10 file:text-[#2563EB] hover:file:bg-[#2563EB]/20"
            />
            {uploadFile && (
              <p className="text-xs text-slate-500 mt-1 tabular-nums">
                Selected: {uploadFile.name} ({formatBytes(uploadFile.size)})
              </p>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setUploadOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={uploading}>
              Upload to Course
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Resource Confirmation */}
      <ConfirmModal
        open={Boolean(deleteResTarget)}
        onClose={() => setDeleteResTarget(null)}
        onConfirm={handleConfirmDeleteResource}
        title="Delete Course Material"
        description={`Permanently remove "${deleteResTarget?.title || ''}" from this course?`}
        confirmLabel="Delete"
        destructive
        loading={deletingRes}
      />

      {/* Create Presentation Topic Modal */}
      <Modal
        open={createTopicOpen}
        onClose={() => setCreateTopicOpen(false)}
        title="Assign Presentation Topic"
        subtitle="Create a presentation assignment for this course, a team, or an enrolled student."
      >
        <form onSubmit={handleCreateTopic} className="space-y-4">
          <div>
            <label
              htmlFor="topic-title"
              className="block text-sm font-medium text-[#162B4D] mb-1"
            >
              Topic Title
            </label>
            <input
              id="topic-title"
              type="text"
              required
              minLength={3}
              maxLength={200}
              value={topicTitle}
              onChange={(e) => setTopicTitle(e.target.value)}
              placeholder="e.g., Zero-Trust API Gateway Patterns"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#162B4D] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
            />
          </div>

          <div>
            <label
              htmlFor="topic-desc"
              className="block text-sm font-medium text-[#162B4D] mb-1"
            >
              Description & Evaluation Criteria
            </label>
            <textarea
              id="topic-desc"
              required
              rows={3}
              minLength={5}
              maxLength={3000}
              value={topicDesc}
              onChange={(e) => setTopicDesc(e.target.value)}
              placeholder="Outline key deliverables, slide expectations, and time limit..."
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#162B4D] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="topic-due"
                className="block text-sm font-medium text-[#162B4D] mb-1"
              >
                Due Date
              </label>
              <input
                id="topic-due"
                type="date"
                required
                value={topicDueDate}
                onChange={(e) => setTopicDueDate(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#162B4D] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
              />
            </div>
            <div>
              <label
                htmlFor="topic-assignee-type"
                className="block text-sm font-medium text-[#162B4D] mb-1"
              >
                Assign To
              </label>
              <select
                id="topic-assignee-type"
                value={topicAssigneeType}
                onChange={(e) =>
                  setTopicAssigneeType(e.target.value as PresentationAssigneeType)
                }
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#162B4D] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
              >
                <option value={PresentationAssigneeType.COURSE}>
                  Entire Course
                </option>
                <option value={PresentationAssigneeType.TEAM}>
                  Named Team / Group
                </option>
                <option value={PresentationAssigneeType.STUDENT}>
                  Specific Student
                </option>
              </select>
            </div>
          </div>

          {topicAssigneeType === PresentationAssigneeType.TEAM && (
            <div>
              <label
                htmlFor="topic-team-label"
                className="block text-sm font-medium text-[#162B4D] mb-1"
              >
                Team / Group Name
              </label>
              <input
                id="topic-team-label"
                type="text"
                required
                maxLength={120}
                value={topicAssigneeLabel}
                onChange={(e) => setTopicAssigneeLabel(e.target.value)}
                placeholder="e.g., Team Beta (Security)"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#162B4D] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
              />
            </div>
          )}

          {topicAssigneeType === PresentationAssigneeType.STUDENT && (
            <div>
              <label
                htmlFor="topic-student"
                className="block text-sm font-medium text-[#162B4D] mb-1"
              >
                Enrolled Student
              </label>
              <select
                id="topic-student"
                required
                value={topicAssigneeUserId}
                onChange={(e) => setTopicAssigneeUserId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#162B4D] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
              >
                <option value="">Select enrolled student...</option>
                {enrolledStudents.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.studentId || s.email})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setCreateTopicOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={creatingTopic}>
              Assign Topic
            </Button>
          </div>
        </form>
      </Modal>

      {/* CR Coordination Modal */}
      <Modal
        open={Boolean(coordTarget)}
        onClose={() => setCoordTarget(null)}
        title="Coordinate Presentation Topic"
        subtitle={coordTarget?.title}
      >
        <form onSubmit={handleSaveCoordination} className="space-y-4">
          <div>
            <label
              htmlFor="coord-slot"
              className="block text-sm font-medium text-[#162B4D] mb-1"
            >
              Presentation Slot & Venue
            </label>
            <input
              id="coord-slot"
              type="text"
              maxLength={160}
              value={coordSlot}
              onChange={(e) => setCoordSlot(e.target.value)}
              placeholder="e.g., Thursday 11:00 AM · Room B-304"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#162B4D] focus:border-[#1D9BA6] focus:outline-none focus:ring-2 focus:ring-[#1D9BA6]/20"
            />
          </div>
          <div>
            <label
              htmlFor="coord-notes"
              className="block text-sm font-medium text-[#162B4D] mb-1"
            >
              Coordination Notes
            </label>
            <textarea
              id="coord-notes"
              rows={3}
              maxLength={1500}
              value={coordNotes}
              onChange={(e) => setCoordNotes(e.target.value)}
              placeholder="Slide submission deadline, presenter order, or equipment notes..."
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#162B4D] focus:border-[#1D9BA6] focus:outline-none focus:ring-2 focus:ring-[#1D9BA6]/20"
            />
          </div>
          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setCoordTarget(null)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="teal" loading={savingCoord}>
              Save Coordination
            </Button>
          </div>
        </form>
      </Modal>

      {/* Faculty Progress Tracking Modal */}
      <Modal
        open={Boolean(progressTarget)}
        onClose={() => setProgressTarget(null)}
        title="Track Presentation Progress"
        subtitle={progressTarget?.title}
      >
        <form onSubmit={handleSaveProgress} className="space-y-4">
          <div>
            <label
              htmlFor="prog-status"
              className="block text-sm font-medium text-[#162B4D] mb-1"
            >
              Presentation Status
            </label>
            <select
              id="prog-status"
              value={progressStatus}
              onChange={(e) =>
                setProgressStatus(e.target.value as PresentationStatus)
              }
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#162B4D] focus:border-[#6D5BD0] focus:outline-none focus:ring-2 focus:ring-[#6D5BD0]/20"
            >
              <option value={PresentationStatus.ASSIGNED}>Assigned</option>
              <option value={PresentationStatus.IN_PROGRESS}>In Progress</option>
              <option value={PresentationStatus.PRESENTED}>Presented</option>
            </select>
          </div>
          <div>
            <label
              htmlFor="prog-notes"
              className="block text-sm font-medium text-[#162B4D] mb-1"
            >
              Faculty Evaluation & Progress Notes
            </label>
            <textarea
              id="prog-notes"
              rows={3}
              maxLength={1500}
              value={progressNotes}
              onChange={(e) => setProgressNotes(e.target.value)}
              placeholder="Milestone feedback, readiness review, or evaluation remarks..."
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#162B4D] focus:border-[#6D5BD0] focus:outline-none focus:ring-2 focus:ring-[#6D5BD0]/20"
            />
          </div>
          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setProgressTarget(null)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={savingProgress}>
              Save Progress
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Topic Confirm */}
      <ConfirmModal
        open={Boolean(deleteTopicTarget)}
        onClose={() => setDeleteTopicTarget(null)}
        onConfirm={handleConfirmDeleteTopic}
        title="Remove Presentation Topic"
        description={`Remove "${deleteTopicTarget?.title || ''}" from this course?`}
        confirmLabel="Remove"
        destructive
        loading={deletingTopic}
      />
    </DashboardLayout>
  );
}
