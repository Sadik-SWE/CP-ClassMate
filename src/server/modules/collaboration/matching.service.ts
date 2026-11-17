import mongoose from 'mongoose';
import { AI_CONFIG } from '../../config/env.ts';
import { CourseEnrollmentModel, CourseModel } from '../courses/courses.model.ts';
import { UserModel, type IUser } from '../users/users.model.ts';
import {
  TeamMatchRequestModel,
  TeamModel,
  type IMatchResultEntry,
  type ITeamMatchRequest,
} from './collaboration.model.ts';
import {
  cosineSimilarity,
  embedNormalizedTexts,
  generateMatchExplanations,
} from '../ai/gemini.service.ts';
import {
  normalizeInterestName,
  normalizeSkillName,
} from './skillNormalizer.ts';
import { notifySpecificUsers } from '../notifications/notifications.service.ts';
import { recordAuditLog } from '../admin/admin.service.ts';
import { logger } from '../../utils/logger.ts';
import {
  EnrollmentStatus,
  MatchCandidateActionStatus,
  MatchRequestStatus,
  NotificationType,
  UserRole,
  UserStatus,
  type AvailabilitySlot,
  type ClassmateDTO,
  type MatchCandidateResultDTO,
  type TeamMatchRequestDTO,
} from '../../../shared/types.ts';

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function computeOverlapMinutes(
  requested: AvailabilitySlot[],
  candidateSlots: AvailabilitySlot[]
): { overlapMinutes: number; requestedTotalMinutes: number } {
  if (requested.length === 0) {
    return { overlapMinutes: 0, requestedTotalMinutes: 0 };
  }

  let requestedTotalMinutes = 0;
  let overlapMinutes = 0;

  for (const reqSlot of requested) {
    const reqStart = toMinutes(reqSlot.from);
    const reqEnd = toMinutes(reqSlot.to);
    if (reqEnd <= reqStart) continue;
    requestedTotalMinutes += reqEnd - reqStart;

    for (const candSlot of candidateSlots) {
      if (candSlot.day !== reqSlot.day) continue;
      const candStart = toMinutes(candSlot.from);
      const candEnd = toMinutes(candSlot.to);
      const overlap = Math.min(reqEnd, candEnd) - Math.max(reqStart, candStart);
      if (overlap > 0) {
        overlapMinutes += overlap;
      }
    }
  }

  return { overlapMinutes, requestedTotalMinutes };
}

function skillSimilarity(
  normA: string,
  normB: string,
  embeddings: Map<string, number[]>
): number {
  if (!normA || !normB) return 0;
  if (normA === normB) return 1;
  const vecA = embeddings.get(normA);
  const vecB = embeddings.get(normB);
  if (!vecA || !vecB) return 0;
  const sim = cosineSimilarity(vecA, vecB);
  return sim >= AI_CONFIG.matchingThresholds.minSkillSimilarity ? sim : 0;
}

function interestSimilarity(
  normA: string,
  normB: string,
  embeddings: Map<string, number[]>
): number {
  if (!normA || !normB) return 0;
  if (normA === normB) return 1;
  const vecA = embeddings.get(normA);
  const vecB = embeddings.get(normB);
  if (!vecA || !vecB) return 0;
  const sim = cosineSimilarity(vecA, vecB);
  return sim >= AI_CONFIG.matchingThresholds.minInterestSimilarity ? sim : 0;
}

