import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  Award,
  CheckCircle2,
  Clock,
  Flag,
  HelpCircle,
  Play,
  Plus,
  RotateCcw,
  Search,
  ShieldAlert,
  Sparkles,
  Trash2,
  Trophy,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { ApiClientError, coursesApi, quizzesApi } from '../../services/api';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { EmptyState } from '../../components/ui/EmptyState';
import { CardSkeleton } from '../../components/ui/Skeleton';
import {
  QuestionReportReason,
  QuizAttemptStatus,
  QuizDifficulty,
  QuizQuestionStatus,
  QuizQuestionType,
  TopicMasteryStatus,
  UserRole,
  type ContributionLedgerDTO,
  type CourseDTO,
  type LeaderboardEntryDTO,
  type PaginationMeta,
  type QuizAttemptDTO,
  type QuizQuestionPublicDTO,
  type QuizQuestionReviewDTO,
  type SimilarQuestionMatch,
} from '../../shared/types';

type QuizTab = 'bank' | 'practice' | 'contributions' | 'review';

const DIFFICULTY_STYLES: Record<QuizDifficulty, { label: string; classes: string; pts: number }> = {
  EASY: {
    label: 'Easy',
    classes: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    pts: 10,
  },
  MEDIUM: {
    label: 'Medium',
    classes: 'bg-amber-50 text-[#b45309] border-amber-200',
    pts: 15,
  },
  HARD: {
    label: 'Hard',
    classes: 'bg-rose-50 text-rose-700 border-rose-200',
    pts: 25,
  },
};

const TYPE_LABELS: Record<QuizQuestionType, string> = {
  MCQ: 'Multiple Choice',
  TRUE_FALSE: 'True / False',
  SHORT_ANSWER: 'Short Answer',
};

const REPORT_REASON_LABELS: Record<QuestionReportReason, string> = {
  WRONG_ANSWER: 'Incorrect Answer Key',
  UNCLEAR: 'Unclear / Ambiguous Wording',
  DUPLICATE: 'Duplicate Question',
  INAPPROPRIATE: 'Inappropriate Content',
  OTHER: 'Other Issue',
};

