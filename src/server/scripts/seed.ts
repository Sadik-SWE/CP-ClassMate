import { env } from '../config/env.ts';
import { connectDatabase, disconnectDatabase } from '../config/db.ts';
import { logger } from '../utils/logger.ts';
import { hashPassword } from '../utils/crypto.ts';
import { UserModel } from '../modules/users/users.model.ts';
import {
  CourseEnrollmentModel,
  CourseModel,
} from '../modules/courses/courses.model.ts';
import { RefreshTokenModel } from '../modules/auth/auth.model.ts';
import { AuditLogModel } from '../modules/admin/admin.model.ts';
import { ResourceModel } from '../modules/resources/resources.model.ts';
import { AnnouncementModel } from '../modules/announcements/announcements.model.ts';
import {
  PresentationProgressModel,
  PresentationTopicModel,
} from '../modules/presentations/presentations.model.ts';
import { NotificationModel } from '../modules/notifications/notifications.model.ts';
import {
  TeamMatchRequestModel,
  TeamModel,
  TeamRequestModel,
} from '../modules/collaboration/collaboration.model.ts';
import {
  ContributionModel,
  QuestionReportModel,
  QuizAttemptModel,
  QuizQuestionModel,
} from '../modules/quizzes/quizzes.model.ts';
import {
  AiConversationModel,
  AiUsageLogModel,
  DocumentChunkModel,
} from '../modules/ai/ai.model.ts';
import { normalizeQuestionText } from '../modules/quizzes/textSimilarity.ts';
import {
  AnnouncementScope,
  AnnouncementStatus,
  CourseStatus,
  EnrollmentStatus,
  NotificationType,
  PresentationAssigneeType,
  PresentationStatus,
  QuizAttemptStatus,
  QuizDifficulty,
  QuizQuestionStatus,
  QuizQuestionType,
  TeamRequestStatus,
  TeamRequestType,
  TeamStatus,
  TopicMasteryStatus,
  UserRole,
  UserStatus,
  type AvailabilitySlot,
  type UserSkill,
} from '../../shared/types.ts';

const DEMO_PASSWORD = 'Password123!';

interface SeedStudentSpec {
  name: string;
  email: string;
  studentId: string;
  department: string;
  batch: string;
  bio: string;
  skills: UserSkill[];
  interests: string[];
  availability: AvailabilitySlot[];
}

