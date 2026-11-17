# ClassMate — University Collaboration Platform

ClassMate connects Students (`S`), Class Representatives (`CR`), Faculty (`F`), and Administrators (`A`) through course-scoped collaboration workflows, verified academic enrollments, GridFS-backed course resources, announcements, presentation topic tracking, consent-based teams, Gemini-powered teammate matching, peer quiz banks with timed server-graded practice, in-app notifications, and role-governed access control.

---

## Architecture Diagram (Mermaid)

```mermaid
graph TD
    subgraph Client [React 19 + TypeScript + Tailwind CSS]
        UI[SPA Pages & Components]
        APIClient[API Client & SSE Reader]
    end

    subgraph Server [Node.js + Express REST API (/api/v1)]
        Auth[JWT & Refresh Cookie Auth]
        RBAC[RBAC & Course-Scope Enforcement]
        Modules[Modular Services: Courses, Resources, Announcements, Presentations, Collaboration, Quizzes, Admin]
        AI[Gemini AI Service (@google/genai)]
    end

    subgraph Storage [MongoDB Atlas & GridFS]
        DB[(MongoDB Mongoose Models)]
        GridFS[(GridFS File Storage & PDF Ingestion Chunks)]
    end

    subgraph External [Google Gemini AI]
        Gemini[Gemini Flash & Embeddings API]
    end

    UI --> APIClient
    APIClient -->|HTTP / SSE| Auth
    Auth --> RBAC
    RBAC --> Modules
    Modules --> DB
    Modules --> GridFS
    Modules -->|Server-Side Only| AI
    AI --> Gemini
```

---

## Tech Stack

- **Frontend:** React 19 + TypeScript + Tailwind CSS v4 + React Router (served via Vite middleware in dev / static `dist` in production)
- **Backend:** Node.js + Express.js REST API (`/api/v1`) in TypeScript (`server.ts`)
- **Database & File Storage:** MongoDB Atlas via Mongoose (`users`, `courses`, `courseEnrollments`, `resources`, `announcements`, `presentationTopics`, `presentationProgress`, `teams`, `teamRequests`, `teamMatchRequests`, `quizQuestions`, `quizAttempts`, `contributions`, `questionReports`, `notifications`, `refreshTokens`, `auditLogs`, `documentChunks`, `aiConversations`, `aiUsageLogs`) + **MongoDB GridFS** (`resources` bucket) with server-side PDF text extraction (`pdf-parse`)
- **AI (Server-Side Only):** Official `@google/genai` SDK using `gemini-embedding-2` (semantic skill & interest embeddings) and `gemini-4-hydrogen` (Study Assistant SSE streaming, note summarization, Zod-validated quiz generation, presentation brief generation, and 1–2 sentence candidate explanations). Weights, thresholds, and `modelVersion` are centralized in `AI_CONFIG` (`src/server/config/env.ts`).
- **Security:** `helmet`, strict `cors`, `bcryptjs` (cost 12), 15-minute Bearer Access JWT, opaque httpOnly rotating Refresh Tokens with family reuse detection, Zod validation, `$`-operator NoSQL sanitization, rich/plain text sanitization, magic-byte file signature checks (20 MB limit), CSV formula-injection neutralization, rate limiting (with stricter `aiLimiter` on AI matching), and audit logging.

---

## Environment Variables (Secrets)

Configure these secrets in your environment or AI Studio Secrets panel (see `.env.example`):

| Variable | Required | Description |
| :--- | :--- | :--- |
| `MONGODB_URI` | Yes | MongoDB Atlas connection string |
| `JWT_ACCESS_SECRET` | Yes | Secret key (16+ chars) for signing 15-minute access JWTs |
| `JWT_REFRESH_SECRET` | Yes | Secret key (16+ chars) for refresh token configuration |
| `GEMINI_API_KEY` | Yes | Google Gemini API key (server-side only; required for AI Study Assistant, Team Matching, Quiz Generation & Presentation Assistant) |
| `FRONTEND_URL` | Optional | Allowed CORS origin (falls back to `APP_URL` or `http://localhost:3000`) |

---

## Scripts

- `npm install` — Install dependencies
- `npm run dev` — Start Express + Vite dev server on port `3000`
- `npm run seed` — Seed MongoDB with 1 Admin, 2 Faculty, 2 CRs, 10 Students, 4 Courses with enrollments, announcements, presentation topics, sample teams (`Team Alpha`, `Query Engine Squad`), quiz bank questions (`APPROVED`/`PENDING`/`REJECTED`), contributor ledger points, a graded practice attempt, and notifications
- `npm run test` — Run RBAC, course-scope, consent, quiz answer-key isolation, and CSV export authorization test suite (`tests/authorization.test.ts`)
- `npm run build` — Build frontend assets into `dist/`
- `npm start` — Run production Express server (`node server.ts`)
- `npm run lint` — Run TypeScript typechecking (`tsc --noEmit`)
- `npm run eslint` — Run ESLint across client and server TypeScript files

