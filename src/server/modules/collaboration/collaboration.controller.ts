import type { NextFunction, Request, Response } from 'express';
import { sendSuccess } from '../../utils/apiResponse.ts';
import * as collaborationService from './collaboration.service.ts';
import type {
  CreateMatchRequestInput,
  CreateTeamInput,
  DiscoverClassmatesQuery,
  InviteToTeamInput,
  JoinTeamRequestInput,
  ListTeamsQuery,
  RespondTeamRequestInput,
  UpdateMatchCandidateActionInput,
} from './collaboration.validation.ts';

function getReqMeta(req: Request) {
  return {
    ip: req.ip || null,
    requestId: req.requestId || null,
    userAgent: req.header('user-agent') || null,
  };
}

export async function discoverClassmates(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const query = req.validated?.query as DiscoverClassmatesQuery;
    const { classmates, meta } = await collaborationService.discoverClassmates(
      req.authUser!,
      query
    );
    sendSuccess(res, 200, 'Classmates retrieved.', { classmates }, meta);
  } catch (err) {
    next(err);
  }
}

export async function listTeams(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const query = req.validated?.query as ListTeamsQuery;
    const { teams, meta } = await collaborationService.listTeams(
      req.authUser!,
      query
    );
    sendSuccess(res, 200, 'Teams retrieved.', { teams }, meta);
  } catch (err) {
    next(err);
  }
}

export async function createTeam(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const body = req.validated?.body as CreateTeamInput;
    const team = await collaborationService.createTeam(
      req.authUser!,
      body,
      getReqMeta(req)
    );
    sendSuccess(res, 201, 'Project team created.', { team });
  } catch (err) {
    next(err);
  }
}

export async function listTeamRequests(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const data = await collaborationService.listMyTeamRequests(req.authUser!);
    sendSuccess(res, 200, 'Team requests retrieved.', data);
  } catch (err) {
    next(err);
  }
}

export async function inviteMember(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { teamId } = (req.validated?.params ?? req.params) as { teamId: string };
    const body = req.validated?.body as InviteToTeamInput;
    const request = await collaborationService.inviteMemberToTeam(
      req.authUser!,
      teamId,
      body,
      getReqMeta(req)
    );
    sendSuccess(res, 201, 'Team invitation sent.', { request });
  } catch (err) {
    next(err);
  }
}

export async function requestToJoin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { teamId } = (req.validated?.params ?? req.params) as { teamId: string };
    const body = req.validated?.body as JoinTeamRequestInput;
    const request = await collaborationService.requestToJoinTeam(
      req.authUser!,
      teamId,
      body,
      getReqMeta(req)
    );
    sendSuccess(res, 201, 'Join request sent to team leader.', { request });
  } catch (err) {
    next(err);
  }
}

export async function respondToRequest(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { requestId } = (req.validated?.params ?? req.params) as {
      requestId: string;
    };
    const body = req.validated?.body as RespondTeamRequestInput;
    const request = await collaborationService.respondToTeamRequest(
      req.authUser!,
      requestId,
      body,
      getReqMeta(req)
    );
    sendSuccess(res, 200, 'Team request updated.', { request });
  } catch (err) {
    next(err);
  }
}

export async function leaveTeam(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { teamId } = (req.validated?.params ?? req.params) as { teamId: string };
    const result = await collaborationService.leaveTeam(
      req.authUser!,
      teamId,
      getReqMeta(req)
    );
    sendSuccess(res, 200, 'Left team.', result);
  } catch (err) {
    next(err);
  }
}

export async function listMatchRequests(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const matchRequests = await collaborationService.listMyMatchRequests(
      req.authUser!
    );
    sendSuccess(res, 200, 'Match requests retrieved.', { matchRequests });
  } catch (err) {
    next(err);
  }
}

export async function createMatchRequest(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const body = req.validated?.body as CreateMatchRequestInput;
    const matchRequest = await collaborationService.createMatchRequest(
      req.authUser!,
      body,
      getReqMeta(req)
    );
    sendSuccess(
      res,
      202,
      'AI team matching job queued. Polling status...',
      { matchRequest }
    );
  } catch (err) {
    next(err);
  }
}

export async function getMatchRequest(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { requestId } = (req.validated?.params ?? req.params) as {
      requestId: string;
    };
    const matchRequest = await collaborationService.getMatchRequest(
      req.authUser!,
      requestId
    );
    sendSuccess(res, 200, 'Match request retrieved.', { matchRequest });
  } catch (err) {
    next(err);
  }
}

export async function actOnMatchCandidate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { requestId, candidateId } = (req.validated?.params ?? req.params) as {
      requestId: string;
      candidateId: string;
    };
    const body = req.validated?.body as UpdateMatchCandidateActionInput;
    const matchRequest = await collaborationService.updateMatchCandidateAction(
      req.authUser!,
      requestId,
      candidateId,
      body,
      getReqMeta(req)
    );
    sendSuccess(res, 200, 'Candidate status updated.', { matchRequest });
  } catch (err) {
    next(err);
  }
}