const STUDENT_SPECS: SeedStudentSpec[] = [
  {
    name: 'Amina Rahman',
    email: 'amina.cr@classmate.edu',
    studentId: '241-35-101',
    department: 'Computer Science & Engineering',
    batch: 'Batch 41',
    bio: 'Class Representative for Software Engineering & AI. Interested in backend systems and RAG pipelines.',
    skills: [
      { name: 'TypeScript', level: 5 },
      { name: 'Node.js', level: 4 },
      { name: 'MongoDB', level: 4 },
    ],
    interests: ['Distributed Systems', 'AI Engineering', 'Technical Writing'],
    availability: [
      { day: 'MON', from: '14:00', to: '17:00' },
      { day: 'WED', from: '15:00', to: '18:00' },
      { day: 'SAT', from: '10:00', to: '13:00' },
    ],
  },
  {
    name: 'Tanvir Hasan',
    email: 'tanvir.cr@classmate.edu',
    studentId: '241-35-102',
    department: 'Computer Science & Engineering',
    batch: 'Batch 41',
    bio: 'Class Representative for DBMS & Networks. Focused on database internals and system design.',
    skills: [
      { name: 'SQL', level: 5 },
      { name: 'Python', level: 4 },
      { name: 'Linux', level: 4 },
    ],
    interests: ['Database Internals', 'Computer Networks', 'DevOps'],
    availability: [
      { day: 'TUE', from: '14:00', to: '17:00' },
      { day: 'THU', from: '15:00', to: '18:00' },
      { day: 'SUN', from: '11:00', to: '14:00' },
    ],
  },
  {
    name: 'Nadia Karim',
    email: 'nadia.student@classmate.edu',
    studentId: '241-35-201',
    department: 'Computer Science & Engineering',
    batch: 'Batch 41',
    bio: 'Frontend developer exploring accessible UI systems and data visualization.',
    skills: [
      { name: 'React', level: 5 },
      { name: 'Tailwind CSS', level: 5 },
      { name: 'Figma', level: 4 },
    ],
    interests: ['Design Systems', 'Human-Computer Interaction', 'EdTech'],
    availability: [
      { day: 'MON', from: '15:00', to: '18:00' },
      { day: 'WED', from: '14:00', to: '17:00' },
    ],
  },
  {
    name: 'Farhan Chowdhury',
    email: 'farhan.student@classmate.edu',
    studentId: '241-35-202',
    department: 'Computer Science & Engineering',
    batch: 'Batch 41',
    bio: 'Competitive programmer learning applied machine learning and NLP.',
    skills: [
      { name: 'C++', level: 5 },
      { name: 'Python', level: 4 },
      { name: 'PyTorch', level: 3 },
    ],
    interests: ['Algorithms', 'Natural Language Processing', 'AI Engineering'],
    availability: [
      { day: 'TUE', from: '16:00', to: '19:00' },
      { day: 'FRI', from: '14:00', to: '17:00' },
    ],
  },
  {
    name: 'Sadia Islam',
    email: 'sadia.student@classmate.edu',
    studentId: '241-35-203',
    department: 'Software Engineering',
    batch: 'Batch 41',
    bio: 'QA automation enthusiast and full-stack learner.',
    skills: [
      { name: 'Playwright', level: 4 },
      { name: 'TypeScript', level: 4 },
      { name: 'Express.js', level: 3 },
    ],
    interests: ['Software Testing', 'Web Security', 'Product Management'],
    availability: [
      { day: 'MON', from: '14:00', to: '16:30' },
      { day: 'THU', from: '14:00', to: '17:00' },
    ],
  },
  {
    name: 'Rafiqul Alam',
    email: 'rafiq.student@classmate.edu',
    studentId: '241-35-204',
    department: 'Computer Science & Engineering',
    batch: 'Batch 41',
    bio: 'Interested in cloud-native microservices and Kubernetes orchestration.',
    skills: [
      { name: 'Docker', level: 4 },
      { name: 'Go', level: 3 },
      { name: 'PostgreSQL', level: 4 },
    ],
    interests: ['Cloud Infrastructure', 'DevOps', 'Distributed Systems'],
    availability: [
      { day: 'WED', from: '15:00', to: '18:00' },
      { day: 'SAT', from: '11:00', to: '15:00' },
    ],
  },
  {
    name: 'Mehedi Hasan',
    email: 'mehedi.student@classmate.edu',
    studentId: '241-35-205',
    department: 'Software Engineering',
    batch: 'Batch 41',
    bio: 'Building mobile-first web apps and REST APIs.',
    skills: [
      { name: 'React', level: 4 },
      { name: 'Node.js', level: 4 },
      { name: 'MongoDB', level: 3 },
    ],
    interests: ['Full-Stack Web', 'API Design', 'Startups'],
    availability: [
      { day: 'TUE', from: '13:00', to: '16:00' },
      { day: 'THU', from: '13:00', to: '16:00' },
    ],
  },
  {
    name: 'Tasnim Jahan',
    email: 'tasnim.student@classmate.edu',
    studentId: '241-35-206',
    department: 'Data Science',
    batch: 'Batch 41',
    bio: 'Data analyst exploring vector search and retrieval evaluation.',
    skills: [
      { name: 'Python', level: 5 },
      { name: 'Pandas', level: 5 },
      { name: 'SQL', level: 4 },
    ],
    interests: ['Data Visualization', 'Information Retrieval', 'Machine Learning'],
    availability: [
      { day: 'MON', from: '16:00', to: '19:00' },
      { day: 'SAT', from: '10:00', to: '13:00' },
    ],
  },
  {
    name: 'Imran Hossain',
    email: 'imran.student@classmate.edu',
    studentId: '241-35-207',
    department: 'Computer Science & Engineering',
    batch: 'Batch 41',
    bio: 'Network security researcher and CTF participant.',
    skills: [
      { name: 'Network Security', level: 4 },
      { name: 'Linux', level: 5 },
      { name: 'Python', level: 3 },
    ],
    interests: ['Cybersecurity', 'Computer Networks', 'Cryptography'],
    availability: [
      { day: 'WED', from: '16:00', to: '19:00' },
      { day: 'SUN', from: '14:00', to: '17:00' },
    ],
  },
  {
    name: 'Sumaiya Akter',
    email: 'sumaiya.student@classmate.edu',
    studentId: '241-35-208',
    department: 'Software Engineering',
    batch: 'Batch 41',
    bio: 'Technical presenter and UI researcher focusing on educational workflows.',
    skills: [
      { name: 'UI Research', level: 4 },
      { name: 'React', level: 3 },
      { name: 'Technical Writing', level: 5 },
    ],
    interests: ['EdTech', 'Product Design', 'Accessibility'],
    availability: [
      { day: 'TUE', from: '14:00', to: '17:00' },
      { day: 'FRI', from: '15:00', to: '18:00' },
    ],
  },
  {
    name: 'Zahin Ahmed',
    email: 'zahin.student@classmate.edu',
    studentId: '241-35-209',
    department: 'Computer Science & Engineering',
    batch: 'Batch 41',
    bio: 'Systems enthusiast experimenting with Rust and WebAssembly.',
    skills: [
      { name: 'Rust', level: 4 },
      { name: 'C', level: 4 },
      { name: 'TypeScript', level: 3 },
    ],
    interests: ['Compilers', 'Operating Systems', 'Performance'],
    availability: [
      { day: 'THU', from: '15:00', to: '18:00' },
      { day: 'SAT', from: '14:00', to: '17:00' },
    ],
  },
  {
    name: 'Maliha Chowdhury',
    email: 'maliha.student@classmate.edu',
    studentId: '241-35-210',
    department: 'Data Science',
    batch: 'Batch 41',
    bio: 'Working on predictive analytics and ethical AI governance.',
    skills: [
      { name: 'Python', level: 4 },
      { name: 'Scikit-Learn', level: 4 },
      { name: 'Statistics', level: 5 },
    ],
    interests: ['AI Ethics', 'Applied Statistics', 'Research Methods'],
    availability: [
      { day: 'MON', from: '13:00', to: '16:00' },
      { day: 'WED', from: '13:00', to: '16:00' },
    ],
  },
];

