import mongoose, { Schema, type Document, type Types } from 'mongoose';
import { NotificationType } from '../../../shared/types.ts';

export interface INotification extends Document {
  userId: Types.ObjectId;
  type: NotificationType;
  title: string;
  message: string;
  courseId?: Types.ObjectId | null;
  link: string;
  readAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: {
      type: String,
      enum: Object.values(NotificationType),
      required: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 180 },
    message: { type: String, required: true, trim: true, maxlength: 400 },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', default: null },
    link: { type: String, required: true, trim: true, maxlength: 300 },
    readAt: { type: Date, default: null },
  },
  {
    collection: 'notifications',
    timestamps: true,
  }
);

notificationSchema.index({ userId: 1, readAt: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, createdAt: -1 });

export const NotificationModel: mongoose.Model<INotification> =
  (mongoose.models.Notification as mongoose.Model<INotification>) ||
  mongoose.model<INotification>('Notification', notificationSchema);
