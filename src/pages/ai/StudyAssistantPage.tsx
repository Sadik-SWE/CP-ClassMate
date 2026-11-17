import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  BookOpen,
  Bot,
  Check,
  Copy,
  FileText,
  HelpCircle,
  Loader2,
  MessageSquarePlus,
  Play,
  Presentation,
  Save,
  Send,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  ApiClientError,
  aiApi,
  coursesApi,
  presentationsApi,
  resourcesApi,
} from '../../services/api';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { CardSkeleton } from '../../components/ui/Skeleton';
import {
  QuizDifficulty,
  ResourceStatus,
  type AiCitationDTO,
  type AiConversationDTO,
  type AiMessageDTO,
  type AiQuotaStatusDTO,
  type CourseDTO,
  type GeneratedAiQuizResponseDTO,
  type NoteSummaryResponseDTO,
  type PresentationAiBriefDTO,
  type PresentationTopicDTO,
  type ResourceDTO,
} from '../../shared/types';

type AssistantTab = 'study' | 'presentation';

function AiGeneratedBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#6D5BD0]/10 text-[#6D5BD0] border border-[#6D5BD0]/25">
      <Sparkles className="w-3 h-3" aria-hidden="true" />
      AI-generated
    </span>
  );
}

function formatBriefAsMarkdown(topicTitle: string, brief: PresentationAiBriefDTO): string {
  const lines: string[] = [];
  lines.push(`# Presentation Brief: ${topicTitle}`);
  lines.push('');
  lines.push('## Explanation');
  lines.push(brief.explanation);
  lines.push('');
  lines.push('## Subtopics');
  for (const s of brief.subtopics) {
    lines.push(`- ${s}`);
  }
  lines.push('');
  lines.push('## Outline');
  brief.outline.forEach((sec, idx) => {
    lines.push(`${idx + 1}. **${sec.section}**`);
    for (const kp of sec.keyPoints) {
      lines.push(`   - ${kp}`);
    }
  });
  lines.push('');
  lines.push('## Discussion Points');
  for (const dp of brief.discussionPoints) {
    lines.push(`- ${dp}`);
  }
  lines.push('');
  lines.push('## Possible Questions & Suggested Answers');
  brief.possibleQuestions.forEach((qa, idx) => {
    lines.push(`${idx + 1}. **Q:** ${qa.question}`);
    lines.push(`   **A:** ${qa.suggestedAnswer}`);
  });
  lines.push('');
  lines.push('## Conclusion');
  lines.push(brief.conclusion);
  return lines.join('\n');
}

