export const UserRole = {
  STUDENT: 'STUDENT',
  FACULTY: 'FACULTY',
  ADMIN: 'ADMIN',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const UserStatus = {
  PENDING: 'PENDING',
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
} as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

export const CourseStatus = {
  ACTIVE: 'ACTIVE',
  ARCHIVED: 'ARCHIVED',
} as const;
export type CourseStatus = (typeof CourseStatus)[keyof typeof CourseStatus];

export const EnrollmentStatus = {
  ACTIVE: 'ACTIVE',
  DROPPED: 'DROPPED',
} as const;
export type EnrollmentStatus = (typeof EnrollmentStatus)[keyof typeof EnrollmentStatus];

export type EffectiveRole = 'STUDENT' | 'CR' | 'FACULTY' | 'ADMIN';

export const DAYS_OF_WEEK = [
  'MON',
  'TUE',
  'WED',
  'THU',
  'FRI',
  'SAT',
  'SUN',
] as const;
export type DayOfWeek = (typeof DAYS_OF_WEEK)[number];

export interface UserSkill {
  name: string;
  level: 1 | 2 | 3 | 4 | 5;
}

export interface AvailabilitySlot {
  day: DayOfWeek;
  from: string; // HH:MM
  to: string;   // HH:MM
}

export interface UserProfile {
  bio: string;
  skills: UserSkill[];
  interests: string[];
}

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  studentId?: string | null;
  department: string;
  batch?: string | null;
  profile: UserProfile;
  availability: AvailabilitySlot[];
  optedOutOfMatching: boolean;
  crCourseIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CourseUserSummary {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  studentId?: string | null;
  department: string;
}

export interface CourseDTO {
  id: string;
  courseCode: string;
  courseName: string;
  department: string;
  semester: string;
  status: CourseStatus;
  faculty: CourseUserSummary[];
  crs: CourseUserSummary[];
  enrollmentCount: number;
  isEnrolled?: boolean;
  isAssignedCR?: boolean;
  isCourseFaculty?: boolean;
  createdAt: string;
  updatedAt: string;
}

// Phase 2: Resources
export const ResourceType = {
  NOTES: 'NOTES',
  SLIDES: 'SLIDES',
  REFERENCE: 'REFERENCE',
  ASSIGNMENT: 'ASSIGNMENT',
  OTHER: 'OTHER',
} as const;
export type ResourceType = (typeof ResourceType)[keyof typeof ResourceType];

export const ResourceVisibility = {
  COURSE: 'COURSE',
  PRIVATE: 'PRIVATE',
} as const;
export type ResourceVisibility =
  (typeof ResourceVisibility)[keyof typeof ResourceVisibility];

export const ResourceStatus = {
  PROCESSING: 'PROCESSING',
  READY: 'READY',
  FAILED: 'FAILED',
} as const;
export type ResourceStatus = (typeof ResourceStatus)[keyof typeof ResourceStatus];

export interface ResourceDTO {
  id: string;
  courseId: string;
  title: string;
  description: string;
  type: ResourceType;
  visibility: ResourceVisibility;
  status: ResourceStatus;
  file: {
    storageKey: string;
    originalName: string;
    mimeType: string;
    size: number;
  };
  pageCount?: number | null;
  chunkCount?: number;
  ingestionError?: string | null;
  hasExtractedText: boolean;
  uploadedBy: {
    id: string;
    name: string;
    role: UserRole;
  };
  createdAt: string;
  updatedAt: string;
}

// Phase 2: Announcements
export const AnnouncementScope = {
  COURSE: 'COURSE',
  ALL_ENROLLED: 'ALL_ENROLLED',
} as const;
export type AnnouncementScope =
  (typeof AnnouncementScope)[keyof typeof AnnouncementScope];

export const AnnouncementStatus = {
  PUBLISHED: 'PUBLISHED',
  WITHDRAWN: 'WITHDRAWN',
} as const;
export type AnnouncementStatus =
  (typeof AnnouncementStatus)[keyof typeof AnnouncementStatus];

export interface AnnouncementDTO {
  id: string;
  title: string;
  content: string;
  scope: AnnouncementScope;
  courseId: string | null;
  courseCode?: string | null;
  courseName?: string | null;
  targetCourseIds: string[];
  pinned: boolean;
  status: AnnouncementStatus;
  author: {
    id: string;
    name: string;
    role: UserRole;
  };
  createdAt: string;
  updatedAt: string;
}

// Phase 2: Presentation Topics & Progress
export const PresentationAssigneeType = {
  COURSE: 'COURSE',
  TEAM: 'TEAM',
  STUDENT: 'STUDENT',
} as const;
export type PresentationAssigneeType =
  (typeof PresentationAssigneeType)[keyof typeof PresentationAssigneeType];

export const PresentationStatus = {
  ASSIGNED: 'ASSIGNED',
  IN_PROGRESS: 'IN_PROGRESS',
  PRESENTED: 'PRESENTED',
} as const;
export type PresentationStatus =
  (typeof PresentationStatus)[keyof typeof PresentationStatus];

export interface PresentationAiOutlineItem {
  section: string;
  keyPoints: string[];
}

export interface PresentationAiQuestionItem {
  question: string;
  suggestedAnswer: string;
}

export interface PresentationAiBriefDTO {
  explanation: string;
  subtopics: string[];
  outline: PresentationAiOutlineItem[];
  discussionPoints: string[];
  possibleQuestions: PresentationAiQuestionItem[];
  conclusion: string;
  savedAt?: string;
  savedByName?: string;
}

export interface PresentationTopicDTO {
  id: string;
  courseId: string;
  title: string;
  description: string;
  dueDate: string;
  assigneeType: PresentationAssigneeType;
  assigneeUser?: CourseUserSummary | null;
  assigneeLabel?: string | null;
  coordinationNotes: string;
  presentationSlot: string;
  aiBrief?: PresentationAiBriefDTO | null;
  progress: {
    status: PresentationStatus;
    facultyNotes: string;
    updatedAt: string;
  };
  createdBy: {
    id: string;
    name: string;
  };
  createdAt: string;
  updatedAt: string;
}

// Phase 2 & 3: Notifications
export const NotificationType = {
  ANNOUNCEMENT: 'ANNOUNCEMENT',
  TOPIC: 'TOPIC',
  RESOURCE: 'RESOURCE',
  TEAM: 'TEAM',
  QUIZ: 'QUIZ',
} as const;
export type NotificationType =
  (typeof NotificationType)[keyof typeof NotificationType];

export interface NotificationDTO {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  courseId: string | null;
  link: string;
  readAt: string | null;
  createdAt: string;
}

export interface AuditLogDTO {
  id: string;
  actorId: string | null;
  actorEmail: string;
  actorRole: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
  ip?: string | null;
  requestId?: string | null;
  createdAt: string;
}

export interface AdminStatsDTO {
  users: {
    total: number;
    active: number;
    pendingFaculty: number;
    suspended: number;
    byRole: {
      STUDENT: number;
      CR: number;
      FACULTY: number;
      ADMIN: number;
    };
  };
  courses: {
    total: number;
    active: number;
    archived: number;
  };
  enrollments: {
    active: number;
  };
  uploads: {
    total: number;
    ready: number;
    processing: number;
    failed: number;
  };
  quizAttempts: {
    total: number;
    submitted: number;
    bankQuestions: number;
  };
  aiUsage: {
    totalRequests: number;
    todayRequests: number;
    estimatedTokens: number;
  };
  auditLogsTotal: number;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiSuccessResponse<T> {
  success: true;
  message: string;
  data: T;
  meta: PaginationMeta | null;
}

export interface ApiErrorResponse {
  success: false;
  message: string;
  error: {
    code: string;
    details: unknown;
  };
}

// Phase 3: Student Discovery, Teams & AI Team Matching
export interface ClassmateDTO {
  id: string;
  name: string;
  department: string;
  batch?: string | null;
  studentId?: string | null;
  profile: UserProfile;
  availability: AvailabilitySlot[];
  sharedCourses: Array<{
    id: string;
    courseCode: string;
    courseName: string;
  }>;
}

export const TeamStatus = {
  OPEN: 'OPEN',
  FULL: 'FULL',
  ARCHIVED: 'ARCHIVED',
} as const;
export type TeamStatus = (typeof TeamStatus)[keyof typeof TeamStatus];

export interface TeamMemberDTO {
  id: string;
  name: string;
  email: string;
  studentId?: string | null;
  department: string;
  skills: UserSkill[];
}

export interface TeamDTO {
  id: string;
  courseId: string;
  courseCode: string;
  courseName: string;
  name: string;
  description: string;
  maxSize: number;
  status: TeamStatus;
  leaderId: string;
  members: TeamMemberDTO[];
  viewerIsMember: boolean;
  viewerIsLeader: boolean;
  hasPendingJoinRequest: boolean;
  createdAt: string;
  updatedAt: string;
}

export const TeamRequestType = {
  INVITE: 'INVITE',
  JOIN_REQUEST: 'JOIN_REQUEST',
} as const;
export type TeamRequestType =
  (typeof TeamRequestType)[keyof typeof TeamRequestType];

export const TeamRequestStatus = {
  PENDING: 'PENDING',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
} as const;
export type TeamRequestStatus =
  (typeof TeamRequestStatus)[keyof typeof TeamRequestStatus];

export interface TeamRequestDTO {
  id: string;
  teamId: string;
  teamName: string;
  courseId: string;
  courseCode: string;
  type: TeamRequestType;
  status: TeamRequestStatus;
  fromUser: CourseUserSummary;
  toUser: CourseUserSummary;
  message: string;
  respondedAt: string | null;
  createdAt: string;
}

export const MatchRequestStatus = {
  QUEUED: 'QUEUED',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
} as const;
export type MatchRequestStatus =
  (typeof MatchRequestStatus)[keyof typeof MatchRequestStatus];

export const MatchCandidateActionStatus = {
  PENDING: 'PENDING',
  INVITED: 'INVITED',
  DISMISSED: 'DISMISSED',
} as const;
export type MatchCandidateActionStatus =
  (typeof MatchCandidateActionStatus)[keyof typeof MatchCandidateActionStatus];

export interface RequiredSkillRequirement {
  name: string;
  normalizedName?: string;
  importance: 1 | 2 | 3 | 4 | 5;
}

export interface MatchScoreBreakdown {
  S: number;
  I: number;
  A: number;
  C: number;
  matchScore: number;
}

export interface MatchCandidateResultDTO {
  candidate: ClassmateDTO;
  rank: number;
  scores: MatchScoreBreakdown;
  matchedSkills: string[];
  complementarySkills: string[];
  overlapMinutes: number;
  explanation: string;
  status: MatchCandidateActionStatus;
}

export interface TeamMatchRequestDTO {
  id: string;
  courseId: string;
  courseCode: string;
  courseName: string;
  teamId: string | null;
  teamName: string | null;
  title: string;
  description: string;
  requiredSkills: RequiredSkillRequirement[];
  desiredTeamSize: number;
  timeConstraints: AvailabilitySlot[];
  optionalInterests: string[];
  hardConstraints: {
    strictTimeOverlap: boolean;
    sameBatchOnly: boolean;
    minSkillLevel: number;
    requiredDays: DayOfWeek[];
  };
  status: MatchRequestStatus;
  modelVersion: string;
  weightsSnapshot: {
    skills: number;
    interests: number;
    availability: number;
    complementary: number;
  };
  candidatePoolSize: number;
  hardFilteredCount: number;
  results: MatchCandidateResultDTO[];
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

// Phase 4: Quizzes, Practice, Review Queue & Contributor Credit
export const QuizDifficulty = {
  EASY: 'EASY',
  MEDIUM: 'MEDIUM',
  HARD: 'HARD',
} as const;
export type QuizDifficulty =
  (typeof QuizDifficulty)[keyof typeof QuizDifficulty];

export const QuizQuestionType = {
  MCQ: 'MCQ',
  TRUE_FALSE: 'TRUE_FALSE',
  SHORT_ANSWER: 'SHORT_ANSWER',
} as const;
export type QuizQuestionType =
  (typeof QuizQuestionType)[keyof typeof QuizQuestionType];

export const QuizQuestionStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;
export type QuizQuestionStatus =
  (typeof QuizQuestionStatus)[keyof typeof QuizQuestionStatus];

export const QuizQuestionSource = {
  HUMAN: 'HUMAN',
  AI: 'AI',
} as const;
export type QuizQuestionSource =
  (typeof QuizQuestionSource)[keyof typeof QuizQuestionSource];

export const QuestionReportReason = {
  WRONG_ANSWER: 'WRONG_ANSWER',
  UNCLEAR: 'UNCLEAR',
  DUPLICATE: 'DUPLICATE',
  INAPPROPRIATE: 'INAPPROPRIATE',
  OTHER: 'OTHER',
} as const;
export type QuestionReportReason =
  (typeof QuestionReportReason)[keyof typeof QuestionReportReason];

export const QuestionReportStatus = {
  OPEN: 'OPEN',
  RESOLVED: 'RESOLVED',
  DISMISSED: 'DISMISSED',
} as const;
export type QuestionReportStatus =
  (typeof QuestionReportStatus)[keyof typeof QuestionReportStatus];

export const QuizAttemptStatus = {
  IN_PROGRESS: 'IN_PROGRESS',
  SUBMITTED: 'SUBMITTED',
} as const;
export type QuizAttemptStatus =
  (typeof QuizAttemptStatus)[keyof typeof QuizAttemptStatus];

export const TopicMasteryStatus = {
  STRONG: 'STRONG',
  MODERATE: 'MODERATE',
  WEAK: 'WEAK',
} as const;
export type TopicMasteryStatus =
  (typeof TopicMasteryStatus)[keyof typeof TopicMasteryStatus];

export interface SimilarQuestionMatch {
  id: string;
  topic: string;
  questionText: string;
  similarity: number;
  status: QuizQuestionStatus;
}

export interface QuestionReportSummaryDTO {
  id: string;
  reason: QuestionReportReason;
  details: string;
  status: QuestionReportStatus;
  reporterName: string;
  createdAt: string;
}

// IMPORTANT: Public quiz bank DTO intentionally excludes correctAnswer and explanation
export interface QuizQuestionPublicDTO {
  id: string;
  courseId: string;
  courseCode: string;
  courseName: string;
  topic: string;
  difficulty: QuizDifficulty;
  type: QuizQuestionType;
  source: QuizQuestionSource;
  questionText: string;
  options: string[];
  status: QuizQuestionStatus;
  reportCount: number;
  contributor: {
    id: string;
    name: string;
    role: UserRole;
  };
  createdAt: string;
}

// Only returned in Faculty/Admin review queue or contributor's own submission status view
export interface QuizQuestionReviewDTO extends QuizQuestionPublicDTO {
  correctAnswer: string;
  explanation: string;
  rejectionReason: string;
  pointsAwarded: number;
  reviewedBy: {
    id: string;
    name: string;
  } | null;
  reviewedAt: string | null;
  potentialDuplicates: SimilarQuestionMatch[];
  openReports: QuestionReportSummaryDTO[];
}

// Practice session question DTO intentionally excludes correctAnswer and explanation
export interface QuizPracticeQuestionDTO {
  id: string;
  topic: string;
  difficulty: QuizDifficulty;
  type: QuizQuestionType;
  source: QuizQuestionSource;
  questionText: string;
  options: string[];
}

export interface TopicWeaknessSummary {
  topic: string;
  total: number;
  correct: number;
  accuracyPercent: number;
  status: TopicMasteryStatus;
}

export interface QuizAttemptReviewItem {
  questionId: string;
  topic: string;
  difficulty: QuizDifficulty;
  type: QuizQuestionType;
  questionText: string;
  options: string[];
  userAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
  explanation: string;
}

export interface QuizAttemptDTO {
  id: string;
  courseId: string;
  courseCode: string;
  courseName: string;
  status: QuizAttemptStatus;
  filters: {
    topic: string | null;
    difficulty: QuizDifficulty | null;
    requestedCount: number;
  };
  totalQuestions: number;
  timeLimitSeconds: number;
  startedAt: string;
  submittedAt: string | null;
  durationSeconds: number;
  score: number;
  correctCount: number;
  percentage: number;
  questions?: QuizPracticeQuestionDTO[];
  reviewItems?: QuizAttemptReviewItem[];
  topicWeaknesses: TopicWeaknessSummary[];
}

export interface ContributionLedgerDTO {
  id: string;
  courseId: string;
  courseCode: string;
  questionId: string | null;
  questionTopic: string;
  points: number;
  action: 'QUESTION_APPROVED' | 'BONUS' | 'REVOKED';
  reason: string;
  createdAt: string;
}

export interface LeaderboardEntryDTO {
  rank: number;
  userId: string;
  name: string;
  department: string;
  batch: string | null;
  totalPoints: number;
  approvedQuestionsCount: number;
}

// Phase 5: AI Study Assistant, Ingestion, Quiz Generation & Presentation Assistant
export interface AiCitationDTO {
  resourceId: string;
  fileName: string;
  resourceTitle: string;
  pageNumber: number;
  excerpt: string;
  score: number;
}

export interface AiMessageDTO {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations: AiCitationDTO[];
  insufficientEvidence: boolean;
  createdAt: string;
}

export interface AiConversationDTO {
  id: string;
  courseId: string;
  courseCode: string;
  courseName: string;
  resourceId: string | null;
  title: string;
  messages: AiMessageDTO[];
  createdAt: string;
  updatedAt: string;
}

export interface AiQuotaStatusDTO {
  usedToday: number;
  dailyLimit: number;
  remaining: number;
  resetsAt: string;
}

export interface NoteSummaryResponseDTO {
  resourceId: string;
  resourceTitle: string;
  fileName: string;
  summary: string;
  keyTakeaways: string[];
  citations: AiCitationDTO[];
  aiGenerated: true;
  quota: AiQuotaStatusDTO;
}

export interface GeneratedAiQuizResponseDTO {
  resourceId: string;
  resourceTitle: string;
  generatedCount: number;
  questions: QuizQuestionPublicDTO[];
  aiGenerated: true;
  quota: AiQuotaStatusDTO;
}

export interface PresentationAssistResponseDTO {
  topicId: string;
  topicTitle: string;
  courseId: string;
  courseCode: string;
  brief: PresentationAiBriefDTO;
  aiGenerated: true;
  quota: AiQuotaStatusDTO;
}


