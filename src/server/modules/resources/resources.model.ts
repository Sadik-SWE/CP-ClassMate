import mongoose, { Schema, type Document, type Types } from 'mongoose';
import {
  ResourceStatus,
  ResourceType,
  ResourceVisibility,
} from '../../../shared/types.ts';

export interface IResource extends Document {
  courseId: Types.ObjectId;
  title: string;
  description: string;
  type: ResourceType;
  visibility: ResourceVisibility;
  file: {
    storageKey: string;
    gridFsId?: Types.ObjectId | null;
    originalName: string;
    mimeType: string;
    size: number;
  };
  extractedText?: string;
  pageCount?: number | null;
  chunkCount?: number;
  ingestionError?: string | null;
  uploadedBy: Types.ObjectId;
  status: ResourceStatus;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const resourceSchema = new Schema<IResource>(
  {
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
    title: { type: String, required: true, trim: true, minlength: 2, maxlength: 180 },
    description: { type: String, default: '', maxlength: 1000 },
    type: {
      type: String,
      enum: Object.values(ResourceType),
      default: ResourceType.NOTES,
      required: true,
    },
    visibility: {
      type: String,
      enum: Object.values(ResourceVisibility),
      default: ResourceVisibility.COURSE,
      required: true,
    },
    file: {
      storageKey: { type: String, required: true, unique: true },
      gridFsId: { type: Schema.Types.ObjectId, default: null },
      originalName: { type: String, required: true, maxlength: 200 },
      mimeType: { type: String, required: true, maxlength: 160 },
      size: { type: Number, required: true, min: 1 },
    },
    extractedText: { type: String, default: '', select: false },
    pageCount: { type: Number, default: null },
    chunkCount: { type: Number, default: 0, min: 0 },
    ingestionError: { type: String, default: null, maxlength: 1000 },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: {
      type: String,
      enum: Object.values(ResourceStatus),
      default: ResourceStatus.PROCESSING,
      required: true,
    },
    deletedAt: { type: Date, default: null },
  },
  {
    collection: 'resources',
    timestamps: true,
  }
);

resourceSchema.index({ courseId: 1, createdAt: -1 });
resourceSchema.index({ courseId: 1, visibility: 1, status: 1 });

export const ResourceModel: mongoose.Model<IResource> =
  (mongoose.models.Resource as mongoose.Model<IResource>) ||
  mongoose.model<IResource>('Resource', resourceSchema);
