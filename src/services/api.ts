import type {
  AdminStatsDTO,
  AiCitationDTO,
  AiConversationDTO,
  AiQuotaStatusDTO,
  AnnouncementDTO,
  AnnouncementScope,
  AnnouncementStatus,
  ApiErrorResponse,
  ApiSuccessResponse,
  AuditLogDTO,
  AvailabilitySlot,
  ClassmateDTO,
  ContributionLedgerDTO,
  CourseDTO,
  CourseStatus,
  CourseUserSummary,
  DayOfWeek,
  GeneratedAiQuizResponseDTO,
  LeaderboardEntryDTO,
  MatchCandidateActionStatus,
  NoteSummaryResponseDTO,
  NotificationDTO,
  PaginationMeta,
  PresentationAiBriefDTO,
  PresentationAssigneeType,
  PresentationAssistResponseDTO,
  PresentationStatus,
  PresentationTopicDTO,
  PublicUser,
  QuestionReportReason,
  QuizAttemptDTO,
  QuizDifficulty,
  QuizQuestionPublicDTO,
  QuizQuestionReviewDTO,
  QuizQuestionStatus,
  QuizQuestionType,
  ResourceDTO,
  ResourceType,
  ResourceVisibility,
  SimilarQuestionMatch,
  TeamDTO,
  TeamMatchRequestDTO,
  TeamRequestDTO,
  UserRole,
  UserSkill,
  UserStatus,
} from '../shared/types';

export class ApiClientError extends Error {
  status: number;
  code: string;
  details: unknown;

