import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, Shield, Users, GraduationCap } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { RoleBadge } from '../components/ui/RoleBadge';

const HERO_IMG = '/src/assets/images/hero_campus_collaboration_1794890505329.jpg';
const STUDY_IMG = '/src/assets/images/campus_study_hall_1794890506257.jpg';

export function LandingPage() {
  const { user, dashboardPath } = useAuth();
  const [heroImgFailed, setHeroImgFailed] = useState(false);
  const [studyImgFailed, setStudyImgFailed] = useState(false);

  return (
    <div className="min-h-screen bg-[#F3F6FB] text-[#162B4D] flex flex-col">
      {/* Strict 3-zone Top Bar Contract */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-xs border-b border-slate-200/85">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
          <Link
            to="/"
            className="font-display text-xl font-bold tracking-tight text-[#162B4D] whitespace-nowrap shrink-0"
          >
            ClassMate
          </Link>

          <nav
            aria-label="Primary navigation"
            className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600"
          >
            <a
              href="#roles"
              className="hover:text-[#162B4D] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Academic Roles
            </a>
            <a
              href="#architecture"
              className="hover:text-[#162B4D] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Course Structure
            </a>
            <a
              href="#security"
              className="hover:text-[#162B4D] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Access Control
            </a>
            <Link
              to="/register"
              className="hover:text-[#162B4D] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Create Account
            </Link>
          </nav>

          <div className="flex items-center shrink-0">
            <Link
              to={user ? dashboardPath : '/login'}
              className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-[#2563EB] hover:bg-[#1d4ed8] rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB]"
            >
              {user ? 'Open Dashboard' : 'Sign In'}
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Split */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-20">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-stretch">
            <div className="lg:col-span-6 flex flex-col justify-center">
              <p className="text-xs font-semibold tracking-wide text-[#1D9BA6] mb-3">
                University Academic Workspace
              </p>
              <h1
                className="font-display font-bold tracking-tight text-[#162B4D] leading-[1.12] mb-5"
                style={{ fontSize: 'clamp(2.25rem, 4vw, 3.35rem)', textWrap: 'balance' }}
              >
                Course-scoped collaboration for students, class reps, and faculty
              </h1>
              <p className="text-base sm:text-lg text-slate-600 leading-relaxed max-w-xl mb-8">
                ClassMate organizes university courses, verified enrollments, structured
                student skill profiles, and role-governed academic workflows in one unified
                campus platform.
              </p>

              <div className="flex flex-wrap items-center gap-4">
                <Link
                  to={user ? dashboardPath : '/register'}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-[#2563EB] hover:bg-[#1d4ed8] text-white text-sm font-semibold transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB]"
                >
                  {user ? 'Go to Dashboard' : 'Register Academic Account'}
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </Link>
                {!user && (
                  <Link
                    to="/login"
                    className="inline-flex items-center px-5 py-3 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-[#162B4D] text-sm font-semibold transition-colors whitespace-nowrap shrink-0"
                  >
                    Sign In to Portal
                  </Link>
                )}
              </div>
            </div>

            <div className="lg:col-span-6">
              <div className="h-full min-h-[280px] rounded-2xl overflow-hidden border border-slate-200 bg-white">
                {!heroImgFailed ? (
                  <img
                    src={HERO_IMG}
                    alt="University students and faculty collaborating around a seminar table in a sunlit study hall"
                    referrerPolicy="no-referrer"
                    onError={() => setHeroImgFailed(true)}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full min-h-[320px] bg-gradient-to-br from-[#2563EB]/10 via-[#1D9BA6]/10 to-[#6D5BD0]/10 flex flex-col items-center justify-center p-8 text-center">
                    <GraduationCap className="w-12 h-12 text-[#2563EB] mb-3" />
                    <p className="font-display font-semibold text-[#162B4D]">
                      ClassMate Campus Commons
                    </p>
                    <p className="text-sm text-slate-600 mt-1">
                      Structured academic collaboration across departments and semesters
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 4-column role summary strip placed below hero split */}
          <div id="roles" className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-xl bg-white border border-slate-200/85 p-5">
              <div className="flex items-center justify-between mb-3">
                <RoleBadge role="STUDENT" />
                <span className="text-xs font-mono text-slate-500">01</span>
              </div>
              <h2 className="font-display text-base font-semibold text-[#162B4D] mb-1.5">
                Students
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                View enrolled courses, manage skill proficiencies, interests, and weekly
                study availability.
              </p>
            </div>

            <div className="rounded-xl bg-white border border-slate-200/85 p-5">
              <div className="flex items-center justify-between mb-3">
                <RoleBadge role="CR" />
                <span className="text-xs font-mono text-slate-500">02</span>
              </div>
              <h2 className="font-display text-base font-semibold text-[#162B4D] mb-1.5">
                Class Representatives
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                Course-scoped representatives assigned by administrators to coordinate
                specific sections.
              </p>
            </div>

            <div className="rounded-xl bg-white border border-slate-200/85 p-5">
              <div className="flex items-center justify-between mb-3">
                <RoleBadge role="FACULTY" />
                <span className="text-xs font-mono text-slate-500">03</span>
              </div>
              <h2 className="font-display text-base font-semibold text-[#162B4D] mb-1.5">
                Faculty Members
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                Manage assigned courses, review student rosters, and oversee academic
                delivery after admin verification.
              </p>
            </div>

            <div className="rounded-xl bg-white border border-slate-200/85 p-5">
              <div className="flex items-center justify-between mb-3">
                <RoleBadge role="ADMIN" />
                <span className="text-xs font-mono text-slate-500">04</span>
              </div>
              <h2 className="font-display text-base font-semibold text-[#162B4D] mb-1.5">
                Administrators
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                Approve faculty accounts, assign course CRs, manage enrollments, and inspect
                system audit logs.
              </p>
            </div>
          </div>
        </section>

        {/* Course Architecture & Access Control */}
        <section
          id="architecture"
          className="border-t border-slate-200/80 bg-white py-14 lg:py-20"
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            <div className="lg:col-span-5">
              <div className="rounded-2xl overflow-hidden border border-slate-200">
                {!studyImgFailed ? (
                  <img
                    src={STUDY_IMG}
                    alt="Quiet university study alcove with oak desk and academic textbooks"
                    referrerPolicy="no-referrer"
                    onError={() => setStudyImgFailed(true)}
                    className="w-full h-full object-cover aspect-[4/3]"
                  />
                ) : (
                  <div className="aspect-[4/3] bg-[#F3F6FB] flex items-center justify-center p-8">
                    <BookOpen className="w-12 h-12 text-[#1D9BA6]" />
                  </div>
                )}
              </div>
            </div>

            <div className="lg:col-span-7 space-y-6" id="security">
              <div>
                <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#162B4D] mb-3">
                  Built on verified course relationships and strict access governance
                </h2>
                <p className="text-slate-600 leading-relaxed">
                  Every API request in ClassMate validates both platform role permissions and
                  exact course scope on the server before returning student or course records.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div className="p-4 rounded-xl bg-[#F3F6FB] border border-slate-200/70">
                  <div className="flex items-center gap-2 text-sm font-semibold text-[#162B4D] mb-1">
                    <Shield className="w-4 h-4 text-[#2563EB]" aria-hidden="true" />
                    Rotating Session Security
                  </div>
                  <p className="text-sm text-slate-600">
                    15-minute access tokens paired with hashed httpOnly refresh cookies and
                    automatic token reuse detection.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-[#F3F6FB] border border-slate-200/70">
                  <div className="flex items-center gap-2 text-sm font-semibold text-[#162B4D] mb-1">
                    <Users className="w-4 h-4 text-[#1D9BA6]" aria-hidden="true" />
                    Course-Scoped CR Authority
                  </div>
                  <p className="text-sm text-slate-600">
                    Class Representatives hold standard student accounts with elevated
                    coordination privileges strictly for assigned courses.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200/80 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-slate-600">
          <span className="font-display font-semibold text-[#162B4D]">ClassMate</span>
          <div className="flex items-center gap-6">
            <Link to="/login" className="hover:text-[#162B4D]">
              Sign In
            </Link>
            <Link to="/register" className="hover:text-[#162B4D]">
              Register
            </Link>
            <Link to="/forgot-password" className="hover:text-[#162B4D]">
              Reset Password
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