---

## Seeded Demo Accounts (Development Only)

After running `npm run seed`, the following accounts are available (all share password `Password123!`):

- **Admin (`A`):** `admin@classmate.edu`
- **Faculty (`F`):** `mahmudul.faculty@classmate.edu`, `nusrat.faculty@classmate.edu`
- **Class Rep (`CR`):** `amina.cr@classmate.edu`, `tanvir.cr@classmate.edu`
- **Student (`S`):** `nadia.student@classmate.edu` (and `farhan.student@classmate.edu` through `maliha.student@classmate.edu`)

---

## API Documentation & OpenAPI / Swagger

- Interactive Swagger UI: `GET /api/docs`
- Raw OpenAPI 3.0 JSON Spec: `GET /api/docs/json`

---

## API Endpoints List

### Health & Docs
- `GET /health/live` — Process liveness probe
- `GET /health/ready` — Database & required secrets readiness probe
- `GET /api/docs` — Interactive Swagger UI documentation
- `GET /api/docs/json` — OpenAPI 3.0 JSON specification

### Authentication (`/api/v1/auth`)
- `POST /api/v1/auth/register` — Register a `STUDENT` (`ACTIVE`) or `FACULTY` (`PENDING` until admin approval).
- `POST /api/v1/auth/login` — Authenticate and receive a 15-min Access JWT + httpOnly Refresh cookie (rate-limited).
- `POST /api/v1/auth/refresh` — Rotate opaque refresh token with reuse detection.
- `POST /api/v1/auth/logout` — Revoke active refresh token and clear cookie.
- `GET /api/v1/auth/me` — Fetch authenticated user profile and assigned CR course IDs.
- `POST /api/v1/auth/forgot-password` — Generate password reset token.
- `POST /api/v1/auth/reset-password` — Reset password and revoke existing refresh tokens.

### Users (`/api/v1/users`)
- `GET /api/v1/users/me` — Get current user profile.
- `PATCH /api/v1/users/me` — Update profile details, skills (`1–5`), interests, weekly availability slots, and matching opt-out preference.

### Courses (`/api/v1/courses`)
- `GET /api/v1/courses` — List "My courses" scoped to the caller (`ADMIN`, `FACULTY`, `CR`, `STUDENT`).
- `GET /api/v1/courses/catalog` — Browse active courses and see caller enrollment status.
- `POST /api/v1/courses/:courseId/enroll` — Student self-enrollment in an active course.
- `DELETE /api/v1/courses/:courseId/enroll` — Student self-drop (blocked if actively serving as CR for that course).
- `GET /api/v1/courses/:courseId` — View course detail (course-scope enforced).
- `GET /api/v1/courses/:courseId/roster` — View faculty, CRs, and enrolled student roster (course-scope enforced).

### Resources (`/api/v1/resources`)
- `GET /api/v1/resources/courses/:courseId` — Paginated, searchable course resources (`STUDENT` sees `READY` + `COURSE` visibility only; `FACULTY`/`CR`/`ADMIN` see all).
- `POST /api/v1/resources/courses/:courseId` — Upload PDF, DOCX, PPTX, or image (`<= 20 MB`) into MongoDB GridFS (`PROCESSING -> READY`, magic-byte verified, PDF text extracted and chunk-indexed with Gemini embeddings). Restricted to course Faculty, assigned CR, or Admin.
- `POST /api/v1/resources/:resourceId/retry-ingestion` — Retry failed PDF indexing.
- `GET /api/v1/resources/:resourceId/download` — Stream authorized GridFS file download (`403` if outside course scope or `PRIVATE` accessed by non-staff/non-CR student).
- `DELETE /api/v1/resources/:resourceId` — Soft-delete resource and remove GridFS blob (course Faculty, assigned CR, or Admin).

### Announcements (`/api/v1/announcements`)
- `GET /api/v1/announcements` — Paginated announcements feed sorted with pinned items first (`pinned: -1, createdAt: -1`). Supports `courseId`, `pinned`, and `search`.
- `POST /api/v1/announcements` — Publish to a single course (`COURSE`) or broadcast (`ALL_ENROLLED`). Restricted to assigned CR, course Faculty, or Admin. Triggers in-app notifications.
- `PATCH /api/v1/announcements/:announcementId` — Edit title, sanitized rich-text body, or pin status.
- `POST /api/v1/announcements/:announcementId/withdraw` — Withdraw announcement from active feeds.

