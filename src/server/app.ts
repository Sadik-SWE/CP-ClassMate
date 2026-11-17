import express, { Router } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env.ts';
import { isDatabaseReady } from './config/db.ts';
import { requestIdMiddleware } from './middleware/requestId.ts';
import { sanitizeNoSqlMiddleware } from './middleware/sanitize.ts';
import { globalApiLimiter } from './middleware/rateLimit.ts';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.ts';
import { sendError, sendSuccess } from './utils/apiResponse.ts';
import { authRouter } from './modules/auth/auth.routes.ts';
import { usersRouter } from './modules/users/users.routes.ts';
import { coursesRouter } from './modules/courses/courses.routes.ts';
import { resourcesRouter } from './modules/resources/resources.routes.ts';
import { announcementsRouter } from './modules/announcements/announcements.routes.ts';
import { presentationsRouter } from './modules/presentations/presentations.routes.ts';
import { notificationsRouter } from './modules/notifications/notifications.routes.ts';
import { collaborationRouter } from './modules/collaboration/collaboration.routes.ts';
import { quizzesRouter } from './modules/quizzes/quizzes.routes.ts';
import { aiRouter } from './modules/ai/ai.routes.ts';
import { adminRouter } from './modules/admin/admin.routes.ts';

export function createExpressApp() {
  const app = express();

  app.set('trust proxy', 1);

  app.use(
    helmet({
      // Disabled frameguard & inline-script CSP blocking so AI Studio iframe + Vite dev preamble function cleanly
      frameguard: false,
      contentSecurityPolicy: false,
    })
  );

  const allowedOrigins = new Set<string>([
    env.frontendUrl.replace(/\/$/, ''),
    env.appUrl.replace(/\/$/, ''),
  ]);
  if (env.isDev) {
    allowedOrigins.add('http://localhost:3000');
    allowedOrigins.add('http://127.0.0.1:3000');
  }

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) {
          callback(null, true);
          return;
        }
        const normalized = origin.replace(/\/$/, '');
        if (allowedOrigins.has(normalized)) {
          callback(null, true);
          return;
        }
        callback(null, false);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    })
  );

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());
  app.use(requestIdMiddleware);
  app.use(sanitizeNoSqlMiddleware);

  // Health endpoints
  const livenessHandler = (_req: express.Request, res: express.Response) => {
    sendSuccess(res, 200, 'Service is alive.', {
      status: 'ok',
      service: 'classmate-api',
      uptimeSeconds: Math.round(process.uptime()),
      env: env.nodeEnv,
    });
  };

  const readinessHandler = (_req: express.Request, res: express.Response) => {
    const dbReady = isDatabaseReady();
    const secretsMissing = env.isDev ? [] : env.missingRequiredSecrets;

    if (!dbReady || secretsMissing.length > 0) {
      sendError(
        res,
        503,
        'Service is not ready.',
        'SERVICE_NOT_READY',
        {
          database: dbReady ? 'connected' : 'disconnected',
          missingSecrets: secretsMissing,
        }
      );
      return;
    }

    sendSuccess(res, 200, 'Service is ready.', {
      status: 'ready',
      database: 'connected',
      aiConfigured: Boolean(env.geminiApiKey),
    });
  };

  app.get('/health/live', livenessHandler);
  app.get('/health/ready', readinessHandler);

  const openApiSpec = {
    openapi: '3.0.3',
    info: {
      title: 'ClassMate API',
      version: '1.0.0',
      description: 'University collaboration platform REST API powered by Node.js, Express, MongoDB Atlas, GridFS, and Google Gemini AI.',
    },
    servers: [{ url: '/api/v1', description: 'API v1 Base' }],
    paths: {
      '/auth/login': {
        post: { summary: 'Authenticate user and receive Access JWT + Refresh cookie' },
      },
      '/auth/register': {
        post: { summary: 'Register student or faculty account' },
      },
      '/courses': {
        get: { summary: 'List enrolled or teaching courses (My courses)' },
      },
      '/resources/courses/{courseId}': {
        get: { summary: 'List course notes and reference files' },
        post: { summary: 'Upload course PDF, DOCX, PPTX or image to GridFS with AI indexing' },
      },
      '/announcements': {
        get: { summary: 'List course or broadcast announcements feed with pin status' },
      },
      '/presentations/courses/{courseId}': {
        get: { summary: 'List presentation topics and progress status' },
      },
      '/collaboration/classmates': {
        get: { summary: 'Discover classmates in shared active courses' },
      },
      '/collaboration/match-requests': {
        post: { summary: 'Run async AI Team Matching job with Gemini skill embeddings' },
      },
      '/quizzes/questions': {
        get: { summary: 'Browse approved peer quiz bank (answer keys strictly hidden)' },
        post: { summary: 'Contribute quiz question with duplicate similarity check' },
      },
      '/quizzes/practice/start': {
        post: { summary: 'Start timed server-graded practice quiz' },
      },
      '/ai/study/ask': {
        post: { summary: 'Ask Study Assistant about course notes with streamed SSE citations' },
      },
      '/ai/study/summarize': {
        post: { summary: 'Summarize course note with AI key takeaways' },
      },
      '/ai/quiz/generate': {
        post: { summary: 'Generate Zod-validated AI quiz questions from a note' },
      },
      '/ai/presentations/generate': {
        post: { summary: 'Generate presentation planning brief for seminar topics' },
      },
      '/admin/stats': {
        get: { summary: 'Get administrator analytics platform metrics and AI usage/token counts' },
      },
      '/admin/audit-logs': {
        get: { summary: 'Filterable security and activity audit logs' },
      },
    },
  };

  app.get('/api/docs/json', (_req, res) => {
    res.json(openApiSpec);
  });

  app.get('/api/docs', (_req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>ClassMate API Documentation (OpenAPI 3.0)</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui.css" />
  <style>
    body { margin: 0; background: #F3F6FB; font-family: system-ui, sans-serif; }
    .topbar { background: #162B4D; padding: 16px 24px; color: white; display: flex; align-items: center; justify-content: space-between; }
    .topbar h1 { font-size: 18px; margin: 0; font-weight: 700; }
    .topbar a { color: #1D9BA6; text-decoration: none; font-size: 13px; font-weight: 600; }
  </style>
</head>
<body>
  <div class="topbar">
    <h1>ClassMate API Documentation · OpenAPI 3.0</h1>
    <a href="/api/docs/json" target="_blank">View Raw JSON Spec</a>
  </div>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-bundle.js"></script>
  <script>
    window.onload = () => {
      SwaggerUIBundle({
        url: '/api/docs/json',
        dom_id: '#swagger-ui',
      });
    };
  </script>
</body>
</html>`);
  });

  // API v1
  const apiV1 = Router();
  apiV1.use(globalApiLimiter);

  apiV1.get('/health/live', livenessHandler);
  apiV1.get('/health/ready', readinessHandler);
  apiV1.use('/auth', authRouter);
  apiV1.use('/users', usersRouter);
  apiV1.use('/courses', coursesRouter);
  apiV1.use('/resources', resourcesRouter);
  apiV1.use('/announcements', announcementsRouter);
  apiV1.use('/presentations', presentationsRouter);
  apiV1.use('/notifications', notificationsRouter);
  apiV1.use('/collaboration', collaborationRouter);
  apiV1.use('/quizzes', quizzesRouter);
  apiV1.use('/ai', aiRouter);
  apiV1.use('/admin', adminRouter);

  apiV1.use(notFoundHandler);

  app.use('/api/v1', apiV1);
  app.use('/api/v1', errorHandler);

  return { app, errorHandler };
}
