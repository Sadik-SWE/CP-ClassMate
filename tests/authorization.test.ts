import test, { after, before, describe, mock } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import mongoose from 'mongoose';

// Ensure JWT secrets exist in process.env before importing env.ts
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET || 'test-access-secret-key-min-32-chars!!';
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || 'test-refresh-secret-key-min-32-chars!';

const { createExpressApp } = await import('../src/server/app.ts');
const { signAccessToken } = await import('../src/server/utils/crypto.ts');
const { UserModel } = await import('../src/server/modules/users/users.model.ts');
const { CourseModel, CourseEnrollmentModel } = await import(
  '../src/server/modules/courses/courses.model.ts'
);
const { ResourceModel } = await import(
  '../src/server/modules/resources/resources.model.ts'
);
const { PresentationTopicModel } = await import(
  '../src/server/modules/presentations/presentations.model.ts'
);
const { TeamModel, TeamRequestModel } = await import(
  '../src/server/modules/collaboration/collaboration.model.ts'
);
const {
  QuizAttemptModel,
  QuizQuestionModel,
} = await import('../src/server/modules/quizzes/quizzes.model.ts');
const { computeTextSimilarity } = await import(
  '../src/server/modules/quizzes/textSimilarity.ts'
);
const { AuditLogModel } = await import(
  '../src/server/modules/admin/admin.model.ts'
);
const {
  QuizAttemptStatus,
  QuizDifficulty,
  QuizQuestionStatus,
  QuizQuestionType,
  ResourceStatus,
  ResourceType,
  ResourceVisibility,
  TeamRequestStatus,
  TeamRequestType,
  TeamStatus,
  UserRole,
  UserStatus,
} = await import('../src/shared/types.ts');

const studentId = new mongoose.Types.ObjectId();
const crId = new mongoose.Types.ObjectId();
const facultyId = new mongoose.Types.ObjectId();
const courseAId = new mongoose.Types.ObjectId();
const courseBId = new mongoose.Types.ObjectId();
const privateResourceAId = new mongoose.Types.ObjectId();
const privateResourceBId = new mongoose.Types.ObjectId();
const courseVisibleResourceBId = new mongoose.Types.ObjectId();
const topicAId = new mongoose.Types.ObjectId();
const topicBId = new mongoose.Types.ObjectId();
const teamAId = new mongoose.Types.ObjectId();
const inviteForStudentId = new mongoose.Types.ObjectId();
const joinReqForLeaderCrId = new mongoose.Types.ObjectId();
const quizQuestionA1Id = new mongoose.Types.ObjectId();
const quizQuestionA2Id = new mongoose.Types.ObjectId();
const quizQuestionB1Id = new mongoose.Types.ObjectId();
const inProgressAttemptId = new mongoose.Types.ObjectId();

const studentToken = signAccessToken({
  sub: studentId.toString(),
  role: UserRole.STUDENT,
  email: 'student.a@classmate.edu',
});

const crToken = signAccessToken({
  sub: crId.toString(),
  role: UserRole.STUDENT,
  email: 'cr.a@classmate.edu',
});

const facultyToken = signAccessToken({
  sub: facultyId.toString(),
  role: UserRole.FACULTY,
  email: 'faculty.a@classmate.edu',
});

let server: http.Server;
let baseUrl = '';
let originalReadyStateDescriptor: PropertyDescriptor | undefined;

function extractQueryId(val: unknown): string {
  if (!val) return '';
  if (typeof val === 'string') return val;
  if (val instanceof mongoose.Types.ObjectId) return val.toString();
  return String(val);
}

