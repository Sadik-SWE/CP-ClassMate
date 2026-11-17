import mongoose, { Schema, type Document, type Types } from 'mongoose';
import { CourseStatus, EnrollmentStatus } from '../../../shared/types.ts';

export interface ICourse extends Document {
  courseCode: string;
  courseName: string;
  department: string;
  semester: string;
  facultyIds: Types.ObjectId[];
  crUserIds: Types.ObjectId[];
  status: CourseStatus;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const courseSchema = new Schema<ICourse>(
  {
    courseCode: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      maxlength: 24,
    },
    courseName: { type: String, required: true, trim: true, maxlength: 160 },
    department: { type: String, required: true, trim: true, maxlength: 100 },
    semester: { type: String, required: true, trim: true, maxlength: 60 },
    facultyIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    crUserIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    status: {
      type: String,
      enum: Object.values(CourseStatus),
      default: CourseStatus.ACTIVE,
      required: true,
    },
    deletedAt: { type: Date, default: null },
  },
  {
    collection: 'courses',
    timestamps: true,
  }
);

courseSchema.index({ department: 1, semester: 1 });
courseSchema.index({ facultyIds: 1 });
courseSchema.index({ crUserIds: 1 });
courseSchema.index({ status: 1 });

export const CourseModel: mongoose.Model<ICourse> =
  (mongoose.models.Course as mongoose.Model<ICourse>) ||
  mongoose.model<ICourse>('Course', courseSchema);

export interface ICourseEnrollment extends Document {
  courseId: Types.ObjectId;
  userId: Types.ObjectId;
  status: EnrollmentStatus;
  createdAt: Date;
  updatedAt: Date;
}

const courseEnrollmentSchema = new Schema<ICourseEnrollment>(
  {
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: {
      type: String,
      enum: Object.values(EnrollmentStatus),
      default: EnrollmentStatus.ACTIVE,
      required: true,
    },
  },
  {
    collection: 'courseEnrollments',
    timestamps: true,
  }
);

courseEnrollmentSchema.index({ courseId: 1, userId: 1 }, { unique: true });
courseEnrollmentSchema.index({ userId: 1, status: 1 });

export const CourseEnrollmentModel: mongoose.Model<ICourseEnrollment> =
  (mongoose.models.CourseEnrollment as mongoose.Model<ICourseEnrollment>) ||
  mongoose.model<ICourseEnrollment>('CourseEnrollment', courseEnrollmentSchema);