  constructor(status: number, code: string, message: string, details: unknown = null) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

let accessTokenMemory: string | null = null;
let refreshPromise: Promise<string | null> | null = null;

export function setClientAccessToken(token: string | null): void {
  accessTokenMemory = token;
}

export function getClientAccessToken(): string | null {
  return accessTokenMemory;
}

async function performRefresh(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const res = await fetch('/api/v1/auth/refresh', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!res.ok) {
          accessTokenMemory = null;
          return null;
        }
        const json = (await res.json()) as ApiSuccessResponse<{
          accessToken: string;
          user: PublicUser;
        }>;
        accessTokenMemory = json.data.accessToken;
        return accessTokenMemory;
      } catch {
        accessTokenMemory = null;
        return null;
      } finally {
        refreshPromise = null;
      }
    })();
  }
  return refreshPromise;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  retryOn401 = true
): Promise<ApiSuccessResponse<T>> {
  const headers = new Headers(options.headers || {});
  if (
    !headers.has('Content-Type') &&
    options.body &&
    !(options.body instanceof FormData)
  ) {
    headers.set('Content-Type', 'application/json');
  }
  if (accessTokenMemory) {
    headers.set('Authorization', `Bearer ${accessTokenMemory}`);
  }

  const res = await fetch(`/api/v1${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (
    res.status === 401 &&
    retryOn401 &&
    !path.startsWith('/auth/login') &&
    !path.startsWith('/auth/register') &&
    !path.startsWith('/auth/refresh')
  ) {
    const newToken = await performRefresh();
    if (newToken) {
      return request<T>(path, options, false);
    }
  }

  const json = (await res.json().catch(() => null)) as
    | ApiSuccessResponse<T>
    | ApiErrorResponse
    | null;

  if (!res.ok || !json || !json.success) {
    const errPayload = json && !json.success ? json : null;
    throw new ApiClientError(
      res.status,
      errPayload?.error?.code || 'REQUEST_FAILED',
      errPayload?.message || `Request failed with status ${res.status}`,
      errPayload?.error?.details ?? null
    );
  }

  return json;
}

function buildQuery(
  params: Record<string, string | number | boolean | undefined>
): string {
  const sp = new URLSearchParams();
  for (const [key, val] of Object.entries(params)) {
    if (val !== undefined && val !== '') {
      sp.set(key, String(val));
    }
  }
  const qs = sp.toString();
  return qs ? `?${qs}` : '';
}

export const healthApi = {
  async checkReady(): Promise<{
    ready: boolean;
    missingSecrets: string[];
    database: string;
  }> {
    try {
      const res = await fetch('/health/ready', { credentials: 'include' });
      const json = await res.json();
      if (res.ok && json.success) {
        return {
          ready: true,
          missingSecrets: [],
          database: json.data?.database || 'connected',
        };
      }
      return {
        ready: false,
        missingSecrets: json?.error?.details?.missingSecrets || [],
        database: json?.error?.details?.database || 'disconnected',
      };
    } catch {
      return { ready: false, missingSecrets: [], database: 'unknown' };
    }
  },
};

export const authApi = {
  async register(payload: {
    name: string;
    email: string;
    password: string;
    department: string;
    batch?: string;
    studentId?: string;
    accountType: 'STUDENT' | 'FACULTY';
  }) {
    return request<{
      user: PublicUser;
      requiresApproval: boolean;
      accessToken: string | null;
    }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async login(payload: { email: string; password: string }) {
    return request<{ user: PublicUser; accessToken: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async refresh() {
    return request<{ user: PublicUser; accessToken: string }>('/auth/refresh', {
      method: 'POST',
    });
  },

  async logout() {
    return request<{ loggedOut: boolean }>('/auth/logout', {
      method: 'POST',
    });
  },

  async me() {
    return request<{ user: PublicUser }>('/auth/me');
  },

  async forgotPassword(email: string) {
    return request<{ requested: boolean }>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },

  async resetPassword(token: string, password: string) {
    return request<{ reset: boolean }>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, password }),
    });
  },
};

export const usersApi = {
  async getMyProfile() {
    return request<{ user: PublicUser }>('/users/me');
  },

  async updateMyProfile(payload: {
    name?: string;
    department?: string;
    batch?: string | null;
    bio?: string;
    skills?: UserSkill[];
    interests?: string[];
    availability?: AvailabilitySlot[];
    optedOutOfMatching?: boolean;
  }) {
    return request<{ user: PublicUser }>('/users/me', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },
};

export const coursesApi = {
  async listMyCourses(params: {
    page?: number;
    limit?: number;
    search?: string;
    status?: CourseStatus;
  } = {}) {
    return request<{ courses: CourseDTO[] }>(`/courses${buildQuery(params)}`);
  },

  async listCatalog(params: {
    page?: number;
    limit?: number;
    search?: string;
    department?: string;
  } = {}) {
    return request<{ courses: CourseDTO[] }>(
      `/courses/catalog${buildQuery(params)}`
    );
  },

  async selfEnroll(courseId: string) {
    return request<{ course: CourseDTO }>(`/courses/${courseId}/enroll`, {
      method: 'POST',
    });
  },

  async selfDrop(courseId: string) {
    return request<{ course: CourseDTO }>(`/courses/${courseId}/enroll`, {
      method: 'DELETE',
    });
  },

  async getCourseDetail(courseId: string) {
    return request<{ course: CourseDTO }>(`/courses/${courseId}`);
  },

  async getCourseRoster(courseId: string) {
    return request<{ course: CourseDTO; students: CourseUserSummary[] }>(
      `/courses/${courseId}/roster`
    );
  },
};

export const resourcesApi = {
  async listByCourse(
    courseId: string,
    params: {
      page?: number;
      limit?: number;
      type?: ResourceType | '';
      search?: string;
    } = {}
  ) {
    return request<{ resources: ResourceDTO[] }>(
      `/resources/courses/${courseId}${buildQuery(params)}`
    );
  },

  async upload(
    courseId: string,
    payload: {
      file: File;
      title: string;
      description?: string;
      type: ResourceType;
      visibility: ResourceVisibility;
    }
  ) {
    const formData = new FormData();
    formData.append('file', payload.file);
    formData.append('title', payload.title);
    if (payload.description) {
      formData.append('description', payload.description);
    }
    formData.append('type', payload.type);
    formData.append('visibility', payload.visibility);

    return request<{ resource: ResourceDTO }>(`/resources/courses/${courseId}`, {
      method: 'POST',
      body: formData,
    });
  },

  async download(resourceId: string, fallbackName: string): Promise<void> {
    const attemptDownload = async (retryOn401: boolean): Promise<Response> => {
      const headers = new Headers();
      if (accessTokenMemory) {
        headers.set('Authorization', `Bearer ${accessTokenMemory}`);
      }
      const res = await fetch(`/api/v1/resources/${resourceId}/download`, {
        headers,
        credentials: 'include',
      });
      if (res.status === 401 && retryOn401) {
        const newToken = await performRefresh();
        if (newToken) {
          return attemptDownload(false);
        }
      }
      return res;
    };

    const res = await attemptDownload(true);
    if (!res.ok) {
      const errJson = (await res.json().catch(() => null)) as ApiErrorResponse | null;
      throw new ApiClientError(
        res.status,
        errJson?.error?.code || 'DOWNLOAD_FAILED',
        errJson?.message || 'Unable to download resource file',
        errJson?.error?.details ?? null
      );
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fallbackName || 'resource';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  },

  async retryIngestion(resourceId: string) {
    return request<{ resource: ResourceDTO }>(
      `/resources/${resourceId}/retry-ingestion`,
      { method: 'POST' }
    );
  },

  async remove(resourceId: string) {
    return request<{ deleted: boolean }>(`/resources/${resourceId}`, {
      method: 'DELETE',
    });
  },
};

export const announcementsApi = {
  async list(params: {
    page?: number;
    limit?: number;
    courseId?: string;
    pinned?: boolean;
    status?: AnnouncementStatus;
    includeWithdrawn?: boolean;
    search?: string;
  } = {}) {
    return request<{ announcements: AnnouncementDTO[] }>(
      `/announcements${buildQuery(params)}`
    );
  },

  async create(payload: {
    title: string;
    content: string;
    scope: AnnouncementScope;
    courseId?: string | null;
    pinned?: boolean;
  }) {
    return request<{ announcement: AnnouncementDTO }>('/announcements', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async update(
    announcementId: string,
    payload: {
      title?: string;
      content?: string;
      pinned?: boolean;
    }
  ) {
    return request<{ announcement: AnnouncementDTO }>(
      `/announcements/${announcementId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }
    );
  },

  async withdraw(announcementId: string) {
    return request<{ announcement: AnnouncementDTO }>(
      `/announcements/${announcementId}/withdraw`,
      { method: 'POST' }
    );
  },
};