function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function QuizzesPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const canReview =
    user?.role === UserRole.FACULTY || user?.role === UserRole.ADMIN;

  const initialCourseParam = searchParams.get('courseId') || '';
  const rawTab = searchParams.get('tab') as QuizTab | null;
  const activeTab: QuizTab = useMemo(() => {
    if (rawTab === 'review' && canReview) return 'review';
    if (rawTab === 'practice' || rawTab === 'contributions' || rawTab === 'bank') {
      return rawTab;
    }
    return 'bank';
  }, [rawTab, canReview]);

  const setTab = (tab: QuizTab, extra?: Record<string, string>) => {
    const next: Record<string, string> = { tab };
    if (extra) {
      Object.assign(next, extra);
    }
    setSearchParams(next, { replace: true });
  };

  const [courses, setCourses] = useState<CourseDTO[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      await Promise.resolve();
      if (!active) return;
      setCoursesLoading(true);
      try {
        const res = await coursesApi.listMyCourses({ page: 1, limit: 50 });
        if (!active) return;
        setCourses(res.data.courses);
      } catch (err) {
        if (!active) return;
        const msg =
          err instanceof ApiClientError
            ? err.message
            : 'Unable to load your courses.';
        showToast(msg, 'error');
      } finally {
        if (active) setCoursesLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [showToast]);

  const reviewableCourses = useMemo(() => {
    if (user?.role === UserRole.ADMIN) return courses;
    return courses.filter((c) => c.isCourseFaculty);
  }, [courses, user?.role]);

  // ---------------------------------------------------------------------------
  // TAB 1: QUIZ BANK STATE
  // ---------------------------------------------------------------------------
  const [bankQuestions, setBankQuestions] = useState<QuizQuestionPublicDTO[]>([]);
  const [bankTopics, setBankTopics] = useState<string[]>([]);
  const [bankMeta, setBankMeta] = useState<PaginationMeta | null>(null);
  const [bankLoading, setBankLoading] = useState(false);
  const [bankPage, setBankPage] = useState(1);
  const [bankCourseId, setBankCourseId] = useState(initialCourseParam);
  const [bankTopic, setBankTopic] = useState('');
  const [bankDifficulty, setBankDifficulty] = useState<QuizDifficulty | ''>('');
  const [bankType, setBankType] = useState<QuizQuestionType | ''>('');
  const [bankSearch, setBankSearch] = useState('');
  const [bankRefreshKey, setBankRefreshKey] = useState(0);

  const loadQuizBank = useCallback(async () => {
    setBankLoading(true);
    try {
      const res = await quizzesApi.listQuestions({
        page: bankPage,
        limit: 10,
        courseId: bankCourseId || undefined,
        topic: bankTopic || undefined,
        difficulty: bankDifficulty,
        type: bankType,
        search: bankSearch.trim() || undefined,
      });
      setBankQuestions(res.data.questions);
      setBankTopics(res.data.topics);
      setBankMeta(res.meta);
    } catch (err) {
      const msg =
        err instanceof ApiClientError ? err.message : 'Unable to load quiz bank.';
      showToast(msg, 'error');
    } finally {
      setBankLoading(false);
    }
  }, [bankPage, bankCourseId, bankTopic, bankDifficulty, bankType, bankSearch, showToast]);

  useEffect(() => {
    if (activeTab !== 'bank') return;
    let active = true;
    (async () => {
      await Promise.resolve();
      if (!active) return;
      await loadQuizBank();
    })();
    return () => {
      active = false;
    };
  }, [activeTab, bankRefreshKey, loadQuizBank]);

  // Contribute Modal State
  const [contribOpen, setContribOpen] = useState(false);
  const [contribCourseId, setContribCourseId] = useState('');
  const [contribTopic, setContribTopic] = useState('');
  const [contribDifficulty, setContribDifficulty] = useState<QuizDifficulty>(
    QuizDifficulty.MEDIUM
  );
  const [contribType, setContribType] = useState<QuizQuestionType>(
    QuizQuestionType.MCQ
  );
  const [contribText, setContribText] = useState('');
  const [contribOptions, setContribOptions] = useState<string[]>(['', '', '', '']);
  const [contribCorrect, setContribCorrect] = useState('');
  const [contribExplanation, setContribExplanation] = useState('');
  const [dupMatches, setDupMatches] = useState<SimilarQuestionMatch[]>([]);
  const [checkingDup, setCheckingDup] = useState(false);
  const [ignoreDupWarning, setIgnoreDupWarning] = useState(false);
  const [submittingContrib, setSubmittingContrib] = useState(false);

  const openContributeModal = (preselectCourse?: string) => {
    const defaultCourse = preselectCourse || bankCourseId || courses[0]?.id || '';
    setContribCourseId(defaultCourse);
    setContribTopic('');
    setContribDifficulty(QuizDifficulty.MEDIUM);
    setContribType(QuizQuestionType.MCQ);
    setContribText('');
    setContribOptions(['', '', '', '']);
    setContribCorrect('');
    setContribExplanation('');
    setDupMatches([]);
    setIgnoreDupWarning(false);
    setContribOpen(true);
  };

  const handleCheckDuplicates = async () => {
    if (!contribCourseId || contribText.trim().length < 8) {
      showToast('Select a course and enter at least 8 characters first.', 'info');
      return;
    }
    setCheckingDup(true);
    try {
      const res = await quizzesApi.checkDuplicate({
        courseId: contribCourseId,
        questionText: contribText.trim(),
      });
      setDupMatches(res.data.matches);
      if (res.data.matches.length === 0) {
        showToast('No similar questions detected in this course.', 'success');
      } else {
        showToast(
          `Found ${res.data.matches.length} potentially similar question(s).`,
          'info'
        );
      }
    } catch (err) {
      const msg =
        err instanceof ApiClientError
          ? err.message
          : 'Could not run duplicate similarity check.';
      showToast(msg, 'error');
    } finally {
      setCheckingDup(false);
    }
  };

  const handleSubmitContribution = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contribCourseId) {
      showToast('Please select a course.', 'error');
      return;
    }
    const cleanOptions =
      contribType === QuizQuestionType.MCQ
        ? contribOptions.map((o) => o.trim()).filter(Boolean)
        : contribType === QuizQuestionType.TRUE_FALSE
          ? ['True', 'False']
          : [];

    if (contribType === QuizQuestionType.MCQ && cleanOptions.length < 2) {
      showToast('MCQ questions require at least 2 non-empty options.', 'error');
      return;
    }
    if (!contribCorrect.trim()) {
      showToast('Please specify the correct answer.', 'error');
      return;
    }

    setSubmittingContrib(true);
    try {
      const res = await quizzesApi.contributeQuestion({
        courseId: contribCourseId,
        topic: contribTopic.trim(),
        difficulty: contribDifficulty,
        type: contribType,
        questionText: contribText.trim(),
        options: cleanOptions,
        correctAnswer: contribCorrect.trim(),
        explanation: contribExplanation.trim(),
        ignoreDuplicateWarning: ignoreDupWarning,
      });
      showToast(res.message, 'success');
      setContribOpen(false);
      setBankRefreshKey((k) => k + 1);
      if (activeTab === 'contributions') {
        setContribRefreshKey((k) => k + 1);
      }
    } catch (err) {
      if (
        err instanceof ApiClientError &&
        err.code === 'DUPLICATE_QUESTION_DETECTED'
      ) {
        const details = err.details as { matches?: SimilarQuestionMatch[] } | null;
        if (details?.matches) {
          setDupMatches(details.matches);
        }
        showToast(err.message, 'error');
      } else {
        const msg =
          err instanceof ApiClientError
            ? err.message
            : 'Unable to submit question.';
        showToast(msg, 'error');
      }
    } finally {
      setSubmittingContrib(false);
    }
  };

  // Report Modal State
  const [reportTarget, setReportTarget] = useState<QuizQuestionPublicDTO | null>(null);
  const [reportReason, setReportReason] = useState<QuestionReportReason>(
    QuestionReportReason.WRONG_ANSWER
  );
  const [reportDetails, setReportDetails] = useState('');
  const [submittingReport, setSubmittingReport] = useState(false);

  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportTarget) return;
    setSubmittingReport(true);
    try {
      await quizzesApi.reportQuestion(reportTarget.id, {
        reason: reportReason,
        details: reportDetails.trim(),
      });
      showToast('Question reported to course faculty for review.', 'success');
      setReportTarget(null);
      setReportDetails('');
      setBankRefreshKey((k) => k + 1);
    } catch (err) {
      const msg =
        err instanceof ApiClientError
          ? err.message
          : 'Unable to report question.';
      showToast(msg, 'error');
    } finally {
      setSubmittingReport(false);
    }
  };

  // ---------------------------------------------------------------------------
  // TAB 2: PRACTICE & TIMED QUIZ STATE
  // ---------------------------------------------------------------------------
  const [practiceCourseId, setPracticeCourseId] = useState(initialCourseParam);
  const [practiceTopic, setPracticeTopic] = useState('');
  const [practiceTopicsList, setPracticeTopicsList] = useState<string[]>([]);
  const [practiceDifficulty, setPracticeDifficulty] = useState<QuizDifficulty | ''>('');
  const [practiceCount, setPracticeCount] = useState(5);
  const [practiceMinutes, setPracticeMinutes] = useState(5);
  const [startingPractice, setStartingPractice] = useState(false);

  const [activeAttempt, setActiveAttempt] = useState<QuizAttemptDTO | null>(null);
  const [answersMap, setAnswersMap] = useState<Record<string, string>>({});
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [submittingAttempt, setSubmittingAttempt] = useState(false);
  const [attemptsHistory, setAttemptsHistory] = useState<QuizAttemptDTO[]>([]);
  const [attemptsLoading, setAttemptsLoading] = useState(false);
  const [attemptsRefreshKey, setAttemptsRefreshKey] = useState(0);

  const answersRef = useRef<Record<string, string>>({});
  const autoSubmittedRef = useRef(false);

  useEffect(() => {
    answersRef.current = answersMap;
  }, [answersMap]);

  useEffect(() => {
    if (!practiceCourseId && courses.length > 0) {
      Promise.resolve().then(() => {
        setPracticeCourseId(courses[0].id);
      });
    }
  }, [courses, practiceCourseId]);

  useEffect(() => {
    if (activeTab !== 'practice' || !practiceCourseId) return;
    let active = true;
    (async () => {
      await Promise.resolve();
      if (!active) return;
      try {
        const res = await quizzesApi.listQuestions({
          courseId: practiceCourseId,
          page: 1,
          limit: 1,
        });
        if (!active) return;
        setPracticeTopicsList(res.data.topics);
      } catch {
        if (active) setPracticeTopicsList([]);
      }
    })();
    return () => {
      active = false;
    };
  }, [activeTab, practiceCourseId]);

  useEffect(() => {
    if (activeTab !== 'practice') return;
    let active = true;
    (async () => {
      await Promise.resolve();
      if (!active) return;
      setAttemptsLoading(true);
      try {
        const res = await quizzesApi.listAttempts({ page: 1, limit: 15 });
        if (!active) return;
        setAttemptsHistory(res.data.attempts);
      } catch {
        void 0;
      } finally {
        if (active) setAttemptsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [activeTab, attemptsRefreshKey]);

  const submitAttemptNow = useCallback(
    async (attempt: QuizAttemptDTO, isAuto = false) => {
      if (submittingAttempt) return;
      setSubmittingAttempt(true);
      const elapsedSeconds = Math.max(
        1,
        Math.min(
          attempt.timeLimitSeconds,
          Math.round((Date.now() - new Date(attempt.startedAt).getTime()) / 1000)
        )
      );
      const payloadAnswers = (attempt.questions ?? []).map((q) => ({
        questionId: q.id,
        answer: answersRef.current[q.id] || '',
      }));

      try {
        const res = await quizzesApi.submitPractice(attempt.id, {
          answers: payloadAnswers,
          elapsedSeconds,
        });
        setActiveAttempt(res.data.attempt);
        setAttemptsRefreshKey((k) => k + 1);
        showToast(
          isAuto
            ? 'Time expired — quiz submitted and graded.'
            : 'Quiz submitted and scored!',
          'success'
        );
      } catch (err) {
        const msg =
          err instanceof ApiClientError
            ? err.message
            : 'Failed to submit quiz attempt.';
        showToast(msg, 'error');
      } finally {
        setSubmittingAttempt(false);
      }
    },
    [showToast, submittingAttempt]
  );

  // Live countdown timer when an attempt is IN_PROGRESS
  useEffect(() => {
    if (!activeAttempt || activeAttempt.status !== QuizAttemptStatus.IN_PROGRESS) {
      return;
    }

    const computeRemaining = () => {
      const elapsed = Math.floor(
        (Date.now() - new Date(activeAttempt.startedAt).getTime()) / 1000
      );
      return Math.max(0, activeAttempt.timeLimitSeconds - elapsed);
    };

    Promise.resolve().then(() => {
      setRemainingSeconds(computeRemaining());
    });

    const timer = window.setInterval(() => {
      const rem = computeRemaining();
      setRemainingSeconds(rem);
      if (rem <= 0 && !autoSubmittedRef.current) {
        autoSubmittedRef.current = true;
        window.clearInterval(timer);
        void submitAttemptNow(activeAttempt, true);
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, [activeAttempt, submitAttemptNow]);

  const handleStartPractice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!practiceCourseId) {
      showToast('Select a course to start practicing.', 'error');
      return;
    }
    setStartingPractice(true);
    try {
      const res = await quizzesApi.startPractice({
        courseId: practiceCourseId,
        topic: practiceTopic || undefined,
        difficulty: practiceDifficulty,
        count: practiceCount,
        timeLimitSeconds: Math.max(60, practiceMinutes * 60),
      });
      autoSubmittedRef.current = false;
      setAnswersMap({});
      setActiveAttempt(res.data.attempt);
      setRemainingSeconds(res.data.attempt.timeLimitSeconds);
    } catch (err) {
      const msg =
        err instanceof ApiClientError
          ? err.message
          : 'Could not start practice quiz.';
      showToast(msg, 'error');
    } finally {
      setStartingPractice(false);
    }
  };

  const handleLoadPastAttempt = async (attemptId: string) => {
    try {
      const res = await quizzesApi.getAttempt(attemptId);
      autoSubmittedRef.current = false;
      setAnswersMap({});
      setActiveAttempt(res.data.attempt);
    } catch (err) {
      const msg =
        err instanceof ApiClientError
          ? err.message
          : 'Unable to load quiz attempt.';
      showToast(msg, 'error');
    }
  };

  // ---------------------------------------------------------------------------
  // TAB 3: CONTRIBUTIONS & LEADERBOARD STATE
  // ---------------------------------------------------------------------------
  const [contribStats, setContribStats] = useState<{
    totalPoints: number;
    approvedCount: number;
    pendingCount: number;
    rejectedCount: number;
    ledger: ContributionLedgerDTO[];
    submissions: QuizQuestionReviewDTO[];
  } | null>(null);
  const [contribLoading, setContribLoading] = useState(false);
  const [contribRefreshKey, setContribRefreshKey] = useState(0);

  const [leaderCourseId, setLeaderCourseId] = useState('');
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntryDTO[]>([]);
  const [leaderLoading, setLeaderLoading] = useState(false);

  useEffect(() => {
    if (activeTab !== 'contributions') return;
    let active = true;
    (async () => {
      await Promise.resolve();
      if (!active) return;
      setContribLoading(true);
      try {
        const res = await quizzesApi.getMyContributions();
        if (!active) return;
        setContribStats(res.data);
      } catch (err) {
        if (!active) return;
        const msg =
          err instanceof ApiClientError
            ? err.message
            : 'Unable to load contributions.';
        showToast(msg, 'error');
      } finally {
        if (active) setContribLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [activeTab, contribRefreshKey, showToast]);

  useEffect(() => {
    if (activeTab !== 'contributions') return;
    let active = true;
    (async () => {
      await Promise.resolve();
      if (!active) return;
      setLeaderLoading(true);
      try {
        const res = await quizzesApi.getLeaderboard({
          courseId: leaderCourseId || undefined,
          limit: 20,
        });
        if (!active) return;
        setLeaderboard(res.data.leaderboard);
      } catch (err) {
        if (!active) return;
        const msg =
          err instanceof ApiClientError
            ? err.message
            : 'Unable to load leaderboard.';
        showToast(msg, 'error');
      } finally {
        if (active) setLeaderLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [activeTab, leaderCourseId, contribRefreshKey, showToast]);

  // ---------------------------------------------------------------------------
  // TAB 4: FACULTY / ADMIN REVIEW QUEUE STATE
  // ---------------------------------------------------------------------------
  const [reviewCourseId, setReviewCourseId] = useState(initialCourseParam);
  const [reviewStatus, setReviewStatus] = useState<QuizQuestionStatus>(
    QuizQuestionStatus.PENDING
  );
  const [reviewReportedOnly, setReviewReportedOnly] = useState(false);
  const [reviewQuestions, setReviewQuestions] = useState<QuizQuestionReviewDTO[]>([]);
  const [reviewMeta, setReviewMeta] = useState<PaginationMeta | null>(null);
  const [reviewPage, setReviewPage] = useState(1);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewRefreshKey, setReviewRefreshKey] = useState(0);
  const [actingQuestionId, setActingQuestionId] = useState<string | null>(null);

  const [rejectTarget, setRejectTarget] = useState<QuizQuestionReviewDTO | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [submittingReject, setSubmittingReject] = useState(false);

  useEffect(() => {
    if (activeTab !== 'review' || !canReview) return;
    let active = true;
    (async () => {
      await Promise.resolve();
      if (!active) return;
      setReviewLoading(true);
      try {
        const res = await quizzesApi.listReviewQueue({
          page: reviewPage,
          limit: 10,
          courseId: reviewCourseId || undefined,
          status: reviewStatus,
          reportedOnly: reviewReportedOnly,
        });
        if (!active) return;
        setReviewQuestions(res.data.questions);
        setReviewMeta(res.meta);
      } catch (err) {
        if (!active) return;
        const msg =
          err instanceof ApiClientError
            ? err.message
            : 'Unable to load review queue.';
        showToast(msg, 'error');
      } finally {
        if (active) setReviewLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [
    activeTab,
    canReview,
    reviewPage,
    reviewCourseId,
    reviewStatus,
    reviewReportedOnly,
    reviewRefreshKey,
    showToast,
  ]);

  const handleApproveQuestion = async (q: QuizQuestionReviewDTO) => {
    setActingQuestionId(q.id);
    try {
      const res = await quizzesApi.reviewQuestion(q.id, {
        decision: 'APPROVE',
      });
      showToast(res.message, 'success');
      setReviewRefreshKey((k) => k + 1);
      setBankRefreshKey((k) => k + 1);
    } catch (err) {
      const msg =
        err instanceof ApiClientError ? err.message : 'Could not approve question.';
      showToast(msg, 'error');
    } finally {
      setActingQuestionId(null);
    }
  };

  const handleConfirmReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectTarget) return;
    setSubmittingReject(true);
    try {
      await quizzesApi.reviewQuestion(rejectTarget.id, {
        decision: 'REJECT',
        reason: rejectReason.trim(),
      });
      showToast('Question declined with feedback.', 'info');
      setRejectTarget(null);
      setRejectReason('');
      setReviewRefreshKey((k) => k + 1);
    } catch (err) {
      const msg =
        err instanceof ApiClientError ? err.message : 'Could not reject question.';
      showToast(msg, 'error');
    } finally {
      setSubmittingReject(false);
    }
  };

  const handleResolveReports = async (
    q: QuizQuestionReviewDTO,
    action: 'DISMISS_REPORTS' | 'UNPUBLISH_QUESTION'
  ) => {
    setActingQuestionId(q.id);
    try {
      await quizzesApi.resolveReports(q.id, {
        action,
        reason:
          action === 'UNPUBLISH_QUESTION'
            ? 'Unpublished following student report review'
            : '',
      });
      showToast(
        action === 'UNPUBLISH_QUESTION'
          ? 'Reports resolved and question unpublished.'
          : 'Open reports dismissed.',
        'success'
      );
      setReviewRefreshKey((k) => k + 1);
      setBankRefreshKey((k) => k + 1);
    } catch (err) {
      const msg =
        err instanceof ApiClientError ? err.message : 'Could not resolve reports.';
      showToast(msg, 'error');
    } finally {
      setActingQuestionId(null);
    }
  };

  return (
    <DashboardLayout
      title="Quizzes & Question Bank"
      subtitle="Contribute peer questions, take timed server-graded practice quizzes, and track topic mastery."
      breadcrumb="Quizzes"
      actions={
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => openContributeModal()}
            disabled={courses.length === 0}
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            Contribute Question
          </Button>
          <Button
            size="sm"
            variant="primary"
            onClick={() => setTab('practice')}
            disabled={courses.length === 0}
          >
            <Play className="w-4 h-4" aria-hidden="true" />
            Practice Quiz
          </Button>
        </div>
      }
    >
      {/* Top Workspace Tabs */}
      <div
        role="tablist"
        aria-label="Quiz workspace tabs"
        className="flex flex-wrap gap-2 border-b border-slate-200 pb-3 mb-6"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'bank'}
          onClick={() => setTab('bank')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
            activeTab === 'bank'
              ? 'bg-[#2563EB] text-white'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <HelpCircle className="w-4 h-4" aria-hidden="true" />
          Quiz Bank
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'practice'}
          onClick={() => setTab('practice')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
            activeTab === 'practice'
              ? 'bg-[#1D9BA6] text-white'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Clock className="w-4 h-4" aria-hidden="true" />
          Timed Practice & Results
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'contributions'}
          onClick={() => setTab('contributions')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
            activeTab === 'contributions'
              ? 'bg-[#D98E2B] text-white'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Trophy className="w-4 h-4" aria-hidden="true" />
          Contributions & Leaderboard
        </button>
        {canReview && (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'review'}
            onClick={() => setTab('review')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'review'
                ? 'bg-[#6D5BD0] text-white'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            <ShieldAlert className="w-4 h-4" aria-hidden="true" />
            Faculty Review Queue
          </button>
        )}
      </div>

      {/* =================================================================== */}
      {/* TAB 1: QUIZ BANK                                                    */}
      {/* =================================================================== */}
      {activeTab === 'bank' && (
        <div className="space-y-6">
          <Card>
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-5">
              <div>
                <h2 className="font-display text-lg font-semibold text-[#162B4D]">
                  Approved Quiz Bank
                </h2>
                <p className="text-sm text-slate-600">
                  Browse peer-contributed, faculty-approved questions. Answer keys remain hidden until you complete a practice attempt.
                </p>
              </div>
              <Button
                variant="teal"
                size="sm"
                onClick={() => openContributeModal()}
                disabled={courses.length === 0}
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                Submit Question
              </Button>
            </div>

            {/* Filters */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
              <div className="relative lg:col-span-2">
                <Search
                  className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  aria-label="Search quiz questions"
                  value={bankSearch}
                  onChange={(e) => {
                    setBankSearch(e.target.value);
                    setBankPage(1);
                  }}
                  placeholder="Search question text or topic..."
                  className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 text-sm text-[#162B4D] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
                />
              </div>

              <select
                aria-label="Filter by course"
                value={bankCourseId}
                onChange={(e) => {
                  setBankCourseId(e.target.value);
                  setBankTopic('');
                  setBankPage(1);
                }}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#162B4D] focus:border-[#2563EB] focus:outline-none"
              >
                <option value="">All My Courses</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.courseCode} — {c.courseName}
                  </option>
                ))}
              </select>

              <select
                aria-label="Filter by topic"
                value={bankTopic}
                onChange={(e) => {
                  setBankTopic(e.target.value);
                  setBankPage(1);
                }}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#162B4D] focus:border-[#2563EB] focus:outline-none"
              >
                <option value="">All Topics</option>
                {bankTopics.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>

              <div className="flex gap-2">
                <select
                  aria-label="Filter by difficulty"
                  value={bankDifficulty}
                  onChange={(e) => {
                    setBankDifficulty(e.target.value as QuizDifficulty | '');
                    setBankPage(1);
                  }}
                  className="flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-[#162B4D] focus:border-[#2563EB] focus:outline-none"
                >
                  <option value="">All Levels</option>
                  <option value={QuizDifficulty.EASY}>Easy</option>
                  <option value={QuizDifficulty.MEDIUM}>Medium</option>
                  <option value={QuizDifficulty.HARD}>Hard</option>
                </select>
                {(bankCourseId || bankTopic || bankDifficulty || bankType || bankSearch) && (
                  <button
                    type="button"
                    aria-label="Reset filters"
                    onClick={() => {
                      setBankCourseId('');
                      setBankTopic('');
                      setBankDifficulty('');
                      setBankType('');
                      setBankSearch('');
                      setBankPage(1);
                    }}
                    className="px-2.5 py-2 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 cursor-pointer"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {coursesLoading || bankLoading ? (
              <div className="space-y-3">
                <CardSkeleton rows={3} />
                <CardSkeleton rows={3} />
              </div>
            ) : bankQuestions.length === 0 ? (
              <EmptyState
                icon={HelpCircle}
                title="No approved questions match these filters"
                description="Try clearing filters or contribute a new question for faculty approval."
                action={
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => openContributeModal()}
                    disabled={courses.length === 0}
                  >
                    Contribute Question
                  </Button>
                }
              />
            ) : (
              <div className="space-y-4">
                {bankQuestions.map((q) => {
                  const diff = DIFFICULTY_STYLES[q.difficulty];
                  return (
                    <div
                      key={q.id}
                      className="rounded-xl border border-slate-200 p-4 sm:p-5 bg-white"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-mono font-semibold text-[#2563EB] bg-[#2563EB]/10 px-2 py-0.5 rounded">
                            {q.courseCode}
                          </span>
                          <span className="font-medium text-[#162B4D] bg-slate-100 px-2.5 py-0.5 rounded-full">
                            {q.topic}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full border font-medium ${diff.classes}`}
                          >
                            {diff.label}
                          </span>
                          <span className="text-slate-500">
                            {TYPE_LABELS[q.type]}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setReportTarget(q);
                            setReportReason(QuestionReportReason.WRONG_ANSWER);
                            setReportDetails('');
                          }}
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-rose-600 cursor-pointer"
                        >
                          <Flag className="w-3.5 h-3.5" aria-hidden="true" />
                          Report
                          {q.reportCount > 0 && (
                            <span className="text-rose-600 font-semibold tabular-nums">
                              ({q.reportCount})
                            </span>
                          )}
                        </button>
                      </div>

                      <p className="text-sm sm:text-base font-medium text-[#162B4D] mt-3">
                        {q.questionText}
                      </p>

                      {q.options.length > 0 && (
                        <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {q.options.map((opt, idx) => (
                            <li
                              key={`${q.id}-opt-${idx}`}
                              className="text-xs sm:text-sm text-slate-700 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2"
                            >
                              <span className="font-semibold text-slate-500 mr-2">
                                {String.fromCharCode(65 + idx)}.
                              </span>
                              {opt}
                            </li>
                          ))}
                        </ul>
                      )}

                      <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                        <span>
                          Contributed by{' '}
                          <strong className="text-[#162B4D]">
                            {q.contributor.name}
                          </strong>
                        </span>
                        <span className="tabular-nums">
                          {new Date(q.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {bankMeta && bankMeta.totalPages > 1 && (
              <div className="flex items-center justify-between mt-5 pt-4 border-t border-slate-100 text-xs text-slate-600">
                <span className="tabular-nums">
                  Page {bankMeta.page} of {bankMeta.totalPages} ({bankMeta.total} questions)
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={bankMeta.page <= 1}
                    onClick={() => setBankPage((p) => p - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={bankMeta.page >= bankMeta.totalPages}
                    onClick={() => setBankPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 2: TIMED PRACTICE & RESULTS                                     */}
      {/* =================================================================== */}
      {activeTab === 'practice' && (
        <div className="space-y-6">
          {/* Active In-Progress Quiz Runner */}
          {activeAttempt &&
            activeAttempt.status === QuizAttemptStatus.IN_PROGRESS && (
              <Card>
                <div className="sticky top-16 z-10 bg-white pb-4 mb-5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-[#1D9BA6] bg-[#1D9BA6]/10 px-2 py-0.5 rounded">
                        {activeAttempt.courseCode}
                      </span>
                      <h2 className="font-display text-lg font-bold text-[#162B4D]">
                        Timed Practice Session
                      </h2>
                    </div>
                    <p className="text-xs text-slate-600 mt-0.5 tabular-nums">
                      {
                        (activeAttempt.questions ?? []).filter(
                          (q) => (answersMap[q.id] || '').trim().length > 0
                        ).length
                      }{' '}
                      of {activeAttempt.totalQuestions} answered
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <div
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-mono text-sm font-bold tabular-nums ${
                        remainingSeconds <= 60
                          ? 'bg-rose-50 text-rose-700 border-rose-300'
                          : 'bg-[#F3F6FB] text-[#162B4D] border-slate-200'
                      }`}
                    >
                      <Clock className="w-4 h-4" aria-hidden="true" />
                      {formatDuration(remainingSeconds)}
                    </div>
                    <Button
                      variant="primary"
                      size="sm"
                      loading={submittingAttempt}
                      onClick={() => submitAttemptNow(activeAttempt, false)}
                    >
                      Submit & Grade
                    </Button>
                  </div>
                </div>

                <div className="space-y-6">
                  {(activeAttempt.questions ?? []).map((q, idx) => {
                    const currentAnswer = answersMap[q.id] || '';
                    const diff = DIFFICULTY_STYLES[q.difficulty];
                    return (
                      <div
                        key={q.id}
                        className="rounded-xl border border-slate-200 p-4 sm:p-5 space-y-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <span className="font-semibold text-[#162B4D]">
                            Question {idx + 1} of {activeAttempt.totalQuestions}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded-full">
                              {q.topic}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-full border font-medium ${diff.classes}`}
                            >
                              {diff.label}
                            </span>
                          </div>
                        </div>

                        <p className="text-sm sm:text-base font-medium text-[#162B4D]">
                          {q.questionText}
                        </p>

                        {q.type === QuizQuestionType.MCQ && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                            {q.options.map((opt, optIdx) => {
                              const selected = currentAnswer === opt;
                              return (
                                <button
                                  key={`${q.id}-choice-${optIdx}`}
                                  type="button"
                                  onClick={() =>
                                    setAnswersMap((prev) => ({
                                      ...prev,
                                      [q.id]: opt,
                                    }))
                                  }
                                  className={`text-left rounded-lg border px-3.5 py-2.5 text-sm transition-colors cursor-pointer ${
                                    selected
                                      ? 'border-[#2563EB] bg-[#2563EB]/10 text-[#162B4D] font-medium'
                                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                                  }`}
                                >
                                  <span className="font-semibold text-slate-500 mr-2">
                                    {String.fromCharCode(65 + optIdx)}.
                                  </span>
                                  {opt}
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {q.type === QuizQuestionType.TRUE_FALSE && (
                          <div className="flex gap-3 pt-1">
                            {['True', 'False'].map((choice) => {
                              const selected = currentAnswer === choice;
                              return (
                                <button
                                  key={choice}
                                  type="button"
                                  onClick={() =>
                                    setAnswersMap((prev) => ({
                                      ...prev,
                                      [q.id]: choice,
                                    }))
                                  }
                                  className={`px-5 py-2 rounded-lg border text-sm font-medium transition-colors cursor-pointer ${
                                    selected
                                      ? 'border-[#2563EB] bg-[#2563EB]/10 text-[#2563EB]'
                                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                                  }`}
                                >
                                  {choice}
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {q.type === QuizQuestionType.SHORT_ANSWER && (
                          <div className="pt-1">
                            <input
                              type="text"
                              value={currentAnswer}
                              onChange={(e) =>
                                setAnswersMap((prev) => ({
                                  ...prev,
                                  [q.id]: e.target.value,
                                }))
                              }
                              placeholder="Type your concise answer..."
                              className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm text-[#162B4D] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}

          {/* Submitted Results + Per-Topic Weakness Summary + Per-Question Review */}
          {activeAttempt &&
            activeAttempt.status === QuizAttemptStatus.SUBMITTED && (
              <div className="space-y-6">
                <Card>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200">
                    <div>
                      <span className="font-mono text-xs font-semibold text-[#1D9BA6] bg-[#1D9BA6]/10 px-2 py-0.5 rounded">
                        {activeAttempt.courseCode}
                      </span>
                      <h2 className="font-display text-xl font-bold text-[#162B4D] mt-1">
                        Practice Quiz Results
                      </h2>
                      <p className="text-sm text-slate-600">
                        Scored on server · Completed in{' '}
                        <span className="font-semibold tabular-nums">
                          {formatDuration(activeAttempt.durationSeconds)}
                        </span>
                      </p>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setActiveAttempt(null)}
                    >
                      Back to Quiz Setup
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-5">
                    <div className="rounded-xl bg-[#F3F6FB] p-4 border border-slate-200/80">
                      <p className="text-xs font-medium text-slate-500">Score</p>
                      <p className="font-display text-2xl font-bold text-[#162B4D] mt-1 tabular-nums">
                        {activeAttempt.correctCount} / {activeAttempt.totalQuestions}
                      </p>
                    </div>
                    <div className="rounded-xl bg-[#F3F6FB] p-4 border border-slate-200/80">
                      <p className="text-xs font-medium text-slate-500">Accuracy</p>
                      <p
                        className={`font-display text-2xl font-bold mt-1 tabular-nums ${
                          activeAttempt.percentage >= 80
                            ? 'text-emerald-600'
                            : activeAttempt.percentage >= 50
                              ? 'text-[#D98E2B]'
                              : 'text-rose-600'
                        }`}
                      >
                        {activeAttempt.percentage}%
                      </p>
                    </div>
                    <div className="rounded-xl bg-[#F3F6FB] p-4 border border-slate-200/80">
                      <p className="text-xs font-medium text-slate-500">
                        Topics Covered
                      </p>
                      <p className="font-display text-2xl font-bold text-[#2563EB] mt-1 tabular-nums">
                        {activeAttempt.topicWeaknesses.length}
                      </p>
                    </div>
                  </div>
                </Card>

                {/* Per-Topic Weakness Summary */}
                <Card>
                  <h3 className="font-display text-base font-semibold text-[#162B4D] mb-1">
                    Per-Topic Weakness Summary
                  </h3>
                  <p className="text-xs text-slate-600 mb-4">
                    Topics below 50% are marked Weak for targeted revision; 50–79% Moderate; 80%+ Strong.
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {activeAttempt.topicWeaknesses.map((tw) => {
                      const badge =
                        tw.status === TopicMasteryStatus.STRONG
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : tw.status === TopicMasteryStatus.MODERATE
                            ? 'bg-amber-50 text-[#b45309] border-amber-200'
                            : 'bg-rose-50 text-rose-700 border-rose-200';
                      const barColor =
                        tw.status === TopicMasteryStatus.STRONG
                          ? 'bg-emerald-500'
                          : tw.status === TopicMasteryStatus.MODERATE
                            ? 'bg-[#D98E2B]'
                            : 'bg-rose-500';
                      return (
                        <div
                          key={tw.topic}
                          className="rounded-xl border border-slate-200 p-4"
                        >
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <p className="text-sm font-semibold text-[#162B4D]">
                              {tw.topic}
                            </p>
                            <span
                              className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${badge}`}
                            >
                              {tw.status}
                            </span>
                          </div>
                          <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden mb-1.5">
                            <div
                              className={`h-full rounded-full ${barColor}`}
                              style={{ width: `${tw.accuracyPercent}%` }}
                            />
                          </div>
                          <div className="flex items-center justify-between text-xs text-slate-600 tabular-nums">
                            <span>
                              {tw.correct} / {tw.total} correct
                            </span>
                            <span className="font-semibold">
                              {tw.accuracyPercent}%
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Card>

                {/* Per-Question Review */}
                <Card>
                  <h3 className="font-display text-base font-semibold text-[#162B4D] mb-4">
                    Question-by-Question Review
                  </h3>
                  <div className="space-y-4">
                    {(activeAttempt.reviewItems ?? []).map((item, idx) => (
                      <div
                        key={item.questionId}
                        className={`rounded-xl border p-4 sm:p-5 ${
                          item.isCorrect
                            ? 'border-emerald-200 bg-emerald-50/20'
                            : 'border-rose-200 bg-rose-50/20'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2 text-xs">
                            <span className="font-semibold text-[#162B4D]">
                              Q{idx + 1}
                            </span>
                            <span className="bg-white border border-slate-200 px-2 py-0.5 rounded-full text-slate-700">
                              {item.topic}
                            </span>
                          </div>
                          {item.isCorrect ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                              <CheckCircle2 className="w-4 h-4" />
                              Correct
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700">
                              <XCircle className="w-4 h-4" />
                              Incorrect
                            </span>
                          )}
                        </div>

                        <p className="text-sm font-medium text-[#162B4D] mb-3">
                          {item.questionText}
                        </p>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs mb-3">
                          <div className="rounded-lg bg-white border border-slate-200 p-2.5">
                            <span className="text-slate-500 block mb-0.5">
                              Your Answer
                            </span>
                            <span
                              className={`font-semibold ${
                                item.isCorrect
                                  ? 'text-emerald-700'
                                  : 'text-rose-700'
                              }`}
                            >
                              {item.userAnswer || '(No answer submitted)'}
                            </span>
                          </div>
                          <div className="rounded-lg bg-white border border-emerald-200 p-2.5">
                            <span className="text-slate-500 block mb-0.5">
                              Correct Answer
                            </span>
                            <span className="font-semibold text-emerald-700">
                              {item.correctAnswer}
                            </span>
                          </div>
                        </div>

                        <div className="rounded-lg bg-[#F3F6FB] border border-slate-200/80 p-3 text-xs text-slate-700">
                          <span className="font-semibold text-[#162B4D]">
                            Explanation:{' '}
                          </span>
                          {item.explanation}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            )}

          {/* Setup + Past Attempts History */}
          {!activeAttempt && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <Card className="lg:col-span-5">
                <h2 className="font-display text-lg font-semibold text-[#162B4D]">
                  Configure Practice Quiz
                </h2>
                <p className="text-sm text-slate-600 mt-0.5 mb-5">
                  Choose a course, topic, difficulty, and timer duration.
                </p>

                <form onSubmit={handleStartPractice} className="space-y-4">
                  <div>
                    <label
                      htmlFor="practice-course"
                      className="block text-sm font-medium text-[#162B4D] mb-1"
                    >
                      Course
                    </label>
                    <select
                      id="practice-course"
                      required
                      value={practiceCourseId}
                      onChange={(e) => {
                        setPracticeCourseId(e.target.value);
                        setPracticeTopic('');
                      }}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#162B4D] focus:border-[#1D9BA6] focus:outline-none"
                    >
                      <option value="">Select a course...</option>
                      {courses.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.courseCode} — {c.courseName}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="practice-topic"
                      className="block text-sm font-medium text-[#162B4D] mb-1"
                    >
                      Topic (optional)
                    </label>
                    <select
                      id="practice-topic"
                      value={practiceTopic}
                      onChange={(e) => setPracticeTopic(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#162B4D] focus:border-[#1D9BA6] focus:outline-none"
                    >
                      <option value="">All Topics (Mixed)</option>
                      {practiceTopicsList.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label
                        htmlFor="practice-diff"
                        className="block text-sm font-medium text-[#162B4D] mb-1"
                      >
                        Difficulty
                      </label>
                      <select
                        id="practice-diff"
                        value={practiceDifficulty}
                        onChange={(e) =>
                          setPracticeDifficulty(
                            e.target.value as QuizDifficulty | ''
                          )
                        }
                        className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-[#162B4D] focus:border-[#1D9BA6] focus:outline-none"
                      >
                        <option value="">Any</option>
                        <option value={QuizDifficulty.EASY}>Easy</option>
                        <option value={QuizDifficulty.MEDIUM}>Medium</option>
                        <option value={QuizDifficulty.HARD}>Hard</option>
                      </select>
                    </div>
                    <div>
                      <label
                        htmlFor="practice-count"
                        className="block text-sm font-medium text-[#162B4D] mb-1"
                      >
                        Questions
                      </label>
                      <input
                        id="practice-count"
                        type="number"
                        min={1}
                        max={30}
                        value={practiceCount}
                        onChange={(e) =>
                          setPracticeCount(
                            Math.min(30, Math.max(1, Number(e.target.value) || 5))
                          )
                        }
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#162B4D] focus:border-[#1D9BA6] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="practice-mins"
                        className="block text-sm font-medium text-[#162B4D] mb-1"
                      >
                        Timer (min)
                      </label>
                      <input
                        id="practice-mins"
                        type="number"
                        min={1}
                        max={60}
                        value={practiceMinutes}
                        onChange={(e) =>
                          setPracticeMinutes(
                            Math.min(60, Math.max(1, Number(e.target.value) || 5))
                          )
                        }
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#162B4D] focus:border-[#1D9BA6] focus:outline-none"
                      />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    variant="teal"
                    className="w-full"
                    loading={startingPractice}
                    disabled={!practiceCourseId}
                  >
                    <Play className="w-4 h-4" aria-hidden="true" />
                    Start Timed Practice
                  </Button>
                </form>
              </Card>

              <Card className="lg:col-span-7">
                <h2 className="font-display text-lg font-semibold text-[#162B4D]">
                  Recent Practice Attempts
                </h2>
                <p className="text-sm text-slate-600 mt-0.5 mb-5">
                  Re-open submitted attempts for answer explanations and topic weakness diagnostics.
                </p>

                {attemptsLoading ? (
                  <CardSkeleton rows={3} />
                ) : attemptsHistory.length === 0 ? (
                  <EmptyState
                    icon={Clock}
                    title="No practice attempts yet"
                    description="Start your first timed quiz on the left to build topic mastery analytics."
                  />
                ) : (
                  <div className="space-y-3">
                    {attemptsHistory.map((att) => (
                      <div
                        key={att.id}
                        className="rounded-xl border border-slate-200 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div>
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="font-mono font-semibold text-[#1D9BA6] bg-[#1D9BA6]/10 px-2 py-0.5 rounded">
                              {att.courseCode}
                            </span>
                            {att.filters.topic && (
                              <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full">
                                {att.filters.topic}
                              </span>
                            )}
                            <span
                              className={`px-2 py-0.5 rounded-full border font-medium ${
                                att.status === QuizAttemptStatus.SUBMITTED
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-amber-50 text-[#b45309] border-amber-200'
                              }`}
                            >
                              {att.status === QuizAttemptStatus.SUBMITTED
                                ? 'Submitted'
                                : 'In Progress'}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-1.5 tabular-nums">
                            {new Date(att.startedAt).toLocaleString()} ·{' '}
                            {att.totalQuestions} questions
                          </p>
                        </div>

                        <div className="flex items-center gap-3">
                          {att.status === QuizAttemptStatus.SUBMITTED && (
                            <div className="text-right tabular-nums">
                              <p className="text-sm font-bold text-[#162B4D]">
                                {att.correctCount}/{att.totalQuestions}
                              </p>
                              <p className="text-xs text-slate-500">
                                {att.percentage}%
                              </p>
                            </div>
                          )}
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleLoadPastAttempt(att.id)}
                          >
                            {att.status === QuizAttemptStatus.SUBMITTED
                              ? 'View Results'
                              : 'Resume'}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          )}
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 3: CONTRIBUTIONS & LEADERBOARD                                  */}
      {/* =================================================================== */}
      {activeTab === 'contributions' && (
        <div className="space-y-6">
          {/* Contributor KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card padding="sm">
              <p className="text-xs font-medium text-slate-500">
                Total Credit Points
              </p>
              <p className="font-display text-2xl font-bold text-[#D98E2B] mt-1 tabular-nums">
                {contribLoading ? '—' : (contribStats?.totalPoints ?? 0)}
              </p>
            </Card>
            <Card padding="sm">
              <p className="text-xs font-medium text-slate-500">
                Approved Questions
              </p>
              <p className="font-display text-2xl font-bold text-emerald-600 mt-1 tabular-nums">
                {contribLoading ? '—' : (contribStats?.approvedCount ?? 0)}
              </p>
            </Card>
            <Card padding="sm">
              <p className="text-xs font-medium text-slate-500">
                Pending Faculty Review
              </p>
              <p className="font-display text-2xl font-bold text-[#2563EB] mt-1 tabular-nums">
                {contribLoading ? '—' : (contribStats?.pendingCount ?? 0)}
              </p>
            </Card>
            <Card padding="sm">
              <p className="text-xs font-medium text-slate-500">Declined</p>
              <p className="font-display text-2xl font-bold text-rose-600 mt-1 tabular-nums">
                {contribLoading ? '—' : (contribStats?.rejectedCount ?? 0)}
              </p>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Course Contributor Leaderboard */}
            <Card className="lg:col-span-5">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <h2 className="font-display text-lg font-semibold text-[#162B4D]">
                    Contributor Leaderboard
                  </h2>
                  <p className="text-xs text-slate-600">
                    Easy +10 · Medium +15 · Hard +25 pts
                  </p>
                </div>
                <select
                  aria-label="Filter leaderboard by course"
                  value={leaderCourseId}
                  onChange={(e) => setLeaderCourseId(e.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-[#162B4D] focus:border-[#D98E2B] focus:outline-none max-w-[160px]"
                >
                  <option value="">All My Courses</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.courseCode}
                    </option>
                  ))}
                </select>
              </div>

              {leaderLoading ? (
                <CardSkeleton rows={3} />
              ) : leaderboard.length === 0 ? (
                <EmptyState
                  icon={Trophy}
                  title="No contributor points yet"
                  description="Approved quiz questions earn points toward the course leaderboard."
                />
              ) : (
                <div className="space-y-2.5">
                  {leaderboard.map((entry) => (
                    <div
                      key={entry.userId}
                      className={`rounded-xl border p-3 flex items-center justify-between gap-3 ${
                        entry.userId === user?.id
                          ? 'border-[#D98E2B] bg-[#D98E2B]/[0.06]'
                          : 'border-slate-200 bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold tabular-nums shrink-0 ${
                            entry.rank === 1
                              ? 'bg-[#D98E2B] text-white'
                              : entry.rank === 2
                                ? 'bg-slate-300 text-[#162B4D]'
                                : entry.rank === 3
                                  ? 'bg-amber-700/80 text-white'
                                  : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {entry.rank}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-[#162B4D] truncate">
                            {entry.name}
                          </p>
                          <p className="text-xs text-slate-500 truncate">
                            {entry.department}
                            {entry.batch ? ` · ${entry.batch}` : ''}
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0 tabular-nums">
                        <p className="text-sm font-bold text-[#D98E2B]">
                          {entry.totalPoints} pts
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {entry.approvedQuestionsCount} approved
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Points Ledger + My Submissions */}
            <div className="lg:col-span-7 space-y-6">
              <Card>
                <h2 className="font-display text-lg font-semibold text-[#162B4D] mb-1">
                  Points Ledger
                </h2>
                <p className="text-xs text-slate-600 mb-4">
                  Every point credit awarded when faculty approve your quiz bank submissions.
                </p>

                {contribLoading ? (
                  <CardSkeleton rows={2} />
                ) : !contribStats || contribStats.ledger.length === 0 ? (
                  <p className="text-sm text-slate-500 py-4">
                    No ledger entries yet. Submit a question for review to earn points.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {contribStats.ledger.map((row) => (
                      <div
                        key={row.id}
                        className="py-3 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 text-xs">
                            <span className="font-mono font-semibold text-[#2563EB]">
                              {row.courseCode}
                            </span>
                            <span className="text-slate-500 truncate">
                              {row.questionTopic}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 mt-0.5">
                            {row.reason}
                          </p>
                        </div>
                        <div className="text-right shrink-0 tabular-nums">
                          <span className="inline-flex items-center gap-1 text-sm font-bold text-emerald-600">
                            <Award className="w-3.5 h-3.5" aria-hidden="true" />+
                            {row.points} pts
                          </span>
                          <p className="text-[11px] text-slate-400">
                            {new Date(row.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              <Card>
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div>
                    <h2 className="font-display text-lg font-semibold text-[#162B4D]">
                      My Submitted Questions
                    </h2>
                    <p className="text-xs text-slate-600">
                      Track approval status and faculty feedback on your contributions.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => openContributeModal()}
                    disabled={courses.length === 0}
                  >
                    <Plus className="w-4 h-4" />
                    New Question
                  </Button>
                </div>

                {contribLoading ? (
                  <CardSkeleton rows={2} />
                ) : !contribStats || contribStats.submissions.length === 0 ? (
                  <EmptyState
                    icon={Sparkles}
                    title="No submissions yet"
                    description="Contribute well-explained quiz questions to help classmates prepare and earn leaderboard credit."
                  />
                ) : (
                  <div className="space-y-3">
                    {contribStats.submissions.map((sub) => {
                      const statusStyle =
                        sub.status === QuizQuestionStatus.APPROVED
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : sub.status === QuizQuestionStatus.REJECTED
                            ? 'bg-rose-50 text-rose-700 border-rose-200'
                            : 'bg-amber-50 text-[#b45309] border-amber-200';
                      return (
                        <div
                          key={sub.id}
                          className="rounded-xl border border-slate-200 p-4 space-y-2"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-semibold text-[#2563EB]">
                                {sub.courseCode}
                              </span>
                              <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full">
                                {sub.topic}
                              </span>
                              <span className="text-slate-500">
                                {DIFFICULTY_STYLES[sub.difficulty].label}
                              </span>
                            </div>
                            <span
                              className={`px-2 py-0.5 rounded-full border font-semibold ${statusStyle}`}
                            >
                              {sub.status}
                              {sub.status === QuizQuestionStatus.APPROVED &&
                              sub.pointsAwarded > 0
                                ? ` (+${sub.pointsAwarded} pts)`
                                : ''}
                            </span>
                          </div>
                          <p className="text-sm font-medium text-[#162B4D]">
                            {sub.questionText}
                          </p>
                          {sub.status === QuizQuestionStatus.REJECTED &&
                            sub.rejectionReason && (
                              <div className="rounded-lg bg-rose-50 border border-rose-200 p-2.5 text-xs text-rose-700">
                                <strong>Faculty feedback:</strong>{' '}
                                {sub.rejectionReason}
                              </div>
                            )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 4: FACULTY / ADMIN REVIEW QUEUE                                 */}
      {/* =================================================================== */}
      {activeTab === 'review' && canReview && (
        <Card>
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-5">
            <div>
              <h2 className="font-display text-lg font-semibold text-[#162B4D]">
                Faculty Question Review Queue
              </h2>
              <p className="text-sm text-slate-600">
                Inspect submitted answer keys, similarity flags, and reported questions for your courses.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <select
                aria-label="Filter review queue by course"
                value={reviewCourseId}
                onChange={(e) => {
                  setReviewCourseId(e.target.value);
                  setReviewPage(1);
                }}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#162B4D] focus:border-[#6D5BD0] focus:outline-none"
              >
                <option value="">All My Courses</option>
                {reviewableCourses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.courseCode} — {c.courseName}
                  </option>
                ))}
              </select>

              <select
                aria-label="Filter review queue by status"
                value={reviewStatus}
                disabled={reviewReportedOnly}
                onChange={(e) => {
                  setReviewStatus(e.target.value as QuizQuestionStatus);
                  setReviewPage(1);
                }}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#162B4D] focus:border-[#6D5BD0] focus:outline-none disabled:opacity-60"
              >
                <option value={QuizQuestionStatus.PENDING}>Pending Review</option>
                <option value={QuizQuestionStatus.APPROVED}>Approved</option>
                <option value={QuizQuestionStatus.REJECTED}>Rejected</option>
              </select>

              <label className="inline-flex items-center gap-2 text-xs font-medium text-[#162B4D] px-3 py-2 rounded-lg border border-slate-300 bg-white cursor-pointer">
                <input
                  type="checkbox"
                  checked={reviewReportedOnly}
                  onChange={(e) => {
                    setReviewReportedOnly(e.target.checked);
                    setReviewPage(1);
                  }}
                  className="rounded border-slate-300 text-[#6D5BD0]"
                />
                Reported Only
              </label>
            </div>
          </div>

          {reviewLoading ? (
            <div className="space-y-3">
              <CardSkeleton rows={3} />
              <CardSkeleton rows={3} />
            </div>
          ) : reviewQuestions.length === 0 ? (
            <EmptyState
              icon={ShieldAlert}
              title="Review queue is clear"
              description="No questions match the selected course, status, or report filter."
            />
          ) : (
            <div className="space-y-4">
              {reviewQuestions.map((q) => {
                const diff = DIFFICULTY_STYLES[q.difficulty];
                const isBusy = actingQuestionId === q.id;
                return (
                  <div
                    key={q.id}
                    className="rounded-xl border border-slate-200 p-5 space-y-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-mono font-semibold text-[#6D5BD0] bg-[#6D5BD0]/10 px-2 py-0.5 rounded">
                          {q.courseCode}
                        </span>
                        <span className="bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded-full font-medium">
                          {q.topic}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full border font-medium ${diff.classes}`}
                        >
                          {diff.label} (+{diff.pts} pts)
                        </span>
                        <span className="text-slate-500">
                          {TYPE_LABELS[q.type]}
                        </span>
                        {q.reportCount > 0 && (
                          <span className="bg-rose-50 text-rose-700 border border-rose-200 px-2 py-0.5 rounded-full font-semibold">
                            {q.reportCount} Open Report(s)
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-slate-500">
                        By <strong className="text-[#162B4D]">{q.contributor.name}</strong>
                      </span>
                    </div>

                    <p className="text-sm sm:text-base font-medium text-[#162B4D]">
                      {q.questionText}
                    </p>

                    {q.options.length > 0 && (
                      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {q.options.map((opt, i) => {
                          const isKey =
                            opt.toLowerCase() === q.correctAnswer.toLowerCase();
                          return (
                            <li
                              key={`${q.id}-rev-opt-${i}`}
                              className={`text-xs rounded-lg border px-3 py-2 ${
                                isKey
                                  ? 'border-emerald-300 bg-emerald-50 text-emerald-800 font-semibold'
                                  : 'border-slate-200 bg-slate-50 text-slate-700'
                              }`}
                            >
                              {opt}
                              {isKey && ' ✓'}
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      <div className="rounded-lg bg-emerald-50/70 border border-emerald-200 p-3">
                        <span className="font-semibold text-emerald-800 block mb-0.5">
                          Correct Answer Key
                        </span>
                        <span className="text-emerald-900 font-medium">
                          {q.correctAnswer}
                        </span>
                      </div>
                      <div className="rounded-lg bg-[#F3F6FB] border border-slate-200 p-3">
                        <span className="font-semibold text-[#162B4D] block mb-0.5">
                          Explanation
                        </span>
                        <span className="text-slate-700">{q.explanation}</span>
                      </div>
                    </div>

                    {q.potentialDuplicates.length > 0 && (
                      <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-[#92400e] space-y-1">
                        <p className="font-semibold flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Potential Similarity Matches
                        </p>
                        {q.potentialDuplicates.map((dup) => (
                          <p key={dup.id}>
                            {Math.round(dup.similarity * 100)}% similar ({dup.status}): “
                            {dup.questionText}”
                          </p>
                        ))}
                      </div>
                    )}

                    {q.openReports.length > 0 && (
                      <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs space-y-2">
                        <p className="font-semibold text-rose-800">
                          Student Reports ({q.openReports.length})
                        </p>
                        {q.openReports.map((rep) => (
                          <div key={rep.id} className="text-rose-700">
                            <strong>{REPORT_REASON_LABELS[rep.reason]}</strong> by{' '}
                            {rep.reporterName}
                            {rep.details ? `: ${rep.details}` : ''}
                          </div>
                        ))}
                        <div className="flex flex-wrap gap-2 pt-1">
                          <Button
                            size="sm"
                            variant="secondary"
                            loading={isBusy}
                            onClick={() =>
                              handleResolveReports(q, 'DISMISS_REPORTS')
                            }
                          >
                            Dismiss Reports
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            loading={isBusy}
                            onClick={() =>
                              handleResolveReports(q, 'UNPUBLISH_QUESTION')
                            }
                          >
                            Unpublish Question
                          </Button>
                        </div>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-100">
                      {q.status !== QuizQuestionStatus.APPROVED && (
                        <Button
                          size="sm"
                          variant="teal"
                          loading={isBusy}
                          onClick={() => handleApproveQuestion(q)}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Approve (+{diff.pts} pts)
                        </Button>
                      )}
                      {q.status !== QuizQuestionStatus.REJECTED && (
                        <Button
                          size="sm"
                          variant="danger"
                          disabled={isBusy}
                          onClick={() => {
                            setRejectTarget(q);
                            setRejectReason('');
                          }}
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          Reject
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {reviewMeta && reviewMeta.totalPages > 1 && (
            <div className="flex items-center justify-between mt-5 pt-4 border-t border-slate-100 text-xs text-slate-600">
              <span className="tabular-nums">
                Page {reviewMeta.page} of {reviewMeta.totalPages}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={reviewMeta.page <= 1}
                  onClick={() => setReviewPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={reviewMeta.page >= reviewMeta.totalPages}
                  onClick={() => setReviewPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* =================================================================== */}
      {/* MODAL: CONTRIBUTE QUESTION + DUPLICATE DETECTION                    */}
      {/* =================================================================== */}
      <Modal
        open={contribOpen}
        onClose={() => setContribOpen(false)}
        title="Contribute Quiz Question"
        subtitle="New submissions start in PENDING status until course faculty approve them."
        maxWidth="xl"
      >
        <form onSubmit={handleSubmitContribution} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="cq-course"
                className="block text-sm font-medium text-[#162B4D] mb-1"
              >
                Course
              </label>
              <select
                id="cq-course"
                required
                value={contribCourseId}
                onChange={(e) => {
                  setContribCourseId(e.target.value);
                  setDupMatches([]);
                }}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#162B4D] focus:border-[#2563EB] focus:outline-none"
              >
                <option value="">Select course...</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.courseCode} — {c.courseName}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="cq-topic"
                className="block text-sm font-medium text-[#162B4D] mb-1"
              >
                Topic
              </label>
              <input
                id="cq-topic"
                type="text"
                required
                minLength={2}
                maxLength={120}
                list="existing-topics-list"
                value={contribTopic}
                onChange={(e) => setContribTopic(e.target.value)}
                placeholder="e.g., Indexing & B+ Trees"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#162B4D] focus:border-[#2563EB] focus:outline-none"
              />
              <datalist id="existing-topics-list">
                {bankTopics.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="cq-diff"
                className="block text-sm font-medium text-[#162B4D] mb-1"
              >
                Difficulty (Credit Reward)
              </label>
              <select
                id="cq-diff"
                value={contribDifficulty}
                onChange={(e) =>
                  setContribDifficulty(e.target.value as QuizDifficulty)
                }
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#162B4D] focus:border-[#2563EB] focus:outline-none"
              >
                <option value={QuizDifficulty.EASY}>Easy (+10 pts)</option>
                <option value={QuizDifficulty.MEDIUM}>Medium (+15 pts)</option>
                <option value={QuizDifficulty.HARD}>Hard (+25 pts)</option>
              </select>
            </div>
            <div>
              <label
                htmlFor="cq-type"
                className="block text-sm font-medium text-[#162B4D] mb-1"
              >
                Question Type
              </label>
              <select
                id="cq-type"
                value={contribType}
                onChange={(e) => {
                  const next = e.target.value as QuizQuestionType;
                  setContribType(next);
                  setContribCorrect(
                    next === QuizQuestionType.TRUE_FALSE ? 'True' : ''
                  );
                }}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#162B4D] focus:border-[#2563EB] focus:outline-none"
              >
                <option value={QuizQuestionType.MCQ}>Multiple Choice (MCQ)</option>
                <option value={QuizQuestionType.TRUE_FALSE}>True / False</option>
                <option value={QuizQuestionType.SHORT_ANSWER}>
                  Short Answer
                </option>
              </select>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label
                htmlFor="cq-text"
                className="block text-sm font-medium text-[#162B4D]"
              >
                Question Prompt
              </label>
              <button
                type="button"
                onClick={handleCheckDuplicates}
                disabled={checkingDup}
                className="text-xs font-medium text-[#2563EB] hover:text-[#1d4ed8] cursor-pointer disabled:opacity-60"
              >
                {checkingDup ? 'Checking similarity...' : 'Check for Duplicates'}
              </button>
            </div>
            <textarea
              id="cq-text"
              required
              rows={3}
              minLength={8}
              maxLength={2000}
              value={contribText}
              onChange={(e) => setContribText(e.target.value)}
              placeholder="Write a clear, unambiguous question..."
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#162B4D] focus:border-[#2563EB] focus:outline-none"
            />
          </div>

          {dupMatches.length > 0 && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-3.5 text-xs space-y-2">
              <p className="font-semibold text-[#92400e] flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                Similar Question(s) Found in Course Bank
              </p>
              <ul className="space-y-1 text-[#78350f]">
                {dupMatches.map((m) => (
                  <li key={m.id}>
                    <span className="font-semibold tabular-nums">
                      {Math.round(m.similarity * 100)}% match
                    </span>{' '}
                    ({m.status} · {m.topic}): “{m.questionText}”
                  </li>
                ))}
              </ul>
              <label className="flex items-center gap-2 pt-1 font-medium text-[#162B4D] cursor-pointer">
                <input
                  type="checkbox"
                  checked={ignoreDupWarning}
                  onChange={(e) => setIgnoreDupWarning(e.target.checked)}
                />
                Confirm this question tests a distinct concept and submit anyway
              </label>
            </div>
          )}

          {contribType === QuizQuestionType.MCQ && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-[#162B4D]">
                  Answer Options (select the correct one)
                </span>
                {contribOptions.length < 6 && (
                  <button
                    type="button"
                    onClick={() => setContribOptions((prev) => [...prev, ''])}
                    className="text-xs font-medium text-[#2563EB] cursor-pointer"
                  >
                    + Add Option
                  </button>
                )}
              </div>
              {contribOptions.map((opt, idx) => (
                <div key={`cq-opt-${idx}`} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="mcq-correct"
                    aria-label={`Mark option ${idx + 1} as correct`}
                    checked={opt.trim() !== '' && contribCorrect === opt.trim()}
                    onChange={() => setContribCorrect(opt.trim())}
                    disabled={opt.trim() === ''}
                  />
                  <input
                    type="text"
                    value={opt}
                    onChange={(e) => {
                      const val = e.target.value;
                      setContribOptions((prev) =>
                        prev.map((item, i) => (i === idx ? val : item))
                      );
                    }}
                    placeholder={`Option ${String.fromCharCode(65 + idx)}`}
                    className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-[#162B4D] focus:border-[#2563EB] focus:outline-none"
                  />
                  {contribOptions.length > 2 && (
                    <button
                      type="button"
                      aria-label={`Remove option ${idx + 1}`}
                      onClick={() =>
                        setContribOptions((prev) =>
                          prev.filter((_, i) => i !== idx)
                        )
                      }
                      className="p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {contribType === QuizQuestionType.TRUE_FALSE && (
            <div>
              <span className="block text-sm font-medium text-[#162B4D] mb-1">
                Correct Answer
              </span>
              <div className="flex gap-4">
                {['True', 'False'].map((v) => (
                  <label
                    key={v}
                    className="inline-flex items-center gap-2 text-sm text-[#162B4D] cursor-pointer"
                  >
                    <input
                      type="radio"
                      name="tf-correct"
                      checked={contribCorrect === v}
                      onChange={() => setContribCorrect(v)}
                    />
                    {v}
                  </label>
                ))}
              </div>
            </div>
          )}

          {contribType === QuizQuestionType.SHORT_ANSWER && (
            <div>
              <label
                htmlFor="cq-short-ans"
                className="block text-sm font-medium text-[#162B4D] mb-1"
              >
                Expected Short Answer
              </label>
              <input
                id="cq-short-ans"
                type="text"
                required
                value={contribCorrect}
                onChange={(e) => setContribCorrect(e.target.value)}
                placeholder="Exact concise answer (case-insensitive graded)"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#162B4D] focus:border-[#2563EB] focus:outline-none"
              />
            </div>
          )}

          <div>
            <label
              htmlFor="cq-expl"
              className="block text-sm font-medium text-[#162B4D] mb-1"
            >
              Explanation (shown after practice submission)
            </label>
            <textarea
              id="cq-expl"
              required
              rows={2}
              minLength={5}
              maxLength={2500}
              value={contribExplanation}
              onChange={(e) => setContribExplanation(e.target.value)}
              placeholder="Explain why the correct answer holds and why distractors are wrong..."
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#162B4D] focus:border-[#2563EB] focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setContribOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={submittingContrib}>
              Submit for Review
            </Button>
          </div>
        </form>
      </Modal>

      {/* =================================================================== */}
      {/* MODAL: REPORT QUESTION                                              */}
      {/* =================================================================== */}
      <Modal
        open={Boolean(reportTarget)}
        onClose={() => setReportTarget(null)}
        title="Report Quiz Question"
        subtitle={reportTarget?.topic}
        maxWidth="md"
      >
        <form onSubmit={handleSubmitReport} className="space-y-4">
          <div>
            <label
              htmlFor="rep-reason"
              className="block text-sm font-medium text-[#162B4D] mb-1"
            >
              Issue Type
            </label>
            <select
              id="rep-reason"
              value={reportReason}
              onChange={(e) =>
                setReportReason(e.target.value as QuestionReportReason)
              }
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#162B4D] focus:border-[#2563EB] focus:outline-none"
            >
              {Object.entries(REPORT_REASON_LABELS).map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="rep-details"
              className="block text-sm font-medium text-[#162B4D] mb-1"
            >
              Details (optional)
            </label>
            <textarea
              id="rep-details"
              rows={3}
              maxLength={1000}
              value={reportDetails}
              onChange={(e) => setReportDetails(e.target.value)}
              placeholder="Describe the error, duplicate, or ambiguity..."
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#162B4D] focus:border-[#2563EB] focus:outline-none"
            />
          </div>
          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setReportTarget(null)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="danger" loading={submittingReport}>
              Submit Report
            </Button>
          </div>
        </form>
      </Modal>

      {/* =================================================================== */}
      {/* MODAL: FACULTY REJECT REASON                                        */}
      {/* =================================================================== */}
      <Modal
        open={Boolean(rejectTarget)}
        onClose={() => setRejectTarget(null)}
        title="Reject Submitted Question"
        subtitle={rejectTarget?.topic}
        maxWidth="md"
      >
        <form onSubmit={handleConfirmReject} className="space-y-4">
          <div>
            <label
              htmlFor="rej-reason"
              className="block text-sm font-medium text-[#162B4D] mb-1"
            >
              Rejection Reason (visible to contributor)
            </label>
            <textarea
              id="rej-reason"
              required
              rows={3}
              minLength={3}
              maxLength={500}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Explain what needs correction or why the question was declined..."
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#162B4D] focus:border-rose-500 focus:outline-none"
            />
          </div>
          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setRejectTarget(null)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="danger" loading={submittingReject}>
              Confirm Rejection
            </Button>
          </div>
        </form>
      </Modal>
    </DashboardLayout>
  );
}