### Presentations (`/api/v1/presentations`)
- `GET /api/v1/presentations/courses/:courseId` — Paginated presentation topics with progress status (`ASSIGNED`, `IN_PROGRESS`, `PRESENTED`) and CR coordination details.
- `POST /api/v1/presentations/courses/:courseId` — Faculty (own course) or Admin creates a topic with due date and assigns it to `COURSE`, `TEAM`, or an enrolled `STUDENT`. Dispatches in-app notifications.
- `PATCH /api/v1/presentations/:topicId/coordinate` — Assigned CR, course Faculty, or Admin updates presentation slot and coordination notes.
- `PATCH /api/v1/presentations/:topicId/progress` — Course Faculty or Admin updates status (`ASSIGNED`, `IN_PROGRESS`, `PRESENTED`) and evaluation notes.
- `DELETE /api/v1/presentations/:topicId` — Course Faculty or Admin soft-deletes a topic.

### Collaboration & AI Team Matching (`/api/v1/collaboration`)
- `GET /api/v1/collaboration/classmates` — Paginated, searchable list of classmates in shared active courses (`name`, `department`, `batch`, `skills`, `interests`, `availability`), respecting `optedOutOfMatching: false` and canonical skill aliases.
- `GET /api/v1/collaboration/teams`, `POST /api/v1/collaboration/teams` — List course teams or create a new project team (`maxSize` 2–10).
- `POST /api/v1/collaboration/teams/:teamId/invite` — Invite an enrolled classmate to a team (consent-based).
- `POST /api/v1/collaboration/teams/:teamId/join-request` — Request to join an open team (consent-based).
- `POST /api/v1/collaboration/teams/:teamId/leave` — Leave a team.
- `GET /api/v1/collaboration/requests`, `POST /api/v1/collaboration/requests/:requestId/respond` — View incoming/outgoing requests and `ACCEPT`, `REJECT`, or `CANCEL`.
- `GET /api/v1/collaboration/match-requests`, `POST /api/v1/collaboration/match-requests` — Queue async AI Team Matching job (`202` queued, rate-limited with `aiLimiter`). Computes `S`, `I`, `A`, `C` (`0–100`) and `MatchScore = 0.40*S + 0.20*I + 0.20*A + 0.20*C`, applies hard constraints, deduplicates enrollees, persists `modelVersion` and weights snapshot, and generates Gemini explanations.
- `GET /api/v1/collaboration/match-requests/:requestId` — Poll async job status and ranked candidates.
- `PATCH /api/v1/collaboration/match-requests/:requestId/candidates/:candidateId` — `INVITED` or `DISMISSED`.

### Quizzes, Practice & Contributor Credit (`/api/v1/quizzes`)
- `GET /api/v1/quizzes/questions` — Filterable approved quiz bank (`courseId`, `topic`, `difficulty`, `type`, `search`). **Never returns `correctAnswer` or `explanation`**.
- `POST /api/v1/quizzes/questions/check-duplicate` — Deterministic token-Jaccard + bigram-Dice text similarity check.
- `POST /api/v1/quizzes/questions` — Contribute question (`PENDING` status; blocks `>= 90%` duplicates unless confirmed; notifies faculty).
- `GET /api/v1/quizzes/review-queue`, `PATCH /api/v1/quizzes/questions/:questionId/review` — Faculty and Admin review queue (`APPROVE` awards contributor points, `REJECT` with reason).
- `POST /api/v1/quizzes/questions/:questionId/report`, `POST /api/v1/quizzes/questions/:questionId/resolve-reports` — Report and resolve approved questions.
- `POST /api/v1/quizzes/practice/start`, `POST /api/v1/quizzes/practice/:attemptId/submit`, `GET /api/v1/quizzes/attempts`, `GET /api/v1/quizzes/attempts/:attemptId` — Start timed practice session (no answer keys returned), grade on server upon submission, store `quizAttempts`, and return per-question review + per-topic weakness summary.
- `GET /api/v1/quizzes/contributions/me`, `GET /api/v1/quizzes/leaderboard` — Contributor ledger points and course leaderboard.

