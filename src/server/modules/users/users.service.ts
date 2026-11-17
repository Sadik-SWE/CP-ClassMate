import mongoose from 'mongoose';
import { UserModel, type IUser } from './users.model.ts';
import { CourseModel } from '../courses/courses.model.ts';
import { AppError } from '../../middleware/errorHandler.ts';
import { sanitizePlainText } from '../../middleware/sanitize.ts';
import type { PublicUser } from '../../../shared/types.ts';
import type { UpdateProfileInput } from './users.validation.ts';

export function toPublicUser(
  user: IUser,
  crCourseIds: string[] = []
): PublicUser {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    studentId: user.studentId ?? null,
    department: user.department,
    batch: user.batch ?? null,
    profile: {
      bio: user.profile?.bio ?? '',
      skills: (user.profile?.skills ?? []).map((s) => ({
        name: s.name,
        level: s.level as 1 | 2 | 3 | 4 | 5,
      })),
      interests: user.profile?.interests ?? [],
    },
    availability: (user.availability ?? []).map((slot) => ({
      day: slot.day,
      from: slot.from,
      to: slot.to,
    })),
    optedOutOfMatching: Boolean(user.optedOutOfMatching),
    crCourseIds,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

export async function getCRCourseIdsForUserId(userId: string): Promise<string[]> {
  if (!mongoose.isValidObjectId(userId)) return [];
  const courses = await CourseModel.find({
    crUserIds: new mongoose.Types.ObjectId(userId),
    deletedAt: null,
  })
    .select('_id')
    .lean();
  return courses.map((c) => c._id.toString());
}

export async function getUserProfileById(userId: string): Promise<PublicUser> {
  if (!mongoose.isValidObjectId(userId)) {
    throw new AppError(400, 'INVALID_ID', 'Invalid user ID');
  }
  const user = await UserModel.findOne({ _id: userId, deletedAt: null });
  if (!user) {
    throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
  }
  const crCourseIds = await getCRCourseIdsForUserId(userId);
  return toPublicUser(user, crCourseIds);
}

export async function updateMyProfile(
  userId: string,
  input: UpdateProfileInput
): Promise<PublicUser> {
  const user = await UserModel.findOne({ _id: userId, deletedAt: null });
  if (!user) {
    throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
  }

  if (input.name !== undefined) {
    user.name = sanitizePlainText(input.name);
  }
  if (input.department !== undefined) {
    user.department = sanitizePlainText(input.department);
  }
  if (input.batch !== undefined) {
    user.batch = input.batch === null ? null : sanitizePlainText(input.batch);
  }
  if (input.bio !== undefined) {
    user.profile.bio = sanitizePlainText(input.bio);
  }
  if (input.skills !== undefined) {
    const deduped = new Map<string, { name: string; level: 1 | 2 | 3 | 4 | 5 }>();
    for (const item of input.skills) {
      const cleanName = sanitizePlainText(item.name);
      if (cleanName) {
        deduped.set(cleanName.toLowerCase(), {
          name: cleanName,
          level: item.level as 1 | 2 | 3 | 4 | 5,
        });
      }
    }
    user.profile.skills = Array.from(deduped.values());
  }
  if (input.interests !== undefined) {
    const uniqueInterests = Array.from(
      new Set(
        input.interests
          .map((item) => sanitizePlainText(item))
          .filter((item) => item.length > 0)
      )
    );
    user.profile.interests = uniqueInterests;
  }
  if (input.availability !== undefined) {
    user.availability = input.availability;
  }
  if (input.optedOutOfMatching !== undefined) {
    user.optedOutOfMatching = input.optedOutOfMatching;
  }

  await user.save();
  const crCourseIds = await getCRCourseIdsForUserId(userId);
  return toPublicUser(user, crCourseIds);
}
