import mongoose from 'mongoose';
import { AI_CONFIG } from '../../config/env.ts';
import { CourseEnrollmentModel, CourseModel } from '../courses/courses.model.ts';
import { UserModel } from '../users/users.model.ts';
import {
  getAccessibleCourseIds,
  isEnrolled,
  type AuthUserContext,
} from '../courses/courses.service.ts';
import {
  TeamMatchRequestModel,
  TeamModel,
  TeamRequestModel,
  type ITeam,
  type ITeamRequest,
} from './collaboration.model.ts';
import {
  hydrateMatchRequest,
  runMatchRequestJob,
} from './matching.service.ts';
import { normalizeSkillName } from './skillNormalizer.ts';
import { notifySpecificUsers } from '../notifications/notifications.service.ts';
import { recordAuditLog, type RequestMeta } from '../admin/admin.service.ts';
import { AppError } from '../../middleware/errorHandler.ts';
import { sanitizePlainText } from '../../middleware/sanitize.ts';
import { buildPaginationMeta } from '../../utils/apiResponse.ts';
import {
  EnrollmentStatus,
  MatchCandidateActionStatus,
  MatchRequestStatus,
  NotificationType,
  TeamRequestStatus,
  TeamRequestType,
  TeamStatus,
  UserRole,
  UserStatus,
  type ClassmateDTO,
  type CourseUserSummary,
  type PaginationMeta,
  type TeamDTO,
  type TeamMatchRequestDTO,
  type TeamMemberDTO,
  type TeamRequestDTO,
} from '../../../shared/types.ts';
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

export async function discoverClassmates(
  viewer: AuthUserContext,
  query: DiscoverClassmatesQuery
): Promise<{ classmates: ClassmateDTO[]; meta: PaginationMeta }> {
  const accessibleCourseIds = await getAccessibleCourseIds(viewer);

  let targetCourseIds = accessibleCourseIds;
  if (query.courseId) {
    if (!mongoose.isValidObjectId(query.courseId)) {
      throw new AppError(400, 'INVALID_ID', 'Invalid course ID');
    }
    if (
      viewer.role !== UserRole.ADMIN &&
      !accessibleCourseIds.includes(query.courseId)
    ) {
      throw new AppError(
        403,
        'COURSE_SCOPE_FORBIDDEN',
        'You can only discover classmates in courses you belong to'
      );
    }
    targetCourseIds = [query.courseId];
  }

  if (targetCourseIds.length === 0) {
    return {
      classmates: [],
      meta: buildPaginationMeta(query.page, query.limit, 0),
    };
  }

  const targetCourseObjIds = targetCourseIds.map(
    (id) => new mongoose.Types.ObjectId(id)
  );

  const [enrollments, courses] = await Promise.all([
    CourseEnrollmentModel.find({
      courseId: { $in: targetCourseObjIds },
      status: EnrollmentStatus.ACTIVE,
      userId: { $ne: new mongoose.Types.ObjectId(viewer.id) },
    })
      .select('userId courseId')
      .lean(),
    CourseModel.find({ _id: { $in: targetCourseObjIds }, deletedAt: null })
      .select('courseCode courseName')
      .lean(),
  ]);

  const courseInfoMap = new Map(
    courses.map((c) => [
      c._id.toString(),
      { id: c._id.toString(), courseCode: c.courseCode, courseName: c.courseName },
    ])
  );

  const sharedCoursesByUser = new Map<
    string,
    Array<{ id: string; courseCode: string; courseName: string }>
  >();

  for (const enr of enrollments) {
    const uid = enr.userId.toString();
    const cid = enr.courseId.toString();
    const cInfo = courseInfoMap.get(cid);
    if (!cInfo) continue;
    const list = sharedCoursesByUser.get(uid) ?? [];
    if (!list.some((item) => item.id === cid)) {
      list.push(cInfo);
    }
    sharedCoursesByUser.set(uid, list);
  }

  const candidateUserIds = Array.from(sharedCoursesByUser.keys()).map(
    (id) => new mongoose.Types.ObjectId(id)
  );
  if (candidateUserIds.length === 0) {
    return {
      classmates: [],
      meta: buildPaginationMeta(query.page, query.limit, 0),
    };
  }

  const filter: Record<string, unknown> = {
    _id: { $in: candidateUserIds },
    role: UserRole.STUDENT,
    status: UserStatus.ACTIVE,
    optedOutOfMatching: false,
    deletedAt: null,
  };

  if (query.day) {
    filter['availability.day'] = query.day;
  }

  const andClauses: Record<string, unknown>[] = [];
  if (query.skill) {
    const rawRx = { $regex: escapeRegex(query.skill), $options: 'i' };
    const norm = normalizeSkillName(query.skill);
    if (norm && norm !== query.skill.trim().toLowerCase()) {
      const normRx = { $regex: escapeRegex(norm), $options: 'i' };
      andClauses.push({
        $or: [{ 'profile.skills.name': rawRx }, { 'profile.skills.name': normRx }],
      });
    } else {
      filter['profile.skills.name'] = rawRx;
    }
  }

  if (query.search) {
    const rx = { $regex: escapeRegex(query.search), $options: 'i' };
    andClauses.push({
      $or: [
        { name: rx },
        { department: rx },
        { batch: rx },
        { 'profile.skills.name': rx },
        { 'profile.interests': rx },
      ],
    });
  }

  if (andClauses.length > 0) {
    filter.$and = andClauses;
  }

  const skip = (query.page - 1) * query.limit;
  const [users, total] = await Promise.all([
    UserModel.find(filter)
      .select('name department batch studentId profile availability')
      .sort({ name: 1 })
      .skip(skip)
      .limit(query.limit)
      .lean(),
    UserModel.countDocuments(filter),
  ]);

  const classmates: ClassmateDTO[] = users.map((u) => ({
    id: u._id.toString(),
    name: u.name,
    department: u.department,
    batch: u.batch ?? null,
    studentId: u.studentId ?? null,
    profile: {
      bio: u.profile?.bio || '',
      skills: u.profile?.skills ?? [],
      interests: u.profile?.interests ?? [],
    },
    availability: u.availability ?? [],
    sharedCourses: sharedCoursesByUser.get(u._id.toString()) ?? [],
  }));

  return {
    classmates,
    meta: buildPaginationMeta(query.page, query.limit, total),
  };
}