### AI Assistant Endpoints (`/api/v1/ai`)
- `GET /api/v1/ai/quota` — Check daily AI request quota status.
- `GET /api/v1/ai/conversations`, `GET /api/v1/ai/conversations/:conversationId`, `DELETE /api/v1/ai/conversations/:conversationId` — Study Assistant chat history.
- `POST /api/v1/ai/study/ask` — Ask Study Assistant with SSE streaming response, chunk retrieval, citations, and untrusted-content isolation.
- `POST /api/v1/ai/study/summarize` — Summarize note with key takeaways and citations.
- `POST /api/v1/ai/quiz/generate` — Generate Zod-validated AI quiz questions from a course note.
- `POST /api/v1/ai/presentations/generate` — Generate structured presentation planning brief with explanation, subtopics, outline, discussion points, and Q&A.
- `POST /api/v1/ai/presentations/:topicId/save-brief` — Save generated AI brief directly to presentation topic in MongoDB.

### Notifications (`/api/v1/notifications`)
- `GET /api/v1/notifications` — List notifications with `unreadCount`.
- `PATCH /api/v1/notifications/:notificationId/read` — Mark single notification as read.
- `POST /api/v1/notifications/read-all` — Mark all unread notifications as read.

### Admin (`/api/v1/admin`)
- `GET /api/v1/admin/stats` — Platform analytics overview (users per role, active courses, active enrollments, resource uploads ingestion breakdown, quiz attempts, and AI usage + token counts).
- `GET /api/v1/admin/users` — Paginated, searchable user directory.
- `PATCH /api/v1/admin/users/:userId/role` — Change user role (`STUDENT`, `FACULTY`, `ADMIN`).
- `PATCH /api/v1/admin/users/:userId/status` — Approve, activate, or suspend user accounts.
- `GET /api/v1/admin/courses`, `POST /api/v1/admin/courses`, `PATCH /api/v1/admin/courses/:courseId` — Course administration.
- `POST /api/v1/admin/courses/:courseId/assign-cr` — Assign or remove Class Representative.
- `POST /api/v1/admin/courses/:courseId/enrollments` — Enroll or drop student.
- `GET /api/v1/admin/audit-logs` — Filterable, paginated security and activity audit logs.
- `GET /api/v1/admin/matching-results/export` — Admin-only CSV export of persisted AI team matching runs.

---

## Final Feature Checklist (Requirements vs. Implementation)

| Phase / Requirement | Feature Description | Status | Notes |
| :--- | :--- | :--- | :--- |
| **Phase 1** | Roles: Student, CR, Faculty, Admin | **Working** | Fully enforced via JWT + RBAC middleware and UI role switching |
| **Phase 1** | Authentication & Registration | **Working** | Bcrypt hash, 15m JWT, httpOnly refresh rotation with reuse detection |
| **Phase 1** | Database & Mongoose Schemas | **Working** | MongoDB Atlas modular models with strict Zod validation |
| **Phase 2** | Course Enrollment & Roster | **Working** | Self-enrollment, catalog browse, admin assignment, scoped roster |
| **Phase 3** | GridFS File Uploads & Ingestion | **Working** | PDF, DOCX, PPTX, images `<=20MB`, magic-byte checks, chunking & Gemini embeddings |
| **Phase 2** | Announcements & In-App Notifications | **Working** | Course/broadcast feeds, pinned sorting, unread notification bell badge |
| **Phase 2** | Presentation Topics & Progress Tracking | **Working** | Faculty/CR coordination, status (`ASSIGNED`, `IN_PROGRESS`, `PRESENTED`) |
| **Phase 3** | Student Discovery & Consent-Based Teams | **Working** | Skill/interest search, team creation, invite/join requests with consent |
| **Phase 3** | AI Team Matching | **Working** | S, I, A, C score formula, Gemini embeddings, job polling, CSV research export |
| **Phase 4** | Quiz Contributions & Duplicate Detection | **Working** | MCQ/T-F/Short Answer, token-Jaccard similarity check, faculty review queue |
| **Phase 4** | Timed Practice & Weakness Diagnostics | **Working** | Server grading, answer key isolation, per-topic weakness summary, leaderboard |
| **Phase 5** | AI Study Assistant & Note Summarizer | **Working** | SSE streaming response, chunk retrieval with citations, untrusted-content isolation |
| **Phase 5** | AI Quiz Generation & Presentation Assistant | **Working** | Strict Zod-validated JSON generation, save brief to topic |
| **Phase 6** | Admin Analytics Dashboard & Audit Logs | **Working** | Users per role, uploads, quiz attempts, AI usage & token counts, filterable logs |
| **Phase 6** | Security Review & Authorization Test Suite | **Working** | Comprehensive Supertest suite (`npm run test`) covering all RBAC & scope rules |
| **Phase 6** | UX Pass & Performance Optimization | **Working** | Loading/empty/error states, pagination everywhere, database indexes verified |
| **Phase 6** | OpenAPI / Swagger Docs at `/api/docs` | **Working** | Interactive Swagger UI + OpenAPI 3.0 JSON spec |
