import mongoose, { Schema, type Document, type Types } from 'mongoose';
import {
  AnnouncementScope,
  AnnouncementStatus,
} from '../../../shared/types.ts';

export interface IAnnouncement extends Document {
  title: string;
  content: string;
  scope: AnnouncementScope;
  courseId?: Types.ObjectId | null;
  targetCourseIds: Types.ObjectId[];
  pinned: boolean;
  status: AnnouncementStatus;
  authorId: Types.ObjectId;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const announcementSchema = new Schema<IAnnouncement>(
  {
    title: { type: String, required: true, trim: true, minlength: 2, maxlength: 180 },
    content: { type: String, required: true, trim: true, minlength: 2, maxlength: 5000 },
    scope: {
      type: String,
      enum: Object.values(AnnouncementScope),
      default: AnnouncementScope.COURSE,
      required: true,
    },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', default: null },
    targetCourseIds: [{ type: Schema.Types.ObjectId, ref: 'Course' }],
    pinned: { type: Boolean, default: false },
    status: {
      type: String,
      enum: Object.values(AnnouncementStatus),
      default: AnnouncementStatus.PUBLISHED,
      required: true,
    },
    authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    deletedAt: { type: Date, default: null },
  },
  {
    collection: 'announcements',
    timestamps: true,
  }
);

announcementSchema.index({ courseId: 1, pinned: -1, createdAt: -1 });
announcementSchema.index({ targetCourseIds: 1, pinned: -1, createdAt: -1 });
announcementSchema.index({ status: 1, createdAt: -1 });

export const AnnouncementModel: mongoose.Model<IAnnouncement> =
  (mongoose.models.Announcement as mongoose.Model<IAnnouncement>) ||
  mongoose.model<IAnnouncement>('Announcement', announcementSchema);