async function hydrateTeams(
  teams: ITeam[],
  viewerId: string
): Promise<TeamDTO[]> {
  if (teams.length === 0) return [];

  const courseIds = Array.from(new Set(teams.map((t) => t.courseId.toString())));
  const memberIds = Array.from(
    new Set(teams.flatMap((t) => t.memberIds.map((m) => m.toString())))
  );
  const teamIds = teams.map((t) => t._id);

  const [courses, members, pendingJoins] = await Promise.all([
    CourseModel.find({ _id: { $in: courseIds } })
      .select('courseCode courseName')
      .lean(),
    UserModel.find({ _id: { $in: memberIds } })
      .select('name email studentId department profile.skills')
      .lean(),
    TeamRequestModel.find({
      teamId: { $in: teamIds },
      fromUserId: new mongoose.Types.ObjectId(viewerId),
      type: TeamRequestType.JOIN_REQUEST,
      status: TeamRequestStatus.PENDING,
    })
      .select('teamId')
      .lean(),
  ]);

  const courseMap = new Map(
    courses.map((c) => [
      c._id.toString(),
      { courseCode: c.courseCode, courseName: c.courseName },
    ])
  );
  const memberMap = new Map<string, TeamMemberDTO>(
    members.map((m) => [
      m._id.toString(),
      {
        id: m._id.toString(),
        name: m.name,
        email: m.email,
        studentId: m.studentId ?? null,
        department: m.department,
        skills: m.profile?.skills ?? [],
      },
    ])
  );
  const pendingJoinSet = new Set(pendingJoins.map((p) => p.teamId.toString()));

  return teams.map((t) => {
    const cid = t.courseId.toString();
    const courseInfo = courseMap.get(cid);
    const hydratedMembers = t.memberIds
      .map((mid) => memberMap.get(mid.toString()))
      .filter((m): m is TeamMemberDTO => Boolean(m));
    const viewerIsMember = t.memberIds.some((m) => m.toString() === viewerId);

    return {
      id: t._id.toString(),
      courseId: cid,
      courseCode: courseInfo?.courseCode || 'Course',
      courseName: courseInfo?.courseName || '',
      name: t.name,
      description: t.description || '',
      maxSize: t.maxSize,
      status: t.status,
      leaderId: t.leaderId.toString(),
      members: hydratedMembers,
      viewerIsMember,
      viewerIsLeader: t.leaderId.toString() === viewerId,
      hasPendingJoinRequest: pendingJoinSet.has(t._id.toString()),
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    };
  });
}

