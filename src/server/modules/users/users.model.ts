import mongoose, { Schema, type Document } from 'mongoose';
import {
  DAYS_OF_WEEK,
  UserRole,
  UserStatus,
  type AvailabilitySlot,
  type UserProfile,
} from '../../../shared/types.ts';

export interface IUser extends Document {
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  status: UserStatus;
  studentId?: string | null;
  department: string;
  batch?: string | null;
  profile: UserProfile;
  availability: AvailabilitySlot[];
  optedOutOfMatching: boolean;
  passwordResetTokenHash?: string | null;
  passwordResetExpiresAt?: Date | null;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const skillSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    level: { type: Number, required: true, min: 1, max: 5 },
  },
  { _id: false }
);

const availabilitySchema = new Schema(
  {
    day: { type: String, required: true, enum: DAYS_OF_WEEK },
    from: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
    to: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
  },
  { _id: false }
);

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 160,
    },
    passwordHash: { type: String, required: true, select: false },
    role: {
      type: String,
      enum: Object.values(UserRole),
      default: UserRole.STUDENT,
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(UserStatus),
      default: UserStatus.ACTIVE,
      required: true,
    },
    studentId: {
      type: String,
      trim: true,
      maxlength: 40,
      default: undefined,
    },
    department: { type: String, required: true, trim: true, maxlength: 100 },
    batch: { type: String, trim: true, maxlength: 40, default: null },
    profile: {
      bio: { type: String, default: '', maxlength: 800 },
      skills: { type: [skillSchema], default: [] },
      interests: { type: [String], default: [] },
    },
    availability: { type: [availabilitySchema], default: [] },
    optedOutOfMatching: { type: Boolean, default: false },
    passwordResetTokenHash: { type: String, default: null, select: false },
    passwordResetExpiresAt: { type: Date, default: null, select: false },
    deletedAt: { type: Date, default: null },
  },
  {
    collection: 'users',
    timestamps: true,
  }
);

userSchema.index({ studentId: 1 }, { unique: true, sparse: true });
userSchema.index({ role: 1, status: 1 });
userSchema.index({ department: 1 });
userSchema.index({ name: 'text', email: 'text', department: 'text' });

export const UserModel: mongoose.Model<IUser> =
  (mongoose.models.User as mongoose.Model<IUser>) ||
  mongoose.model<IUser>('User', userSchema);
