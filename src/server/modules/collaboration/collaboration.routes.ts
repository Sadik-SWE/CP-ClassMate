import { Router } from 'express';
import { Permission } from '../../config/permissions.ts';
import { authenticate } from '../../middleware/auth.ts';
import { authorize } from '../../middleware/authorize.ts';
import { aiLimiter } from '../../middleware/rateLimit.ts';
import { validate } from '../../middleware/validate.ts';
import * as collaborationController from './collaboration.controller.ts';
import {
  createMatchRequestSchema,
  createTeamSchema,
  discoverClassmatesQuerySchema,
  inviteToTeamSchema,
  joinTeamRequestSchema,
  listTeamsQuerySchema,
  matchRequestCandidateParamsSchema,
  requestIdParamSchema,
  respondTeamRequestSchema,
  teamIdParamSchema,
  updateMatchCandidateActionSchema,
} from './collaboration.validation.ts';

export const collaborationRouter = Router();

collaborationRouter.use(authenticate);

// Student Discovery
collaborationRouter.get(
  '/classmates',
  authorize(Permission.COURSE_VIEW_ENROLLED),
  validate({ query: discoverClassmatesQuerySchema }),
  collaborationController.discoverClassmates
);

// Teams & Consent Requests
collaborationRouter.get(
  '/teams',
  authorize(Permission.TEAM_COLLABORATE),
  validate({ query: listTeamsQuerySchema }),
  collaborationController.listTeams
);

collaborationRouter.post(
  '/teams',
  authorize(Permission.TEAM_COLLABORATE),
  validate({ body: createTeamSchema }),
  collaborationController.createTeam
);

collaborationRouter.post(
  '/teams/:teamId/invite',
  authorize(Permission.TEAM_COLLABORATE),
  validate({ params: teamIdParamSchema, body: inviteToTeamSchema }),
  collaborationController.inviteMember
);

collaborationRouter.post(
  '/teams/:teamId/join-request',
  authorize(Permission.TEAM_COLLABORATE),
  validate({ params: teamIdParamSchema, body: joinTeamRequestSchema }),
  collaborationController.requestToJoin
);

collaborationRouter.post(
  '/teams/:teamId/leave',
  authorize(Permission.TEAM_COLLABORATE),
  validate({ params: teamIdParamSchema }),
  collaborationController.leaveTeam
);

collaborationRouter.get(
  '/requests',
  authorize(Permission.TEAM_COLLABORATE),
  collaborationController.listTeamRequests
);

collaborationRouter.post(
  '/requests/:requestId/respond',
  authorize(Permission.TEAM_COLLABORATE),
  validate({ params: requestIdParamSchema, body: respondTeamRequestSchema }),
  collaborationController.respondToRequest
);

// AI Team Matching (async job + status polling)
collaborationRouter.get(
  '/match-requests',
  authorize(Permission.TEAM_COLLABORATE),
  collaborationController.listMatchRequests
);

collaborationRouter.post(
  '/match-requests',
  authorize(Permission.TEAM_COLLABORATE),
  aiLimiter,
  validate({ body: createMatchRequestSchema }),
  collaborationController.createMatchRequest
);

collaborationRouter.get(
  '/match-requests/:requestId',
  authorize(Permission.TEAM_COLLABORATE),
  validate({ params: requestIdParamSchema }),
  collaborationController.getMatchRequest
);

collaborationRouter.patch(
  '/match-requests/:requestId/candidates/:candidateId',
  authorize(Permission.TEAM_COLLABORATE),
  validate({
    params: matchRequestCandidateParamsSchema,
    body: updateMatchCandidateActionSchema,
  }),
  collaborationController.actOnMatchCandidate
);