export async function listTeams(
  viewer: AuthUserContext,
  query: ListTeamsQuery
): Promise<{ teams: TeamDTO[]; meta: PaginationMeta }> {
  const accessible = await getAccessibleCourseIds(viewer);
  const filter: Record<string, unknown> = { deletedAt: null };

  if (query.courseId) {
    if (!mongoose.isValidObjectId(query.courseId)) {
      throw new AppError(400, 'INVALID_ID', 'Invalid course ID');
    }
    if (viewer.role !== UserRole.ADMIN && !accessible.includes(query.courseId)) {
      throw new AppError(
        403,
        'COURSE_SCOPE_FORBIDDEN',
        'You do not have access to teams in this course'
      );
    }
    filter.courseId = new mongoose.Types.ObjectId(query.courseId);
  } else if (viewer.role !== UserRole.ADMIN) {
    filter.courseId = {
      $in: accessible.map((id) => new mongoose.Types.ObjectId(id)),
    };
  }

  if (query.mineOnly) {
    filter.memberIds = new mongoose.Types.ObjectId(viewer.id);
  }

  const skip = (query.page - 1) * query.limit;
  const [docs, total] = await Promise.all([
    TeamModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(query.limit),
    TeamModel.countDocuments(filter),
  ]);

  const teams = await hydrateTeams(docs, viewer.id);
  return {
    teams,
    meta: buildPaginationMeta(query.page, query.limit, total),
  };
}

export async function createTeam(
  actor: AuthUserContext,
  input: CreateTeamInput,
  reqMeta?: RequestMeta
): Promise<TeamDTO> {
  if (!mongoose.isValidObjectId(input.courseId)) {
    throw new AppError(400, 'INVALID_ID', 'Invalid course ID');
  }

  const course = await CourseModel.findOne({
    _id: input.courseId,
    deletedAt: null,
  });
  if (!course) {
    throw new AppError(404, 'COURSE_NOT_FOUND', 'Course not found');
  }

  if (actor.role !== UserRole.ADMIN) {
    const enrolled = await isEnrolled(actor.id, input.courseId);
    if (!enrolled) {
      throw new AppError(
        403,
        'COURSE_SCOPE_FORBIDDEN',
        'You must be actively enrolled in this course to create a project team'
      );
    }
  }

  const team = await TeamModel.create({
    courseId: course._id,
    name: sanitizePlainText(input.name),
    description: sanitizePlainText(input.description || ''),
    maxSize: input.maxSize,
    leaderId: new mongoose.Types.ObjectId(actor.id),
    memberIds: [new mongoose.Types.ObjectId(actor.id)],
    status: TeamStatus.OPEN,
  });

  await recordAuditLog({
    actor: { id: actor.id, email: actor.email, role: actor.role },
    action: 'TEAM_CREATED',
    targetType: 'TEAM',
    targetId: team._id.toString(),
    metadata: {
      courseCode: course.courseCode,
      name: team.name,
      maxSize: team.maxSize,
    },
    reqMeta,
  });

  const [dto] = await hydrateTeams([team], actor.id);
  return dto;
}