describe('ClassMate Phase 2 RBAC & Course-Scope Authorization', () => {
  before(async () => {
    originalReadyStateDescriptor = Object.getOwnPropertyDescriptor(
      mongoose.connection,
      'readyState'
    );
    Object.defineProperty(mongoose.connection, 'readyState', {
      configurable: true,
      get: () => 1,
    });

    mock.method(UserModel, 'findOne', (filter: Record<string, unknown>) => {
      const id = extractQueryId(filter?._id);
      const users = new Map([
        [
          studentId.toString(),
          {
            _id: studentId,
            email: 'student.a@classmate.edu',
            name: 'Student A',
            role: UserRole.STUDENT,
            status: UserStatus.ACTIVE,
            department: 'CSE',
          },
        ],
        [
          crId.toString(),
          {
            _id: crId,
            email: 'cr.a@classmate.edu',
            name: 'CR A',
            role: UserRole.STUDENT,
            status: UserStatus.ACTIVE,
            department: 'CSE',
          },
        ],
        [
          facultyId.toString(),
          {
            _id: facultyId,
            email: 'faculty.a@classmate.edu',
            name: 'Faculty A',
            role: UserRole.FACULTY,
            status: UserStatus.ACTIVE,
            department: 'CSE',
          },
        ],
      ]);
      const found = users.get(id) ?? null;
      return {
        select: async () => found,
      };
    });

    mock.method(CourseModel, 'find', (filter: Record<string, unknown>) => {
      if (filter?._id && typeof filter._id === 'object') {
        return {
          select: () => ({
            lean: async () => [
              {
                _id: courseAId,
                courseCode: 'CSE-301',
                courseName: 'Software Engineering',
              },
            ],
          }),
        };
      }
      const crQueryId = extractQueryId(filter?.crUserIds);
      const rows =
        crQueryId === crId.toString() ? [{ _id: courseAId }] : [];
      return {
        select: () => ({
          lean: async () => rows,
        }),
      };
    });

    mock.method(CourseModel, 'exists', async (filter: Record<string, unknown>) => {
      const cid = extractQueryId(filter?._id);
      if (filter?.crUserIds) {
        const uid = extractQueryId(filter.crUserIds);
        return cid === courseAId.toString() && uid === crId.toString()
          ? { _id: courseAId }
          : null;
      }
      if (filter?.facultyIds) {
        const fid = extractQueryId(filter.facultyIds);
        return cid === courseAId.toString() && fid === facultyId.toString()
          ? { _id: courseAId }
          : null;
      }
      return null;
    });

    mock.method(CourseModel, 'findOne', async (filter: Record<string, unknown>) => {
      const cid = extractQueryId(filter?._id);
      if (cid === courseAId.toString()) {
        return {
          _id: courseAId,
          courseCode: 'CSE-301',
          courseName: 'Software Engineering',
          deletedAt: null,
        };
      }
      if (cid === courseBId.toString()) {
        return {
          _id: courseBId,
          courseCode: 'CSE-305',
          courseName: 'Database Systems',
          deletedAt: null,
        };
      }
      return null;
    });

    mock.method(CourseModel, 'findById', (id: unknown) => {
      const cid = extractQueryId(id);
      const doc =
        cid === courseAId.toString()
          ? {
              _id: courseAId,
              courseCode: 'CSE-301',
              courseName: 'Software Engineering',
            }
          : cid === courseBId.toString()
            ? {
                _id: courseBId,
                courseCode: 'CSE-305',
                courseName: 'Database Systems',
              }
            : null;
      return {
        select: () => ({
          lean: async () => doc,
        }),
      };
    });

    mock.method(AuditLogModel, 'create', async () => ({
      _id: new mongoose.Types.ObjectId(),
    }));

    mock.method(
      CourseEnrollmentModel,
      'exists',
      async (filter: Record<string, unknown>) => {
        const uid = extractQueryId(filter?.userId);
        const cid = extractQueryId(filter?.courseId);
        const isCourseA = cid === courseAId.toString();
        if (isCourseA && (uid === studentId.toString() || uid === crId.toString())) {
          return { _id: new mongoose.Types.ObjectId() };
        }
        return null;
      }
    );

    mock.method(
      CourseEnrollmentModel,
      'find',
      (filter: Record<string, unknown>) => {
        const uid = extractQueryId(filter?.userId);
        const rows =
          uid === studentId.toString() || uid === crId.toString()
            ? [{ courseId: courseAId }]
            : [];
        return {
          select: () => ({
            lean: async () => rows,
          }),
        };
      }
    );

    mock.method(ResourceModel, 'findOne', async (filter: Record<string, unknown>) => {
      const rid = extractQueryId(filter?._id);
      const baseFile = {
        storageKey: 'non-guessable-uuid',
        gridFsId: new mongoose.Types.ObjectId(),
        originalName: 'notes.pdf',
        mimeType: 'application/pdf',
        size: 1024,
      };
      if (rid === privateResourceAId.toString()) {
        return {
          _id: privateResourceAId,
          courseId: courseAId,
          title: 'Private Faculty Draft A',
          type: ResourceType.NOTES,
          visibility: ResourceVisibility.PRIVATE,
          status: ResourceStatus.READY,
          file: baseFile,
        };
      }
      if (rid === privateResourceBId.toString()) {
        return {
          _id: privateResourceBId,
          courseId: courseBId,
          title: 'Private Exam Key B',
          type: ResourceType.REFERENCE,
          visibility: ResourceVisibility.PRIVATE,
          status: ResourceStatus.READY,
          file: baseFile,
        };
      }
      if (rid === courseVisibleResourceBId.toString()) {
        return {
          _id: courseVisibleResourceBId,
          courseId: courseBId,
          title: 'Course B Lecture Slides',
          type: ResourceType.SLIDES,
          visibility: ResourceVisibility.COURSE,
          status: ResourceStatus.READY,
          file: baseFile,
        };
      }
      return null;
    });

    mock.method(
      PresentationTopicModel,
      'findOne',
      async (filter: Record<string, unknown>) => {
        const tid = extractQueryId(filter?._id);
        if (tid === topicAId.toString()) {
          return { _id: topicAId, courseId: courseAId, deletedAt: null };
        }
        if (tid === topicBId.toString()) {
          return { _id: topicBId, courseId: courseBId, deletedAt: null };
        }
        return null;
      }
    );

    mock.method(TeamModel, 'findOne', async (filter: Record<string, unknown>) => {
      const tid = extractQueryId(filter?._id);
      if (tid === teamAId.toString()) {
        return {
          _id: teamAId,
          courseId: courseAId,
          name: 'Team Alpha',
          maxSize: 4,
          leaderId: crId,
          memberIds: [crId],
          status: TeamStatus.OPEN,
          deletedAt: null,
        };
      }
      return null;
    });

    mock.method(TeamRequestModel, 'findById', async (id: unknown) => {
      const rid = extractQueryId(id);
      if (rid === inviteForStudentId.toString()) {
        return {
          _id: inviteForStudentId,
          teamId: teamAId,
          courseId: courseAId,
          type: TeamRequestType.INVITE,
          fromUserId: crId,
          toUserId: studentId,
          status: TeamRequestStatus.PENDING,
        };
      }
      if (rid === joinReqForLeaderCrId.toString()) {
        return {
          _id: joinReqForLeaderCrId,
          teamId: teamAId,
          courseId: courseAId,
          type: TeamRequestType.JOIN_REQUEST,
          fromUserId: studentId,
          toUserId: crId,
          status: TeamRequestStatus.PENDING,
        };
      }
      return null;
    });

    // Phase 4 Quiz mocks
    const quizQuestionsFixture = [
      {
        _id: quizQuestionA1Id,
        courseId: courseAId,
        contributorId: studentId,
        topic: 'API Design',
        difficulty: QuizDifficulty.MEDIUM,
        type: QuizQuestionType.MCQ,
        questionText: 'Which HTTP status code represents an authorization failure?',
        options: ['401', '403', '404', '500'],
        correctAnswer: '403',
        explanation: 'SECRET_EXPLANATION_403_FORBIDDEN',
        status: QuizQuestionStatus.APPROVED,
        reportCount: 0,
        createdAt: new Date(),
      },
      {
        _id: quizQuestionA2Id,
        courseId: courseAId,
        contributorId: crId,
        topic: 'Modular Architecture',
        difficulty: QuizDifficulty.EASY,
        type: QuizQuestionType.TRUE_FALSE,
        questionText: 'Services are the only layer other modules may invoke.',
        options: ['True', 'False'],
        correctAnswer: 'True',
        explanation: 'SECRET_EXPLANATION_SERVICE_BOUNDARY',
        status: QuizQuestionStatus.APPROVED,
        reportCount: 0,
        createdAt: new Date(),
      },
      {
        _id: quizQuestionB1Id,
        courseId: courseBId,
        contributorId: studentId,
        topic: 'Indexing',
        difficulty: QuizDifficulty.HARD,
        type: QuizQuestionType.SHORT_ANSWER,
        questionText: 'Which tree structure backs most relational indexes?',
        options: [],
        correctAnswer: 'B+ Tree',
        explanation: 'SECRET_EXPLANATION_BTREE',
        status: QuizQuestionStatus.PENDING,
        reportCount: 0,
        createdAt: new Date(),
      },
    ];

    mock.method(UserModel, 'find', () => ({
      select: () => ({
        lean: async () => [
          { _id: studentId, name: 'Student A', role: UserRole.STUDENT },
          { _id: crId, name: 'CR A', role: UserRole.STUDENT },
        ],
      }),
    }));

    mock.method(QuizQuestionModel, 'find', (filter: Record<string, unknown>) => {
      const matches = quizQuestionsFixture.filter((q) => {
        if (filter?.status && q.status !== filter.status) return false;
        if (filter?.courseId && extractQueryId(filter.courseId) !== q.courseId.toString()) {
          return false;
        }
        return true;
      });
      const chain = {
        select: () => chain,
        sort: () => chain,
        skip: () => chain,
        limit: () => chain,
        lean: async () => matches,
        then: (
          resolve: (value: typeof matches) => unknown,
          reject?: (reason: unknown) => unknown
        ) => Promise.resolve(matches).then(resolve, reject),
      };
      return chain;
    });

    mock.method(QuizQuestionModel, 'countDocuments', async () => 2);
    mock.method(QuizQuestionModel, 'distinct', async () => [
      'API Design',
      'Modular Architecture',
    ]);
    mock.method(
      QuizQuestionModel,
      'findOne',
      async (filter: Record<string, unknown>) => {
        const qid = extractQueryId(filter?._id);
        return quizQuestionsFixture.find((q) => q._id.toString() === qid) ?? null;
      }
    );

    const startedAt = new Date(Date.now() - 30_000);
    const inProgressAttemptDoc = {
      _id: inProgressAttemptId,
      userId: studentId,
      courseId: courseAId,
      status: QuizAttemptStatus.IN_PROGRESS,
      filters: { topic: null, difficulty: null, requestedCount: 2 },
      questionIds: [quizQuestionA1Id, quizQuestionA2Id],
      answers: [] as Array<{
        questionId: mongoose.Types.ObjectId;
        userAnswer: string;
        isCorrect: boolean;
      }>,
      timeLimitSeconds: 120,
      startedAt,
      submittedAt: null as Date | null,
      durationSeconds: 0,
      score: 0,
      correctCount: 0,
      totalQuestions: 2,
      percentage: 0,
      topicWeaknesses: [] as Array<{
        topic: string;
        total: number;
        correct: number;
        accuracyPercent: number;
        status: string;
      }>,
      save: async () => inProgressAttemptDoc,
    };

    mock.method(QuizAttemptModel, 'create', async (payload: Record<string, unknown>) => ({
      ...inProgressAttemptDoc,
      _id: inProgressAttemptId,
      filters: payload.filters ?? inProgressAttemptDoc.filters,
      questionIds: payload.questionIds ?? inProgressAttemptDoc.questionIds,
      timeLimitSeconds:
        (payload.timeLimitSeconds as number) ?? inProgressAttemptDoc.timeLimitSeconds,
      totalQuestions:
        (payload.totalQuestions as number) ?? inProgressAttemptDoc.totalQuestions,
    }));

    mock.method(QuizAttemptModel, 'findById', async (id: unknown) => {
      return extractQueryId(id) === inProgressAttemptId.toString()
        ? inProgressAttemptDoc
        : null;
    });

    const { app } = createExpressApp();
    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address();
    if (!addr || typeof addr === 'string') {
      throw new Error('Failed to bind test HTTP server');
    }
    baseUrl = `http://127.0.0.1:${addr.port}/api/v1`;
  });

  after(async () => {
    mock.restoreAll();
    if (originalReadyStateDescriptor) {
      Object.defineProperty(
        mongoose.connection,
        'readyState',
        originalReadyStateDescriptor
      );
    }
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  test('rejects unauthenticated requests with 401 AUTH_UNAUTHORIZED', async () => {
    const res = await fetch(`${baseUrl}/resources/courses/${courseAId.toString()}`);
    assert.equal(res.status, 401);
    const body = (await res.json()) as { success: boolean; error: { code: string } };
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'AUTH_UNAUTHORIZED');
  });

  test("student cannot read another course's private resource or unenrolled course resources", async () => {
    // 1. Download private resource from Course B (not enrolled)
    const privateResB = await fetch(
      `${baseUrl}/resources/${privateResourceBId.toString()}/download`,
      { headers: { Authorization: `Bearer ${studentToken}` } }
    );
    assert.equal(privateResB.status, 403);
    const privateBodyB = (await privateResB.json()) as {
      success: boolean;
      error: { code: string };
    };
    assert.equal(privateBodyB.error.code, 'COURSE_SCOPE_FORBIDDEN');

    // 2. Download course-visible resource from Course B (not enrolled)
    const courseResB = await fetch(
      `${baseUrl}/resources/${courseVisibleResourceBId.toString()}/download`,
      { headers: { Authorization: `Bearer ${studentToken}` } }
    );
    assert.equal(courseResB.status, 403);
    const courseBodyB = (await courseResB.json()) as {
      success: boolean;
      error: { code: string };
    };
    assert.equal(courseBodyB.error.code, 'COURSE_SCOPE_FORBIDDEN');

    // 3. Download PRIVATE resource inside student's OWN enrolled Course A
    const privateResA = await fetch(
      `${baseUrl}/resources/${privateResourceAId.toString()}/download`,
      { headers: { Authorization: `Bearer ${studentToken}` } }
    );
    assert.equal(privateResA.status, 403);
    const privateBodyA = (await privateResA.json()) as {
      success: boolean;
      error: { code: string };
    };
    assert.equal(privateBodyA.error.code, 'RESOURCE_PRIVATE_FORBIDDEN');

    // 4. List resources for unenrolled Course B
    const listCourseB = await fetch(
      `${baseUrl}/resources/courses/${courseBId.toString()}`,
      { headers: { Authorization: `Bearer ${studentToken}` } }
    );
    assert.equal(listCourseB.status, 403);
  });

  test('CR cannot modify an unassigned course (resources, announcements, presentations)', async () => {
    // 1. CR tries to upload resource to unassigned Course B
    const formData = new FormData();
    formData.append('title', 'Unauthorized Upload');
    formData.append('type', 'NOTES');
    formData.append('visibility', 'COURSE');
    formData.append(
      'file',
      new Blob(['%PDF-1.4 mock'], { type: 'application/pdf' }),
      'notes.pdf'
    );

    const uploadRes = await fetch(
      `${baseUrl}/resources/courses/${courseBId.toString()}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${crToken}` },
        body: formData,
      }
    );
    assert.equal(uploadRes.status, 403);
    const uploadBody = (await uploadRes.json()) as { error: { code: string } };
    assert.equal(uploadBody.error.code, 'COURSE_SCOPE_FORBIDDEN');

    // 2. CR tries to post announcement to unassigned Course B
    const annRes = await fetch(`${baseUrl}/announcements`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${crToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Unassigned Course Announcement',
        content: 'Should be blocked by course scope check.',
        scope: 'COURSE',
        courseId: courseBId.toString(),
        pinned: false,
      }),
    });
    assert.equal(annRes.status, 403);
    const annBody = (await annRes.json()) as { error: { code: string } };
    assert.equal(annBody.error.code, 'COURSE_SCOPE_FORBIDDEN');

    // 3. CR tries to coordinate presentation topic in unassigned Course B
    const coordRes = await fetch(
      `${baseUrl}/presentations/${topicBId.toString()}/coordinate`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${crToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          presentationSlot: 'Monday 9 AM',
          coordinationNotes: 'Attempted unauthorized edit',
        }),
      }
    );
    assert.equal(coordRes.status, 403);
    const coordBody = (await coordRes.json()) as { error: { code: string } };
    assert.equal(coordBody.error.code, 'COURSE_SCOPE_FORBIDDEN');

    // 4. CR tries to mark faculty presentation progress even on assigned Course A
    const progressRes = await fetch(
      `${baseUrl}/presentations/${topicAId.toString()}/progress`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${crToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: 'PRESENTED',
          facultyNotes: 'CR cannot evaluate presentations',
        }),
      }
    );
    assert.equal(progressRes.status, 403);
    const progressBody = (await progressRes.json()) as { error: { code: string } };
    assert.equal(progressBody.error.code, 'AUTH_FORBIDDEN');
  });

  test('faculty cannot change system roles and cannot modify unassigned courses', async () => {
    // 1. Faculty attempts to escalate a student's system role to ADMIN
    const roleRes = await fetch(
      `${baseUrl}/admin/users/${studentId.toString()}/role`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${facultyToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ role: 'ADMIN' }),
      }
    );
    assert.equal(roleRes.status, 403);
    const roleBody = (await roleRes.json()) as { error: { code: string } };
    assert.equal(roleBody.error.code, 'AUTH_FORBIDDEN');

    // 2. Faculty attempts to assign a presentation topic to Course B (not teaching)
    const topicRes = await fetch(
      `${baseUrl}/presentations/courses/${courseBId.toString()}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${facultyToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: 'Unauthorized Topic',
          description: 'Faculty should not modify courses they do not teach.',
          dueDate: new Date(Date.now() + 86_400_000).toISOString(),
          assigneeType: 'COURSE',
        }),
      }
    );
    assert.equal(topicRes.status, 403);
    const topicBody = (await topicRes.json()) as { error: { code: string } };
    assert.equal(topicBody.error.code, 'COURSE_SCOPE_FORBIDDEN');
  });

  test('non-admin roles cannot export matching results CSV and team consent is strictly enforced', async () => {
    // 1. Faculty and Student are blocked from admin-only CSV export
    for (const token of [facultyToken, studentToken]) {
      const exportRes = await fetch(
        `${baseUrl}/admin/matching-results/export`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      assert.equal(exportRes.status, 403);
      const exportBody = (await exportRes.json()) as { error: { code: string } };
      assert.equal(exportBody.error.code, 'AUTH_FORBIDDEN');
    }

    // 2. Sender (CR) cannot unilaterally accept an INVITE sent to a classmate
    const forceInviteRes = await fetch(
      `${baseUrl}/collaboration/requests/${inviteForStudentId.toString()}/respond`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${crToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'ACCEPT' }),
      }
    );
    assert.equal(forceInviteRes.status, 403);
    const forceInviteBody = (await forceInviteRes.json()) as {
      error: { code: string };
    };
    assert.equal(forceInviteBody.error.code, 'CONSENT_REQUIRED');

    // 3. Requester (Student) cannot self-approve their own JOIN_REQUEST; only team leader can
    const selfJoinRes = await fetch(
      `${baseUrl}/collaboration/requests/${joinReqForLeaderCrId.toString()}/respond`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${studentToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'ACCEPT' }),
      }
    );
    assert.equal(selfJoinRes.status, 403);
    const selfJoinBody = (await selfJoinRes.json()) as {
      error: { code: string };
    };
    assert.equal(selfJoinBody.error.code, 'LEADER_REQUIRED');
  });

  test('Phase 4: answer keys are never exposed before submission and students cannot approve questions', async () => {
    // 1. Quiz bank list must never expose correctAnswer or explanation
    const bankRes = await fetch(
      `${baseUrl}/quizzes/questions?courseId=${courseAId.toString()}`,
      { headers: { Authorization: `Bearer ${studentToken}` } }
    );
    assert.equal(bankRes.status, 200);
    const bankRaw = await bankRes.text();
    assert.equal(bankRaw.includes('correctAnswer'), false);
    assert.equal(bankRaw.includes('explanation'), false);
    assert.equal(bankRaw.includes('SECRET_EXPLANATION_403_FORBIDDEN'), false);

    // 2. Starting timed practice must never expose correctAnswer or explanation
    const startRes = await fetch(`${baseUrl}/quizzes/practice/start`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${studentToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        courseId: courseAId.toString(),
        count: 2,
      }),
    });
    assert.equal(startRes.status, 201);
    const startRaw = await startRes.text();
    assert.equal(startRaw.includes('correctAnswer'), false);
    assert.equal(startRaw.includes('explanation'), false);
    assert.equal(startRaw.includes('SECRET_EXPLANATION_SERVICE_BOUNDARY'), false);

    // 3. Fetching an IN_PROGRESS attempt must never expose answer keys
    const inProgRes = await fetch(
      `${baseUrl}/quizzes/attempts/${inProgressAttemptId.toString()}`,
      { headers: { Authorization: `Bearer ${studentToken}` } }
    );
    assert.equal(inProgRes.status, 200);
    const inProgRaw = await inProgRes.text();
    assert.equal(inProgRaw.includes('correctAnswer'), false);
    assert.equal(inProgRaw.includes('explanation'), false);

    // 4. Submitting attempt grades on server and reveals answer keys, explanations & weakness summary
    const submitRes = await fetch(
      `${baseUrl}/quizzes/practice/${inProgressAttemptId.toString()}/submit`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${studentToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          answers: [
            { questionId: quizQuestionA1Id.toString(), answer: '403' },
            { questionId: quizQuestionA2Id.toString(), answer: 'False' },
          ],
          elapsedSeconds: 45,
        }),
      }
    );
    assert.equal(submitRes.status, 200);
    const submitBody = (await submitRes.json()) as {
      data: {
        attempt: {
          correctCount: number;
          percentage: number;
          reviewItems: Array<{
            correctAnswer: string;
            explanation: string;
            isCorrect: boolean;
          }>;
          topicWeaknesses: Array<{ topic: string; status: string }>;
        };
      };
    };
    assert.equal(submitBody.data.attempt.correctCount, 1);
    assert.equal(submitBody.data.attempt.percentage, 50);
    assert.equal(submitBody.data.attempt.reviewItems.length, 2);
    assert.equal(submitBody.data.attempt.reviewItems[0].correctAnswer, '403');
    assert.equal(
      submitBody.data.attempt.reviewItems[0].explanation,
      'SECRET_EXPLANATION_403_FORBIDDEN'
    );
    assert.equal(submitBody.data.attempt.topicWeaknesses.length, 2);

    // 5. Students and CRs cannot approve or review quiz questions or view the review queue
    for (const token of [studentToken, crToken]) {
      const reviewRes = await fetch(
        `${baseUrl}/quizzes/questions/${quizQuestionB1Id.toString()}/review`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ decision: 'APPROVE' }),
        }
      );
      assert.equal(reviewRes.status, 403);
      const reviewBody = (await reviewRes.json()) as { error: { code: string } };
      assert.equal(reviewBody.error.code, 'AUTH_FORBIDDEN');

      const queueRes = await fetch(`${baseUrl}/quizzes/review-queue`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(queueRes.status, 403);
    }

    // 6. Faculty cannot review questions in a course they do not teach (Course B)
    const facultyWrongCourseRes = await fetch(
      `${baseUrl}/quizzes/questions/${quizQuestionB1Id.toString()}/review`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${facultyToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ decision: 'APPROVE' }),
      }
    );
    assert.equal(facultyWrongCourseRes.status, 403);
    const facultyWrongBody = (await facultyWrongCourseRes.json()) as {
      error: { code: string };
    };
    assert.equal(facultyWrongBody.error.code, 'COURSE_SCOPE_FORBIDDEN');

    // 7. Duplicate detection text similarity flags near-duplicates vs distinct stems
    const dupScore = computeTextSimilarity(
      'Why are B+ Trees preferred over binary search trees for disk database indexes?',
      'Why are B+ Trees preferred over standard binary search trees for disk-backed database indexes?'
    );
    const distinctScore = computeTextSimilarity(
      'Why are B+ Trees preferred for disk indexes?',
      'Which HTTP header configures Cross-Origin Resource Sharing policies?'
    );
    assert.ok(dupScore >= 0.7, `Expected >= 0.7 similarity, got ${dupScore}`);
    assert.ok(distinctScore < 0.4, `Expected < 0.4 similarity, got ${distinctScore}`);
  });
});
