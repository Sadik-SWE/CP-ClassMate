import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/auth/LoginPage';
import { RegisterPage } from './pages/auth/RegisterPage';
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/auth/ResetPasswordPage';
import { StudentDashboard } from './pages/dashboard/StudentDashboard';
import { CRDashboard } from './pages/dashboard/CRDashboard';
import { FacultyDashboard } from './pages/dashboard/FacultyDashboard';
import { AdminDashboard } from './pages/dashboard/AdminDashboard';
import { AdminUsersPage } from './pages/admin/AdminUsersPage';
import { AdminCoursesPage } from './pages/admin/AdminCoursesPage';
import { AdminAuditLogsPage } from './pages/admin/AdminAuditLogsPage';
import { ProfilePage } from './pages/profile/ProfilePage';
import { CourseDetailPage } from './pages/courses/CourseDetailPage';
import { CollaborationPage } from './pages/collaboration/CollaborationPage';
import { QuizzesPage } from './pages/quizzes/QuizzesPage';
import { StudyAssistantPage } from './pages/ai/StudyAssistantPage';
import type { EffectiveRole } from './shared/types';

function FullPageLoader() {
  return (
    <div className="min-h-screen bg-[#F3F6FB] flex items-center justify-center p-6">
      <div className="text-center space-y-2">
        <p className="font-display text-lg font-bold text-[#162B4D]">ClassMate</p>
        <p className="text-sm text-slate-500">Restoring your academic session...</p>
      </div>
    </div>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <FullPageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RequireRole({
  allowed,
  children,
}: {
  allowed: EffectiveRole[];
  children: React.ReactNode;
}) {
  const { user, loading, effectiveRole, dashboardPath } = useAuth();
  if (loading) return <FullPageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (!effectiveRole || !allowed.includes(effectiveRole)) {
    return <Navigate to={dashboardPath} replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />

            {/* Student & CR */}
            <Route
              path="/student"
              element={
                <RequireRole allowed={['STUDENT', 'CR']}>
                  <StudentDashboard />
                </RequireRole>
              }
            />
            <Route
              path="/cr"
              element={
                <RequireRole allowed={['CR']}>
                  <CRDashboard />
                </RequireRole>
              }
            />

            {/* Faculty */}
            <Route
              path="/faculty"
              element={
                <RequireRole allowed={['FACULTY']}>
                  <FacultyDashboard />
                </RequireRole>
              }
            />

            {/* Admin */}
            <Route
              path="/admin"
              element={
                <RequireRole allowed={['ADMIN']}>
                  <AdminDashboard />
                </RequireRole>
              }
            />
            <Route
              path="/admin/users"
              element={
                <RequireRole allowed={['ADMIN']}>
                  <AdminUsersPage />
                </RequireRole>
              }
            />
            <Route
              path="/admin/courses"
              element={
                <RequireRole allowed={['ADMIN']}>
                  <AdminCoursesPage />
                </RequireRole>
              }
            />
            <Route
              path="/admin/audit-logs"
              element={
                <RequireRole allowed={['ADMIN']}>
                  <AdminAuditLogsPage />
                </RequireRole>
              }
            />

            {/* Shared authenticated routes */}
            <Route
              path="/courses/:courseId"
              element={
                <RequireAuth>
                  <CourseDetailPage />
                </RequireAuth>
              }
            />
            <Route
              path="/collaboration"
              element={
                <RequireRole allowed={['STUDENT', 'CR', 'ADMIN']}>
                  <CollaborationPage />
                </RequireRole>
              }
            />
            <Route
              path="/quizzes"
              element={
                <RequireAuth>
                  <QuizzesPage />
                </RequireAuth>
              }
            />
            <Route
              path="/study-assistant"
              element={
                <RequireAuth>
                  <StudyAssistantPage />
                </RequireAuth>
              }
            />
            <Route
              path="/profile"
              element={
                <RequireAuth>
                  <ProfilePage />
                </RequireAuth>
              }
            />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ToastProvider>
  );
}
