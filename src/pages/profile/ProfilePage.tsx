import React, { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { usersApi, ApiClientError } from '../../services/api';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { CardSkeleton } from '../../components/ui/Skeleton';
import {
  DAYS_OF_WEEK,
  type AvailabilitySlot,
  type DayOfWeek,
  type UserSkill,
} from '../../shared/types';

export function ProfilePage() {
  const { user, setUser } = useAuth();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [department, setDepartment] = useState('');
  const [batch, setBatch] = useState('');
  const [bio, setBio] = useState('');
  const [skills, setSkills] = useState<UserSkill[]>([]);
  const [interests, setInterests] = useState<string[]>([]);
  const [availability, setAvailability] = useState<AvailabilitySlot[]>([]);
  const [optedOutOfMatching, setOptedOutOfMatching] = useState(false);

  const [newSkillName, setNewSkillName] = useState('');
  const [newSkillLevel, setNewSkillLevel] = useState<1 | 2 | 3 | 4 | 5>(3);
  const [newInterest, setNewInterest] = useState('');

  useEffect(() => {
    let active = true;
    usersApi
      .getMyProfile()
      .then((res) => {
        if (!active) return;
        const p = res.data.user;
        setName(p.name);
        setDepartment(p.department);
        setBatch(p.batch || '');
        setBio(p.profile?.bio || '');
        setSkills(p.profile?.skills || []);
        setInterests(p.profile?.interests || []);
        setAvailability(p.availability || []);
        setOptedOutOfMatching(Boolean(p.optedOutOfMatching));
      })
      .catch((err) => {
        if (!active) return;
        const msg =
          err instanceof ApiClientError ? err.message : 'Unable to load profile.';
        showToast(msg, 'error');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [showToast]);

  const handleAddSkill = () => {
    const trimmed = newSkillName.trim();
    if (!trimmed) return;
    if (skills.some((s) => s.name.toLowerCase() === trimmed.toLowerCase())) {
      showToast('This skill is already in your list.', 'info');
      return;
    }
    setSkills((prev) => [...prev, { name: trimmed, level: newSkillLevel }]);
    setNewSkillName('');
    setNewSkillLevel(3);
  };

  const handleAddInterest = () => {
    const trimmed = newInterest.trim();
    if (!trimmed) return;
    if (interests.some((i) => i.toLowerCase() === trimmed.toLowerCase())) {
      showToast('This interest is already listed.', 'info');
      return;
    }
    setInterests((prev) => [...prev, trimmed]);
    setNewInterest('');
  };

  const handleAddAvailability = () => {
    setAvailability((prev) => [
      ...prev,
      { day: 'MON', from: '14:00', to: '16:00' },
    ]);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (name.trim().length < 2) {
      setErrorMsg('Name must be at least 2 characters.');
      return;
    }
    for (const slot of availability) {
      if (slot.from >= slot.to) {
        setErrorMsg(
          `Availability slot on ${slot.day}: end time (${slot.to}) must be after start time (${slot.from}).`
        );
        return;
      }
    }

    setSaving(true);
    try {
      const res = await usersApi.updateMyProfile({
        name: name.trim(),
        department: department.trim(),
        batch: batch.trim() ? batch.trim() : null,
        bio: bio.trim(),
        skills,
        interests,
        availability,
        optedOutOfMatching,
      });
      setUser(res.data.user);
      showToast('Profile saved successfully.', 'success');
    } catch (err) {
      const msg =
        err instanceof ApiClientError ? err.message : 'Unable to save profile.';
      setErrorMsg(msg);
      showToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout
      title="My Academic Profile"
      subtitle="Manage your identity, skill proficiencies, interests, and weekly study schedule"
      breadcrumb="Profile"
    >
      {loading ? (
        <div className="space-y-4">
          <CardSkeleton rows={4} />
          <CardSkeleton rows={3} />
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-6 max-w-4xl">
          {errorMsg && (
            <div
              role="alert"
              className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
            >
              {errorMsg}
            </div>
          )}

          {/* Identity & Bio */}
          <Card>
            <h2 className="font-display text-lg font-semibold text-[#162B4D] mb-4">
              Basic Information
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="profile-name"
                  className="block text-sm font-medium text-[#162B4D] mb-1.5"
                >
                  Full Name
                </label>
                <input
                  id="profile-name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#162B4D] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
                />
              </div>

              <div>
                <label
                  htmlFor="profile-email"
                  className="block text-sm font-medium text-[#162B4D] mb-1.5"
                >
                  University Email
                </label>
                <input
                  id="profile-email"
                  type="email"
                  disabled
                  value={user?.email || ''}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500 cursor-not-allowed"
                />
              </div>

              <div>
                <label
                  htmlFor="profile-dept"
                  className="block text-sm font-medium text-[#162B4D] mb-1.5"
                >
                  Department
                </label>
                <input
                  id="profile-dept"
                  type="text"
                  required
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#162B4D] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
                />
              </div>

              <div>
                <label
                  htmlFor="profile-batch"
                  className="block text-sm font-medium text-[#162B4D] mb-1.5"
                >
                  Batch / Cohort
                </label>
                <input
                  id="profile-batch"
                  type="text"
                  value={batch}
                  onChange={(e) => setBatch(e.target.value)}
                  placeholder="e.g. Batch 41"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#162B4D] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
                />
              </div>
            </div>

            <div className="mt-4">
              <label
                htmlFor="profile-bio"
                className="block text-sm font-medium text-[#162B4D] mb-1.5"
              >
                Academic Bio
              </label>
              <textarea
                id="profile-bio"
                rows={3}
                maxLength={800}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Share your academic focus, project experience, or preferred collaboration style..."
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#162B4D] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
              />
            </div>
          </Card>

          {/* Skills */}
          <Card>
            <h2 className="font-display text-lg font-semibold text-[#162B4D] mb-1">
              Technical & Academic Skills
            </h2>
            <p className="text-sm text-slate-600 mb-4">
              Rate each skill from 1 (Foundational) to 5 (Advanced)
            </p>

            <div className="flex flex-col sm:flex-row gap-2 mb-4">
              <input
                type="text"
                aria-label="New skill name"
                value={newSkillName}
                onChange={(e) => setNewSkillName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddSkill();
                  }
                }}
                placeholder="Add skill (e.g. TypeScript, Python, System Design)"
                className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#162B4D] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
              />
              <select
                aria-label="Skill level"
                value={newSkillLevel}
                onChange={(e) =>
                  setNewSkillLevel(Number(e.target.value) as 1 | 2 | 3 | 4 | 5)
                }
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#162B4D] focus:border-[#2563EB] focus:outline-none"
              >
                <option value={1}>Level 1 · Foundational</option>
                <option value={2}>Level 2 · Basic</option>
                <option value={3}>Level 3 · Intermediate</option>
                <option value={4}>Level 4 · Proficient</option>
                <option value={5}>Level 5 · Advanced</option>
              </select>
              <Button type="button" variant="secondary" onClick={handleAddSkill}>
                <Plus className="w-4 h-4" aria-hidden="true" />
                Add Skill
              </Button>
            </div>

            {skills.length === 0 ? (
              <p className="text-sm text-slate-500">No skills added yet.</p>
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
                {skills.map((skill, idx) => (
                  <div
                    key={`${skill.name}-${idx}`}
                    className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm"
                  >
                    <span className="font-medium text-[#162B4D]">{skill.name}</span>
                    <div className="flex items-center gap-3">
                      <select
                        aria-label={`Level for ${skill.name}`}
                        value={skill.level}
                        onChange={(e) => {
                          const lvl = Number(e.target.value) as 1 | 2 | 3 | 4 | 5;
                          setSkills((prev) =>
                            prev.map((s, i) => (i === idx ? { ...s, level: lvl } : s))
                          );
                        }}
                        className="rounded border border-slate-200 px-2 py-1 text-xs font-mono text-[#162B4D]"
                      >
                        <option value={1}>1 / 5</option>
                        <option value={2}>2 / 5</option>
                        <option value={3}>3 / 5</option>
                        <option value={4}>4 / 5</option>
                        <option value={5}>5 / 5</option>
                      </select>
                      <button
                        type="button"
                        aria-label={`Remove ${skill.name}`}
                        onClick={() =>
                          setSkills((prev) => prev.filter((_, i) => i !== idx))
                        }
                        className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Interests */}
          <Card>
            <h2 className="font-display text-lg font-semibold text-[#162B4D] mb-1">
              Research & Collaboration Interests
            </h2>
            <p className="text-sm text-slate-600 mb-4">
              Add topics or project themes you enjoy working on
            </p>

            <div className="flex flex-col sm:flex-row gap-2 mb-4">
              <input
                type="text"
                aria-label="New interest"
                value={newInterest}
                onChange={(e) => setNewInterest(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddInterest();
                  }
                }}
                placeholder="Add interest (e.g. Distributed Systems, EdTech)"
                className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#162B4D] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
              />
              <Button type="button" variant="secondary" onClick={handleAddInterest}>
                <Plus className="w-4 h-4" aria-hidden="true" />
                Add Interest
              </Button>
            </div>

            {interests.length === 0 ? (
              <p className="text-sm text-slate-500">No interests added yet.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {interests.map((item, idx) => (
                  <div
                    key={`${item}-${idx}`}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-[#F3F6FB] px-3 py-1.5 text-sm text-[#162B4D]"
                  >
                    <span>{item}</span>
                    <button
                      type="button"
                      aria-label={`Remove ${item}`}
                      onClick={() =>
                        setInterests((prev) => prev.filter((_, i) => i !== idx))
                      }
                      className="text-slate-400 hover:text-rose-600 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Availability */}
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
              <div>
                <h2 className="font-display text-lg font-semibold text-[#162B4D]">
                  Weekly Study Availability
                </h2>
                <p className="text-sm text-slate-600">
                  Specify windows when you can meet with project teammates
                </p>
              </div>
              <Button type="button" variant="secondary" size="sm" onClick={handleAddAvailability}>
                <Plus className="w-4 h-4" aria-hidden="true" />
                Add Time Slot
              </Button>
            </div>

            {availability.length === 0 ? (
              <p className="text-sm text-slate-500">
                No availability slots added yet.
              </p>
            ) : (
              <div className="space-y-2.5">
                {availability.map((slot, idx) => (
                  <div
                    key={idx}
                    className="flex flex-wrap items-center gap-3 p-3 rounded-lg border border-slate-200 bg-[#F3F6FB]/50"
                  >
                    <select
                      aria-label={`Day for slot ${idx + 1}`}
                      value={slot.day}
                      onChange={(e) => {
                        const day = e.target.value as DayOfWeek;
                        setAvailability((prev) =>
                          prev.map((s, i) => (i === idx ? { ...s, day } : s))
                        );
                      }}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-[#162B4D]"
                    >
                      {DAYS_OF_WEEK.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>

                    <div className="flex items-center gap-2 text-sm">
                      <input
                        type="time"
                        aria-label={`Start time for slot ${idx + 1}`}
                        value={slot.from}
                        onChange={(e) => {
                          const from = e.target.value;
                          setAvailability((prev) =>
                            prev.map((s, i) => (i === idx ? { ...s, from } : s))
                          );
                        }}
                        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-mono tabular-nums"
                      />
                      <span className="text-slate-500">to</span>
                      <input
                        type="time"
                        aria-label={`End time for slot ${idx + 1}`}
                        value={slot.to}
                        onChange={(e) => {
                          const to = e.target.value;
                          setAvailability((prev) =>
                            prev.map((s, i) => (i === idx ? { ...s, to } : s))
                          );
                        }}
                        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-mono tabular-nums"
                      />
                    </div>

                    <button
                      type="button"
                      aria-label={`Remove availability slot ${idx + 1}`}
                      onClick={() =>
                        setAvailability((prev) => prev.filter((_, i) => i !== idx))
                      }
                      className="ml-auto p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-[#162B4D]">
                  Opt out of team matching recommendations
                </p>
                <p className="text-xs text-slate-500">
                  When enabled, your profile is excluded from automated teammate suggestions
                </p>
              </div>
              <input
                type="checkbox"
                aria-label="Opt out of team matching recommendations"
                checked={optedOutOfMatching}
                onChange={(e) => setOptedOutOfMatching(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-[#2563EB] focus:ring-[#2563EB]"
              />
            </div>
          </Card>

          <div className="flex justify-end">
            <Button type="submit" size="lg" loading={saving}>
              Save Profile Changes
            </Button>
          </div>
        </form>
      )}
    </DashboardLayout>
  );
}