async function hydrateTeamRequests(
  docs: ITeamRequest[]
): Promise<TeamRequestDTO[]> {
  if (docs.length === 0) return [];

  const teamIds = Array.from(new Set(docs.map((d) => d.teamId.toString())));
  const courseIds = Array.from(new Set(docs.map((d) => d.courseId.toString())));
  const userIds = Array.from(
    new Set(
      docs.flatMap((d) => [d.fromUserId.toString(), d.toUserId.toString()])
    )
  );

  const [teams, courses, users] = await Promise.all([
    TeamModel.find({ _id: { $in: teamIds } }).select('name').lean(),
    CourseModel.find({ _id: { $in: courseIds } }).select('courseCode').lean(),
    UserModel.find({ _id: { $in: userIds } })
      .select('name email role studentId department')
      .lean(),
  ]);

  const teamMap = new Map(teams.map((t) => [t._id.toString(), t.name]));
  const courseMap = new Map(
    courses.map((c) => [c._id.toString(), c.courseCode])
  );
  const userMap = new Map<string, CourseUserSummary>(
    users.map((u) => [
      u._id.toString(),
      {
        id: u._id.toString(),
        name: u.name,
        email: u.email,
        role: u.role,
        studentId: u.studentId ?? null,
        department: u.department,
      },
    ])
  );

  return docs.map((d) => ({
    id: d._id.toString(),
    teamId: d.teamId.toString(),
    teamName: teamMap.get(d.teamId.toString()) || 'Team',
    courseId: d.courseId.toString(),
    courseCode: courseMap.get(d.courseId.toString()) || 'Course',
    type: d.type,
    status: d.status,
    fromUser: userMap.get(d.fromUserId.toString()) || {
      id: d.fromUserId.toString(),
      name: 'Member',
      email: '',
      role: UserRole.STUDENT,
      department: '',
    },
    toUser: userMap.get(d.toUserId.toString()) || {
      id: d.toUserId.toString(),
      name: 'Member',
      email: '',
      role: UserRole.STUDENT,
      department: '',
    },
    message: d.message || '',
    respondedAt: d.respondedAt ? d.respondedAt.toISOString() : null,
    createdAt: d.createdAt.toISOString(),
  }));
}

export async function listMyTeamRequests(
  viewer: AuthUserContext
): Promise<{ incoming: TeamRequestDTO[]; outgoing: TeamRequestDTO[] }> {
  const viewerObjId = new mongoose.Types.ObjectId(viewer.id);
  const [incomingDocs, outgoingDocs] = await Promise.all([
    TeamRequestModel.find({ toUserId: viewerObjId })
      .sort({ createdAt: -1 })
      .limit(50),
    TeamRequestModel.find({ fromUserId: viewerObjId })
      .sort({ createdAt: -1 })
      .limit(50),
  ]);

  const [incoming, outgoing] = await Promise.all([
    hydrateTeamRequests(incomingDocs),
    hydrateTeamRequests(outgoingDocs),
  ]);
  return { incoming, outgoing };
}

export async function inviteMemberToTeam(
  actor: AuthUserContext,
  teamId: string,
  input: InviteToTeamInput,
  reqMeta?: RequestMeta
): Promise<TeamRequestDTO> {
  if (
    !mongoose.isValidObjectId(teamId) ||
    !mongoose.isValidObjectId(input.targetUserId)
  ) {
    throw new AppError(400, 'INVALID_ID', 'Invalid team or user ID');
  }

  const team = await TeamModel.findOne({ _id: teamId, deletedAt: null });
  if (!team) {
    throw new AppError(404, 'TEAM_NOT_FOUND', 'Team not found');
  }

  if (
    actor.role !== UserRole.ADMIN &&
    !team.memberIds.some((m) => m.toString() === actor.id)
  ) {
    throw new AppError(
      403,
      'TEAM_MEMBERSHIP_REQUIRED',
      'Only team members can invite classmates to this team'
    );
  }

  if (team.memberIds.length >= team.maxSize) {
    throw new AppError(409, 'TEAM_FULL', 'This team has reached its member limit');
  }

  if (team.memberIds.some((m) => m.toString() === input.targetUserId)) {
    throw new AppError(
      409,
      'ALREADY_TEAM_MEMBER',
      'This student is already a member of the team'
    );
  }

  const targetEnrolled = await isEnrolled(
    input.targetUserId,
    team.courseId.toString()
  );
  if (!targetEnrolled) {
    throw new AppError(
      400,
      'CLASSMATE_NOT_ENROLLED',
      'Invited classmate must be actively enrolled in the same course'
    );
  }

  const duplicate = await TeamRequestModel.exists({
    teamId: team._id,
    toUserId: new mongoose.Types.ObjectId(input.targetUserId),
    type: TeamRequestType.INVITE,
    status: TeamRequestStatus.PENDING,
  });
  if (duplicate) {
    throw new AppError(
      409,
      'INVITE_ALREADY_PENDING',
      'An invitation is already pending for this classmate'
    );
  }

  const reqDoc = await TeamRequestModel.create({
    teamId: team._id,
    courseId: team.courseId,
    type: TeamRequestType.INVITE,
    fromUserId: new mongoose.Types.ObjectId(actor.id),
    toUserId: new mongoose.Types.ObjectId(input.targetUserId),
    message: sanitizePlainText(input.message || ''),
    status: TeamRequestStatus.PENDING,
  });

  await recordAuditLog({
    actor: { id: actor.id, email: actor.email, role: actor.role },
    action: 'TEAM_INVITE_SENT',
    targetType: 'TEAM_REQUEST',
    targetId: reqDoc._id.toString(),
    metadata: { teamId: team._id.toString(), targetUserId: input.targetUserId },
    reqMeta,
  });

  await notifySpecificUsers({
    userIds: [input.targetUserId],
    excludeUserId: actor.id,
    type: NotificationType.TEAM,
    title: `Team invitation: ${team.name}`,
    message: `${actor.name} invited you to join "${team.name}". Accept or decline in Collaboration.`,
    link: '/collaboration?tab=teams',
    courseId: team.courseId.toString(),
  });

  const [dto] = await hydrateTeamRequests([reqDoc]);
  return dto;
}