export const presentationsApi = {
  async listByCourse(
    courseId: string,
    params: {
      page?: number;
      limit?: number;
      status?: PresentationStatus | '';
      assigneeType?: PresentationAssigneeType | '';
    } = {}
  ) {
    return request<{ topics: PresentationTopicDTO[] }>(
      `/presentations/courses/${courseId}${buildQuery(params)}`
    );
  },

  async create(
    courseId: string,
    payload: {
      title: string;
      description: string;
      dueDate: string;
      assigneeType: PresentationAssigneeType;
      assigneeUserId?: string | null;
      assigneeLabel?: string | null;
    }
  ) {
    return request<{ topic: PresentationTopicDTO }>(
      `/presentations/courses/${courseId}`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  },

  async coordinate(
    topicId: string,
    payload: { coordinationNotes: string; presentationSlot: string }
  ) {
    return request<{ topic: PresentationTopicDTO }>(
      `/presentations/${topicId}/coordinate`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }
    );
  },

  async updateProgress(
    topicId: string,
    payload: { status: PresentationStatus; facultyNotes: string }
  ) {
    return request<{ topic: PresentationTopicDTO }>(
      `/presentations/${topicId}/progress`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }
    );
  },

  async remove(topicId: string) {
    return request<{ deleted: boolean }>(`/presentations/${topicId}`, {
      method: 'DELETE',
    });
  },
};

