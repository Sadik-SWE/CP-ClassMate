import mongoose, { Schema, type Document } from 'mongoose';
import {
  PresentationAssigneeType,
  PresentationStatus,
} from '../../../shared/types.ts';

export interface IPresentationAiBrief {
  explanation: string;
  subtopics: string[];
  outline: Array<{ section: string; keyPoints: string[] }>;
  discussionPoints: string[];
  possibleQuestions: Array<{ question: string; suggestedAnswer: string }>;
  conclusion: string;
  savedAt: Date;
  savedBy: mongoose.Types.ObjectId;
  savedByName: string;
}

export interface IPresentationTopic extends Document {
  courseId: mongoose.Types.ObjectId;
  title: string;
  description: string;
  dueDate: Date;
  assigneeType: PresentationAssigneeType;
  assigneeUserId?: mongoose.Types.ObjectId | null;
  assigneeLabel?: string | null;
  coordinationNotes: string;
  presentationSlot: string;
  aiBrief?: IPresentationAiBrief | null;
  createdBy: mongoose.Types.ObjectId;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IPresentationProgress extends Document {
  topicId: mongoose.Types.ObjectId;
  courseId: mongoose.Types.ObjectId;
  status: PresentationStatus;
  facultyNotes: string;
  updatedBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const presentationAiOutlineSchema = new Schema(
  {
    section: { type: String, required: true, trim: true, maxlength: 250 },
    keyPoints: { type: [String], default: [] },
  },
  { _id: false }
);

const presentationAiQuestionSchema = new Schema(
  {
    question: { type: String, required: true, trim: true, maxlength: 500 },
    suggestedAnswer: { type: String, required: true, trim: true, maxlength: 1500 },
  },
  { _id: false }
);

const presentationAiBriefSchema = new Schema<IPresentationAiBrief>(
  {
    explanation: { type: String, required: true, trim: true, maxlength: 4000 },
    subtopics: { type: [String], default: [] },
    outline: { type: [presentationAiOutlineSchema], default: [] },
    discussionPoints: { type: [String], default: [] },
    possibleQuestions: { type: [presentationAiQuestionSchema], default: [] },
    conclusion: { type: String, required: true, trim: true, maxlength: 2000 },
    savedAt: { type: Date, required: true },
    savedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    savedByName: { type: String, required: true, trim: true, maxlength: 120 },
  },
  { _id: false }
);

const presentationTopicSchema = new Schema<IPresentationTopic>(
  {
    courseId: {
      type: Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 3000,
    },
    dueDate: {
      type: Date,
      required: true,
      index: true,
    },
    assigneeType: {
      type: String,
      enum: Object.values(PresentationAssigneeType),
      required: true,
    },
    assigneeUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    assigneeLabel: {
      type: String,
      trim: true,
      maxlength: 120,
      default: null,
    },
    coordinationNotes: {
      type: String,
      default: '',
      trim: true,
      maxlength: 1500,
    },
    presentationSlot: {
      type: String,
      default: '',
      trim: true,
      maxlength: 160,
    },
    aiBrief: {
      type: presentationAiBriefSchema,
      default: null,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  {
    collection: 'presentationTopics',
    timestamps: true,
  }
);

presentationTopicSchema.index({ courseId: 1, deletedAt: 1, dueDate: 1 });

const presentationProgressSchema = new Schema<IPresentationProgress>(
  {
    topicId: {
      type: Schema.Types.ObjectId,
      ref: 'PresentationTopic',
      required: true,
      unique: true,
    },
    courseId: {
      type: Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(PresentationStatus),
      default: PresentationStatus.ASSIGNED,
      index: true,
    },
    facultyNotes: {
      type: String,
      default: '',
      trim: true,
      maxlength: 1500,
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    collection: 'presentationProgress',
    timestamps: true,
  }
);

export const PresentationTopicModel: mongoose.Model<IPresentationTopic> =
  (mongoose.models.PresentationTopic as mongoose.Model<IPresentationTopic>) ||
  mongoose.model<IPresentationTopic>(
    'PresentationTopic',
    presentationTopicSchema
  );

export const PresentationProgressModel: mongoose.Model<IPresentationProgress> =
  (mongoose.models
    .PresentationProgress as mongoose.Model<IPresentationProgress>) ||
  mongoose.model<IPresentationProgress>(
    'PresentationProgress',
    presentationProgressSchema
  );