export async function requestToJoinTeam(
  actor: AuthUserContext,
  teamId: string,
  input: JoinTeamRequestInput,
  reqMeta?: RequestMeta
): Promise<TeamRequestDTO> {
  if (!mongoose.isValidObjectId(teamId)) {
    throw new AppError(400, 'INVALID_ID', 'Invalid team ID');
  }

  const team = await TeamModel.findOne({ _id: teamId, deletedAt: null });
  if (!team) {
    throw new AppError(404, 'TEAM_NOT_FOUND', 'Team not found');
  }

  const enrolled = await isEnrolled(actor.id, team.courseId.toString());
  if (!enrolled) {
    throw new AppError(
      403,
      'COURSE_SCOPE_FORBIDDEN',
      'You must be enrolled in this course to request joining this team'
    );
  }

  if (team.memberIds.some((m) => m.toString() === actor.id)) {
    throw new AppError(409, 'ALREADY_TEAM_MEMBER', 'You are already in this team');
  }

  if (team.memberIds.length >= team.maxSize) {
    throw new AppError(409, 'TEAM_FULL', 'This team is already full');
  }

  const duplicate = await TeamRequestModel.exists({
    teamId: team._id,
    fromUserId: new mongoose.Types.ObjectId(actor.id),
    type: TeamRequestType.JOIN_REQUEST,
    status: TeamRequestStatus.PENDING,
  });
  if (duplicate) {
    throw new AppError(
      409,
      'JOIN_REQUEST_PENDING',
      'You already have a pending join request for this team'
    );
  }

  const reqDoc = await TeamRequestModel.create({
    teamId: team._id,
    courseId: team.courseId,
    type: TeamRequestType.JOIN_REQUEST,
    fromUserId: new mongoose.Types.ObjectId(actor.id),
    toUserId: team.leaderId,
    message: sanitizePlainText(input.message || ''),
    status: TeamRequestStatus.PENDING,
  });

  await recordAuditLog({
    actor: { id: actor.id, email: actor.email, role: actor.role },
    action: 'TEAM_JOIN_REQUEST_SENT',
    targetType: 'TEAM_REQUEST',
    targetId: reqDoc._id.toString(),
    metadata: { teamId: team._id.toString() },
    reqMeta,
  });

  await notifySpecificUsers({
    userIds: [team.leaderId.toString()],
    excludeUserId: actor.id,
    type: NotificationType.TEAM,
    title: `Join request for ${team.name}`,
    message: `${actor.name} requested to join "${team.name}".`,
    link: '/collaboration?tab=teams',
    courseId: team.courseId.toString(),
  });

  const [dto] = await hydrateTeamRequests([reqDoc]);
  return dto;
}