let activeSeedPromise: Promise<void> | null = null;

export async function runSeed(options: { disconnectOnComplete?: boolean } = {}) {
  if (activeSeedPromise) {
    return activeSeedPromise;
  }

  activeSeedPromise = (async () => {
    const connected = await connectDatabase();
    if (!connected) {
      throw new Error('Could not connect to MongoDB for seeding.');
    }

    logger.info('Clearing existing ClassMate collections before seeding...');
  await Promise.all([
    AiUsageLogModel.deleteMany({}),
    AiConversationModel.deleteMany({}),
    DocumentChunkModel.deleteMany({}),
    QuestionReportModel.deleteMany({}),
    ContributionModel.deleteMany({}),
    QuizAttemptModel.deleteMany({}),
    QuizQuestionModel.deleteMany({}),
    TeamMatchRequestModel.deleteMany({}),
    TeamRequestModel.deleteMany({}),
    TeamModel.deleteMany({}),
    NotificationModel.deleteMany({}),
    PresentationProgressModel.deleteMany({}),
    PresentationTopicModel.deleteMany({}),
    AnnouncementModel.deleteMany({}),
    ResourceModel.deleteMany({}),
    CourseEnrollmentModel.deleteMany({}),
    CourseModel.deleteMany({}),
    RefreshTokenModel.deleteMany({}),
    AuditLogModel.deleteMany({}),
    UserModel.deleteMany({}),
  ]);

  const passwordHash = await hashPassword(DEMO_PASSWORD);

  const admin = await UserModel.create({
    name: 'Dr. Shahariar Kabir',
    email: 'admin@classmate.edu',
    passwordHash,
    role: UserRole.ADMIN,
    status: UserStatus.ACTIVE,
    department: 'Academic Administration',
    profile: {
      bio: 'Platform Administrator overseeing academic departments, faculty approvals, and course structures.',
      skills: [{ name: 'Academic Governance', level: 5 }],
      interests: ['Educational Technology', 'Institutional Analytics'],
    },
    availability: [{ day: 'MON', from: '09:00', to: '12:00' }],
    optedOutOfMatching: true,
  });

  const faculty1 = await UserModel.create({
    name: 'Prof. Mahmudul Haque',
    email: 'mahmudul.faculty@classmate.edu',
    passwordHash,
    role: UserRole.FACULTY,
    status: UserStatus.ACTIVE,
    department: 'Computer Science & Engineering',
    profile: {
      bio: 'Associate Professor teaching Software Engineering and Artificial Intelligence.',
      skills: [
        { name: 'Software Architecture', level: 5 },
        { name: 'Machine Learning', level: 5 },
      ],
      interests: ['AI in Education', 'Software Verification'],
    },
    availability: [
      { day: 'MON', from: '10:00', to: '12:00' },
      { day: 'WED', from: '11:00', to: '13:00' },
    ],
    optedOutOfMatching: true,
  });

  const faculty2 = await UserModel.create({
    name: 'Dr. Nusrat Jahan',
    email: 'nusrat.faculty@classmate.edu',
    passwordHash,
    role: UserRole.FACULTY,
    status: UserStatus.ACTIVE,
    department: 'Computer Science & Engineering',
    profile: {
      bio: 'Assistant Professor focusing on Database Systems and Computer Networks.',
      skills: [
        { name: 'Database Systems', level: 5 },
        { name: 'Distributed Networks', level: 5 },
      ],
      interests: ['Query Optimization', 'Network Protocols'],
    },
    availability: [
      { day: 'TUE', from: '10:00', to: '12:00' },
      { day: 'THU', from: '11:00', to: '13:00' },
    ],
    optedOutOfMatching: true,
  });

  const studentDocs = await UserModel.insertMany(
    STUDENT_SPECS.map((s) => ({
      name: s.name,
      email: s.email,
      passwordHash,
      role: UserRole.STUDENT,
      status: UserStatus.ACTIVE,
      studentId: s.studentId,
      department: s.department,
      batch: s.batch,
      profile: {
        bio: s.bio,
        skills: s.skills,
        interests: s.interests,
      },
      availability: s.availability,
      optedOutOfMatching: false,
    }))
  );

  const cr1 = studentDocs[0];
  const cr2 = studentDocs[1];

  const coursesData = [
    {
      courseCode: 'CSE-301',
      courseName: 'Software Engineering & System Design',
      department: 'Computer Science & Engineering',
      semester: 'Fall 2026',
      facultyIds: [faculty1._id],
      crUserIds: [cr1._id],
      status: CourseStatus.ACTIVE,
      studentIndices: [0, 2, 3, 4, 6, 9, 10],
    },
    {
      courseCode: 'CSE-305',
      courseName: 'Database Management Systems',
      department: 'Computer Science & Engineering',
      semester: 'Fall 2026',
      facultyIds: [faculty2._id],
      crUserIds: [cr2._id],
      status: CourseStatus.ACTIVE,
      studentIndices: [1, 2, 4, 5, 6, 7, 11],
    },
    {
      courseCode: 'CSE-411',
      courseName: 'Artificial Intelligence & Knowledge Systems',
      department: 'Computer Science & Engineering',
      semester: 'Fall 2026',
      facultyIds: [faculty1._id],
      crUserIds: [cr1._id],
      status: CourseStatus.ACTIVE,
      studentIndices: [0, 3, 5, 7, 8, 10, 11],
    },
    {
      courseCode: 'CSE-421',
      courseName: 'Computer Networks & Security',
      department: 'Computer Science & Engineering',
      semester: 'Fall 2026',
      facultyIds: [faculty2._id],
      crUserIds: [cr2._id],
      status: CourseStatus.ACTIVE,
      studentIndices: [1, 3, 4, 5, 8, 9],
    },
  ];

  const createdCourses = [];
  let enrollmentCount = 0;

  for (const c of coursesData) {
    const course = await CourseModel.create({
      courseCode: c.courseCode,
      courseName: c.courseName,
      department: c.department,
      semester: c.semester,
      facultyIds: c.facultyIds,
      crUserIds: c.crUserIds,
      status: c.status,
    });
    createdCourses.push(course);

    const enrollmentDocs = c.studentIndices.map((idx) => ({
      courseId: course._id,
      userId: studentDocs[idx]._id,
      status: EnrollmentStatus.ACTIVE,
    }));
    await CourseEnrollmentModel.insertMany(enrollmentDocs);
    enrollmentCount += enrollmentDocs.length;
  }

  const [cse301, cse305, cse411] = createdCourses;

  await AnnouncementModel.insertMany([
    {
      title: 'Project Milestone 1 Architecture Review Schedule',
      content:
        '<p>Please prepare your system architecture diagram and API contract checklist ahead of next week&apos;s lab session. <strong>Pinned for quick reference.</strong></p>',
      scope: AnnouncementScope.COURSE,
      courseId: cse301._id,
      targetCourseIds: [cse301._id],
      pinned: true,
      status: AnnouncementStatus.PUBLISHED,
      authorId: faculty1._id,
    },
    {
      title: 'CSE-301 Lab Room Updated to Academic Block B-304',
      content:
        '<p>Coordinating with faculty: Thursday&apos;s software engineering lab moves to <strong>Room B-304</strong>.</p>',
      scope: AnnouncementScope.COURSE,
      courseId: cse301._id,
      targetCourseIds: [cse301._id],
      pinned: false,
      status: AnnouncementStatus.PUBLISHED,
      authorId: cr1._id,
    },
    {
      title: 'Midterm Syllabus & Office Hours Window',
      content:
        '<p>Extended faculty office hours will run Monday and Wednesday 11:00–13:00 across all my Fall 2026 sections.</p>',
      scope: AnnouncementScope.ALL_ENROLLED,
      courseId: null,
      targetCourseIds: [cse301._id, cse411._id],
      pinned: true,
      status: AnnouncementStatus.PUBLISHED,
      authorId: faculty1._id,
    },
    {
      title: 'Indexing & B+ Tree Lab Dataset Released',
      content:
        '<p>Review the schema normalization rubric before submitting your query plan exercise.</p>',
      scope: AnnouncementScope.COURSE,
      courseId: cse305._id,
      targetCourseIds: [cse305._id],
      pinned: false,
      status: AnnouncementStatus.PUBLISHED,
      authorId: faculty2._id,
    },
  ]);

  const due1 = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const due2 = new Date(Date.now() + 12 * 24 * 60 * 60 * 1000);
  const due3 = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

  const [topic1, topic2, topic3] = await PresentationTopicModel.insertMany([
    {
      courseId: cse301._id,
      title: 'Modular Monolith vs Microservices Trade-offs',
      description:
        'Present deployment boundaries, transaction guarantees, and module isolation patterns with a concrete case study.',
      dueDate: due1,
      assigneeType: PresentationAssigneeType.TEAM,
      assigneeLabel: 'Team Alpha (Architecture)',
      coordinationNotes: 'Slot 1 confirmed with slides uploaded 24h prior.',
      presentationSlot: 'Tuesday 10:30 AM · Room A-201',
      createdBy: faculty1._id,
    },
    {
      courseId: cse301._id,
      title: 'Role-Based & Resource-Scoped Authorization Audit',
      description:
        'Walk through JWT lifecycle, refresh token rotation, and course-scoped access middleware.',
      dueDate: due2,
      assigneeType: PresentationAssigneeType.STUDENT,
      assigneeUserId: studentDocs[2]._id,
      coordinationNotes: 'Check demo checklist with CR before Thursday.',
      presentationSlot: 'Thursday 11:00 AM · Room A-201',
      createdBy: faculty1._id,
    },
    {
      courseId: cse305._id,
      title: 'MVCC & Isolation Anomalies in Production Databases',
      description:
        'Compare Read Committed, Repeatable Read, and Serializable isolation levels with lock contention benchmarks.',
      dueDate: due3,
      assigneeType: PresentationAssigneeType.COURSE,
      assigneeLabel: null,
      coordinationNotes: '',
      presentationSlot: '',
      createdBy: faculty2._id,
    },
  ]);

  await PresentationProgressModel.insertMany([
    {
      topicId: topic1._id,
      courseId: cse301._id,
      status: PresentationStatus.IN_PROGRESS,
      facultyNotes: 'Outline approved; add latency comparison table.',
      updatedBy: faculty1._id,
    },
    {
      topicId: topic2._id,
      courseId: cse301._id,
      status: PresentationStatus.ASSIGNED,
      facultyNotes: '',
      updatedBy: faculty1._id,
    },
    {
      topicId: topic3._id,
      courseId: cse305._id,
      status: PresentationStatus.ASSIGNED,
      facultyNotes: '',
      updatedBy: faculty2._id,
    },
  ]);

  const [team1] = await TeamModel.insertMany([
    {
      courseId: cse301._id,
      name: 'Team Alpha (Architecture)',
      description:
        'Building a modular monolith & RAG study pipeline for CSE-301 capstone.',
      maxSize: 4,
      leaderId: studentDocs[2]._id,
      memberIds: [studentDocs[2]._id, studentDocs[3]._id],
      status: TeamStatus.OPEN,
    },
    {
      courseId: cse305._id,
      name: 'Query Engine Squad',
      description:
        'Database indexing & MVCC concurrency benchmarking team.',
      maxSize: 3,
      leaderId: studentDocs[4]._id,
      memberIds: [studentDocs[4]._id, studentDocs[5]._id],
      status: TeamStatus.OPEN,
    },
  ]);

  await TeamRequestModel.create({
    teamId: team1._id,
    courseId: cse301._id,
    type: TeamRequestType.INVITE,
    fromUserId: studentDocs[2]._id,
    toUserId: studentDocs[0]._id,
    message: 'Would you like to join Team Alpha for backend Node.js & MongoDB architecture?',
    status: TeamRequestStatus.PENDING,
  });

  await NotificationModel.insertMany([
    {
      userId: studentDocs[0]._id,
      type: NotificationType.TEAM,
      title: `Team invitation: ${team1.name}`,
      message: `${studentDocs[2].name} invited you to join "${team1.name}".`,
      courseId: cse301._id,
      link: '/collaboration?tab=teams',
      readAt: null,
    },
    {
      userId: studentDocs[2]._id,
      type: NotificationType.ANNOUNCEMENT,
      title: 'CSE-301: Project Milestone 1 Architecture Review Schedule',
      message: 'Prof. Mahmudul Haque posted a pinned announcement.',
      courseId: cse301._id,
      link: `/courses/${cse301._id.toString()}?tab=announcements`,
      readAt: null,
    },
    {
      userId: studentDocs[2]._id,
      type: NotificationType.TOPIC,
      title: 'Presentation assigned (CSE-301)',
      message:
        'Prof. Mahmudul Haque assigned you the topic "Role-Based & Resource-Scoped Authorization Audit".',
      courseId: cse301._id,
      link: `/courses/${cse301._id.toString()}?tab=topics`,
      readAt: null,
    },
    {
      userId: cr1._id,
      type: NotificationType.TOPIC,
      title: 'New topic in CSE-301',
      message:
        'Prof. Mahmudul Haque posted presentation topic "Modular Monolith vs Microservices Trade-offs".',
      courseId: cse301._id,
      link: `/courses/${cse301._id.toString()}?tab=topics`,
      readAt: null,
    },
    {
      userId: faculty1._id,
      type: NotificationType.QUIZ,
      title: 'Quiz question pending review (CSE-301)',
      message: 'Nadia Karim contributed a MEDIUM question on "API Design".',
      courseId: cse301._id,
      link: `/quizzes?tab=review&courseId=${cse301._id.toString()}`,
      readAt: null,
    },
  ]);

  // Phase 4: Seed Quiz Questions (Approved, Pending, Rejected) + Contributions + Sample Attempt
  const approvedSeeds = [
    {
      courseId: cse301._id,
      contributorId: studentDocs[2]._id,
      topic: 'Modular Architecture',
      difficulty: QuizDifficulty.MEDIUM,
      type: QuizQuestionType.MCQ,
      questionText:
        'Why do modular monoliths keep cross-module communication behind explicit service interfaces?',
      options: [
        'To enforce module boundaries and decouple internal schemas',
        'To eliminate the need for any database transactions',
        'To allow frontend code to query MongoDB directly',
        'To bypass authentication checks between controllers',
      ],
      correctAnswer: 'To enforce module boundaries and decouple internal schemas',
      explanation:
        'Explicit service interfaces keep business rules isolated per module so internal models can evolve without breaking callers.',
      pointsAwarded: 15,
      reviewedBy: faculty1._id,
    },
    {
      courseId: cse301._id,
      contributorId: studentDocs[0]._id,
      topic: 'Authentication & Security',
      difficulty: QuizDifficulty.HARD,
      type: QuizQuestionType.MCQ,
      questionText:
        'Which approach best protects refresh tokens against XSS exfiltration in a web application?',
      options: [
        'Storing them in HttpOnly, SameSite cookies scoped to the auth path',
        'Storing them in window.localStorage with Base64 encoding',
        'Passing them in URL query parameters on every GET request',
        'Embedding them inside client-side bundle environment variables',
      ],
      correctAnswer:
        'Storing them in HttpOnly, SameSite cookies scoped to the auth path',
      explanation:
        'HttpOnly cookies cannot be read by JavaScript, mitigating XSS token theft, while SameSite reduces CSRF risk.',
      pointsAwarded: 25,
      reviewedBy: faculty1._id,
    },
    {
      courseId: cse301._id,
      contributorId: studentDocs[3]._id,
      topic: 'API Design',
      difficulty: QuizDifficulty.EASY,
      type: QuizQuestionType.TRUE_FALSE,
      questionText:
        'HTTP 403 Forbidden should be returned when a user is authenticated but lacks permission or course scope for a resource.',
      options: ['True', 'False'],
      correctAnswer: 'True',
      explanation:
        '401 Unauthorized indicates missing or invalid authentication, whereas 403 Forbidden indicates insufficient authorization.',
      pointsAwarded: 10,
      reviewedBy: faculty1._id,
    },
    {
      courseId: cse301._id,
      contributorId: studentDocs[4]._id,
      topic: 'Testing & Quality',
      difficulty: QuizDifficulty.MEDIUM,
      type: QuizQuestionType.SHORT_ANSWER,
      questionText:
        'What HTTP status code should be returned when request body validation fails with Zod?',
      options: [],
      correctAnswer: '400',
      explanation:
        'Malformed or schema-invalid client payloads are rejected with 400 Bad Request and field-level validation details.',
      pointsAwarded: 15,
      reviewedBy: faculty1._id,
    },
    {
      courseId: cse305._id,
      contributorId: studentDocs[1]._id,
      topic: 'Indexing & B+ Trees',
      difficulty: QuizDifficulty.MEDIUM,
      type: QuizQuestionType.MCQ,
      questionText:
        'Why are B+ Trees preferred over standard binary search trees for disk-backed database indexes?',
      options: [
        'High fan-out reduces tree height and minimizes disk page I/O',
        'Leaf nodes store no keys and only hold hash buckets',
        'They require zero rebalancing on insertions or deletions',
        'They cannot support range queries efficiently',
      ],
      correctAnswer:
        'High fan-out reduces tree height and minimizes disk page I/O',
      explanation:
        'Each B+ Tree node fits a disk page with many keys, keeping depth shallow and linking leaf nodes for fast range scans.',
      pointsAwarded: 15,
      reviewedBy: faculty2._id,
    },
    {
      courseId: cse305._id,
      contributorId: studentDocs[5]._id,
      topic: 'Transactions & MVCC',
      difficulty: QuizDifficulty.HARD,
      type: QuizQuestionType.MCQ,
      questionText:
        'Under Multi-Version Concurrency Control (MVCC), why do read-only queries avoid blocking concurrent writers?',
      options: [
        'Readers inspect a consistent snapshot of committed row versions',
        'Writers acquire global table-level exclusive locks only after reads finish',
        'MVCC disables all durability guarantees until commit',
        'Readers read uncommitted dirty pages directly from disk',
      ],
      correctAnswer:
        'Readers inspect a consistent snapshot of committed row versions',
      explanation:
        'MVCC maintains versioned tuples so readers read an earlier consistent snapshot without waiting on writer locks.',
      pointsAwarded: 25,
      reviewedBy: faculty2._id,
    },
    {
      courseId: cse305._id,
      contributorId: studentDocs[7]._id,
      topic: 'Normalization',
      difficulty: QuizDifficulty.EASY,
      type: QuizQuestionType.TRUE_FALSE,
      questionText:
        'A relation in Third Normal Form (3NF) removes transitive functional dependencies of non-key attributes on candidate keys.',
      options: ['True', 'False'],
      correctAnswer: 'True',
      explanation:
        '3NF requires 2NF plus no non-prime attribute depends transitively on any candidate key.',
      pointsAwarded: 10,
      reviewedBy: faculty2._id,
    },
  ];

  const createdApprovedQuestions = await QuizQuestionModel.insertMany(
    approvedSeeds.map((q) => ({
      ...q,
      normalizedText: normalizeQuestionText(q.questionText),
      status: QuizQuestionStatus.APPROVED,
      reviewedAt: new Date(Date.now() - 86_400_000),
      potentialDuplicates: [],
    }))
  );

  await ContributionModel.insertMany(
    createdApprovedQuestions.map((q, idx) => ({
      userId: q.contributorId,
      courseId: q.courseId,
      questionId: q._id,
      questionTopic: q.topic,
      points: q.pointsAwarded,
      action: 'QUESTION_APPROVED' as const,
      reason: `Approved ${q.difficulty} ${q.type} question on "${q.topic}"`,
      awardedBy: approvedSeeds[idx].reviewedBy,
    }))
  );

  // Pending & Rejected sample submissions for Faculty Review Queue & My Contributions
  const pendingText1 =
    'Which HTTP status code indicates a resource conflict such as a duplicate submission?';
  const pendingText2 =
    'Why does query pagination protect API endpoints from memory exhaustion?';
  const rejectedText = 'What does SQL stand for in databases?';

  await QuizQuestionModel.insertMany([
    {
      courseId: cse301._id,
      contributorId: studentDocs[2]._id,
      topic: 'API Design',
      difficulty: QuizDifficulty.MEDIUM,
      type: QuizQuestionType.MCQ,
      questionText: pendingText1,
      normalizedText: normalizeQuestionText(pendingText1),
      options: ['409 Conflict', '204 No Content', '302 Found', '502 Bad Gateway'],
      correctAnswer: '409 Conflict',
      explanation:
        'HTTP 409 Conflict signals that the request cannot complete due to a conflict with the current state of the resource.',
      status: QuizQuestionStatus.PENDING,
      potentialDuplicates: [],
    },
    {
      courseId: cse301._id,
      contributorId: studentDocs[3]._id,
      topic: 'API Design',
      difficulty: QuizDifficulty.EASY,
      type: QuizQuestionType.TRUE_FALSE,
      questionText: pendingText2,
      normalizedText: normalizeQuestionText(pendingText2),
      options: ['True', 'False'],
      correctAnswer: 'True',
      explanation:
        'Bounding page size limits database cursor scans and response payload sizes.',
      status: QuizQuestionStatus.PENDING,
      potentialDuplicates: [],
    },
    {
      courseId: cse305._id,
      contributorId: studentDocs[2]._id,
      topic: 'SQL Basics',
      difficulty: QuizDifficulty.EASY,
      type: QuizQuestionType.SHORT_ANSWER,
      questionText: rejectedText,
      normalizedText: normalizeQuestionText(rejectedText),
      options: [],
      correctAnswer: 'Structured Query Language',
      explanation: 'SQL stands for Structured Query Language.',
      status: QuizQuestionStatus.REJECTED,
      rejectionReason:
        'Too trivial for upper-division DBMS; please frame around relational algebra or query plans.',
      reviewedBy: faculty2._id,
      reviewedAt: new Date(Date.now() - 43_200_000),
      potentialDuplicates: [],
    },
  ]);

  const cse301Approved = createdApprovedQuestions.filter(
    (q) => q.courseId.toString() === cse301._id.toString()
  );
  await QuizAttemptModel.create({
    userId: studentDocs[2]._id,
    courseId: cse301._id,
    status: QuizAttemptStatus.SUBMITTED,
    filters: { topic: null, difficulty: null, requestedCount: 4 },
    questionIds: cse301Approved.map((q) => q._id),
    answers: cse301Approved.map((q, i) => ({
      questionId: q._id,
      userAnswer: i === 1 ? 'Storing them in window.localStorage with Base64 encoding' : q.correctAnswer,
      isCorrect: i !== 1,
    })),
    timeLimitSeconds: 240,
    startedAt: new Date(Date.now() - 3_600_000),
    submittedAt: new Date(Date.now() - 3_480_000),
    durationSeconds: 120,
    score: 3,
    correctCount: 3,
    totalQuestions: cse301Approved.length,
    percentage: 75,
    topicWeaknesses: [
      {
        topic: 'Authentication & Security',
        total: 1,
        correct: 0,
        accuracyPercent: 0,
        status: TopicMasteryStatus.WEAK,
      },
      {
        topic: 'API Design',
        total: 1,
        correct: 1,
        accuracyPercent: 100,
        status: TopicMasteryStatus.STRONG,
      },
      {
        topic: 'Modular Architecture',
        total: 1,
        correct: 1,
        accuracyPercent: 100,
        status: TopicMasteryStatus.STRONG,
      },
      {
        topic: 'Testing & Quality',
        total: 1,
        correct: 1,
        accuracyPercent: 100,
        status: TopicMasteryStatus.STRONG,
      },
    ],
  });

  await AuditLogModel.create({
    actorId: admin._id,
    actorEmail: admin.email,
    actorRole: admin.role,
    action: 'SYSTEM_SEED_COMPLETED',
    targetType: 'SYSTEM',
    metadata: {
      adminCount: 1,
      facultyCount: 2,
      crCount: 2,
      studentCount: 10,
      courseCount: createdCourses.length,
      enrollmentCount,
      announcementsCount: 4,
      topicsCount: 3,
      quizQuestionsCount: approvedSeeds.length + 3,
    },
  });

    logger.info(
      {
        admin: admin.email,
        faculty: [faculty1.email, faculty2.email],
        crs: [cr1.email, cr2.email],
        students: studentDocs.length - 2,
        courses: createdCourses.map((c) => c.courseCode),
        enrollments: enrollmentCount,
        quizQuestions: approvedSeeds.length + 3,
      },
      'ClassMate database seeded successfully'
    );

    if (options.disconnectOnComplete) {
      await disconnectDatabase();
    }
  })().finally(() => {
    activeSeedPromise = null;
  });

  return activeSeedPromise;
}

const isDirectCliExecution =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  Boolean(process.argv[1]) &&
  /[\\/]seed\.(ts|js|mjs|cjs)$/.test(process.argv[1]);

if (isDirectCliExecution) {
  runSeed({ disconnectOnComplete: true }).catch(async (err) => {
    logger.error({ err }, 'Seed script failed');
    await disconnectDatabase();
    process.exit(1);
  });
}
