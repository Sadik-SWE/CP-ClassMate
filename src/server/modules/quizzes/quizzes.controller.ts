import type { NextFunction, Request, Response } from 'express';
import { sendSuccess } from '../../utils/apiResponse.ts';
import * as quizzesService from './quizzes.service.ts';
import type {
  CheckDuplicateInput,
  ContributeQuestionInput,
  LeaderboardQuery,
  ListAttemptsQuery,
  ListQuizBankQuery,
  ListReviewQueueQuery,
  ReportQuestionInput,
  ResolveReportsInput,
  ReviewQuestionInput,
  StartPracticeInput,
  SubmitPracticeInput,
} from './quizzes.validation.ts';

function getReqMeta(req: Request) {
  return {
    ip: req.ip || null,
    requestId: req.requestId || null,
    userAgent: req.header('user-agent') || null,
  };
}

export async function checkDuplicates(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const body = req.validated?.body as CheckDuplicateInput;
    const matches = await quizzesService.checkDuplicates(
      req.authUser!,
      body.courseId,
      body.questionText
    );
    sendSuccess(res, 200, 'Duplicate similarity check completed.', { matches });
  } catch (err) {
    next(err);
  }
}

export async function contributeQuestion(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const body = req.validated?.body as ContributeQuestionInput;
    const data = await quizzesService.contributeQuestion(
      req.authUser!,
      body,
      getReqMeta(req)
    );
    sendSuccess(
      res,
      201,
      'Question submitted for faculty review (Status: PENDING).',
      data
    );
  } catch (err) {
    next(err);
  }
}

export async function listQuizBank(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const query = req.validated?.query as ListQuizBankQuery;
    const { questions, topics, meta } = await quizzesService.listQuizBank(
      req.authUser!,
      query
    );
    sendSuccess(
      res,
      200,
      'Quiz bank questions retrieved.',
      { questions, topics },
      meta
    );
  } catch (err) {
    next(err);
  }
}

export async function listReviewQueue(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const query = req.validated?.query as ListReviewQueueQuery;
    const { questions, meta } = await quizzesService.listReviewQueue(
      req.authUser!,
      query
    );
    sendSuccess(
      res,
      200,
      'Quiz review queue retrieved.',
      { questions },
      meta
    );
  } catch (err) {
    next(err);
  }
}

export async function reviewQuestion(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { questionId } = (req.validated?.params ?? req.params) as {
      questionId: string;
    };
    const body = req.validated?.body as ReviewQuestionInput;
    const question = await quizzesService.reviewQuestion(
      req.authUser!,
      questionId,
      body,
      getReqMeta(req)
    );
    sendSuccess(
      res,
      200,
      body.decision === 'APPROVE'
        ? 'Question approved and contributor points awarded.'
        : 'Question rejected with feedback.',
      { question }
    );
  } catch (err) {
    next(err);
  }
}

export async function reportQuestion(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { questionId } = (req.validated?.params ?? req.params) as {
      questionId: string;
    };
    const body = req.validated?.body as ReportQuestionInput;
    const data = await quizzesService.reportQuestion(
      req.authUser!,
      questionId,
      body,
      getReqMeta(req)
    );
    sendSuccess(res, 201, 'Question reported to course faculty.', data);
  } catch (err) {
    next(err);
  }
}

export async function resolveReports(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { questionId } = (req.validated?.params ?? req.params) as {
      questionId: string;
    };
    const body = req.validated?.body as ResolveReportsInput;
    const question = await quizzesService.resolveQuestionReports(
      req.authUser!,
      questionId,
      body,
      getReqMeta(req)
    );
    sendSuccess(res, 200, 'Question reports resolved.', { question });
  } catch (err) {
    next(err);
  }
}

export async function startPractice(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const body = req.validated?.body as StartPracticeInput;
    const attempt = await quizzesService.startPracticeQuiz(
      req.authUser!,
      body,
      getReqMeta(req)
    );
    sendSuccess(res, 201, 'Practice quiz started.', { attempt });
  } catch (err) {
    next(err);
  }
}

export async function submitPractice(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { attemptId } = (req.validated?.params ?? req.params) as {
      attemptId: string;
    };
    const body = req.validated?.body as SubmitPracticeInput;
    const attempt = await quizzesService.submitPracticeQuiz(
      req.authUser!,
      attemptId,
      body,
      getReqMeta(req)
    );
    sendSuccess(res, 200, 'Quiz submitted and scored.', { attempt });
  } catch (err) {
    next(err);
  }
}

export async function listMyAttempts(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const query = req.validated?.query as ListAttemptsQuery;
    const { attempts, meta } = await quizzesService.listMyAttempts(
      req.authUser!,
      query
    );
    sendSuccess(res, 200, 'Quiz attempts retrieved.', { attempts }, meta);
  } catch (err) {
    next(err);
  }
}

export async function getAttempt(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { attemptId } = (req.validated?.params ?? req.params) as {
      attemptId: string;
    };
    const attempt = await quizzesService.getAttemptById(
      req.authUser!,
      attemptId
    );
    sendSuccess(res, 200, 'Quiz attempt retrieved.', { attempt });
  } catch (err) {
    next(err);
  }
}

export async function getMyContributions(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const data = await quizzesService.getMyContributions(req.authUser!);
    sendSuccess(res, 200, 'Contributor points and submissions retrieved.', data);
  } catch (err) {
    next(err);
  }
}

export async function getLeaderboard(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const query = req.validated?.query as LeaderboardQuery;
    const leaderboard = await quizzesService.getContributorLeaderboard(
      req.authUser!,
      query
    );
    sendSuccess(res, 200, 'Contributor leaderboard retrieved.', { leaderboard });
  } catch (err) {
    next(err);
  }
}
