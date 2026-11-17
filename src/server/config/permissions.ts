import type { UserRole } from '../../shared/types.ts';

export const Permission = {
  USER_READ_SELF: 'user:read_self',
  USER_UPDATE_SELF: 'user:update_self',
  COURSE_VIEW_ENROLLED: 'course:view_enrolled',
  COURSE_VIEW_ALL: 'course:view_all',
  RESOURCE_READ: 'resource:read',
  RESOURCE_MANAGE_COURSE: 'resource:manage_course',
  ANNOUNCEMENT_READ: 'announcement:read',
  ANNOUNCEMENT_MANAGE_COURSE: 'announcement:manage_course',
  PRESENTATION_READ: 'presentation:read',
  PRESENTATION_COORDINATE_CR: 'presentation:coordinate_cr',
  PRESENTATION_ASSIGN_FACULTY: 'presentation:assign_faculty',
  QUIZ_PRACTICE: 'quiz:practice',
  QUIZ_CONTRIBUTE: 'quiz:contribute',
  QUIZ_MANAGE_CR: 'quiz:manage_cr',
  QUIZ_REVIEW_FACULTY: 'quiz:review_faculty',
  TEAM_COLLABORATE: 'team:collaborate',
  AI_STUDY_USE: 'ai:study_use',
  AI_PRESENTATION_USE: 'ai:presentation_use',
  ADMIN_USERS_MANAGE: 'admin:users_manage',
  ADMIN_COURSES_MANAGE: 'admin:courses_manage',
  ADMIN_AUDIT_READ: 'admin:audit_read',
  ADMIN_STATS_READ: 'admin:stats_read',
  ADMIN_MATCHING_EXPORT: 'admin:matching_export',
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];

const STUDENT_PERMISSIONS: Permission[] = [
  Permission.USER_READ_SELF,
  Permission.USER_UPDATE_SELF,
  Permission.COURSE_VIEW_ENROLLED,
  Permission.RESOURCE_READ,
  Permission.ANNOUNCEMENT_READ,
  Permission.PRESENTATION_READ,
  Permission.QUIZ_PRACTICE,
  Permission.QUIZ_CONTRIBUTE,
  Permission.TEAM_COLLABORATE,
  Permission.AI_STUDY_USE,
];

const CR_COURSE_PERMISSIONS: Permission[] = [
  Permission.RESOURCE_MANAGE_COURSE,
  Permission.ANNOUNCEMENT_MANAGE_COURSE,
  Permission.PRESENTATION_COORDINATE_CR,
  Permission.QUIZ_MANAGE_CR,
  Permission.AI_PRESENTATION_USE,
];

const FACULTY_PERMISSIONS: Permission[] = [
  Permission.USER_READ_SELF,
  Permission.USER_UPDATE_SELF,
  Permission.COURSE_VIEW_ENROLLED,
  Permission.RESOURCE_READ,
  Permission.RESOURCE_MANAGE_COURSE,
  Permission.ANNOUNCEMENT_READ,
  Permission.ANNOUNCEMENT_MANAGE_COURSE,
  Permission.PRESENTATION_READ,
  Permission.PRESENTATION_COORDINATE_CR,
  Permission.PRESENTATION_ASSIGN_FACULTY,
  Permission.QUIZ_PRACTICE,
  Permission.QUIZ_CONTRIBUTE,
  Permission.QUIZ_REVIEW_FACULTY,
  Permission.AI_STUDY_USE,
  Permission.AI_PRESENTATION_USE,
];

const ADMIN_PERMISSIONS: Permission[] = [
  ...Object.values(Permission),
];

export const ROLE_PERMISSION_MAP: Record<UserRole, Set<Permission>> = {
  STUDENT: new Set(STUDENT_PERMISSIONS),
  FACULTY: new Set(FACULTY_PERMISSIONS),
  ADMIN: new Set(ADMIN_PERMISSIONS),
};

export const CR_EXTRA_PERMISSIONS = new Set<Permission>(CR_COURSE_PERMISSIONS);

export function hasRolePermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSION_MAP[role]?.has(permission) ?? false;
}