export async function respondToTeamRequest(
  actor: AuthUserContext,
  requestId: string,
  input: RespondTeamRequestInput,
  reqMeta?: RequestMeta
): Promise<TeamRequestDTO> {
  if (!mongoose.isValidObjectId(requestId)) {
    throw new AppError(400, 'INVALID_ID', 'Invalid request ID');
  }

  const reqDoc = await TeamRequestModel.findById(requestId);
  if (!reqDoc) {
    throw new AppError(404, 'REQUEST_NOT_FOUND', 'Team request not found');
  }
  if (reqDoc.status !== TeamRequestStatus.PENDING) {
    throw new AppError(
      409,
      'REQUEST_ALREADY_RESOLVED',
      `This request has already been ${reqDoc.status.toLowerCase()}`
    );
  }

  const team = await TeamModel.findOne({ _id: reqDoc.teamId, deletedAt: null });
  if (!team) {
    throw new AppError(404, 'TEAM_NOT_FOUND', 'Associated team no longer exists');
  }

  if (input.action === 'CANCEL') {
    if (reqDoc.fromUserId.toString() !== actor.id) {
      throw new AppError(
        403,
        'AUTH_FORBIDDEN',
        'Only the sender can cancel this pending request'
      );
    }
    reqDoc.status = TeamRequestStatus.CANCELLED;
    reqDoc.respondedBy = new mongoose.Types.ObjectId(actor.id);
    reqDoc.respondedAt = new Date();
    await reqDoc.save();
    const [dto] = await hydrateTeamRequests([reqDoc]);
    return dto;
  }

  // Strict consent rule:
  // - INVITE can ONLY be accepted/rejected by the invited student (toUserId)
  // - JOIN_REQUEST can ONLY be accepted/rejected by the team leader (team.leaderId)
  if (reqDoc.type === TeamRequestType.INVITE) {
    if (reqDoc.toUserId.toString() !== actor.id) {
      throw new AppError(
        403,
        'CONSENT_REQUIRED',
        'Only the invited classmate can accept or decline this invitation'
      );
    }
  } else {
    if (team.leaderId.toString() !== actor.id) {
      throw new AppError(
        403,
        'LEADER_REQUIRED',
        'Only the team leader can accept or decline join requests'
      );
    }
  }

  if (input.action === 'REJECT') {
    reqDoc.status = TeamRequestStatus.REJECTED;
    reqDoc.respondedBy = new mongoose.Types.ObjectId(actor.id);
    reqDoc.respondedAt = new Date();
    await reqDoc.save();
    const [dto] = await hydrateTeamRequests([reqDoc]);
    return dto;
  }

  // ACCEPT
  const newMemberId =
    reqDoc.type === TeamRequestType.INVITE ? reqDoc.toUserId : reqDoc.fromUserId;

  const alreadyMember = team.memberIds.some(
    (m) => m.toString() === newMemberId.toString()
  );
  if (!alreadyMember) {
    if (team.memberIds.length >= team.maxSize) {
      throw new AppError(
        409,
        'TEAM_FULL',
        'Cannot accept because the team has reached its member limit'
      );
    }
    team.memberIds.push(newMemberId);
    team.status =
      team.memberIds.length >= team.maxSize ? TeamStatus.FULL : TeamStatus.OPEN;
    await team.save();
  }

  reqDoc.status = TeamRequestStatus.ACCEPTED;
  reqDoc.respondedBy = new mongoose.Types.ObjectId(actor.id);
  reqDoc.respondedAt = new Date();
  await reqDoc.save();

  await recordAuditLog({
    actor: { id: actor.id, email: actor.email, role: actor.role },
    action: 'TEAM_MEMBER_JOINED',
    targetType: 'TEAM',
    targetId: team._id.toString(),
    metadata: {
      memberId: newMemberId.toString(),
      via: reqDoc.type,
    },
    reqMeta,
  });

  await notifySpecificUsers({
    userIds: [reqDoc.fromUserId.toString()],
    excludeUserId: actor.id,
    type: NotificationType.TEAM,
    title: `${team.name}: Request accepted`,
    message: `${actor.name} accepted the ${reqDoc.type === TeamRequestType.INVITE ? 'team invitation' : 'join request'} for "${team.name}".`,
    link: '/collaboration?tab=teams',
    courseId: team.courseId.toString(),
  });

  const [dto] = await hydrateTeamRequests([reqDoc]);
  return dto;
}