export async function runMatchRequestJob(requestId: string): Promise<void> {
  const reqDoc = await TeamMatchRequestModel.findById(requestId);
  if (!reqDoc) return;

  reqDoc.status = MatchRequestStatus.PROCESSING;
  reqDoc.startedAt = new Date();
  await reqDoc.save();

  try {
    const [requester, course, team] = await Promise.all([
      UserModel.findById(reqDoc.requesterId).lean(),
      CourseModel.findOne({ _id: reqDoc.courseId, deletedAt: null }).lean(),
      reqDoc.teamId
        ? TeamModel.findOne({ _id: reqDoc.teamId, deletedAt: null }).lean()
        : Promise.resolve(null),
    ]);

    if (!requester || !course) {
      throw new Error('Requester or target course is no longer available.');
    }

    // 1. Gather unique active course enrollees (excluding requester & current team members)
    const enrollments = await CourseEnrollmentModel.find({
      courseId: reqDoc.courseId,
      status: EnrollmentStatus.ACTIVE,
    })
      .select('userId')
      .lean();

    const excludedIds = new Set<string>([reqDoc.requesterId.toString()]);
    if (team) {
      for (const mid of team.memberIds) {
        excludedIds.add(mid.toString());
      }
    }

    const uniqueCandidateIds = Array.from(
      new Set(enrollments.map((e) => e.userId.toString()))
    ).filter((uid) => !excludedIds.has(uid));

    const poolUsers = await UserModel.find({
      _id: { $in: uniqueCandidateIds },
      role: UserRole.STUDENT,
      status: UserStatus.ACTIVE,
      optedOutOfMatching: false,
      deletedAt: null,
    }).lean();

    reqDoc.candidatePoolSize = poolUsers.length;

    // 2. Apply Hard Constraints
    const effectiveTimeSlots =
      reqDoc.timeConstraints.length > 0
        ? reqDoc.timeConstraints
        : requester.availability ?? [];

    const filteredCandidates: IUser[] = [];
    for (const candidate of poolUsers) {
      if (
        reqDoc.hardConstraints.sameBatchOnly &&
        requester.batch &&
        candidate.batch !== requester.batch
      ) {
        continue;
      }

      if (reqDoc.hardConstraints.minSkillLevel > 0) {
        const hasMinSkill = (candidate.profile?.skills ?? []).some(
          (s) => s.level >= reqDoc.hardConstraints.minSkillLevel
        );
        if (!hasMinSkill) continue;
      }

      if (reqDoc.hardConstraints.requiredDays.length > 0) {
        const candDays = new Set(
          (candidate.availability ?? []).map((slot) => slot.day)
        );
        const coversAllDays = reqDoc.hardConstraints.requiredDays.every((d) =>
          candDays.has(d)
        );
        if (!coversAllDays) continue;
      }

      if (
        reqDoc.hardConstraints.strictTimeOverlap &&
        effectiveTimeSlots.length > 0
      ) {
        const { overlapMinutes } = computeOverlapMinutes(
          effectiveTimeSlots,
          candidate.availability ?? []
        );
        if (overlapMinutes <= 0) continue;
      }

      filteredCandidates.push(candidate as unknown as IUser);
    }

    reqDoc.hardFilteredCount = poolUsers.length - filteredCandidates.length;

    if (filteredCandidates.length === 0) {
      reqDoc.status = MatchRequestStatus.COMPLETED;
      reqDoc.results = [];
      reqDoc.completedAt = new Date();
      await reqDoc.save();
      return;
    }

    // 3. Determine existing team skills for Complementary score C
    let teamMembers: Array<{ profile?: { skills?: Array<{ name: string; level: number }> } }> =
      [];
    if (team && team.memberIds.length > 0) {
      teamMembers = await UserModel.find({
        _id: { $in: team.memberIds },
        deletedAt: null,
      })
        .select('profile.skills')
        .lean();
    } else {
      teamMembers = [requester];
    }

    const existingTeamSkillLevels = new Map<string, number>();
    for (const member of teamMembers) {
      for (const sk of member.profile?.skills ?? []) {
        const norm = normalizeSkillName(sk.name);
        if (!norm) continue;
        const prev = existingTeamSkillLevels.get(norm) ?? 0;
        if (sk.level > prev) existingTeamSkillLevels.set(norm, sk.level);
      }
    }

    // 4. Batch Gemini embeddings for all normalized skills & interests
    const effectiveInterests = (
      reqDoc.optionalInterests.length > 0
        ? reqDoc.optionalInterests
        : requester.profile?.interests ?? []
    )
      .map(normalizeInterestName)
      .filter(Boolean);

    const textsToEmbed: string[] = [];
    for (const reqSkill of reqDoc.requiredSkills) {
      textsToEmbed.push(reqSkill.normalizedName);
    }
    for (const normTeamSkill of existingTeamSkillLevels.keys()) {
      textsToEmbed.push(normTeamSkill);
    }
    for (const int of effectiveInterests) {
      textsToEmbed.push(int);
    }
    for (const cand of filteredCandidates) {
      for (const sk of cand.profile?.skills ?? []) {
        const norm = normalizeSkillName(sk.name);
        if (norm) textsToEmbed.push(norm);
      }
      for (const int of cand.profile?.interests ?? []) {
        const norm = normalizeInterestName(int);
        if (norm) textsToEmbed.push(norm);
      }
    }

    const embeddings = await embedNormalizedTexts(textsToEmbed);

    // Determine which required skills the current team still lacks (level < 3 & no strong semantic coverage)
    const missingRequiredSkills = reqDoc.requiredSkills.filter((reqSk) => {
      const directLevel = existingTeamSkillLevels.get(reqSk.normalizedName) ?? 0;
      if (directLevel >= 3) return false;
      for (const [teamSkill, level] of existingTeamSkillLevels.entries()) {
        if (
          level >= 3 &&
          skillSimilarity(reqSk.normalizedName, teamSkill, embeddings) >= 0.8
        ) {
          return false;
        }
      }
      return true;
    });

    // 5. Score every candidate on S, I, A, C (0-100) and compute MatchScore
    const weights = reqDoc.weightsSnapshot;
    const scoredList: Array<{
      candidate: IUser;
      scores: { S: number; I: number; A: number; C: number; matchScore: number };
      matchedSkills: string[];
      complementarySkills: string[];
      overlapMinutes: number;
      sharedInterests: string[];
    }> = [];

    for (const cand of filteredCandidates) {
      const candSkills = (cand.profile?.skills ?? []).map((s) => ({
        raw: s.name,
        norm: normalizeSkillName(s.name),
        level: s.level,
      }));
      const candInterests = (cand.profile?.interests ?? []).map((i) => ({
        raw: i,
        norm: normalizeInterestName(i),
      }));

      // S: Skills Score (weighted by importance + proficiency)
      let skillWeightSum = 0;
      let skillEarnedSum = 0;
      const matchedSkills: string[] = [];

      for (const reqSk of reqDoc.requiredSkills) {
        skillWeightSum += reqSk.importance;
        let bestContrib = 0;
        for (const cs of candSkills) {
          const sim = skillSimilarity(reqSk.normalizedName, cs.norm, embeddings);
          if (sim > 0) {
            const profFactor = 0.5 + 0.5 * (cs.level / 5);
            const contrib = sim * profFactor;
            if (contrib > bestContrib) bestContrib = contrib;
          }
        }
        if (bestContrib >= 0.45) {
          matchedSkills.push(reqSk.name);
        }
        skillEarnedSum += reqSk.importance * bestContrib;
      }

      const S =
        skillWeightSum > 0
          ? Math.round((skillEarnedSum / skillWeightSum) * 100)
          : 50;

      // I: Interests Score
      let I = 50;
      const sharedInterests: string[] = [];
      if (effectiveInterests.length > 0) {
        if (candInterests.length === 0) {
          I = 0;
        } else {
          let intSum = 0;
          for (const reqInt of effectiveInterests) {
            let bestIntSim = 0;
            for (const ci of candInterests) {
              const sim = interestSimilarity(reqInt, ci.norm, embeddings);
              if (sim > bestIntSim) bestIntSim = sim;
            }
            if (bestIntSim >= 0.6) {
              sharedInterests.push(reqInt);
            }
            intSum += bestIntSim;
          }
          I = Math.round((intSum / effectiveInterests.length) * 100);
        }
      }

      // A: Availability Overlap Score
      const { overlapMinutes, requestedTotalMinutes } = computeOverlapMinutes(
        effectiveTimeSlots,
        cand.availability ?? []
      );
      const A =
        requestedTotalMinutes > 0
          ? Math.min(100, Math.round((overlapMinutes / requestedTotalMinutes) * 100))
          : 50;

      // C: Complementary Score (rewards covering required skills the current team lacks)
      const complementarySkills: string[] = [];
      let C = 0;
      if (missingRequiredSkills.length > 0) {
        let gapWeightSum = 0;
        let gapCoveredSum = 0;
        for (const miss of missingRequiredSkills) {
          gapWeightSum += miss.importance;
          let bestGapContrib = 0;
          for (const cs of candSkills) {
            const sim = skillSimilarity(miss.normalizedName, cs.norm, embeddings);
            if (sim > 0) {
              const contrib = sim * (0.5 + 0.5 * (cs.level / 5));
              if (contrib > bestGapContrib) bestGapContrib = contrib;
            }
          }
          if (bestGapContrib >= 0.45) {
            complementarySkills.push(miss.name);
          }
          gapCoveredSum += miss.importance * bestGapContrib;
        }
        C = gapWeightSum > 0 ? Math.round((gapCoveredSum / gapWeightSum) * 100) : 0;
      } else {
        // Team already covers required skills; reward unique distinct skills candidate brings
        const uniqueExtras = candSkills.filter(
          (cs) => !existingTeamSkillLevels.has(cs.norm)
        );
        for (const ue of uniqueExtras.slice(0, 4)) {
          complementarySkills.push(ue.raw);
        }
        C = Math.min(100, uniqueExtras.length * 25);
      }

      const matchScore =
        Math.round(
          (weights.skills * S +
            weights.interests * I +
            weights.availability * A +
            weights.complementary * C) *
            100
        ) / 100;

      if (matchScore >= AI_CONFIG.matchingThresholds.minCandidateScore) {
        scoredList.push({
          candidate: cand,
          scores: { S, I, A, C, matchScore },
          matchedSkills: Array.from(new Set(matchedSkills)),
          complementarySkills: Array.from(new Set(complementarySkills)),
          overlapMinutes,
          sharedInterests: Array.from(new Set(sharedInterests)),
        });
      }
    }

    // 6. Deterministic Ranking
    scoredList.sort((a, b) => {
      if (b.scores.matchScore !== a.scores.matchScore) {
        return b.scores.matchScore - a.scores.matchScore;
      }
      if (b.scores.S !== a.scores.S) return b.scores.S - a.scores.S;
      if (b.scores.C !== a.scores.C) return b.scores.C - a.scores.C;
      return b.scores.A - a.scores.A;
    });

    const topRanked = scoredList.slice(
      0,
      AI_CONFIG.matchingThresholds.maxReturnedCandidates
    );

    // 7. Gemini-written 1-2 sentence explanations (explanation ONLY, never ranking)
    const explanationMap = await generateMatchExplanations({
      projectTitle: reqDoc.title,
      projectDescription: reqDoc.description,
      candidates: topRanked
        .slice(0, AI_CONFIG.matchingThresholds.maxAiExplanationCandidates)
        .map((entry, idx) => ({
          candidateId: entry.candidate._id.toString(),
          name: entry.candidate.name,
          department: entry.candidate.department,
          rank: idx + 1,
          S: entry.scores.S,
          I: entry.scores.I,
          A: entry.scores.A,
          C: entry.scores.C,
          matchScore: entry.scores.matchScore,
          matchedSkills: entry.matchedSkills,
          complementarySkills: entry.complementarySkills,
          overlapMinutes: entry.overlapMinutes,
          sharedInterests: entry.sharedInterests,
        })),
    });

    const persistedResults: IMatchResultEntry[] = topRanked.map((entry, idx) => {
      const cid = entry.candidate._id.toString();
      const explanation =
        explanationMap.get(cid) ||
        `Ranked #${idx + 1} with a ${entry.scores.matchScore.toFixed(1)}% match based on skill alignment (${entry.scores.S}/100) and complementary coverage (${entry.scores.C}/100).`;
      return {
        candidateId: new mongoose.Types.ObjectId(cid),
        rank: idx + 1,
        scores: entry.scores,
        matchedSkills: entry.matchedSkills,
        complementarySkills: entry.complementarySkills,
        overlapMinutes: entry.overlapMinutes,
        explanation,
        status: MatchCandidateActionStatus.PENDING,
      };
    });

    reqDoc.results = persistedResults;
    reqDoc.status = MatchRequestStatus.COMPLETED;
    reqDoc.completedAt = new Date();
    reqDoc.errorMessage = null;
    await reqDoc.save();

    await recordAuditLog({
      actor: {
        id: requester._id.toString(),
        email: requester.email,
        role: requester.role,
      },
      action: 'TEAM_MATCHING_COMPLETED',
      targetType: 'TEAM_MATCH_REQUEST',
      targetId: reqDoc._id.toString(),
      metadata: {
        courseCode: course.courseCode,
        modelVersion: reqDoc.modelVersion,
        candidatePoolSize: reqDoc.candidatePoolSize,
        returnedCount: persistedResults.length,
      },
    });

    await notifySpecificUsers({
      userIds: [requester._id.toString()],
      type: NotificationType.TEAM,
      title: `Team matches ready (${course.courseCode})`,
      message: `${persistedResults.length} ranked teammate suggestions are ready for "${reqDoc.title}".`,
      link: '/collaboration?tab=matching',
      courseId: course._id.toString(),
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Team matching job failed.';
    logger.error({ err, requestId }, 'Team matching async job failed');
    reqDoc.status = MatchRequestStatus.FAILED;
    reqDoc.errorMessage = message;
    reqDoc.completedAt = new Date();
    await reqDoc.save().catch(() => undefined);
  }
}

export async function hydrateMatchRequest(
  doc: ITeamMatchRequest
): Promise<TeamMatchRequestDTO> {
  const candidateIds = doc.results.map((r) => r.candidateId);
  const [course, team, candidates] = await Promise.all([
    CourseModel.findById(doc.courseId).select('courseCode courseName').lean(),
    doc.teamId
      ? TeamModel.findById(doc.teamId).select('name').lean()
      : Promise.resolve(null),
    candidateIds.length > 0
      ? UserModel.find({ _id: { $in: candidateIds } })
          .select('name department batch studentId profile availability')
          .lean()
      : Promise.resolve([]),
  ]);

  const candMap = new Map<string, ClassmateDTO>();
  for (const c of candidates) {
    candMap.set(c._id.toString(), {
      id: c._id.toString(),
      name: c.name,
      department: c.department,
      batch: c.batch ?? null,
      studentId: c.studentId ?? null,
      profile: {
        bio: c.profile?.bio || '',
        skills: c.profile?.skills ?? [],
        interests: c.profile?.interests ?? [],
      },
      availability: c.availability ?? [],
      sharedCourses: course
        ? [
            {
              id: doc.courseId.toString(),
              courseCode: course.courseCode,
              courseName: course.courseName,
            },
          ]
        : [],
    });
  }

  const results: MatchCandidateResultDTO[] = [];
  for (const r of doc.results) {
    const cand = candMap.get(r.candidateId.toString());
    if (!cand) continue;
    results.push({
      candidate: cand,
      rank: r.rank,
      scores: r.scores,
      matchedSkills: r.matchedSkills,
      complementarySkills: r.complementarySkills,
      overlapMinutes: r.overlapMinutes,
      explanation: r.explanation,
      status: r.status,
    });
  }

  return {
    id: doc._id.toString(),
    courseId: doc.courseId.toString(),
    courseCode: course?.courseCode || 'Course',
    courseName: course?.courseName || '',
    teamId: doc.teamId ? doc.teamId.toString() : null,
    teamName: team?.name ?? null,
    title: doc.title,
    description: doc.description,
    requiredSkills: doc.requiredSkills.map((s) => ({
      name: s.name,
      normalizedName: s.normalizedName,
      importance: s.importance,
    })),
    desiredTeamSize: doc.desiredTeamSize,
    timeConstraints: doc.timeConstraints,
    optionalInterests: doc.optionalInterests,
    hardConstraints: {
      strictTimeOverlap: doc.hardConstraints.strictTimeOverlap,
      sameBatchOnly: doc.hardConstraints.sameBatchOnly,
      minSkillLevel: doc.hardConstraints.minSkillLevel,
      requiredDays: doc.hardConstraints.requiredDays,
    },
    status: doc.status,
    modelVersion: doc.modelVersion,
    weightsSnapshot: doc.weightsSnapshot,
    candidatePoolSize: doc.candidatePoolSize,
    hardFilteredCount: doc.hardFilteredCount,
    results,
    errorMessage: doc.errorMessage ?? null,
    startedAt: doc.startedAt ? doc.startedAt.toISOString() : null,
    completedAt: doc.completedAt ? doc.completedAt.toISOString() : null,
    createdAt: doc.createdAt.toISOString(),
  };
}

function escapeCsvCell(value: unknown): string {
  let str = value === null || value === undefined ? '' : String(value);
  // Guard spreadsheet formula injection
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function exportMatchingResultsCsv(): Promise<string> {
  const requests = await TeamMatchRequestModel.find({})
    .sort({ createdAt: -1 })
    .limit(500)
    .lean();

  const userIds = new Set<string>();
  const courseIds = new Set<string>();
  for (const r of requests) {
    userIds.add(r.requesterId.toString());
    courseIds.add(r.courseId.toString());
    for (const item of r.results) {
      userIds.add(item.candidateId.toString());
    }
  }

  const [users, courses] = await Promise.all([
    UserModel.find({ _id: { $in: Array.from(userIds) } })
      .select('email batch department')
      .lean(),
    CourseModel.find({ _id: { $in: Array.from(courseIds) } })
      .select('courseCode')
      .lean(),
  ]);

  const userMap = new Map(users.map((u) => [u._id.toString(), u]));
  const courseMap = new Map(courses.map((c) => [c._id.toString(), c.courseCode]));

  const headers = [
    'requestId',
    'createdAt',
    'completedAt',
    'status',
    'modelVersion',
    'courseCode',
    'requesterEmail',
    'teamId',
    'desiredTeamSize',
    'candidatePoolSize',
    'hardFilteredCount',
    'rank',
    'candidateId',
    'candidateEmail',
    'candidateBatch',
    'skillScore_S',
    'interestScore_I',
    'availabilityScore_A',
    'complementaryScore_C',
    'matchScore',
    'weightS',
    'weightI',
    'weightA',
    'weightC',
    'candidateActionStatus',
    'matchedSkills',
    'complementarySkills',
    'overlapMinutes',
    'explanation',
  ];

  const lines = [headers.join(',')];

  for (const r of requests) {
    const requesterEmail = userMap.get(r.requesterId.toString())?.email ?? '';
    const courseCode = courseMap.get(r.courseId.toString()) ?? '';

    if (r.results.length === 0) {
      lines.push(
        [
          r._id.toString(),
          new Date(r.createdAt).toISOString(),
          r.completedAt ? new Date(r.completedAt).toISOString() : '',
          r.status,
          r.modelVersion,
          courseCode,
          requesterEmail,
          r.teamId ? r.teamId.toString() : '',
          r.desiredTeamSize,
          r.candidatePoolSize,
          r.hardFilteredCount,
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          r.weightsSnapshot.skills,
          r.weightsSnapshot.interests,
          r.weightsSnapshot.availability,
          r.weightsSnapshot.complementary,
          '',
          '',
          '',
          '',
          r.errorMessage ?? '',
        ]
          .map(escapeCsvCell)
          .join(',')
      );
      continue;
    }

    for (const item of r.results) {
      const candUser = userMap.get(item.candidateId.toString());
      lines.push(
        [
          r._id.toString(),
          new Date(r.createdAt).toISOString(),
          r.completedAt ? new Date(r.completedAt).toISOString() : '',
          r.status,
          r.modelVersion,
          courseCode,
          requesterEmail,
          r.teamId ? r.teamId.toString() : '',
          r.desiredTeamSize,
          r.candidatePoolSize,
          r.hardFilteredCount,
          item.rank,
          item.candidateId.toString(),
          candUser?.email ?? '',
          candUser?.batch ?? '',
          item.scores.S,
          item.scores.I,
          item.scores.A,
          item.scores.C,
          item.scores.matchScore,
          r.weightsSnapshot.skills,
          r.weightsSnapshot.interests,
          r.weightsSnapshot.availability,
          r.weightsSnapshot.complementary,
          item.status,
          item.matchedSkills.join('; '),
          item.complementarySkills.join('; '),
          item.overlapMinutes,
          item.explanation,
        ]
          .map(escapeCsvCell)
          .join(',')
      );
    }
  }

  return lines.join('\n');
}