export function StudyAssistantPage() {
  const { effectiveRole } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const canUsePresentationAssistant =
    effectiveRole === 'CR' ||
    effectiveRole === 'FACULTY' ||
    effectiveRole === 'ADMIN';

  const initialTabParam = searchParams.get('tab');
  const activeTab: AssistantTab = useMemo(() => {
    if (initialTabParam === 'presentation' && canUsePresentationAssistant) {
      return 'presentation';
    }
    return 'study';
  }, [initialTabParam, canUsePresentationAssistant]);

  const setTab = (tab: AssistantTab) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', tab);
    setSearchParams(next, { replace: true });
  };

  // Courses & quota
  const [courses, setCourses] = useState<CourseDTO[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(true);
  const [quota, setQuota] = useState<AiQuotaStatusDTO | null>(null);

  const [selectedCourseId, setSelectedCourseId] = useState(
    searchParams.get('courseId') || ''
  );
  const [selectedResourceId, setSelectedResourceId] = useState(
    searchParams.get('resourceId') || ''
  );

  // Resources for selected course
  const [resources, setResources] = useState<ResourceDTO[]>([]);
  const [resourcesLoading, setResourcesLoading] = useState(false);

  // Conversations & streaming chat state
  const [conversations, setConversations] = useState<AiConversationDTO[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AiMessageDTO[]>([]);
  const [questionInput, setQuestionInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamDraft, setStreamDraft] = useState('');
  const [streamCitations, setStreamCitations] = useState<AiCitationDTO[]>([]);
  const [streamInsufficient, setStreamInsufficient] = useState(false);
  const streamAbortRef = useRef<AbortController | null>(null);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  // Summarizer state
  const [summarizing, setSummarizing] = useState(false);
  const [noteSummary, setNoteSummary] = useState<NoteSummaryResponseDTO | null>(null);

  // AI Quiz Generator state
  const [quizCount, setQuizCount] = useState(5);
  const [quizDifficulty, setQuizDifficulty] = useState<QuizDifficulty | ''>('');
  const [quizTopic, setQuizTopic] = useState('');
  const [generatingQuiz, setGeneratingQuiz] = useState(false);
  const [generatedQuiz, setGeneratedQuiz] = useState<GeneratedAiQuizResponseDTO | null>(
    null
  );

  // Presentation Assistant state
  const [presCourseId, setPresCourseId] = useState(
    searchParams.get('courseId') || ''
  );
  const [presTopics, setPresTopics] = useState<PresentationTopicDTO[]>([]);
  const [presTopicsLoading, setPresTopicsLoading] = useState(false);
  const [selectedTopicId, setSelectedTopicId] = useState(
    searchParams.get('topicId') || ''
  );
  const [focusNotes, setFocusNotes] = useState('');
  const [generatingBrief, setGeneratingBrief] = useState(false);
  const [briefResult, setBriefResult] = useState<PresentationAiBriefDTO | null>(null);
  const [savingBrief, setSavingBrief] = useState(false);
  const [copiedBrief, setCopiedBrief] = useState(false);

  const assistantManageableCourses = useMemo(() => {
    if (effectiveRole === 'ADMIN') return courses;
    if (effectiveRole === 'FACULTY') return courses.filter((c) => c.isCourseFaculty);
    if (effectiveRole === 'CR') return courses.filter((c) => c.isAssignedCR);
    return [];
  }, [courses, effectiveRole]);

  const loadQuotaAndHistory = useCallback(async () => {
    try {
      const [qRes, cRes] = await Promise.all([
        aiApi.getQuota(),
        aiApi.listConversations({ limit: 25 }),
      ]);
      setQuota(qRes.data.quota);
      setConversations(cRes.data.conversations);
    } catch {
      void 0;
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      await Promise.resolve();
      if (!active) return;
      setCoursesLoading(true);
      try {
        const res = await coursesApi.listMyCourses({ page: 1, limit: 50 });
        if (!active) return;
        const list = res.data.courses;
        setCourses(list);
        if (!selectedCourseId && list.length > 0) {
          setSelectedCourseId(list[0].id);
        }
        if (!presCourseId && list.length > 0) {
          const manageable = list.find(
            (c) =>
              effectiveRole === 'ADMIN' ||
              (effectiveRole === 'FACULTY' && c.isCourseFaculty) ||
              (effectiveRole === 'CR' && c.isAssignedCR)
          );
          if (manageable) setPresCourseId(manageable.id);
        }
        await loadQuotaAndHistory();
      } catch (err) {
        if (!active) return;
        const msg =
          err instanceof ApiClientError ? err.message : 'Unable to load courses.';
        showToast(msg, 'error');
      } finally {
        if (active) setCoursesLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [effectiveRole, loadQuotaAndHistory, presCourseId, selectedCourseId, showToast]);

  // Load resources when Study course changes
  useEffect(() => {
    let active = true;
    (async () => {
      await Promise.resolve();
      if (!active) return;
      if (!selectedCourseId) {
        setResources([]);
        return;
      }
      setResourcesLoading(true);
      try {
        const res = await resourcesApi.listByCourse(selectedCourseId, {
          page: 1,
          limit: 50,
        });
        if (!active) return;
        setResources(res.data.resources);
      } catch {
        if (active) setResources([]);
      } finally {
        if (active) setResourcesLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [selectedCourseId]);

  // Load presentation topics when Presentation Assistant course changes
  useEffect(() => {
    let active = true;
    (async () => {
      await Promise.resolve();
      if (!active) return;
      if (!canUsePresentationAssistant || !presCourseId) {
        setPresTopics([]);
        return;
      }
      setPresTopicsLoading(true);
      try {
        const res = await presentationsApi.listByCourse(presCourseId, {
          page: 1,
          limit: 50,
        });
        if (!active) return;
        const list = res.data.topics;
        setPresTopics(list);
        if (
          list.length > 0 &&
          (!selectedTopicId || !list.some((t) => t.id === selectedTopicId))
        ) {
          setSelectedTopicId(list[0].id);
          setBriefResult(list[0].aiBrief ?? null);
        } else {
          const activeTopic = list.find((t) => t.id === selectedTopicId);
          if (activeTopic?.aiBrief) {
            setBriefResult((prev) => prev ?? activeTopic.aiBrief ?? null);
          }
        }
      } catch {
        if (active) setPresTopics([]);
      } finally {
        if (active) setPresTopicsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [canUsePresentationAssistant, presCourseId, selectedTopicId]);

  const readyPdfResources = useMemo(
    () =>
      resources.filter(
        (r) =>
          r.status === ResourceStatus.READY &&
          r.file.mimeType === 'application/pdf'
      ),
    [resources]
  );

  const selectedResource = useMemo(
    () => readyPdfResources.find((r) => r.id === selectedResourceId) || null,
    [readyPdfResources, selectedResourceId]
  );

  const selectedTopic = useMemo(
    () => presTopics.find((t) => t.id === selectedTopicId) || null,
    [presTopics, selectedTopicId]
  );

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamDraft]);

  const startNewChat = () => {
    if (streaming) return;
    setActiveConversationId(null);
    setMessages([]);
    setStreamDraft('');
    setStreamCitations([]);
    setStreamInsufficient(false);
  };

  const handleLoadConversation = async (convId: string) => {
    if (streaming) return;
    try {
      const res = await aiApi.getConversation(convId);
      const conv = res.data.conversation;
      setActiveConversationId(conv.id);
      setSelectedCourseId(conv.courseId);
      setSelectedResourceId(conv.resourceId || '');
      setMessages(conv.messages);
      setNoteSummary(null);
      setGeneratedQuiz(null);
    } catch (err) {
      const msg =
        err instanceof ApiClientError ? err.message : 'Unable to load conversation.';
      showToast(msg, 'error');
    }
  };

  const handleDeleteConversation = async (convId: string) => {
    try {
      await aiApi.deleteConversation(convId);
      setConversations((prev) => prev.filter((c) => c.id !== convId));
      if (activeConversationId === convId) {
        startNewChat();
      }
      showToast('Conversation removed.', 'info');
    } catch (err) {
      const msg =
        err instanceof ApiClientError ? err.message : 'Unable to delete conversation.';
      showToast(msg, 'error');
    }
  };

  const handleAskQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = questionInput.trim();
    if (!selectedCourseId || q.length < 3 || streaming) return;

    const tempUserMsg: AiMessageDTO = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: q,
      citations: [],
      insufficientEvidence: false,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, tempUserMsg]);
    setQuestionInput('');
    setStreaming(true);
    setStreamDraft('');
    setStreamCitations([]);
    setStreamInsufficient(false);

    const abortController = new AbortController();
    streamAbortRef.current = abortController;

    let accumulatedCitations: AiCitationDTO[] = [];
    let insufficient = false;

    try {
      await aiApi.askStudyAssistantStream(
        {
          courseId: selectedCourseId,
          resourceId: selectedResourceId || null,
          conversationId: activeConversationId,
          question: q,
        },
        {
          onCitations: (data) => {
            accumulatedCitations = data.citations;
            insufficient = data.insufficientEvidence;
            setStreamCitations(data.citations);
            setStreamInsufficient(data.insufficientEvidence);
          },
          onDelta: (delta) => {
            setStreamDraft((prev) => prev + delta);
          },
          onDone: (doneData) => {
            setActiveConversationId(doneData.conversation.id);
            setMessages(doneData.conversation.messages);
            setQuota(doneData.quota);
            setConversations((prev) => {
              const filtered = prev.filter((c) => c.id !== doneData.conversation.id);
              return [doneData.conversation, ...filtered];
            });
          },
        },
        abortController.signal
      );
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') {
        showToast('Study Assistant response stopped.', 'info');
      } else {
        const msg =
          err instanceof ApiClientError
            ? err.message
            : 'Study Assistant failed to respond.';
        showToast(msg, 'error');
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: 'assistant',
            content: `Unable to complete response: ${msg}`,
            citations: accumulatedCitations,
            insufficientEvidence: insufficient,
            createdAt: new Date().toISOString(),
          },
        ]);
      }
    } finally {
      setStreaming(false);
      setStreamDraft('');
      streamAbortRef.current = null;
    }
  };

  const handleSummarizeNote = async () => {
    if (!selectedCourseId || !selectedResourceId) {
      showToast('Select a ready PDF note first to summarize it.', 'info');
      return;
    }
    setSummarizing(true);
    try {
      const res = await aiApi.summarizeNote({
        courseId: selectedCourseId,
        resourceId: selectedResourceId,
      });
      setNoteSummary(res.data);
      setQuota(res.data.quota);
      showToast('Note summary generated.', 'success');
    } catch (err) {
      const msg =
        err instanceof ApiClientError ? err.message : 'Unable to summarize this note.';
      showToast(msg, 'error');
    } finally {
      setSummarizing(false);
    }
  };

  const handleGenerateQuiz = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCourseId || !selectedResourceId) {
      showToast('Select a ready PDF note first to generate quiz questions.', 'info');
      return;
    }
    setGeneratingQuiz(true);
    try {
      const res = await aiApi.generateQuiz({
        courseId: selectedCourseId,
        resourceId: selectedResourceId,
        count: quizCount,
        difficulty: quizDifficulty || undefined,
        topic: quizTopic.trim() || undefined,
      });
      setGeneratedQuiz(res.data);
      setQuota(res.data.quota);
      showToast(
        `Generated ${res.data.generatedCount} AI questions (saved as PENDING).`,
        'success'
      );
    } catch (err) {
      const msg =
        err instanceof ApiClientError
          ? err.message
          : 'Unable to generate quiz questions from note.';
      showToast(msg, 'error');
    } finally {
      setGeneratingQuiz(false);
    }
  };

  const handleGeneratePresentationBrief = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTopicId) {
      showToast('Select a presentation topic first.', 'info');
      return;
    }
    setGeneratingBrief(true);
    try {
      const res = await aiApi.assistPresentation({
        topicId: selectedTopicId,
        focusNotes: focusNotes.trim() || undefined,
      });
      setBriefResult(res.data.brief);
      setQuota(res.data.quota);
      showToast('AI presentation brief generated.', 'success');
    } catch (err) {
      const msg =
        err instanceof ApiClientError
          ? err.message
          : 'Failed to generate presentation brief.';
      showToast(msg, 'error');
    } finally {
      setGeneratingBrief(false);
    }
  };

  const handleSaveBriefToTopic = async () => {
    if (!selectedTopicId || !briefResult) return;
    setSavingBrief(true);
    try {
      const res = await aiApi.savePresentationBrief(selectedTopicId, briefResult);
      setPresTopics((prev) =>
        prev.map((t) => (t.id === res.data.topic.id ? res.data.topic : t))
      );
      if (res.data.topic.aiBrief) {
        setBriefResult(res.data.topic.aiBrief);
      }
      showToast('Brief saved to presentation topic.', 'success');
    } catch (err) {
      const msg =
        err instanceof ApiClientError ? err.message : 'Could not save brief to topic.';
      showToast(msg, 'error');
    } finally {
      setSavingBrief(false);
    }
  };

  const handleCopyBrief = async () => {
    if (!briefResult || !selectedTopic) return;
    try {
      await navigator.clipboard.writeText(
        formatBriefAsMarkdown(selectedTopic.title, briefResult)
      );
      setCopiedBrief(true);
      showToast('Presentation brief copied to clipboard.', 'success');
      window.setTimeout(() => setCopiedBrief(false), 2000);
    } catch {
      showToast('Clipboard access was denied by the browser.', 'error');
    }
  };

  return (
    <DashboardLayout
      title="AI Study & Presentation Assistant"
      subtitle="Grounded Q&A over indexed course PDFs, note summaries, AI practice question generation, and presentation planning."
      breadcrumb="AI Assistant"
      actions={
        quota ? (
          <div className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs text-[#162B4D] tabular-nums">
            Daily AI Quota:{' '}
            <strong className="text-[#2563EB]">
              {quota.remaining} / {quota.dailyLimit}
            </strong>{' '}
            remaining
          </div>
        ) : null
      }
    >
      {/* Workspace Mode Switcher */}
      <div
        role="tablist"
        aria-label="AI workspace tools"
        className="flex flex-wrap gap-2 border-b border-slate-200 pb-3 mb-6"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'study'}
          onClick={() => setTab('study')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
            activeTab === 'study'
              ? 'bg-[#2563EB] text-white'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Bot className="w-4 h-4" aria-hidden="true" />
          Study Assistant & Note AI
        </button>

        {canUsePresentationAssistant && (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'presentation'}
            onClick={() => setTab('presentation')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'presentation'
                ? 'bg-[#6D5BD0] text-white'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            <Presentation className="w-4 h-4" aria-hidden="true" />
            Presentation Assistant (CR & Faculty)
          </button>
        )}
      </div>

      {/* =================================================================== */}
      {/* TAB 1: STUDY ASSISTANT, SUMMARIZER & AI QUIZ GENERATION             */}
      {/* =================================================================== */}
      {activeTab === 'study' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Rail: Scope Controls & Conversation History */}
          <div className="lg:col-span-4 space-y-5">
            <Card>
              <h2 className="font-display text-base font-semibold text-[#162B4D] mb-3">
                1. Course & Note Scope
              </h2>

              {coursesLoading ? (
                <CardSkeleton rows={2} />
              ) : courses.length === 0 ? (
                <EmptyState
                  icon={BookOpen}
                  title="No accessible courses"
                  description="Enroll in a course or get assigned as CR/Faculty to query course notes."
                />
              ) : (
                <div className="space-y-3">
                  <div>
                    <label
                      htmlFor="ai-course"
                      className="block text-xs font-medium text-slate-600 mb-1"
                    >
                      Course
                    </label>
                    <select
                      id="ai-course"
                      value={selectedCourseId}
                      onChange={(e) => {
                        setSelectedCourseId(e.target.value);
                        setSelectedResourceId('');
                        setNoteSummary(null);
                        setGeneratedQuiz(null);
                        startNewChat();
                      }}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#162B4D] focus:border-[#2563EB] focus:outline-none"
                    >
                      <option value="">Select a course...</option>
                      {courses.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.courseCode} — {c.courseName}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="ai-resource"
                      className="block text-xs font-medium text-slate-600 mb-1"
                    >
                      Course PDF Note (required for Summarize / Quiz Gen)
                    </label>
                    <select
                      id="ai-resource"
                      disabled={resourcesLoading || !selectedCourseId}
                      value={selectedResourceId}
                      onChange={(e) => {
                        setSelectedResourceId(e.target.value);
                        setNoteSummary(null);
                        setGeneratedQuiz(null);
                      }}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#162B4D] focus:border-[#2563EB] focus:outline-none disabled:bg-slate-50"
                    >
                      <option value="">All Indexed Course Notes (Q&A)</option>
                      {readyPdfResources.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.title} ({r.pageCount || '?'}p · {r.chunkCount ?? 0} chunks)
                        </option>
                      ))}
                    </select>
                    {!resourcesLoading && selectedCourseId && readyPdfResources.length === 0 && (
                      <p className="text-xs text-[#b45309] mt-1.5">
                        No indexed PDF notes are ready in this course yet.
                      </p>
                    )}
                  </div>

                  {selectedResource && (
                    <div className="pt-2 border-t border-slate-100 space-y-3">
                      <Button
                        type="button"
                        variant="teal"
                        size="sm"
                        className="w-full"
                        loading={summarizing}
                        onClick={handleSummarizeNote}
                      >
                        <FileText className="w-4 h-4" aria-hidden="true" />
                        Summarize this note
                      </Button>

                      <form
                        onSubmit={handleGenerateQuiz}
                        className="rounded-xl border border-slate-200 bg-[#F3F6FB] p-3 space-y-2.5"
                      >
                        <p className="text-xs font-semibold text-[#162B4D] flex items-center gap-1.5">
                          <HelpCircle className="w-3.5 h-3.5 text-[#6D5BD0]" aria-hidden="true" />
                          Generate Practice Quiz from Note
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label
                              htmlFor="ai-quiz-count"
                              className="block text-[11px] text-slate-600 mb-0.5"
                            >
                              Count (1–10)
                            </label>
                            <input
                              id="ai-quiz-count"
                              type="number"
                              min={1}
                              max={10}
                              value={quizCount}
                              onChange={(e) =>
                                setQuizCount(
                                  Math.min(10, Math.max(1, Number(e.target.value) || 5))
                                )
                              }
                              className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
                            />
                          </div>
                          <div>
                            <label
                              htmlFor="ai-quiz-diff"
                              className="block text-[11px] text-slate-600 mb-0.5"
                            >
                              Difficulty
                            </label>
                            <select
                              id="ai-quiz-diff"
                              value={quizDifficulty}
                              onChange={(e) =>
                                setQuizDifficulty(e.target.value as QuizDifficulty | '')
                              }
                              className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
                            >
                              <option value="">Mixed</option>
                              <option value={QuizDifficulty.EASY}>Easy</option>
                              <option value={QuizDifficulty.MEDIUM}>Medium</option>
                              <option value={QuizDifficulty.HARD}>Hard</option>
                            </select>
                          </div>
                        </div>
                        <input
                          type="text"
                          value={quizTopic}
                          onChange={(e) => setQuizTopic(e.target.value)}
                          placeholder="Optional focus topic..."
                          maxLength={120}
                          className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                        />
                        <Button
                          type="submit"
                          variant="primary"
                          size="sm"
                          className="w-full"
                          loading={generatingQuiz}
                        >
                          <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                          Generate AI Questions
                        </Button>
                      </form>
                    </div>
                  )}
                </div>
              )}
            </Card>

            {/* Conversation History */}
            <Card>
              <div className="flex items-center justify-between gap-2 mb-3">
                <h2 className="font-display text-base font-semibold text-[#162B4D]">
                  Conversation History
                </h2>
                <button
                  type="button"
                  onClick={startNewChat}
                  className="inline-flex items-center gap-1 text-xs font-medium text-[#2563EB] hover:underline cursor-pointer"
                >
                  <MessageSquarePlus className="w-3.5 h-3.5" aria-hidden="true" />
                  New Chat
                </button>
              </div>

              {conversations.length === 0 ? (
                <p className="text-xs text-slate-500">
                  Your saved Q&A sessions with citations will appear here.
                </p>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {conversations.map((conv) => {
                    const active = conv.id === activeConversationId;
                    return (
                      <div
                        key={conv.id}
                        className={`rounded-lg border p-2.5 flex items-start justify-between gap-2 transition-colors ${
                          active
                            ? 'border-[#2563EB] bg-[#2563EB]/[0.06]'
                            : 'border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => handleLoadConversation(conv.id)}
                          className="text-left min-w-0 flex-1 cursor-pointer"
                        >
                          <div className="flex items-center gap-1.5 text-[11px]">
                            <span className="font-mono font-semibold text-[#2563EB]">
                              {conv.courseCode}
                            </span>
                            <span className="text-slate-400">·</span>
                            <span className="text-slate-500 tabular-nums">
                              {new Date(conv.updatedAt).toLocaleDateString()}
                            </span>
                          </div>
                          <p className="text-xs font-medium text-[#162B4D] truncate mt-0.5">
                            {conv.title}
                          </p>
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete conversation ${conv.title}`}
                          onClick={() => handleDeleteConversation(conv.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>

          {/* Main Panel: Streamed Q&A + Note Summary + Generated Quiz Preview */}
          <div className="lg:col-span-8 space-y-6">
            {/* Note Summary Result Card */}
            {noteSummary && (
              <Card className="border-[#1D9BA6]/40">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <AiGeneratedBadge />
                      <span className="text-xs text-slate-500">
                        {noteSummary.fileName}
                      </span>
                    </div>
                    <h3 className="font-display text-base font-semibold text-[#162B4D]">
                      Note Summary: {noteSummary.resourceTitle}
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setNoteSummary(null)}
                    className="text-xs text-slate-500 hover:text-[#162B4D] cursor-pointer"
                  >
                    Dismiss
                  </button>
                </div>

                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                  {noteSummary.summary}
                </p>

                {noteSummary.keyTakeaways.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-slate-100">
                    <p className="text-xs font-semibold text-[#162B4D] mb-2">
                      Key Takeaways
                    </p>
                    <ul className="space-y-1.5 text-sm text-slate-700 list-disc pl-5">
                      {noteSummary.keyTakeaways.map((kt, idx) => (
                        <li key={idx}>{kt}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </Card>
            )}

            {/* Generated Quiz Result Card */}
            {generatedQuiz && (
              <Card className="border-[#6D5BD0]/40">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <AiGeneratedBadge />
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-50 text-[#b45309] border border-amber-200">
                        Saved as PENDING (Private Practice Ready)
                      </span>
                    </div>
                    <h3 className="font-display text-base font-semibold text-[#162B4D]">
                      Generated {generatedQuiz.generatedCount} Question(s) from{' '}
                      {generatedQuiz.resourceTitle}
                    </h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="teal"
                      onClick={() =>
                        navigate(
                          `/quizzes?tab=practice&courseId=${selectedCourseId}&includePrivateAi=1`
                        )
                      }
                    >
                      <Play className="w-3.5 h-3.5" aria-hidden="true" />
                      Practice Privately Now
                    </Button>
                    <button
                      type="button"
                      onClick={() => setGeneratedQuiz(null)}
                      className="text-xs text-slate-500 hover:text-[#162B4D] cursor-pointer"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
                <p className="text-xs text-slate-600 mb-3">
                  These AI questions are available immediately in your private timed practice mode. Faculty approval is required before they enter the public course quiz bank. Answer keys remain hidden until quiz submission.
                </p>
                <div className="space-y-2.5">
                  {generatedQuiz.questions.map((q, idx) => (
                    <div
                      key={q.id}
                      className="rounded-lg border border-slate-200 bg-[#F3F6FB] p-3 text-sm"
                    >
                      <div className="flex flex-wrap items-center gap-2 text-xs mb-1">
                        <span className="font-semibold text-[#162B4D]">
                          Q{idx + 1}
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-700">
                          {q.topic}
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-600">
                          {q.difficulty} · {q.type}
                        </span>
                      </div>
                      <p className="font-medium text-[#162B4D]">{q.questionText}</p>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Streamed Study Chat Card */}
            <Card className="flex flex-col min-h-[540px]">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-4 mb-4 border-b border-slate-200">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-display text-lg font-semibold text-[#162B4D]">
                      Course Notes Q&A
                    </h2>
                    <AiGeneratedBadge />
                  </div>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Answers are strictly grounded in uploaded PDFs from courses you can access and cite file + page numbers.
                  </p>
                </div>
                {streaming && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => streamAbortRef.current?.abort()}
                  >
                    Stop Generating
                  </Button>
                )}
              </div>

              {/* Message Thread */}
              <div className="flex-1 space-y-4 overflow-y-auto max-h-[480px] pr-1 mb-4">
                {messages.length === 0 && !streaming ? (
                  <EmptyState
                    icon={Bot}
                    title="Ask a question about your course notes"
                    description="Pick a course on the left and ask about definitions, algorithms, proofs, or concepts covered in your uploaded PDFs."
                  />
                ) : (
                  messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`rounded-xl p-4 ${
                        msg.role === 'user'
                          ? 'bg-[#2563EB]/[0.08] border border-[#2563EB]/20 ml-6'
                          : 'bg-[#F3F6FB] border border-slate-200 mr-4'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5 text-xs">
                        <span className="font-semibold text-[#162B4D]">
                          {msg.role === 'user' ? 'You' : 'Study Assistant'}
                        </span>
                        {msg.role === 'assistant' && <AiGeneratedBadge />}
                      </div>

                      {msg.insufficientEvidence && (
                        <div className="mb-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-[#92400e] flex items-center gap-2">
                          <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                          <span>
                            Insufficient evidence found in the selected course notes.
                          </span>
                        </div>
                      )}

                      <p className="text-sm text-[#162B4D] leading-relaxed whitespace-pre-wrap">
                        {msg.content}
                      </p>

                      {msg.citations && msg.citations.length > 0 && (
                        <div className="mt-3 pt-2.5 border-t border-slate-200/80">
                          <p className="text-[11px] font-semibold text-slate-500 mb-1.5">
                            Sources Cited
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {msg.citations.map((cit, idx) => (
                              <span
                                key={`${msg.id}-cit-${idx}`}
                                title={cit.excerpt}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white border border-slate-200 text-[11px] text-[#162B4D]"
                              >
                                <FileText
                                  className="w-3 h-3 text-[#2563EB]"
                                  aria-hidden="true"
                                />
                                <span className="font-medium">{cit.fileName}</span>
                                <span className="text-slate-500 tabular-nums">
                                  p.{cit.pageNumber}
                                </span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}

                {streaming && (
                  <div className="rounded-xl p-4 bg-[#F3F6FB] border border-[#2563EB]/30 mr-4">
                    <div className="flex items-center justify-between gap-2 mb-1.5 text-xs">
                      <span className="font-semibold text-[#162B4D] inline-flex items-center gap-1.5">
                        <Loader2
                          className="w-3.5 h-3.5 animate-spin text-[#2563EB]"
                          aria-hidden="true"
                        />
                        Study Assistant
                      </span>
                      <AiGeneratedBadge />
                    </div>

                    {streamInsufficient && (
                      <div className="mb-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-[#92400e]">
                        Insufficient evidence found in selected notes.
                      </div>
                    )}

                    <p className="text-sm text-[#162B4D] leading-relaxed whitespace-pre-wrap">
                      {streamDraft || 'Searching indexed course chunks...'}
                    </p>

                    {streamCitations.length > 0 && (
                      <div className="mt-3 pt-2.5 border-t border-slate-200/80 flex flex-wrap gap-1.5">
                        {streamCitations.map((cit, idx) => (
                          <span
                            key={`stream-cit-${idx}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white border border-slate-200 text-[11px] text-[#162B4D]"
                          >
                            <FileText
                              className="w-3 h-3 text-[#2563EB]"
                              aria-hidden="true"
                            />
                            <span>{cit.fileName}</span>
                            <span className="text-slate-500 tabular-nums">
                              p.{cit.pageNumber}
                            </span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div ref={chatBottomRef} />
              </div>

              {/* Prompt Input */}
              <form
                onSubmit={handleAskQuestion}
                className="pt-3 border-t border-slate-200 flex gap-2"
              >
                <input
                  type="text"
                  value={questionInput}
                  disabled={!selectedCourseId || streaming}
                  onChange={(e) => setQuestionInput(e.target.value)}
                  maxLength={1500}
                  placeholder={
                    selectedCourseId
                      ? 'Ask a question grounded in your selected course notes...'
                      : 'Select a course first...'
                  }
                  className="flex-1 rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-[#162B4D] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20 disabled:bg-slate-50"
                />
                <Button
                  type="submit"
                  variant="primary"
                  disabled={!selectedCourseId || questionInput.trim().length < 3}
                  loading={streaming}
                >
                  <Send className="w-4 h-4" aria-hidden="true" />
                  Ask
                </Button>
              </form>
            </Card>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 2: PRESENTATION ASSISTANT (CR, FACULTY, ADMIN)                  */}
      {/* =================================================================== */}
      {activeTab === 'presentation' && canUsePresentationAssistant && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <Card className="lg:col-span-4 h-fit">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h2 className="font-display text-base font-semibold text-[#162B4D]">
                Select Assigned Topic
              </h2>
              <AiGeneratedBadge />
            </div>

            {assistantManageableCourses.length === 0 ? (
              <EmptyState
                icon={Presentation}
                title="No assigned courses"
                description="Presentation Assistant is available for courses where you are Faculty, assigned CR, or Admin."
              />
            ) : (
              <form onSubmit={handleGeneratePresentationBrief} className="space-y-4">
                <div>
                  <label
                    htmlFor="pres-course"
                    className="block text-xs font-medium text-slate-600 mb-1"
                  >
                    Course
                  </label>
                  <select
                    id="pres-course"
                    value={presCourseId}
                    onChange={(e) => {
                      setPresCourseId(e.target.value);
                      setSelectedTopicId('');
                      setBriefResult(null);
                    }}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#162B4D] focus:border-[#6D5BD0] focus:outline-none"
                  >
                    <option value="">Select course...</option>
                    {assistantManageableCourses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.courseCode} — {c.courseName}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="pres-topic"
                    className="block text-xs font-medium text-slate-600 mb-1"
                  >
                    Presentation Topic
                  </label>
                  <select
                    id="pres-topic"
                    disabled={presTopicsLoading || presTopics.length === 0}
                    value={selectedTopicId}
                    onChange={(e) => {
                      const tid = e.target.value;
                      setSelectedTopicId(tid);
                      const found = presTopics.find((t) => t.id === tid);
                      setBriefResult(found?.aiBrief ?? null);
                    }}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#162B4D] focus:border-[#6D5BD0] focus:outline-none disabled:bg-slate-50"
                  >
                    {presTopics.length === 0 ? (
                      <option value="">No topics assigned in this course</option>
                    ) : (
                      presTopics.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.title}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                {selectedTopic && (
                  <div className="rounded-lg bg-[#F3F6FB] border border-slate-200 p-3 text-xs text-slate-600 space-y-1">
                    <p className="font-semibold text-[#162B4D]">
                      Topic Prompt
                    </p>
                    <p>{selectedTopic.description}</p>
                    <p className="text-[11px] text-slate-500 pt-1 tabular-nums">
                      Due {new Date(selectedTopic.dueDate).toLocaleDateString()}
                    </p>
                  </div>
                )}

                <div>
                  <label
                    htmlFor="pres-focus"
                    className="block text-xs font-medium text-slate-600 mb-1"
                  >
                    Coordinator / Faculty Focus (optional)
                  </label>
                  <textarea
                    id="pres-focus"
                    rows={3}
                    maxLength={600}
                    value={focusNotes}
                    onChange={(e) => setFocusNotes(e.target.value)}
                    placeholder="e.g., Emphasize live architecture demo, trade-offs, and 10-minute timing..."
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-[#162B4D] focus:border-[#6D5BD0] focus:outline-none"
                  />
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  className="w-full"
                  loading={generatingBrief}
                  disabled={!selectedTopicId}
                >
                  <Sparkles className="w-4 h-4" aria-hidden="true" />
                  Generate Presentation Brief
                </Button>
              </form>
            )}
          </Card>

          <Card className="lg:col-span-8">
            {!briefResult ? (
              <EmptyState
                icon={Presentation}
                title="Generate a structured presentation brief"
                description="Select an assigned topic on the left to create an explanation, subtopics, slide outline, discussion points, likely Q&A, and conclusion."
              />
            ) : (
              <div className="space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <AiGeneratedBadge />
                      {briefResult.savedAt && (
                        <span className="text-xs text-emerald-700 font-medium">
                          Saved to topic on{' '}
                          {new Date(briefResult.savedAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    <h2 className="font-display text-lg font-bold text-[#162B4D]">
                      {selectedTopic?.title}
                    </h2>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={handleCopyBrief}
                    >
                      {copiedBrief ? (
                        <Check className="w-4 h-4 text-emerald-600" aria-hidden="true" />
                      ) : (
                        <Copy className="w-4 h-4" aria-hidden="true" />
                      )}
                      {copiedBrief ? 'Copied' : 'Copy Brief'}
                    </Button>
                    <Button
                      size="sm"
                      variant="teal"
                      loading={savingBrief}
                      onClick={handleSaveBriefToTopic}
                    >
                      <Save className="w-4 h-4" aria-hidden="true" />
                      Save to Topic
                    </Button>
                  </div>
                </div>

                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                    Topic Explanation
                  </h3>
                  <p className="text-sm text-[#162B4D] leading-relaxed">
                    {briefResult.explanation}
                  </p>
                </section>

                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                    Core Subtopics
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {briefResult.subtopics.map((sub, idx) => (
                      <span
                        key={idx}
                        className="px-3 py-1 rounded-lg bg-[#2563EB]/[0.08] border border-[#2563EB]/20 text-xs font-medium text-[#162B4D]"
                      >
                        {sub}
                      </span>
                    ))}
                  </div>
                </section>

                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                    Structured Presentation Outline
                  </h3>
                  <div className="space-y-3">
                    {briefResult.outline.map((sec, idx) => (
                      <div
                        key={idx}
                        className="rounded-xl border border-slate-200 bg-[#F3F6FB] p-3.5"
                      >
                        <p className="text-sm font-semibold text-[#162B4D] mb-1.5">
                          {idx + 1}. {sec.section}
                        </p>
                        <ul className="list-disc pl-5 space-y-1 text-xs sm:text-sm text-slate-700">
                          {sec.keyPoints.map((kp, kIdx) => (
                            <li key={kIdx}>{kp}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </section>

                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                    Class Discussion Points
                  </h3>
                  <ul className="list-disc pl-5 space-y-1.5 text-sm text-slate-700">
                    {briefResult.discussionPoints.map((dp, idx) => (
                      <li key={idx}>{dp}</li>
                    ))}
                  </ul>
                </section>

                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                    Anticipated Questions & Suggested Answers
                  </h3>
                  <div className="space-y-2.5">
                    {briefResult.possibleQuestions.map((qa, idx) => (
                      <div
                        key={idx}
                        className="rounded-xl border border-slate-200 p-3.5 space-y-1"
                      >
                        <p className="text-sm font-semibold text-[#162B4D]">
                          Q{idx + 1}: {qa.question}
                        </p>
                        <p className="text-xs sm:text-sm text-slate-600">
                          {qa.suggestedAnswer}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="rounded-xl bg-[#1D9BA6]/[0.06] border border-[#1D9BA6]/25 p-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[#12737c] mb-1">
                    Conclusion & Key Takeaway
                  </h3>
                  <p className="text-sm text-[#162B4D] leading-relaxed">
                    {briefResult.conclusion}
                  </p>
                </section>
              </div>
            )}
          </Card>
        </div>
      )}
    </DashboardLayout>
  );
}