export async function leaveTeam(
  actor: AuthUserContext,
  teamId: string,
  reqMeta?: RequestMeta
): Promise<{ left: boolean; disbanded: boolean }> {
  if (!mongoose.isValidObjectId(teamId)) {
    throw new AppError(400, 'INVALID_ID', 'Invalid team ID');
  }

  const team = await TeamModel.findOne({ _id: teamId, deletedAt: null });
  if (!team) {
    throw new AppError(404, 'TEAM_NOT_FOUND', 'Team not found');
  }

  const isMember = team.memberIds.some((m) => m.toString() === actor.id);
  if (!isMember) {
    throw new AppError(400, 'NOT_A_MEMBER', 'You are not a member of this team');
  }

  team.memberIds = team.memberIds.filter((m) => m.toString() !== actor.id);

  let disbanded = false;
  if (team.memberIds.length === 0) {
    team.status = TeamStatus.ARCHIVED;
    team.deletedAt = new Date();
    disbanded = true;
    await TeamRequestModel.updateMany(
      { teamId: team._id, status: TeamRequestStatus.PENDING },
      { $set: { status: TeamRequestStatus.CANCELLED, respondedAt: new Date() } }
    );
  } else {
    if (team.leaderId.toString() === actor.id) {
      team.leaderId = team.memberIds[0];
    }
    team.status =
      team.memberIds.length >= team.maxSize ? TeamStatus.FULL : TeamStatus.OPEN;
  }

  await team.save();

  await recordAuditLog({
    actor: { id: actor.id, email: actor.email, role: actor.role },
    action: disbanded ? 'TEAM_DISBANDED' : 'TEAM_MEMBER_LEFT',
    targetType: 'TEAM',
    targetId: team._id.toString(),
    metadata: { disbanded },
    reqMeta,
  });

  return { left: true, disbanded };
}

export async function createMatchRequest(
  actor: AuthUserContext,
  input: CreateMatchRequestInput,
  reqMeta?: RequestMeta
): Promise<TeamMatchRequestDTO> {
  if (!mongoose.isValidObjectId(input.courseId)) {
    throw new AppError(400, 'INVALID_ID', 'Invalid course ID');
  }
  const course = await CourseModel.findOne({
    _id: input.courseId,
    deletedAt: null,
  });
  if (!course) {
    throw new AppError(404, 'COURSE_NOT_FOUND', 'Course not found');
  }

  if (actor.role !== UserRole.ADMIN) {
    const enrolled = await isEnrolled(actor.id, input.courseId);
    if (!enrolled) {
      throw new AppError(
        403,
        'COURSE_SCOPE_FORBIDDEN',
        'You must be enrolled in this course to run AI team matching'
      );
    }
  }

  let validatedTeamId: mongoose.Types.ObjectId | null = null;
  if (input.teamId) {
    if (!mongoose.isValidObjectId(input.teamId)) {
      throw new AppError(400, 'INVALID_ID', 'Invalid team ID');
    }
    const team = await TeamModel.findOne({
      _id: input.teamId,
      courseId: course._id,
      deletedAt: null,
    });
    if (!team) {
      throw new AppError(404, 'TEAM_NOT_FOUND', 'Selected team not found in this course');
    }
    if (!team.memberIds.some((m) => m.toString() === actor.id)) {
      throw new AppError(
        403,
        'TEAM_MEMBERSHIP_REQUIRED',
        'You must be a member of the selected team to match candidates for it'
      );
    }
    validatedTeamId = team._id;
  }

  const normalizedRequiredSkills = input.requiredSkills.map((sk) => ({
    name: sanitizePlainText(sk.name),
    normalizedName: normalizeSkillName(sk.name),
    importance: sk.importance as 1 | 2 | 3 | 4 | 5,
  }));

  const doc = await TeamMatchRequestModel.create({
    requesterId: new mongoose.Types.ObjectId(actor.id),
    courseId: course._id,
    teamId: validatedTeamId,
    title: sanitizePlainText(input.title),
    description: sanitizePlainText(input.description),
    requiredSkills: normalizedRequiredSkills,
    desiredTeamSize: input.desiredTeamSize,
    timeConstraints: input.timeConstraints,
    optionalInterests: input.optionalInterests.map((i) => sanitizePlainText(i)),
    hardConstraints: input.hardConstraints,
    status: MatchRequestStatus.QUEUED,
    modelVersion: AI_CONFIG.modelVersion,
    weightsSnapshot: { ...AI_CONFIG.matchingWeights },
  });

  await recordAuditLog({
    actor: { id: actor.id, email: actor.email, role: actor.role },
    action: 'TEAM_MATCHING_REQUESTED',
    targetType: 'TEAM_MATCH_REQUEST',
    targetId: doc._id.toString(),
    metadata: {
      courseCode: course.courseCode,
      modelVersion: doc.modelVersion,
    },
    reqMeta,
  });

  setImmediate(() => {
    void runMatchRequestJob(doc._id.toString());
  });

  return hydrateMatchRequest(doc);
}

