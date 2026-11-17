import mongoose, { Schema, type Document } from 'mongoose';
import { ResourceVisibility, type AiCitationDTO } from '../../../shared/types.ts';

export interface IDocumentChunk extends Document {
  resourceId: mongoose.Types.ObjectId;
  courseId: mongoose.Types.ObjectId;
  visibility: ResourceVisibility;
  fileName: string;
  resourceTitle: string;
  chunkIndex: number;
  pageNumber: number;
  tokenCount: number;
  content: string;
  embedding: number[];
  createdAt: Date;
  updatedAt: Date;
}

const documentChunkSchema = new Schema<IDocumentChunk>(
  {
    resourceId: {
      type: Schema.Types.ObjectId,
      ref: 'Resource',
      required: true,
      index: true,
    },
    courseId: {
      type: Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
      index: true,
    },
    visibility: {
      type: String,
      enum: Object.values(ResourceVisibility),
      default: ResourceVisibility.COURSE,
      required: true,
    },
    fileName: { type: String, required: true, trim: true, maxlength: 220 },
    resourceTitle: { type: String, required: true, trim: true, maxlength: 200 },
    chunkIndex: { type: Number, required: true, min: 0 },
    pageNumber: { type: Number, required: true, min: 1 },
    tokenCount: { type: Number, required: true, min: 1 },
    content: { type: String, required: true, maxlength: 8000 },
    embedding: { type: [Number], required: true },
  },
  {
    collection: 'documentChunks',
    timestamps: true,
  }
);

documentChunkSchema.index({ courseId: 1, visibility: 1, resourceId: 1 });
documentChunkSchema.index({ resourceId: 1, chunkIndex: 1 }, { unique: true });

export const DocumentChunkModel: mongoose.Model<IDocumentChunk> =
  (mongoose.models.DocumentChunk as mongoose.Model<IDocumentChunk>) ||
  mongoose.model<IDocumentChunk>('DocumentChunk', documentChunkSchema);

export interface IAiMessage {
  _id: mongoose.Types.ObjectId;
  role: 'user' | 'assistant';
  content: string;
  citations: AiCitationDTO[];
  insufficientEvidence: boolean;
  createdAt: Date;
}

export interface IAiConversation extends Document {
  userId: mongoose.Types.ObjectId;
  courseId: mongoose.Types.ObjectId;
  resourceId?: mongoose.Types.ObjectId | null;
  title: string;
  messages: IAiMessage[];
  createdAt: Date;
  updatedAt: Date;
}

const aiCitationSchema = new Schema<AiCitationDTO>(
  {
    resourceId: { type: String, required: true },
    fileName: { type: String, required: true },
    resourceTitle: { type: String, required: true },
    pageNumber: { type: Number, required: true, min: 1 },
    excerpt: { type: String, required: true, maxlength: 600 },
    score: { type: Number, required: true },
  },
  { _id: false }
);

const aiMessageSchema = new Schema<IAiMessage>(
  {
    role: { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: String, required: true, maxlength: 16000 },
    citations: { type: [aiCitationSchema], default: [] },
    insufficientEvidence: { type: Boolean, default: false },
    createdAt: { type: Date, default: () => new Date() },
  },
  { _id: true }
);

const aiConversationSchema = new Schema<IAiConversation>(
  {
    userId: {
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
    resourceId: {
      type: Schema.Types.ObjectId,
      ref: 'Resource',
      default: null,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 140,
    },
    messages: { type: [aiMessageSchema], default: [] },
  },
  {
    collection: 'aiConversations',
    timestamps: true,
  }
);

aiConversationSchema.index({ userId: 1, updatedAt: -1 });

export const AiConversationModel: mongoose.Model<IAiConversation> =
  (mongoose.models.AiConversation as mongoose.Model<IAiConversation>) ||
  mongoose.model<IAiConversation>('AiConversation', aiConversationSchema);

export interface IAiUsageLog extends Document {
  userId: mongoose.Types.ObjectId;
  dateKey: string;
  count: number;
  lastAction: string;
  createdAt: Date;
  updatedAt: Date;
}

const aiUsageLogSchema = new Schema<IAiUsageLog>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    dateKey: { type: String, required: true, maxlength: 16 },
    count: { type: Number, required: true, default: 0, min: 0 },
    lastAction: { type: String, default: '', maxlength: 80 },
  },
  {
    collection: 'aiUsageLogs',
    timestamps: true,
  }
);

aiUsageLogSchema.index({ userId: 1, dateKey: 1 }, { unique: true });

export const AiUsageLogModel: mongoose.Model<IAiUsageLog> =
  (mongoose.models.AiUsageLog as mongoose.Model<IAiUsageLog>) ||
  mongoose.model<IAiUsageLog>('AiUsageLog', aiUsageLogSchema);
