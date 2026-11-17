import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Check,
  Clock,
  LogOut,
  Plus,
  Search,
  Send,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  ApiClientError,
  collaborationApi,
  coursesApi,
} from '../../services/api';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { ConfirmModal } from '../../components/ui/ConfirmModal';
import { EmptyState } from '../../components/ui/EmptyState';
import { CardSkeleton } from '../../components/ui/Skeleton';
import {
  DAYS_OF_WEEK,
  MatchCandidateActionStatus,
  MatchRequestStatus,
  TeamRequestStatus,
  TeamRequestType,
  TeamStatus,
  type AvailabilitySlot,
  type ClassmateDTO,
  type CourseDTO,
  type DayOfWeek,
  type PaginationMeta,
  type TeamDTO,
  type TeamMatchRequestDTO,
  type TeamRequestDTO,
} from '../../shared/types';

type CollabTab = 'discover' | 'teams' | 'matching';
const VALID_TABS: CollabTab[] = ['discover', 'teams', 'matching'];

function ScoreBar({
  label,
  weightLabel,
  score,
  colorClass,
}: {
  label: string;
  weightLabel: string;
  score: number;
  colorClass: string;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="font-medium text-[#162B4D]">
          {label} <span className="text-slate-400">({weightLabel})</span>
        </span>
        <span className="font-mono font-semibold text-[#162B4D] tabular-nums">
          {clamped}/100
        </span>
      </div>
      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${colorClass}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

export function CollaborationPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const rawTab = searchParams.get('tab') as CollabTab | null;
  const activeTab: CollabTab =
    rawTab && VALID_TABS.includes(rawTab) ? rawTab : 'discover';

  const setTab = (tab: CollabTab) => {
    setSearchParams({ tab }, { replace: true });
  };

  const [myCourses, setMyCourses] = useState<CourseDTO[]>([]);

  // Tab 1: Classmate Discovery
  const [classmates, setClassmates] = useState<ClassmateDTO[]>([]);
  const [discMeta, setDiscMeta] = useState<PaginationMeta | null>(null);
  const [discPage, setDiscPage] = useState(1);
  const [discCourseId, setDiscCourseId] = useState('');
  const [discSearch, setDiscSearch] = useState('');
  const [discSkill, setDiscSkill] = useState('');
  const [discDay, setDiscDay] = useState<DayOfWeek | ''>('');
  const [discLoading, setDiscLoading] = useState(false);

  // Invite Classmate Modal (from Discovery or Matching)
  const [inviteModalTarget, setInviteModalTarget] =
    useState<ClassmateDTO | null>(null);
  const [inviteTeamId, setInviteTeamId] = useState('');
  const [inviteMessage, setInviteMessage] = useState('');
  const [inviting, setInviting] = useState(false);

  // Tab 2: Teams & Requests
  const [teams, setTeams] = useState<TeamDTO[]>([]);
  const [myTeams, setMyTeams] = useState<TeamDTO[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [teamCourseFilter, setTeamCourseFilter] = useState('');
  const [mineOnly, setMineOnly] = useState(false);
  const [teamsRefreshKey, setTeamsRefreshKey] = useState(0);

  const [incomingReqs, setIncomingReqs] = useState<TeamRequestDTO[]>([]);
  const [outgoingReqs, setOutgoingReqs] = useState<TeamRequestDTO[]>([]);
  const [respondingReqId, setRespondingReqId] = useState<string | null>(null);

  // Create Team Modal
  const [createTeamOpen, setCreateTeamOpen] = useState(false);
  const [teamCourseId, setTeamCourseId] = useState('');
  const [teamName, setTeamName] = useState('');
  const [teamDesc, setTeamDesc] = useState('');
  const [teamMaxSize, setTeamMaxSize] = useState(4);
  const [creatingTeam, setCreatingTeam] = useState(false);

  // Join Team Modal
  const [joinTargetTeam, setJoinTargetTeam] = useState<TeamDTO | null>(null);
  const [joinMessage, setJoinMessage] = useState('');
  const [joiningTeam, setJoiningTeam] = useState(false);

  // Leave Team Confirm
  const [leaveTargetTeam, setLeaveTargetTeam] = useState<TeamDTO | null>(null);
  const [leavingTeam, setLeavingTeam] = useState(false);

  // Tab 3: AI Team Matching
  const [matchHistory, setMatchHistory] = useState<TeamMatchRequestDTO[]>([]);
  const [activeMatch, setActiveMatch] = useState<TeamMatchRequestDTO | null>(null);
  const [matchCourseId, setMatchCourseId] = useState('');
  const [matchTeamId, setMatchTeamId] = useState('');
  const [matchTitle, setMatchTitle] = useState('');
  const [matchDesc, setMatchDesc] = useState('');
  const [matchTeamSize, setMatchTeamSize] = useState(4);
  const [reqSkills, setReqSkills] = useState<
    Array<{ name: string; importance: number }>
  >([
    { name: 'React', importance: 5 },
    { name: 'Node.js', importance: 4 },
  ]);
  const [newSkillName, setNewSkillName] = useState('');
  const [newSkillImportance, setNewSkillImportance] = useState(4);
  const [interestsText, setInterestsText] = useState('');
  const [timeConstraints, setTimeConstraints] = useState<AvailabilitySlot[]>([]);
  const [slotDay, setSlotDay] = useState<DayOfWeek>('MON');
  const [slotFrom, setSlotFrom] = useState('14:00');
  const [slotTo, setSlotTo] = useState('17:00');
  const [strictTimeOverlap, setStrictTimeOverlap] = useState(false);
  const [sameBatchOnly, setSameBatchOnly] = useState(false);
  const [minSkillLevel, setMinSkillLevel] = useState(0);
  const [requiredDays, setRequiredDays] = useState<DayOfWeek[]>([]);
  const [submittingMatch, setSubmittingMatch] = useState(false);
  const [actingCandidateKey, setActingCandidateKey] = useState<string | null>(
    null
  );
  const [matchInviteTeamMap, setMatchInviteTeamMap] = useState<
    Record<string, string>
  >({});

  // Load caller's courses & teams once
  useEffect(() => {
    let active = true;
    coursesApi
      .listMyCourses({ page: 1, limit: 50 })
      .then((res) => {
        if (!active) return;
        setMyCourses(res.data.courses);
        if (res.data.courses.length > 0) {
          setTeamCourseId((prev) => prev || res.data.courses[0].id);
          setMatchCourseId((prev) => prev || res.data.courses[0].id);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  // Keep user's own teams loaded for inviting from Discovery or Matching
  useEffect(() => {
    let active = true;
    collaborationApi
      .listTeams({ page: 1, limit: 50, mineOnly: true })
      .then((res) => {
        if (!active) return;
        setMyTeams(res.data.teams);
        if (res.data.teams.length > 0) {
          setInviteTeamId((prev) => prev || res.data.teams[0].id);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [teamsRefreshKey]);

  // Discovery tab fetch
  useEffect(() => {
    if (activeTab !== 'discover') return;
    let active = true;
    (async () => {
      await Promise.resolve();
      if (!active) return;
      setDiscLoading(true);
      try {
        const res = await collaborationApi.discoverClassmates({
          page: discPage,
          limit: 8,
          courseId: discCourseId || undefined,
          search: discSearch.trim() || undefined,
          skill: discSkill.trim() || undefined,
          day: discDay,
        });
        if (!active) return;
        setClassmates(res.data.classmates);
        setDiscMeta(res.meta);
      } catch (err) {
        if (!active) return;
        const msg =
          err instanceof ApiClientError
            ? err.message
            : 'Unable to load classmates.';
        showToast(msg, 'error');
      } finally {
        if (active) setDiscLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [activeTab, discPage, discCourseId, discSearch, discSkill, discDay, showToast]);

  // Teams & requests fetch
  useEffect(() => {
    if (activeTab !== 'teams') return;
    let active = true;
    (async () => {
      await Promise.resolve();
      if (!active) return;
      setTeamsLoading(true);
      try {
        const [teamsRes, reqsRes] = await Promise.all([
          collaborationApi.listTeams({
            page: 1,
            limit: 30,
            courseId: teamCourseFilter || undefined,
            mineOnly,
          }),
          collaborationApi.listTeamRequests(),
        ]);
        if (!active) return;
        setTeams(teamsRes.data.teams);
        setIncomingReqs(reqsRes.data.incoming);
        setOutgoingReqs(reqsRes.data.outgoing);
      } catch (err) {
        if (!active) return;
        const msg =
          err instanceof ApiClientError ? err.message : 'Unable to load teams.';
        showToast(msg, 'error');
      } finally {
        if (active) setTeamsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [activeTab, teamCourseFilter, mineOnly, teamsRefreshKey, showToast]);

  // Load match history when Matching tab opens
  useEffect(() => {
    if (activeTab !== 'matching') return;
    let active = true;
    collaborationApi
      .listMatchRequests()
      .then((res) => {
        if (!active) return;
        setMatchHistory(res.data.matchRequests);
        setActiveMatch((prev) => prev || res.data.matchRequests[0] || null);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [activeTab]);

  // Poll active match job while QUEUED or PROCESSING
  const activeMatchId = activeMatch?.id ?? '';
  const activeMatchStatus = activeMatch?.status;
  useEffect(() => {
    if (
      !activeMatchId ||
      (activeMatchStatus !== MatchRequestStatus.QUEUED &&
        activeMatchStatus !== MatchRequestStatus.PROCESSING)
    ) {
      return;
    }

    const timer = window.setInterval(async () => {
      try {
        const res = await collaborationApi.getMatchRequest(activeMatchId);
        const updated = res.data.matchRequest;
        setActiveMatch(updated);
        setMatchHistory((prev) =>
          prev.map((m) => (m.id === updated.id ? updated : m))
        );
        if (updated.status === MatchRequestStatus.COMPLETED) {
          showToast(
            `Found ${updated.results.length} ranked candidate matches.`,
            'success'
          );
        } else if (updated.status === MatchRequestStatus.FAILED) {
          showToast(
            updated.errorMessage || 'Team matching job failed.',
            'error'
          );
        }
      } catch {
        void 0;
      }
    }, 1500);

    return () => window.clearInterval(timer);
  }, [activeMatchId, activeMatchStatus, showToast]);

  const handleOpenInviteModal = (classmate: ClassmateDTO) => {
    const eligibleTeams = myTeams.filter((t) =>
      classmate.sharedCourses.some((sc) => sc.id === t.courseId)
    );
    setInviteModalTarget(classmate);
    setInviteTeamId(eligibleTeams[0]?.id || myTeams[0]?.id || '');
    setInviteMessage('');
  };

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteModalTarget || !inviteTeamId) {
      showToast('Create or join a team in that course before inviting.', 'error');
      return;
    }
    setInviting(true);
    try {
      await collaborationApi.inviteToTeam(inviteTeamId, {
        targetUserId: inviteModalTarget.id,
        message: inviteMessage.trim(),
      });
      showToast(`Invitation sent to ${inviteModalTarget.name}.`, 'success');
      setInviteModalTarget(null);
      setTeamsRefreshKey((k) => k + 1);
    } catch (err) {
      const msg =
        err instanceof ApiClientError ? err.message : 'Could not send invitation.';
      showToast(msg, 'error');
    } finally {
      setInviting(false);
    }
  };

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingTeam(true);
    try {
      await collaborationApi.createTeam({
        courseId: teamCourseId,
        name: teamName.trim(),
        description: teamDesc.trim(),
        maxSize: teamMaxSize,
      });
      showToast('Project team created.', 'success');
      setCreateTeamOpen(false);
      setTeamName('');
      setTeamDesc('');
      setTeamMaxSize(4);
      setTeamsRefreshKey((k) => k + 1);
    } catch (err) {
      const msg =
        err instanceof ApiClientError ? err.message : 'Could not create team.';
      showToast(msg, 'error');
    } finally {
      setCreatingTeam(false);
    }
  };

  const handleJoinRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinTargetTeam) return;
    setJoiningTeam(true);
    try {
      await collaborationApi.requestToJoinTeam(
        joinTargetTeam.id,
        joinMessage.trim()
      );
      showToast(`Join request sent to ${joinTargetTeam.name}.`, 'success');
      setJoinTargetTeam(null);
      setJoinMessage('');
      setTeamsRefreshKey((k) => k + 1);
    } catch (err) {
      const msg =
        err instanceof ApiClientError
          ? err.message
          : 'Could not submit join request.';
      showToast(msg, 'error');
    } finally {
      setJoiningTeam(false);
    }
  };

  const handleRespondRequest = async (
    requestId: string,
    action: 'ACCEPT' | 'REJECT' | 'CANCEL'
  ) => {
    setRespondingReqId(requestId);
    try {
      await collaborationApi.respondTeamRequest(requestId, action);
      showToast(
        action === 'ACCEPT'
          ? 'Request accepted and team roster updated.'
          : action === 'REJECT'
            ? 'Request declined.'
            : 'Request cancelled.',
        action === 'ACCEPT' ? 'success' : 'info'
      );
      setTeamsRefreshKey((k) => k + 1);
    } catch (err) {
      const msg =
        err instanceof ApiClientError
          ? err.message
          : 'Could not update request.';
      showToast(msg, 'error');
    } finally {
      setRespondingReqId(null);
    }
  };

  const handleLeaveTeamConfirm = async () => {
    if (!leaveTargetTeam) return;
    setLeavingTeam(true);
    try {
      const res = await collaborationApi.leaveTeam(leaveTargetTeam.id);
      showToast(
        res.data.disbanded
          ? `Left and archived ${leaveTargetTeam.name}.`
          : `Left ${leaveTargetTeam.name}.`,
        'info'
      );
      setLeaveTargetTeam(null);
      setTeamsRefreshKey((k) => k + 1);
    } catch (err) {
      const msg =
        err instanceof ApiClientError ? err.message : 'Could not leave team.';
      showToast(msg, 'error');
    } finally {
      setLeavingTeam(false);
    }
  };

  const handleAddSkillRow = () => {
    const clean = newSkillName.trim();
    if (!clean) return;
    if (
      reqSkills.some((s) => s.name.toLowerCase() === clean.toLowerCase())
    ) {
      showToast('That skill is already listed.', 'info');
      return;
    }
    setReqSkills((prev) => [
      ...prev,
      { name: clean, importance: newSkillImportance },
    ]);
    setNewSkillName('');
  };

  const handleAddTimeSlot = () => {
    if (slotFrom >= slotTo) {
      showToast('End time must be after start time.', 'error');
      return;
    }
    setTimeConstraints((prev) => [
      ...prev,
      { day: slotDay, from: slotFrom, to: slotTo },
    ]);
  };

  const handleCreateMatchRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (reqSkills.length === 0) {
      showToast('Add at least one required skill.', 'error');
      return;
    }
    setSubmittingMatch(true);
    try {
      const interests = interestsText
        .split(',')
        .map((i) => i.trim())
        .filter(Boolean);

      const res = await collaborationApi.createMatchRequest({
        courseId: matchCourseId,
        teamId: matchTeamId || null,
        title: matchTitle.trim(),
        description: matchDesc.trim(),
        requiredSkills: reqSkills,
        desiredTeamSize: matchTeamSize,
        timeConstraints,
        optionalInterests: interests,
        hardConstraints: {
          strictTimeOverlap,
          sameBatchOnly,
          minSkillLevel,
          requiredDays,
        },
      });
      const created = res.data.matchRequest;
      setActiveMatch(created);
      setMatchHistory((prev) => [created, ...prev]);
      showToast('AI matching job queued. Computing scores...', 'info');
    } catch (err) {
      const msg =
        err instanceof ApiClientError
          ? err.message
          : 'Could not submit team matching request.';
      showToast(msg, 'error');
    } finally {
      setSubmittingMatch(false);
    }
  };

  const handleMatchCandidateAction = async (
    request: TeamMatchRequestDTO,
    candidateId: string,
    action: MatchCandidateActionStatus
  ) => {
    const chosenTeamId =
      request.teamId ||
      matchInviteTeamMap[candidateId] ||
      myTeams.find((t) => t.courseId === request.courseId)?.id ||
      '';

    if (action === MatchCandidateActionStatus.INVITED && !chosenTeamId) {
      showToast(
        'Create a team for this course first so the invitation links to a team.',
        'error'
      );
      return;
    }

    setActingCandidateKey(`${candidateId}:${action}`);
    try {
      const res = await collaborationApi.actOnMatchCandidate(
        request.id,
        candidateId,
        {
          action,
          teamId:
            action === MatchCandidateActionStatus.INVITED ? chosenTeamId : null,
        }
      );
      const updated = res.data.matchRequest;
      setActiveMatch(updated);
      setMatchHistory((prev) =>
        prev.map((m) => (m.id === updated.id ? updated : m))
      );
      showToast(
        action === MatchCandidateActionStatus.INVITED
          ? 'Consent-based team invitation sent!'
          : 'Candidate dismissed from this list.',
        action === MatchCandidateActionStatus.INVITED ? 'success' : 'info'
      );
      if (action === MatchCandidateActionStatus.INVITED) {
        setTeamsRefreshKey((k) => k + 1);
      }
    } catch (err) {
      const msg =
        err instanceof ApiClientError
          ? err.message
          : 'Could not update candidate action.';
      showToast(msg, 'error');
    } finally {
      setActingCandidateKey(null);
    }
  };

  const pendingIncomingCount = incomingReqs.filter(
    (r) => r.status === TeamRequestStatus.PENDING
  ).length;

  return (
    <DashboardLayout
      title="Teams & AI Teammate Matching"
      subtitle="Discover classmates in your courses, form consent-based teams, and run semantic Gemini matching."
      breadcrumb="Teams & Matching"
    >
      {user?.optedOutOfMatching && (
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs sm:text-sm text-[#92400e]">
          You currently have <strong>Opt out of team matching</strong> enabled in
          your profile, so your card is hidden from classmate discovery and matching
          pools.
        </div>
      )}

      {/* Navigation Tabs */}
      <Card padding="sm" className="mb-6">
        <nav
          aria-label="Collaboration sections"
          className="flex items-center gap-2 overflow-x-auto"
        >
          {[
            { id: 'discover' as const, label: 'Discover Classmates', icon: Search },
            {
              id: 'teams' as const,
              label: `Teams & Requests${pendingIncomingCount > 0 ? ` (${pendingIncomingCount})` : ''}`,
              icon: Users,
            },
            { id: 'matching' as const, label: 'AI Team Matching', icon: Sparkles },
          ].map((tab) => {
            const Icon = tab.icon;
            const selected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setTab(tab.id)}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  selected
                    ? 'bg-[#2563EB] text-white'
                    : 'text-slate-600 hover:text-[#162B4D] hover:bg-slate-100'
                }`}
              >
                <Icon className="w-4 h-4" aria-hidden="true" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </Card>

      {/* TAB 1: STUDENT DISCOVERY */}
      {activeTab === 'discover' && (
        <div className="space-y-5">
          <Card padding="sm">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="relative">
                <Search
                  className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  aria-label="Search classmates"
                  value={discSearch}
                  onChange={(e) => {
                    setDiscSearch(e.target.value);
                    setDiscPage(1);
                  }}
                  placeholder="Name, batch, interest..."
                  className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 text-sm text-[#162B4D] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
                />
              </div>

              <select
                aria-label="Filter by shared course"
                value={discCourseId}
                onChange={(e) => {
                  setDiscCourseId(e.target.value);
                  setDiscPage(1);
                }}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#162B4D]"
              >
                <option value="">All My Courses</option>
                {myCourses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.courseCode} — {c.courseName}
                  </option>
                ))}
              </select>

              <input
                type="text"
                aria-label="Filter by skill"
                value={discSkill}
                onChange={(e) => {
                  setDiscSkill(e.target.value);
                  setDiscPage(1);
                }}
                placeholder="Filter skill (e.g. React)"
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#162B4D] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
              />

              <select
                aria-label="Filter by availability day"
                value={discDay}
                onChange={(e) => {
                  setDiscDay(e.target.value as DayOfWeek | '');
                  setDiscPage(1);
                }}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#162B4D]"
              >
                <option value="">Any Availability Day</option>
                {DAYS_OF_WEEK.map((d) => (
                  <option key={d} value={d}>
                    Available on {d}
                  </option>
                ))}
              </select>
            </div>
          </Card>

          {discLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <CardSkeleton rows={3} />
              <CardSkeleton rows={3} />
            </div>
          ) : classmates.length === 0 ? (
            <Card>
              <EmptyState
                icon={Users}
                title="No matching classmates found"
                description="Only classmates enrolled in your active courses who have not opted out of matching appear here."
              />
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {classmates.map((mate) => (
                <Card key={mate.id} className="flex flex-col justify-between gap-4">
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-display text-base font-semibold text-[#162B4D]">
                          {mate.name}
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {mate.department}
                          {mate.batch ? ` · ${mate.batch}` : ''}
                        </p>
                      </div>
                      <span className="text-xs font-mono text-[#2563EB] shrink-0">
                        {mate.sharedCourses.map((c) => c.courseCode).join(', ')}
                      </span>
                    </div>

                    {mate.profile.bio && (
                      <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                        {mate.profile.bio}
                      </p>
                    )}

                    <div className="mt-3 space-y-2 text-xs">
                      <div>
                        <span className="font-semibold text-[#162B4D]">Skills:</span>{' '}
                        {mate.profile.skills.length > 0
                          ? mate.profile.skills
                              .map((s) => `${s.name} (${s.level}/5)`)
                              .join(' · ')
                          : 'Not listed'}
                      </div>
                      <div>
                        <span className="font-semibold text-[#162B4D]">
                          Interests:
                        </span>{' '}
                        {mate.profile.interests.length > 0
                          ? mate.profile.interests.join(', ')
                          : 'Not listed'}
                      </div>
                      <div>
                        <span className="font-semibold text-[#162B4D]">
                          Availability:
                        </span>{' '}
                        <span className="tabular-nums">
                          {mate.availability.length > 0
                            ? mate.availability
                                .map((a) => `${a.day} ${a.from}–${a.to}`)
                                .join(', ')
                            : 'Not set'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-end pt-3 border-t border-slate-100">
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => handleOpenInviteModal(mate)}
                    >
                      <UserPlus className="w-4 h-4" aria-hidden="true" />
                      Invite to Team
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {discMeta && discMeta.totalPages > 1 && (
            <div className="flex items-center justify-between text-xs text-slate-600">
              <span className="tabular-nums">
                Page {discMeta.page} of {discMeta.totalPages} ({discMeta.total} classmates)
              </span>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={discMeta.page <= 1}
                  onClick={() => setDiscPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={discMeta.page >= discMeta.totalPages}
                  onClick={() => setDiscPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: TEAMS & CONSENT REQUESTS */}
      {activeTab === 'teams' && (
        <div className="space-y-6">
          {/* Pending & Recent Requests */}
          {(incomingReqs.length > 0 || outgoingReqs.length > 0) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <h2 className="font-display text-base font-semibold text-[#162B4D] mb-3">
                  Incoming Invites & Join Requests
                </h2>
                {incomingReqs.length === 0 ? (
                  <p className="text-xs text-slate-500">No incoming requests.</p>
                ) : (
                  <div className="space-y-3">
                    {incomingReqs.map((req) => (
                      <div
                        key={req.id}
                        className="rounded-lg border border-slate-200 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-mono font-semibold text-[#2563EB]">
                            {req.courseCode} ·{' '}
                            {req.type === TeamRequestType.INVITE
                              ? 'Team Invite'
                              : 'Join Request'}
                          </p>
                          <p className="text-sm font-semibold text-[#162B4D]">
                            {req.teamName}
                          </p>
                          <p className="text-xs text-slate-600">
                            From {req.fromUser.name}
                            {req.message ? ` — "${req.message}"` : ''}
                          </p>
                        </div>
                        {req.status === TeamRequestStatus.PENDING ? (
                          <div className="flex items-center gap-2 shrink-0">
                            <Button
                              size="sm"
                              variant="primary"
                              loading={respondingReqId === req.id}
                              onClick={() => handleRespondRequest(req.id, 'ACCEPT')}
                            >
                              <Check className="w-3.5 h-3.5" aria-hidden="true" />
                              Accept
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              loading={respondingReqId === req.id}
                              onClick={() => handleRespondRequest(req.id, 'REJECT')}
                            >
                              <X className="w-3.5 h-3.5" aria-hidden="true" />
                              Decline
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs font-medium text-slate-500 shrink-0">
                            {req.status}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              <Card>
                <h2 className="font-display text-base font-semibold text-[#162B4D] mb-3">
                  Outgoing Invites & Join Requests
                </h2>
                {outgoingReqs.length === 0 ? (
                  <p className="text-xs text-slate-500">No outgoing requests.</p>
                ) : (
                  <div className="space-y-3">
                    {outgoingReqs.map((req) => (
                      <div
                        key={req.id}
                        className="rounded-lg border border-slate-200 p-3 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-mono text-[#1D9BA6]">
                            {req.courseCode} ·{' '}
                            {req.type === TeamRequestType.INVITE
                              ? `Invited ${req.toUser.name}`
                              : `Requested to join ${req.teamName}`}
                          </p>
                          <p className="text-sm font-medium text-[#162B4D] truncate">
                            {req.teamName}
                          </p>
                        </div>
                        {req.status === TeamRequestStatus.PENDING ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            loading={respondingReqId === req.id}
                            onClick={() => handleRespondRequest(req.id, 'CANCEL')}
                          >
                            Cancel
                          </Button>
                        ) : (
                          <span className="text-xs font-medium text-slate-500 shrink-0">
                            {req.status}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          )}

          {/* Teams Directory */}
          <Card>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
              <div>
                <h2 className="font-display text-lg font-semibold text-[#162B4D]">
                  Course & Project Teams
                </h2>
                <p className="text-sm text-slate-600">
                  Every membership change requires explicit invite acceptance or leader approval.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <select
                  aria-label="Filter teams by course"
                  value={teamCourseFilter}
                  onChange={(e) => setTeamCourseFilter(e.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#162B4D]"
                >
                  <option value="">All Courses</option>
                  {myCourses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.courseCode}
                    </option>
                  ))}
                </select>
                <label className="inline-flex items-center gap-2 text-xs font-medium text-[#162B4D] px-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={mineOnly}
                    onChange={(e) => setMineOnly(e.target.checked)}
                    className="rounded border-slate-300 text-[#2563EB]"
                  />
                  My teams only
                </label>
                <Button
                  size="sm"
                  variant="primary"
                  disabled={myCourses.length === 0}
                  onClick={() => setCreateTeamOpen(true)}
                >
                  <Plus className="w-4 h-4" aria-hidden="true" />
                  Create Team
                </Button>
              </div>
            </div>

            {teamsLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <CardSkeleton rows={3} />
                <CardSkeleton rows={3} />
              </div>
            ) : teams.length === 0 ? (
              <EmptyState
                icon={Users}
                title="No teams found"
                description="Create a project team for one of your enrolled courses and invite classmates."
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {teams.map((team) => (
                  <div
                    key={team.id}
                    className="rounded-xl border border-slate-200 p-4 flex flex-col justify-between gap-4"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 text-xs mb-1">
                        <span className="font-mono font-semibold text-[#2563EB]">
                          {team.courseCode}
                        </span>
                        <span className="font-mono text-slate-500 tabular-nums">
                          {team.members.length}/{team.maxSize} members · {team.status}
                        </span>
                      </div>
                      <h3 className="font-display text-base font-semibold text-[#162B4D]">
                        {team.name}
                      </h3>
                      {team.description && (
                        <p className="text-xs text-slate-600 mt-1">
                          {team.description}
                        </p>
                      )}

                      <div className="mt-3 pt-3 border-t border-slate-100 space-y-1.5">
                        {team.members.map((m) => (
                          <div
                            key={m.id}
                            className="flex items-center justify-between text-xs"
                          >
                            <span className="font-medium text-[#162B4D]">
                              {m.name}
                              {m.id === team.leaderId ? ' (Leader)' : ''}
                            </span>
                            <span className="text-slate-500 truncate max-w-[180px]">
                              {m.skills.map((s) => s.name).join(', ')}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                      {team.viewerIsMember ? (
                        <>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              setMatchCourseId(team.courseId);
                              setMatchTeamId(team.id);
                              setTab('matching');
                            }}
                          >
                            <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                            Match Teammates
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => setLeaveTargetTeam(team)}
                          >
                            <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                            Leave
                          </Button>
                        </>
                      ) : team.hasPendingJoinRequest ? (
                        <span className="text-xs font-medium text-slate-500">
                          Join request pending
                        </span>
                      ) : team.status === TeamStatus.OPEN ? (
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => {
                            setJoinTargetTeam(team);
                            setJoinMessage('');
                          }}
                        >
                          <Send className="w-3.5 h-3.5" aria-hidden="true" />
                          Request to Join
                        </Button>
                      ) : (
                        <span className="text-xs font-medium text-slate-400">
                          Team Full
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* TAB 3: AI TEAM MATCHING */}
      {activeTab === 'matching' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Request Form */}
          <div className="lg:col-span-5 space-y-5">
            <Card>
              <h2 className="font-display text-lg font-semibold text-[#162B4D] mb-1">
                New Team Match Request
              </h2>
              <p className="text-xs text-slate-600 mb-4">
                Weights: 40% Skills (S) · 20% Interests (I) · 20% Availability (A) · 20% Complementary (C)
              </p>

              <form onSubmit={handleCreateMatchRequest} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="match-course"
                      className="block text-xs font-medium text-[#162B4D] mb-1"
                    >
                      Course
                    </label>
                    <select
                      id="match-course"
                      required
                      value={matchCourseId}
                      onChange={(e) => {
                        setMatchCourseId(e.target.value);
                        setMatchTeamId('');
                      }}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#162B4D]"
                    >
                      <option value="">Select course...</option>
                      {myCourses.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.courseCode}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor="match-team"
                      className="block text-xs font-medium text-[#162B4D] mb-1"
                    >
                      Existing Team (for C gap)
                    </label>
                    <select
                      id="match-team"
                      value={matchTeamId}
                      onChange={(e) => setMatchTeamId(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#162B4D]"
                    >
                      <option value="">Solo / New Team</option>
                      {myTeams
                        .filter((t) => !matchCourseId || t.courseId === matchCourseId)
                        .map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name} ({t.members.length}/{t.maxSize})
                          </option>
                        ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="match-title"
                    className="block text-xs font-medium text-[#162B4D] mb-1"
                  >
                    Project / Match Title
                  </label>
                  <input
                    id="match-title"
                    type="text"
                    required
                    minLength={3}
                    value={matchTitle}
                    onChange={(e) => setMatchTitle(e.target.value)}
                    placeholder="e.g., Full-Stack Capstone Partner Search"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#162B4D]"
                  />
                </div>

                <div>
                  <label
                    htmlFor="match-desc"
                    className="block text-xs font-medium text-[#162B4D] mb-1"
                  >
                    Project Description
                  </label>
                  <textarea
                    id="match-desc"
                    required
                    rows={2}
                    minLength={10}
                    value={matchDesc}
                    onChange={(e) => setMatchDesc(e.target.value)}
                    placeholder="Briefly describe architecture, goals, and roles needed..."
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#162B4D]"
                  />
                </div>

                {/* Required Skills + Importance */}
                <div>
                  <label className="block text-xs font-medium text-[#162B4D] mb-1">
                    Required Skills & Importance (1–5)
                  </label>
                  <div className="space-y-1.5 mb-2">
                    {reqSkills.map((sk, idx) => (
                      <div
                        key={sk.name}
                        className="flex items-center justify-between gap-2 rounded-lg bg-[#F3F6FB] px-3 py-1.5 text-xs"
                      >
                        <span className="font-medium text-[#162B4D]">{sk.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-slate-600 tabular-nums">
                            Imp {sk.importance}/5
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setReqSkills((prev) =>
                                prev.filter((_, i) => i !== idx)
                              )
                            }
                            aria-label={`Remove ${sk.name}`}
                            className="text-slate-400 hover:text-red-600 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={newSkillName}
                      onChange={(e) => setNewSkillName(e.target.value)}
                      placeholder="Add skill (e.g. TypeScript)"
                      className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-[#162B4D]"
                    />
                    <select
                      aria-label="Skill importance"
                      value={newSkillImportance}
                      onChange={(e) => setNewSkillImportance(Number(e.target.value))}
                      className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs"
                    >
                      {[1, 2, 3, 4, 5].map((n) => (
                        <option key={n} value={n}>
                          Imp {n}
                        </option>
                      ))}
                    </select>
                    <Button type="button" size="sm" variant="secondary" onClick={handleAddSkillRow}>
                      Add
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="match-size"
                      className="block text-xs font-medium text-[#162B4D] mb-1"
                    >
                      Target Team Size
                    </label>
                    <input
                      id="match-size"
                      type="number"
                      min={2}
                      max={10}
                      value={matchTeamSize}
                      onChange={(e) => setMatchTeamSize(Number(e.target.value))}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="match-interests"
                      className="block text-xs font-medium text-[#162B4D] mb-1"
                    >
                      Optional Interests
                    </label>
                    <input
                      id="match-interests"
                      type="text"
                      value={interestsText}
                      onChange={(e) => setInterestsText(e.target.value)}
                      placeholder="AI Engineering, EdTech"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                {/* Time Constraints */}
                <div>
                  <label className="block text-xs font-medium text-[#162B4D] mb-1">
                    Time Constraints (Meeting Windows)
                  </label>
                  {timeConstraints.length > 0 && (
                    <div className="space-y-1 mb-2">
                      {timeConstraints.map((tc, idx) => (
                        <div
                          key={`${tc.day}-${tc.from}-${idx}`}
                          className="flex items-center justify-between rounded bg-[#F3F6FB] px-2.5 py-1 text-xs tabular-nums"
                        >
                          <span>
                            {tc.day} {tc.from}–{tc.to}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setTimeConstraints((prev) =>
                                prev.filter((_, i) => i !== idx)
                              )
                            }
                            className="text-slate-400 hover:text-red-600 cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <select
                      aria-label="Meeting day"
                      value={slotDay}
                      onChange={(e) => setSlotDay(e.target.value as DayOfWeek)}
                      className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs"
                    >
                      {DAYS_OF_WEEK.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                    <input
                      type="time"
                      aria-label="From time"
                      value={slotFrom}
                      onChange={(e) => setSlotFrom(e.target.value)}
                      className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
                    />
                    <input
                      type="time"
                      aria-label="To time"
                      value={slotTo}
                      onChange={(e) => setSlotTo(e.target.value)}
                      className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
                    />
                    <Button type="button" size="sm" variant="secondary" onClick={handleAddTimeSlot}>
                      Add Slot
                    </Button>
                  </div>
                </div>

                {/* Hard Constraints */}
                <div className="rounded-lg border border-slate-200 p-3 space-y-2 text-xs">
                  <p className="font-semibold text-[#162B4D]">Hard Constraints</p>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={strictTimeOverlap}
                      onChange={(e) => setStrictTimeOverlap(e.target.checked)}
                    />
                    Require positive weekly time overlap
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sameBatchOnly}
                      onChange={(e) => setSameBatchOnly(e.target.checked)}
                    />
                    Same batch only
                  </label>
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <span>Minimum skill level (any skill)</span>
                    <select
                      value={minSkillLevel}
                      onChange={(e) => setMinSkillLevel(Number(e.target.value))}
                      className="rounded border border-slate-300 bg-white px-2 py-1"
                    >
                      <option value={0}>No minimum</option>
                      {[1, 2, 3, 4, 5].map((lv) => (
                        <option key={lv} value={lv}>
                          Level {lv}+
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="pt-1">
                    <span className="block mb-1">Required available days:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {DAYS_OF_WEEK.map((d) => {
                        const checked = requiredDays.includes(d);
                        return (
                          <button
                            key={d}
                            type="button"
                            onClick={() =>
                              setRequiredDays((prev) =>
                                checked ? prev.filter((x) => x !== d) : [...prev, d]
                              )
                            }
                            className={`px-2 py-1 rounded border text-[11px] font-medium cursor-pointer ${
                              checked
                                ? 'bg-[#2563EB] text-white border-[#2563EB]'
                                : 'bg-white text-slate-600 border-slate-300'
                            }`}
                          >
                            {d}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  className="w-full"
                  loading={submittingMatch}
                >
                  <Sparkles className="w-4 h-4" aria-hidden="true" />
                  Run AI Team Matching
                </Button>
              </form>
            </Card>

            {matchHistory.length > 0 && (
              <Card padding="sm">
                <h3 className="text-sm font-semibold text-[#162B4D] mb-2">
                  Recent Match Runs
                </h3>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {matchHistory.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setActiveMatch(m)}
                      className={`w-full text-left rounded-lg border p-2.5 text-xs transition-colors cursor-pointer ${
                        activeMatch?.id === m.id
                          ? 'border-[#2563EB] bg-[#2563EB]/[0.04]'
                          : 'border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-[#162B4D] truncate">
                          {m.title}
                        </span>
                        <span className="font-mono text-[11px] text-slate-500 shrink-0">
                          {m.status}
                        </span>
                      </div>
                      <p className="text-slate-500 mt-0.5 tabular-nums">
                        {m.courseCode} · {m.results.length} matches
                      </p>
                    </button>
                  ))}
                </div>
              </Card>
            )}
          </div>

          {/* Ranked Results Panel */}
          <div className="lg:col-span-7 space-y-4">
            {!activeMatch ? (
              <Card>
                <EmptyState
                  icon={Sparkles}
                  title="No match run selected"
                  description="Submit a Team Match Request on the left to compute S, I, A, C scores using Gemini embeddings and grounded recommendations."
                />
              </Card>
            ) : (
              <>
                <Card padding="sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-mono text-[#2563EB]">
                        {activeMatch.courseCode} · {activeMatch.modelVersion}
                      </p>
                      <h2 className="font-display text-lg font-semibold text-[#162B4D]">
                        {activeMatch.title}
                      </h2>
                    </div>
                    <div className="text-right text-xs text-slate-600 tabular-nums">
                      <p className="font-semibold text-[#162B4D]">
                        Status: {activeMatch.status}
                      </p>
                      <p>
                        Pool: {activeMatch.candidatePoolSize} · Filtered out:{' '}
                        {activeMatch.hardFilteredCount}
                      </p>
                    </div>
                  </div>
                </Card>

                {(activeMatch.status === MatchRequestStatus.QUEUED ||
                  activeMatch.status === MatchRequestStatus.PROCESSING) && (
                  <Card>
                    <div className="flex items-center gap-3 text-sm text-[#162B4D]">
                      <Clock
                        className="w-5 h-5 text-[#2563EB] animate-spin"
                        aria-hidden="true"
                      />
                      <div>
                        <p className="font-semibold">
                          Computing semantic skill embeddings & S/I/A/C scores...
                        </p>
                        <p className="text-xs text-slate-500">
                          Status updates automatically every 1.5 seconds.
                        </p>
                      </div>
                    </div>
                  </Card>
                )}

                {activeMatch.status === MatchRequestStatus.FAILED && (
                  <Card>
                    <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                      <p className="font-semibold">Matching job failed</p>
                      <p className="text-xs mt-1">
                        {activeMatch.errorMessage ||
                          'Upstream Gemini service error.'}
                      </p>
                    </div>
                  </Card>
                )}

                {activeMatch.status === MatchRequestStatus.COMPLETED &&
                  activeMatch.results.length === 0 && (
                    <Card>
                      <EmptyState
                        icon={Users}
                        title="No eligible candidates passed hard constraints"
                        description="Try relaxing strict time overlap, batch, or minimum skill level constraints."
                      />
                    </Card>
                  )}

                {activeMatch.status === MatchRequestStatus.COMPLETED &&
                  activeMatch.results.map((item) => {
                    const courseTeams = myTeams.filter(
                      (t) => t.courseId === activeMatch.courseId
                    );
                    const selectedInviteTeam =
                      activeMatch.teamId ||
                      matchInviteTeamMap[item.candidate.id] ||
                      courseTeams[0]?.id ||
                      '';

                    return (
                      <Card key={item.candidate.id} className="space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                              <span className="font-mono font-semibold text-[#2563EB]">
                                Rank #{item.rank}
                              </span>
                              <span>·</span>
                              <span>{item.candidate.department}</span>
                              {item.candidate.batch && (
                                <>
                                  <span>·</span>
                                  <span>{item.candidate.batch}</span>
                                </>
                              )}
                            </div>
                            <h3 className="font-display text-lg font-semibold text-[#162B4D]">
                              {item.candidate.name}
                            </h3>
                          </div>

                          <div className="text-left sm:text-right shrink-0">
                            <p className="text-xs text-slate-500">Match Score</p>
                            <p className="font-display text-2xl font-bold text-[#2563EB] tabular-nums">
                              {item.scores.matchScore.toFixed(1)}%
                            </p>
                          </div>
                        </div>

                        {/* Score bars for S, I, A, C */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <ScoreBar
                            label="Skills (S)"
                            weightLabel="40%"
                            score={item.scores.S}
                            colorClass="bg-[#2563EB]"
                          />
                          <ScoreBar
                            label="Interests (I)"
                            weightLabel="20%"
                            score={item.scores.I}
                            colorClass="bg-[#6D5BD0]"
                          />
                          <ScoreBar
                            label="Availability (A)"
                            weightLabel="20%"
                            score={item.scores.A}
                            colorClass="bg-[#1D9BA6]"
                          />
                          <ScoreBar
                            label="Complementary (C)"
                            weightLabel="20%"
                            score={item.scores.C}
                            colorClass="bg-[#D98E2B]"
                          />
                        </div>

                        {/* Why recommended */}
                        <div className="rounded-lg bg-[#F3F6FB] border border-slate-200/80 p-3 text-xs space-y-1.5">
                          <p className="font-semibold text-[#162B4D]">
                            Why recommended
                          </p>
                          <p className="text-slate-700 leading-relaxed">
                            {item.explanation}
                          </p>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-slate-500 pt-1">
                            <span>
                              <strong>Matched:</strong>{' '}
                              {item.matchedSkills.length > 0
                                ? item.matchedSkills.join(', ')
                                : 'Semantic overlap'}
                            </span>
                            <span>
                              <strong>Gaps filled:</strong>{' '}
                              {item.complementarySkills.length > 0
                                ? item.complementarySkills.join(', ')
                                : 'None'}
                            </span>
                            <span className="tabular-nums">
                              <strong>Overlap:</strong>{' '}
                              {(item.overlapMinutes / 60).toFixed(1)}h/wk
                            </span>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
                          <div className="text-xs text-slate-500">
                            {item.status === MatchCandidateActionStatus.INVITED && (
                              <span className="font-semibold text-emerald-700">
                                Invitation Sent (awaiting consent)
                              </span>
                            )}
                            {item.status ===
                              MatchCandidateActionStatus.DISMISSED && (
                              <span className="font-medium text-slate-500">
                                Dismissed
                              </span>
                            )}
                          </div>

                          {item.status === MatchCandidateActionStatus.PENDING && (
                            <div className="flex flex-wrap items-center gap-2">
                              {!activeMatch.teamId && courseTeams.length > 0 && (
                                <select
                                  aria-label={`Select team for ${item.candidate.name}`}
                                  value={selectedInviteTeam}
                                  onChange={(e) =>
                                    setMatchInviteTeamMap((prev) => ({
                                      ...prev,
                                      [item.candidate.id]: e.target.value,
                                    }))
                                  }
                                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-[#162B4D]"
                                >
                                  {courseTeams.map((t) => (
                                    <option key={t.id} value={t.id}>
                                      {t.name}
                                    </option>
                                  ))}
                                </select>
                              )}
                              <Button
                                size="sm"
                                variant="secondary"
                                loading={
                                  actingCandidateKey ===
                                  `${item.candidate.id}:DISMISSED`
                                }
                                onClick={() =>
                                  handleMatchCandidateAction(
                                    activeMatch,
                                    item.candidate.id,
                                    MatchCandidateActionStatus.DISMISSED
                                  )
                                }
                              >
                                Dismiss
                              </Button>
                              <Button
                                size="sm"
                                variant="primary"
                                loading={
                                  actingCandidateKey ===
                                  `${item.candidate.id}:INVITED`
                                }
                                onClick={() =>
                                  handleMatchCandidateAction(
                                    activeMatch,
                                    item.candidate.id,
                                    MatchCandidateActionStatus.INVITED
                                  )
                                }
                              >
                                <UserPlus
                                  className="w-3.5 h-3.5"
                                  aria-hidden="true"
                                />
                                Invite
                              </Button>
                            </div>
                          )}
                        </div>
                      </Card>
                    );
                  })}
              </>
            )}
          </div>
        </div>
      )}

      {/* Invite from Discovery Modal */}
      <Modal
        open={Boolean(inviteModalTarget)}
        onClose={() => setInviteModalTarget(null)}
        title={`Invite ${inviteModalTarget?.name || 'Classmate'}`}
        subtitle="Classmates join only after accepting your invitation."
      >
        <form onSubmit={handleSendInvite} className="space-y-4">
          <div>
            <label
              htmlFor="inv-team"
              className="block text-sm font-medium text-[#162B4D] mb-1"
            >
              Select Your Team
            </label>
            {myTeams.length === 0 ? (
              <p className="text-xs text-slate-600">
                You are not in a team yet. Switch to the Teams tab to create one first.
              </p>
            ) : (
              <select
                id="inv-team"
                required
                value={inviteTeamId}
                onChange={(e) => setInviteTeamId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#162B4D]"
              >
                <option value="">Select team...</option>
                {myTeams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.courseCode} — {t.name} ({t.members.length}/{t.maxSize})
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label
              htmlFor="inv-msg"
              className="block text-sm font-medium text-[#162B4D] mb-1"
            >
              Message (optional)
            </label>
            <textarea
              id="inv-msg"
              rows={3}
              maxLength={500}
              value={inviteMessage}
              onChange={(e) => setInviteMessage(e.target.value)}
              placeholder="Share what role or project idea you have in mind..."
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#162B4D]"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setInviteModalTarget(null)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={myTeams.length === 0}
              loading={inviting}
            >
              Send Invitation
            </Button>
          </div>
        </form>
      </Modal>

      {/* Create Team Modal */}
      <Modal
        open={createTeamOpen}
        onClose={() => setCreateTeamOpen(false)}
        title="Create Project Team"
        subtitle="Create a team for an enrolled course with a member cap."
      >
        <form onSubmit={handleCreateTeam} className="space-y-4">
          <div>
            <label
              htmlFor="new-team-course"
              className="block text-sm font-medium text-[#162B4D] mb-1"
            >
              Course
            </label>
            <select
              id="new-team-course"
              required
              value={teamCourseId}
              onChange={(e) => setTeamCourseId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#162B4D]"
            >
              {myCourses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.courseCode} — {c.courseName}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label
                htmlFor="new-team-name"
                className="block text-sm font-medium text-[#162B4D] mb-1"
              >
                Team Name
              </label>
              <input
                id="new-team-name"
                type="text"
                required
                minLength={3}
                maxLength={120}
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                placeholder="e.g., Team Beta (Distributed)"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#162B4D]"
              />
            </div>
            <div>
              <label
                htmlFor="new-team-max"
                className="block text-sm font-medium text-[#162B4D] mb-1"
              >
                Max Members
              </label>
              <input
                id="new-team-max"
                type="number"
                min={2}
                max={10}
                required
                value={teamMaxSize}
                onChange={(e) => setTeamMaxSize(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm tabular-nums"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="new-team-desc"
              className="block text-sm font-medium text-[#162B4D] mb-1"
            >
              Project Focus (optional)
            </label>
            <textarea
              id="new-team-desc"
              rows={3}
              maxLength={1000}
              value={teamDesc}
              onChange={(e) => setTeamDesc(e.target.value)}
              placeholder="Outline your team goals and preferred tech stack..."
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#162B4D]"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setCreateTeamOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={creatingTeam}>
              Create Team
            </Button>
          </div>
        </form>
      </Modal>

      {/* Request to Join Modal */}
      <Modal
        open={Boolean(joinTargetTeam)}
        onClose={() => setJoinTargetTeam(null)}
        title={`Request to Join ${joinTargetTeam?.name || ''}`}
        subtitle="The team leader must approve your request before you are added."
      >
        <form onSubmit={handleJoinRequest} className="space-y-4">
          <div>
            <label
              htmlFor="join-msg"
              className="block text-sm font-medium text-[#162B4D] mb-1"
            >
              Introductory Note (optional)
            </label>
            <textarea
              id="join-msg"
              rows={3}
              maxLength={500}
              value={joinMessage}
              onChange={(e) => setJoinMessage(e.target.value)}
              placeholder="Highlight your relevant skills and availability..."
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#162B4D]"
            />
          </div>
          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setJoinTargetTeam(null)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={joiningTeam}>
              Send Join Request
            </Button>
          </div>
        </form>
      </Modal>

      {/* Leave Team Confirm */}
      <ConfirmModal
        open={Boolean(leaveTargetTeam)}
        onClose={() => setLeaveTargetTeam(null)}
        onConfirm={handleLeaveTeamConfirm}
        title="Leave Team"
        description={`Leave "${leaveTargetTeam?.name || ''}"? If you are the last member, the team will be archived.`}
        confirmLabel="Leave Team"
        destructive
        loading={leavingTeam}
      />
    </DashboardLayout>
  );
}