export async function getMatchRequest(
  viewer: AuthUserContext,
  requestId: string
): Promise<TeamMatchRequestDTO> {
  if (!mongoose.isValidObjectId(requestId)) {
    throw new AppError(400, 'INVALID_ID', 'Invalid match request ID');
  }
  const doc = await TeamMatchRequestModel.findById(requestId);
  if (!doc) {
    throw new AppError(404, 'MATCH_REQUEST_NOT_FOUND', 'Match request not found');
  }
  if (
    viewer.role !== UserRole.ADMIN &&
    doc.requesterId.toString() !== viewer.id
  ) {
    throw new AppError(
      403,
      'AUTH_FORBIDDEN',
      'You can only view your own team matching requests'
    );
  }
  return hydrateMatchRequest(doc);
}

export async function listMyMatchRequests(
  viewer: AuthUserContext
): Promise<TeamMatchRequestDTO[]> {
  const docs = await TeamMatchRequestModel.find({
    requesterId: new mongoose.Types.ObjectId(viewer.id),
  })
    .sort({ createdAt: -1 })
    .limit(15);

  return Promise.all(docs.map((d) => hydrateMatchRequest(d)));
}

export async function updateMatchCandidateAction(
  actor: AuthUserContext,
  requestId: string,
  candidateId: string,
  input: UpdateMatchCandidateActionInput,
  reqMeta?: RequestMeta
): Promise<TeamMatchRequestDTO> {
  if (
    !mongoose.isValidObjectId(requestId) ||
    !mongoose.isValidObjectId(candidateId)
  ) {
    throw new AppError(400, 'INVALID_ID', 'Invalid request or candidate ID');
  }

  const doc = await TeamMatchRequestModel.findById(requestId);
  if (!doc) {
    throw new AppError(404, 'MATCH_REQUEST_NOT_FOUND', 'Match request not found');
  }
  if (
    actor.role !== UserRole.ADMIN &&
    doc.requesterId.toString() !== actor.id
  ) {
    throw new AppError(
      403,
      'AUTH_FORBIDDEN',
      'Only the requester can act on matching candidates'
    );
  }

  const entry = doc.results.find(
    (r) => r.candidateId.toString() === candidateId
  );
  if (!entry) {
    throw new AppError(
      404,
      'CANDIDATE_NOT_FOUND',
      'Candidate not found in this match result'
    );
  }

  if (input.action === MatchCandidateActionStatus.INVITED) {
    const targetTeamId =
      input.teamId || (doc.teamId ? doc.teamId.toString() : '');
    if (!targetTeamId) {
      throw new AppError(
        400,
        'TEAM_ID_REQUIRED',
        'Select or create a team before sending an invitation'
      );
    }

    await inviteMemberToTeam(
      actor,
      targetTeamId,
      {
        targetUserId: candidateId,
        message:
          input.message ||
          `Matched via ClassMate (${entry.scores.matchScore.toFixed(1)}% score) for "${doc.title}".`,
      },
      reqMeta
    );
  }

  entry.status = input.action;
  await doc.save();

  return hydrateMatchRequest(doc);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
