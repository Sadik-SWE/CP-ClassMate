import mongoose, { Schema, type Document } from 'mongoose';
import {
  DAYS_OF_WEEK,
  MatchCandidateActionStatus,
  MatchRequestStatus,
  TeamRequestStatus,
  TeamRequestType,
  TeamStatus,
  type AvailabilitySlot,
  type DayOfWeek,
} from '../../../shared/types.ts';

export interface ITeam extends Document {
  courseId: mongoose.Types.ObjectId;
  name: string;
  description: string;
  maxSize: number;
  leaderId: mongoose.Types.ObjectId;
  memberIds: mongoose.Types.ObjectId[];
  status: TeamStatus;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ITeamRequest extends Document {
  teamId: mongoose.Types.ObjectId;
  courseId: mongoose.Types.ObjectId;
  type: TeamRequestType;
  fromUserId: mongoose.Types.ObjectId;
  toUserId: mongoose.Types.ObjectId;
  message: string;
  status: TeamRequestStatus;
  respondedBy?: mongoose.Types.ObjectId | null;
  respondedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IMatchResultEntry {
  candidateId: mongoose.Types.ObjectId;
  rank: number;
  scores: {
    S: number;
    I: number;
    A: number;
    C: number;
    matchScore: number;
  };
  matchedSkills: string[];
  complementarySkills: string[];
  overlapMinutes: number;
  explanation: string;
  status: MatchCandidateActionStatus;
}

export interface ITeamMatchRequest extends Document {
  requesterId: mongoose.Types.ObjectId;
  courseId: mongoose.Types.ObjectId;
  teamId?: mongoose.Types.ObjectId | null;
  title: string;
  description: string;
  requiredSkills: Array<{
    name: string;
    normalizedName: string;
    importance: 1 | 2 | 3 | 4 | 5;
  }>;
  desiredTeamSize: number;
  timeConstraints: AvailabilitySlot[];
  optionalInterests: string[];
  hardConstraints: {
    strictTimeOverlap: boolean;
    sameBatchOnly: boolean;
    minSkillLevel: number;
    requiredDays: DayOfWeek[];
  };
  status: MatchRequestStatus;
  modelVersion: string;
  weightsSnapshot: {
    skills: number;
    interests: number;
    availability: number;
    complementary: number;
  };
  candidatePoolSize: number;
  hardFilteredCount: number;
  results: IMatchResultEntry[];
  errorMessage?: string | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const availabilitySlotSchema = new Schema<AvailabilitySlot>(
  {
    day: { type: String, enum: [...DAYS_OF_WEEK], required: true },
    from: { type: String, required: true },
    to: { type: String, required: true },
  },
  { _id: false }
);

const teamSchema = new Schema<ITeam>(
  {
    courseId: {
      type: Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    description: {
      type: String,
      default: '',
      trim: true,
      maxlength: 1000,
    },
    maxSize: {
      type: Number,
      required: true,
      min: 2,
      max: 10,
      default: 4,
    },
    leaderId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    memberIds: {
      type: [Schema.Types.ObjectId],
      ref: 'User',
      default: [],
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(TeamStatus),
      default: TeamStatus.OPEN,
      index: true,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  {
    collection: 'teams',
    timestamps: true,
  }
);

teamSchema.index({ courseId: 1, deletedAt: 1, createdAt: -1 });

const teamRequestSchema = new Schema<ITeamRequest>(
  {
    teamId: {
      type: Schema.Types.ObjectId,
      ref: 'Team',
      required: true,
      index: true,
    },
    courseId: {
      type: Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: Object.values(TeamRequestType),
      required: true,
    },
    fromUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    toUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    message: {
      type: String,
      default: '',
      trim: true,
      maxlength: 500,
    },
    status: {
      type: String,
      enum: Object.values(TeamRequestStatus),
      default: TeamRequestStatus.PENDING,
      index: true,
    },
    respondedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    respondedAt: {
      type: Date,
      default: null,
    },
  },
  {
    collection: 'teamRequests',
    timestamps: true,
  }
);

teamRequestSchema.index({ toUserId: 1, status: 1, createdAt: -1 });
teamRequestSchema.index({ fromUserId: 1, status: 1, createdAt: -1 });

const matchResultEntrySchema = new Schema<IMatchResultEntry>(
  {
    candidateId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    rank: { type: Number, required: true, min: 1 },
    scores: {
      S: { type: Number, required: true },
      I: { type: Number, required: true },
      A: { type: Number, required: true },
      C: { type: Number, required: true },
      matchScore: { type: Number, required: true },
    },
    matchedSkills: { type: [String], default: [] },
    complementarySkills: { type: [String], default: [] },
    overlapMinutes: { type: Number, default: 0 },
    explanation: { type: String, default: '' },
    status: {
      type: String,
      enum: Object.values(MatchCandidateActionStatus),
      default: MatchCandidateActionStatus.PENDING,
    },
  },
  { _id: false }
);

const teamMatchRequestSchema = new Schema<ITeamMatchRequest>(
  {
    requesterId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    courseId: {
      type: Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
      index: true,
    },
    teamId: {
      type: Schema.Types.ObjectId,
      ref: 'Team',
      default: null,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
    requiredSkills: {
      type: [
        {
          name: { type: String, required: true },
          normalizedName: { type: String, required: true },
          importance: { type: Number, min: 1, max: 5, required: true },
        },
      ],
      required: true,
    },
    desiredTeamSize: {
      type: Number,
      required: true,
      min: 2,
      max: 10,
      default: 4,
    },
    timeConstraints: {
      type: [availabilitySlotSchema],
      default: [],
    },
    optionalInterests: {
      type: [String],
      default: [],
    },
    hardConstraints: {
      strictTimeOverlap: { type: Boolean, default: false },
      sameBatchOnly: { type: Boolean, default: false },
      minSkillLevel: { type: Number, min: 0, max: 5, default: 0 },
      requiredDays: {
        type: [String],
        enum: [...DAYS_OF_WEEK],
        default: [],
      },
    },
    status: {
      type: String,
      enum: Object.values(MatchRequestStatus),
      default: MatchRequestStatus.QUEUED,
      index: true,
    },
    modelVersion: {
      type: String,
      required: true,
    },
    weightsSnapshot: {
      skills: { type: Number, required: true },
      interests: { type: Number, required: true },
      availability: { type: Number, required: true },
      complementary: { type: Number, required: true },
    },
    candidatePoolSize: { type: Number, default: 0 },
    hardFilteredCount: { type: Number, default: 0 },
    results: {
      type: [matchResultEntrySchema],
      default: [],
    },
    errorMessage: { type: String, default: null },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  {
    collection: 'teamMatchRequests',
    timestamps: true,
  }
);

teamMatchRequestSchema.index({ requesterId: 1, createdAt: -1 });

export const TeamModel: mongoose.Model<ITeam> =
  (mongoose.models.Team as mongoose.Model<ITeam>) ||
  mongoose.model<ITeam>('Team', teamSchema);

export const TeamRequestModel: mongoose.Model<ITeamRequest> =
  (mongoose.models.TeamRequest as mongoose.Model<ITeamRequest>) ||
  mongoose.model<ITeamRequest>('TeamRequest', teamRequestSchema);

export const TeamMatchRequestModel: mongoose.Model<ITeamMatchRequest> =
  (mongoose.models.TeamMatchRequest as mongoose.Model<ITeamMatchRequest>) ||
  mongoose.model<ITeamMatchRequest>('TeamMatchRequest', teamMatchRequestSchema);