export const notificationsApi = {
  async list(params: { page?: number; limit?: number; unreadOnly?: boolean } = {}) {
    return request<{ notifications: NotificationDTO[]; unreadCount: number }>(
      `/notifications${buildQuery(params)}`
    );
  },

  async markRead(notificationId: string) {
    return request<{ notification: NotificationDTO }>(
      `/notifications/${notificationId}/read`,
      { method: 'PATCH' }
    );
  },

  async markAllRead() {
    return request<{ markedCount: number }>('/notifications/read-all', {
      method: 'POST',
    });
  },
};

export const adminApi = {
  async getStats() {
    return request<{ stats: AdminStatsDTO }>('/admin/stats');
  },

  async listUsers(params: {
    page?: number;
    limit?: number;
    search?: string;
    role?: string;
    status?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  } = {}) {
    return request<{ users: PublicUser[] }>(`/admin/users${buildQuery(params)}`);
  },

  async changeUserRole(userId: string, role: UserRole) {
    return request<{ user: PublicUser }>(`/admin/users/${userId}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    });
  },

  async changeUserStatus(userId: string, status: UserStatus) {
    return request<{ user: PublicUser }>(`/admin/users/${userId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },

  async listCourses(params: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  } = {}) {
    return request<{ courses: CourseDTO[] }>(`/admin/courses${buildQuery(params)}`);
  },

  async createCourse(payload: {
    courseCode: string;
    courseName: string;
    department: string;
    semester: string;
    facultyIds: string[];
    crUserIds: string[];
    status: CourseStatus;
  }) {
    return request<{ course: CourseDTO }>('/admin/courses', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async updateCourse(
    courseId: string,
    payload: {
      courseCode?: string;
      courseName?: string;
      department?: string;
      semester?: string;
      facultyIds?: string[];
      crUserIds?: string[];
      status?: CourseStatus;
    }
  ) {
    return request<{ course: CourseDTO }>(`/admin/courses/${courseId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  async assignCR(courseId: string, userId: string, action: 'ADD' | 'REMOVE') {
    return request<{ course: CourseDTO }>(`/admin/courses/${courseId}/assign-cr`, {
      method: 'POST',
      body: JSON.stringify({ userId, action }),
    });
  },

  async manageEnrollment(courseId: string, userId: string, action: 'ENROLL' | 'DROP') {
    return request<{ course: CourseDTO }>(`/admin/courses/${courseId}/enrollments`, {
      method: 'POST',
      body: JSON.stringify({ userId, action }),
    });
  },

  async listAuditLogs(params: {
    page?: number;
    limit?: number;
    action?: string;
    actorEmail?: string;
    targetType?: string;
    sortOrder?: 'asc' | 'desc';
  } = {}) {
    return request<{ logs: AuditLogDTO[] }>(
      `/admin/audit-logs${buildQuery(params)}`
    );
  },

  async exportMatchingResultsCsv(): Promise<void> {
    const attemptFetch = async (retryOn401: boolean): Promise<Response> => {
      const headers = new Headers();
      if (accessTokenMemory) {
        headers.set('Authorization', `Bearer ${accessTokenMemory}`);
      }
      const res = await fetch('/api/v1/admin/matching-results/export', {
        headers,
        credentials: 'include',
      });
      if (res.status === 401 && retryOn401) {
        const newToken = await performRefresh();
        if (newToken) {
          return attemptFetch(false);
        }
      }
      return res;
    };

    const res = await attemptFetch(true);
    if (!res.ok) {
      const errJson = (await res.json().catch(() => null)) as ApiErrorResponse | null;
      throw new ApiClientError(
        res.status,
        errJson?.error?.code || 'EXPORT_FAILED',
        errJson?.message || 'Unable to export matching results CSV',
        errJson?.error?.details ?? null
      );
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `classmate-matching-results-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  },
};

export const collaborationApi = {
  async discoverClassmates(params: {
    page?: number;
    limit?: number;
    courseId?: string;
    search?: string;
    skill?: string;
    day?: DayOfWeek | '';
  } = {}) {
    return request<{ classmates: ClassmateDTO[] }>(
      `/collaboration/classmates${buildQuery(params)}`
    );
  },

  async listTeams(params: {
    page?: number;
    limit?: number;
    courseId?: string;
    mineOnly?: boolean;
  } = {}) {
    return request<{ teams: TeamDTO[] }>(
      `/collaboration/teams${buildQuery(params)}`
    );
  },

  async createTeam(payload: {
    courseId: string;
    name: string;
    description: string;
    maxSize: number;
  }) {
    return request<{ team: TeamDTO }>('/collaboration/teams', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async inviteToTeam(
    teamId: string,
    payload: { targetUserId: string; message?: string }
  ) {
    return request<{ request: TeamRequestDTO }>(
      `/collaboration/teams/${teamId}/invite`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  },

  async requestToJoinTeam(teamId: string, message?: string) {
    return request<{ request: TeamRequestDTO }>(
      `/collaboration/teams/${teamId}/join-request`,
      {
        method: 'POST',
        body: JSON.stringify({ message: message || '' }),
      }
    );
  },

  async leaveTeam(teamId: string) {
    return request<{ left: boolean; disbanded: boolean }>(
      `/collaboration/teams/${teamId}/leave`,
      { method: 'POST' }
    );
  },

  async listTeamRequests() {
    return request<{ incoming: TeamRequestDTO[]; outgoing: TeamRequestDTO[] }>(
      '/collaboration/requests'
    );
  },

  async respondTeamRequest(
    requestId: string,
    action: 'ACCEPT' | 'REJECT' | 'CANCEL'
  ) {
    return request<{ request: TeamRequestDTO }>(
      `/collaboration/requests/${requestId}/respond`,
      {
        method: 'POST',
        body: JSON.stringify({ action }),
      }
    );
  },

  async listMatchRequests() {
    return request<{ matchRequests: TeamMatchRequestDTO[] }>(
      '/collaboration/match-requests'
    );
  },

  async createMatchRequest(payload: {
    courseId: string;
    teamId?: string | null;
    title: string;
    description: string;
    requiredSkills: Array<{ name: string; importance: number }>;
    desiredTeamSize: number;
    timeConstraints: AvailabilitySlot[];
    optionalInterests: string[];
    hardConstraints: {
      strictTimeOverlap: boolean;
      sameBatchOnly: boolean;
      minSkillLevel: number;
      requiredDays: DayOfWeek[];
    };
  }) {
    return request<{ matchRequest: TeamMatchRequestDTO }>(
      '/collaboration/match-requests',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  },

  async getMatchRequest(requestId: string) {
    return request<{ matchRequest: TeamMatchRequestDTO }>(
      `/collaboration/match-requests/${requestId}`
    );
  },

  async actOnMatchCandidate(
    requestId: string,
    candidateId: string,
    payload: {
      action: MatchCandidateActionStatus;
      teamId?: string | null;
      message?: string;
    }
  ) {
    return request<{ matchRequest: TeamMatchRequestDTO }>(
      `/collaboration/match-requests/${requestId}/candidates/${candidateId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }
    );
  },
};

export const quizzesApi = {
  async listQuestions(params: {
    page?: number;
    limit?: number;
    courseId?: string;
    topic?: string;
    difficulty?: QuizDifficulty | '';
    type?: QuizQuestionType | '';
    search?: string;
  } = {}) {
    return request<{ questions: QuizQuestionPublicDTO[]; topics: string[] }>(
      `/quizzes/questions${buildQuery(params)}`
    );
  },

  async checkDuplicate(payload: { courseId: string; questionText: string }) {
    return request<{ matches: SimilarQuestionMatch[] }>(
      '/quizzes/questions/check-duplicate',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  },

  async contributeQuestion(payload: {
    courseId: string;
    topic: string;
    difficulty: QuizDifficulty;
    type: QuizQuestionType;
    questionText: string;
    options: string[];
    correctAnswer: string;
    explanation: string;
    ignoreDuplicateWarning?: boolean;
  }) {
    return request<{
      question: QuizQuestionPublicDTO;
      potentialDuplicates: SimilarQuestionMatch[];
    }>('/quizzes/questions', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async listReviewQueue(params: {
    page?: number;
    limit?: number;
    courseId?: string;
    status?: QuizQuestionStatus;
    reportedOnly?: boolean;
  } = {}) {
    return request<{ questions: QuizQuestionReviewDTO[] }>(
      `/quizzes/review-queue${buildQuery(params)}`
    );
  },

  async reviewQuestion(
    questionId: string,
    payload: { decision: 'APPROVE' | 'REJECT'; reason?: string }
  ) {
    return request<{ question: QuizQuestionReviewDTO }>(
      `/quizzes/questions/${questionId}/review`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }
    );
  },

  async reportQuestion(
    questionId: string,
    payload: { reason: QuestionReportReason; details?: string }
  ) {
    return request<{ reported: boolean; reportCount: number }>(
      `/quizzes/questions/${questionId}/report`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  },

  async resolveReports(
    questionId: string,
    payload: {
      action: 'DISMISS_REPORTS' | 'UNPUBLISH_QUESTION';
      reason?: string;
    }
  ) {
    return request<{ question: QuizQuestionReviewDTO }>(
      `/quizzes/questions/${questionId}/resolve-reports`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  },

  async startPractice(payload: {
    courseId: string;
    topic?: string;
    difficulty?: QuizDifficulty | '';
    count: number;
    timeLimitSeconds?: number;
    includeMyPrivateAi?: boolean;
  }) {
    return request<{ attempt: QuizAttemptDTO }>('/quizzes/practice/start', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async submitPractice(
    attemptId: string,
    payload: {
      answers: Array<{ questionId: string; answer: string }>;
      elapsedSeconds?: number;
    }
  ) {
    return request<{ attempt: QuizAttemptDTO }>(
      `/quizzes/practice/${attemptId}/submit`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  },

  async listAttempts(params: {
    page?: number;
    limit?: number;
    courseId?: string;
  } = {}) {
    return request<{ attempts: QuizAttemptDTO[] }>(
      `/quizzes/attempts${buildQuery(params)}`
    );
  },

  async getAttempt(attemptId: string) {
    return request<{ attempt: QuizAttemptDTO }>(`/quizzes/attempts/${attemptId}`);
  },

  async getMyContributions() {
    return request<{
      totalPoints: number;
      approvedCount: number;
      pendingCount: number;
      rejectedCount: number;
      ledger: ContributionLedgerDTO[];
      submissions: QuizQuestionReviewDTO[];
    }>('/quizzes/contributions/me');
  },

  async getLeaderboard(params: { courseId?: string; limit?: number } = {}) {
    return request<{ leaderboard: LeaderboardEntryDTO[] }>(
      `/quizzes/leaderboard${buildQuery(params)}`
    );
  },
};

export const aiApi = {
  async getQuota() {
    return request<{ quota: AiQuotaStatusDTO }>('/ai/quota');
  },

  async listConversations(params: { courseId?: string; limit?: number } = {}) {
    return request<{ conversations: AiConversationDTO[] }>(
      `/ai/conversations${buildQuery(params)}`
    );
  },

  async getConversation(conversationId: string) {
    return request<{ conversation: AiConversationDTO }>(
      `/ai/conversations/${conversationId}`
    );
  },

  async deleteConversation(conversationId: string) {
    return request<{ deleted: boolean }>(`/ai/conversations/${conversationId}`, {
      method: 'DELETE',
    });
  },

  async askStudyAssistantStream(
    payload: {
      courseId: string;
      resourceId?: string | null;
      conversationId?: string | null;
      question: string;
    },
    handlers: {
      onCitations?: (data: {
        citations: AiCitationDTO[];
        insufficientEvidence: boolean;
      }) => void;
      onDelta: (delta: string) => void;
      onDone?: (data: {
        conversation: AiConversationDTO;
        quota: AiQuotaStatusDTO;
        aiGenerated: true;
      }) => void;
    },
    signal?: AbortSignal
  ): Promise<void> {
    const openStream = async (retryOn401: boolean): Promise<Response> => {
      const headers = new Headers({
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      });
      if (accessTokenMemory) {
        headers.set('Authorization', `Bearer ${accessTokenMemory}`);
      }
      const res = await fetch('/api/v1/ai/study/ask', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify(payload),
        signal,
      });
      if (res.status === 401 && retryOn401) {
        const newToken = await performRefresh();
        if (newToken) {
          return openStream(false);
        }
      }
      return res;
    };

    const res = await openStream(true);
    if (!res.ok) {
      const errJson = (await res.json().catch(() => null)) as ApiErrorResponse | null;
      throw new ApiClientError(
        res.status,
        errJson?.error?.code || 'AI_REQUEST_FAILED',
        errJson?.message || `Study Assistant failed with status ${res.status}`,
        errJson?.error?.details ?? null
      );
    }

    if (!res.body) {
      throw new ApiClientError(500, 'STREAM_UNAVAILABLE', 'No response stream available');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    const dispatchBlock = (rawBlock: string) => {
      const lines = rawBlock.split(/\r?\n/);
      let eventType = 'message';
      const dataLines: string[] = [];

      for (const line of lines) {
        if (line.startsWith('event:')) {
          eventType = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).trim());
        }
      }

      if (dataLines.length === 0) return;
      const jsonStr = dataLines.join('\n');
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(jsonStr) as Record<string, unknown>;
      } catch {
        return;
      }

      if (eventType === 'citations') {
        handlers.onCitations?.(
          parsed as { citations: AiCitationDTO[]; insufficientEvidence: boolean }
        );
      } else if (eventType === 'delta') {
        if (typeof parsed.text === 'string') {
          handlers.onDelta(parsed.text);
        }
      } else if (eventType === 'done') {
        handlers.onDone?.(
          parsed as {
            conversation: AiConversationDTO;
            quota: AiQuotaStatusDTO;
            aiGenerated: true;
          }
        );
      } else if (eventType === 'error') {
        throw new ApiClientError(
          typeof parsed.statusCode === 'number' ? parsed.statusCode : 502,
          typeof parsed.code === 'string' ? parsed.code : 'AI_STREAM_ERROR',
          typeof parsed.message === 'string'
            ? parsed.message
            : 'Study Assistant encountered an error.'
        );
      }
    };

    while (true) {
      const { value, done } = await reader.read();
      if (value) {
        buffer += decoder.decode(value, { stream: !done });
        const parts = buffer.split(/\r?\n\r?\n/);
        buffer = parts.pop() || '';
        for (const block of parts) {
          if (block.trim()) {
            dispatchBlock(block);
          }
        }
      }
      if (done) {
        if (buffer.trim()) {
          dispatchBlock(buffer);
        }
        break;
      }
    }
  },

  async summarizeNote(payload: { courseId: string; resourceId: string }) {
    return request<NoteSummaryResponseDTO>('/ai/study/summarize', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async generateQuiz(payload: {
    courseId: string;
    resourceId: string;
    count: number;
    difficulty?: QuizDifficulty;
    topic?: string;
  }) {
    return request<GeneratedAiQuizResponseDTO>('/ai/quizzes/generate', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async assistPresentation(payload: { topicId: string; focusNotes?: string }) {
    return request<PresentationAssistResponseDTO>('/ai/presentations/assist', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async savePresentationBrief(topicId: string, brief: PresentationAiBriefDTO) {
    return request<{ topic: PresentationTopicDTO }>(
      `/ai/presentations/${topicId}/save`,
      {
        method: 'POST',
        body: JSON.stringify({
          explanation: brief.explanation,
          subtopics: brief.subtopics,
          outline: brief.outline,
          discussionPoints: brief.discussionPoints,
          possibleQuestions: brief.possibleQuestions,
          conclusion: brief.conclusion,
        }),
      }
    );
  },
};

export type { PaginationMeta };
