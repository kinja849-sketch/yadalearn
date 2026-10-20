import { useState, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { formatDistanceToNow } from 'date-fns';
import { useTeacherAI } from '@/hooks/useTeacherAI';
import type { GradeSubmissionResponse } from '@/types/ai';

interface ReviewSubmissionsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

interface Submission {
    id: string;
    content: string;
    submission_type: 'text' | 'link' | 'file';
    submitted_at: string;
    status: string;
    grade?: string | number;
    feedback?: string;
    student: {
        full_name: string;
        avatar_url: string;
    };
    assignment: {
        title: string;
    };
}

export const ReviewSubmissionsModal = ({ isOpen, onClose }: ReviewSubmissionsModalProps) => {
    const { user } = useAuth();
    const { gradeSubmission, isLoading: isAiGrading } = useTeacherAI();
    const [activeFilter, setActiveFilter] = useState('all');
    const [submissions, setSubmissions] = useState<Submission[]>([]);
    const [loading, setLoading] = useState(false);

    // Grading State
    const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(null);
    const [grade, setGrade] = useState('');
    const [feedback, setFeedback] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [aiSuggestion, setAiSuggestion] = useState<GradeSubmissionResponse | null>(null);


    useEffect(() => {
        if (isOpen && user?.id) {
            fetchSubmissions();
        }
    }, [isOpen, user?.id, activeFilter]); // Re-fetch on filter change if needed, or filter client-side

    const fetchSubmissions = async () => {
        if (!user?.id) return;
        setLoading(true);
        try {
            // Fetch submissions for courses taught by this teacher
            // This requires a complex join or multiple queries. 
            // Supabase approach: select submissions, join assignments (filter by teacher_id indirectly via course)

            // Step 1: Get courses taught by teacher
            const { data: courses } = await supabase.from('courses').select('id').eq('teacher_id', user.id);

            if (courses && courses.length > 0) {
                const courseIds = courses.map(c => c.id);

                // Step 2: Get assignments for these courses
                const { data: assignments } = await supabase.from('assignments').select('id').in('course_id', courseIds);

                if (assignments && assignments.length > 0) {
                    const assignmentIds = assignments.map(a => a.id);

                    // Step 3: Get submissions for these assignments
                    let query = supabase
                        .from('submissions')
                        .select(`
                            id, content, submission_type, submitted_at, status, grade, feedback,
                            student:profiles!student_id(full_name, avatar_url),
                            assignment:assignments!assignment_id(title)
                        `)
                        .in('assignment_id', assignmentIds)
                        .order('submitted_at', { ascending: false });

                    if (activeFilter !== 'all') {
                        if (activeFilter === 'graded') query = query.eq('status', 'graded');
                        else query = query.neq('status', 'graded'); // pending/submitted
                    }

                    const { data, error } = await query;

                    if (error) throw error;

                    // Transform to match interface (handle array/single select quirks if any)
                    const formatted = (data || []).map((s: any) => ({
                        id: s.id,
                        content: s.content,
                        submission_type: s.submission_type,
                        submitted_at: s.submitted_at,
                        status: s.status,
                        grade: s.grade,
                        feedback: s.feedback,
                        student: {
                            full_name: s.student?.full_name || 'Unknown Student',
                            avatar_url: s.student?.avatar_url || ''
                        },
                        assignment: {
                            title: s.assignment?.title || 'Untitled Assignment'
                        }
                    }));

                    setSubmissions(formatted);

                    // Select first one by default if none selected
                    if (!selectedSubmissionId && formatted.length > 0) {
                        setSelectedSubmissionId(formatted[0].id);
                    }
                } else {
                    setSubmissions([]);
                }
            } else {
                setSubmissions([]);
            }
        } catch (err) {
            console.error('Error fetching submissions', err);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmitGrade = async () => {
        if (!selectedSubmissionId) return;
        setSubmitting(true);
        try {
            const { error } = await supabase
                .from('submissions')
                .update({
                    grade: grade,
                    feedback: feedback,
                    status: 'graded'
                })
                .eq('id', selectedSubmissionId);

            if (error) throw error;

            alert('Grade submitted!');
            // Update local state
            setSubmissions(prev => prev.map(s =>
                s.id === selectedSubmissionId ? { ...s, grade, feedback, status: 'graded' } : s
            ));

            // Clear inputs or move to next
            setGrade('');
            setFeedback('');

        } catch (err) {
            alert('Error submitting grade');
            console.error(err);
        } finally {
            setSubmitting(false);
        }
    };

    const selectedSubmission = submissions.find(s => s.id === selectedSubmissionId);
    const quickFeedback = ['✨ Excellent point', '⚠️ Cite sources', '📝 Revise', '👏 Great work'];

    const handleGenerateAiReview = async () => {
        if (!selectedSubmission) return;
        const result = await gradeSubmission(
            selectedSubmission.assignment.title,
            selectedSubmission.content,
            selectedSubmission.student.full_name
        );
        if (result) {
            setAiSuggestion(result);
        }
    };

    const handleApplySuggestion = () => {
        if (!aiSuggestion) return;
        setGrade(aiSuggestion.suggestedGrade.toString());
        setFeedback(aiSuggestion.suggestedFeedback);
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="!max-w-4xl mx-auto bg-white dark:bg-zinc-900 text-gray-900 dark:text-white border-0 p-0 overflow-hidden rounded-[2.5rem] max-h-[85vh] flex flex-col shadow-2xl">
                {/* Top App Bar */}
                <div className="flex flex-col gap-2 p-6 pb-3 bg-white dark:bg-zinc-900 sticky top-0 z-30 border-b border-gray-150 dark:border-zinc-800 shadow-sm flex-none">
                    <div className="flex items-center h-12 justify-between">
                        <div className="flex items-center gap-3">
                            <button
                                onClick={onClose}
                                className="text-gray-900 dark:text-white flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
                            >
                                <span className="material-symbols-outlined">arrow_back</span>
                            </button>
                            <h1 className="text-xl font-extrabold leading-tight tracking-tight">Review Submissions</h1>
                        </div>
                    </div>

                    {/* Filter Chips */}
                    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 pt-1">
                        {['all', 'pending', 'graded'].map(filter => (
                            <button
                                key={filter}
                                onClick={() => setActiveFilter(filter)}
                                className={`flex h-8 shrink-0 items-center justify-center gap-x-2 rounded-full px-4 transition-transform active:scale-95 ${activeFilter === filter
                                    ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20 font-bold'
                                    : 'bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:border-orange-500/50'
                                    }`}
                            >
                                <span className="text-xs font-semibold capitalize">{filter}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Main Content Area: Split Pane */}
                <div className="flex-1 overflow-hidden min-h-0 flex flex-col md:flex-row">
                    {loading ? (
                        <div className="flex justify-center p-10 w-full"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div></div>
                    ) : submissions.length === 0 ? (
                        <div className="p-8 text-center text-gray-500 w-full">
                            <p>No submissions found.</p>
                            <p className="text-xs mt-2">Try initializing teacher data in dashboard if testing.</p>
                        </div>
                    ) : (
                        <>
                            {/* Queue List Pane (Left Column) */}
                            <div className="w-full md:w-1/3 border-b md:border-b-0 md:border-r border-gray-150 dark:border-zinc-800 p-4 overflow-y-auto min-h-0">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-base font-extrabold text-gray-900 dark:text-white">Queue</h3>
                                    <span className="text-xs font-bold text-orange-600 dark:text-orange-400 bg-orange-100 dark:bg-orange-950/30 px-2 py-0.5 rounded-md">
                                        {submissions.filter(s => s.status !== 'graded').length} Pending
                                    </span>
                                </div>
                                <div className="flex flex-col gap-3">
                                    {submissions.map((submission) => (
                                        <div
                                            key={submission.id}
                                            onClick={() => {
                                                setSelectedSubmissionId(submission.id);
                                                setGrade(submission.grade?.toString() || '');
                                                setFeedback(submission.feedback || '');
                                                setAiSuggestion(null);
                                            }}
                                            className={`flex gap-3 p-3 rounded-2xl border transition-all cursor-pointer group relative overflow-hidden ${selectedSubmissionId === submission.id
                                                    ? 'bg-orange-550/10 dark:bg-orange-950/10 border-orange-500 shadow-sm'
                                                    : 'bg-white dark:bg-zinc-800/40 border-gray-200 dark:border-zinc-800 hover:bg-gray-50/50'
                                                }`}
                                        >
                                            <div className="bg-center bg-no-repeat bg-cover rounded-full h-10 w-10 shrink-0 border border-orange-550/20" style={{ backgroundImage: `url(${submission.student.avatar_url || 'https://i.pravatar.cc/150'})` }}></div>
                                            <div className="flex flex-1 flex-col justify-center min-w-0">
                                                <div className="flex justify-between items-start gap-2">
                                                    <p className="text-sm font-bold leading-none mb-1 text-gray-900 dark:text-white truncate">{submission.student.full_name}</p>
                                                    <span className={`text-[9px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0 ${submission.status === 'graded'
                                                        ? 'text-orange-600 dark:text-orange-400 bg-orange-100/60 dark:bg-orange-950/30'
                                                        : 'text-orange-655 dark:text-orange-400 bg-orange-100/60 dark:bg-orange-950/30'
                                                        }`}>
                                                        {submission.status}
                                                    </span>
                                                </div>
                                                <p className="text-gray-550 dark:text-gray-450 text-xs line-clamp-1 truncate">{submission.assignment.title}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Active Grading Workspace Pane (Right Column) */}
                            <div className="flex-1 p-6 overflow-y-auto min-h-0 flex flex-col relative pb-32 bg-gray-50/30 dark:bg-zinc-950/20">
                                {selectedSubmission ? (
                                    <>
                                        <div className="mb-4 flex items-center justify-between">
                                            <h3 className="text-base font-extrabold text-gray-900 dark:text-white">Workspace</h3>
                                            <span className="text-xs text-gray-400 font-semibold">Editing: {selectedSubmission.student.full_name}</span>
                                        </div>

                                        <div className="bg-white dark:bg-zinc-800 rounded-3xl shadow-sm border border-gray-150 dark:border-zinc-800 overflow-hidden flex flex-col flex-1 min-h-[300px]">
                                            {/* Content Viewer */}
                                            <div className="p-5 bg-gray-50/50 dark:bg-zinc-900/60 flex-1 min-h-0 overflow-y-auto">
                                                <div className="bg-white dark:bg-zinc-950 p-5 rounded-2xl border border-gray-150 dark:border-zinc-800/80 shadow-sm">
                                                    <h4 className="text-[10px] font-extrabold text-gray-405 dark:text-zinc-500 uppercase tracking-wider mb-2">Student Submission</h4>
                                                    {selectedSubmission.submission_type === 'link' ? (
                                                        <a href={selectedSubmission.content} target="_blank" rel="noreferrer" className="text-blue-500 underline break-all flex items-center gap-2 text-sm font-semibold">
                                                            <span className="material-symbols-outlined text-base">link</span>
                                                            {selectedSubmission.content}
                                                        </a>
                                                    ) : (
                                                        <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap font-serif leading-relaxed">
                                                            {selectedSubmission.content}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Grading Controls */}
                                            <div className="bg-white dark:bg-zinc-800 p-5 border-t border-gray-100 dark:border-zinc-700/50">
                                                {/* AI Formative Review Assistant */}
                                                <div className="mb-4 p-4 rounded-2xl bg-gradient-to-r from-orange-50/80 via-amber-50/60 to-orange-50/40 dark:from-orange-950/20 dark:via-zinc-850 dark:to-zinc-900 border border-orange-200/60 dark:border-orange-900/30 shadow-sm">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <div className="flex items-center gap-2">
                                                            <div className="size-6 rounded-full bg-orange-500/10 dark:bg-orange-400/20 flex items-center justify-center text-orange-600 dark:text-orange-400 text-xs font-bold">
                                                                ✨
                                                            </div>
                                                            <div>
                                                                <h4 className="text-xs font-extrabold text-gray-900 dark:text-white uppercase tracking-wider">AI Formative Assistant</h4>
                                                                <p className="text-[10px] text-gray-500 dark:text-zinc-400">Rubric analysis & constructive feedback</p>
                                                            </div>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={handleGenerateAiReview}
                                                            disabled={isAiGrading || !selectedSubmission.content}
                                                            className="px-3.5 py-1.5 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 shrink-0 active:scale-95"
                                                        >
                                                            {isAiGrading ? (
                                                                <>
                                                                    <div className="size-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                                    <span>Analyzing...</span>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <span>Generate AI Review</span>
                                                                </>
                                                            )}
                                                        </button>
                                                    </div>

                                                    {aiSuggestion && (
                                                        <div className="mt-3 p-3 bg-white dark:bg-zinc-900 rounded-xl border border-orange-200/80 dark:border-zinc-800 space-y-2 text-xs animate-in fade-in duration-200">
                                                            <div className="flex items-center justify-between border-b border-gray-100 dark:border-zinc-800 pb-2">
                                                                <div className="flex items-center gap-1.5">
                                                                    <span className="text-[11px] font-bold text-gray-600 dark:text-zinc-300">Suggested Grade:</span>
                                                                    <span className="text-orange-600 dark:text-orange-400 font-mono font-bold text-sm bg-orange-50 dark:bg-orange-950/40 px-2 py-0.5 rounded-md">
                                                                        {aiSuggestion.suggestedGrade}/100
                                                                    </span>
                                                                </div>
                                                                <button
                                                                    type="button"
                                                                    onClick={handleApplySuggestion}
                                                                    className="px-2.5 py-1 rounded-lg bg-orange-100 dark:bg-orange-950/50 hover:bg-orange-200 text-orange-700 dark:text-orange-300 text-[11px] font-bold transition-colors flex items-center gap-1"
                                                                >
                                                                    <span>Apply to Grade & Feedback</span>
                                                                    <span className="material-symbols-outlined text-xs">check</span>
                                                                </button>
                                                            </div>
                                                            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                                                                <strong className="text-gray-900 dark:text-white font-semibold">Strengths: </strong>
                                                                {aiSuggestion.strengths}
                                                            </p>
                                                            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                                                                <strong className="text-gray-900 dark:text-white font-semibold">Growth Areas: </strong>
                                                                {aiSuggestion.growthAreas}
                                                            </p>
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="grid grid-cols-3 gap-4 items-center mb-4">
                                                    <label className="text-xs font-extrabold text-gray-450 dark:text-zinc-400 uppercase tracking-wider">Grade (0-100)</label>
                                                    <input
                                                        type="number"
                                                        max="100"
                                                        min="0"
                                                        value={grade}
                                                        onChange={e => setGrade(e.target.value)}
                                                        className="col-span-2 p-2 rounded-xl border border-gray-300 dark:border-zinc-700 bg-transparent dark:bg-zinc-900 font-mono text-base font-bold text-center"
                                                        placeholder="--/100"
                                                    />
                                                </div>

                                                <div className="bg-gray-50 dark:bg-zinc-900/60 rounded-2xl p-4 border border-gray-200/60 dark:border-zinc-800/80 shadow-inner">
                                                    <div className="flex gap-2 overflow-x-auto no-scrollbar mb-3 pb-1">
                                                        {quickFeedback.map(text => (
                                                            <span
                                                                key={text}
                                                                onClick={() => setFeedback(prev => prev ? prev + ' ' + text : text)}
                                                                className="shrink-0 px-3 py-1.5 rounded-lg bg-white dark:bg-zinc-850 hover:bg-gray-100 dark:hover:bg-zinc-750 text-[10px] font-bold text-gray-650 dark:text-zinc-350 border border-gray-200 dark:border-zinc-700/60 cursor-pointer transition-colors"
                                                            >
                                                                {text}
                                                            </span>
                                                        ))}
                                                    </div>
                                                    <textarea
                                                        value={feedback}
                                                        onChange={(e) => setFeedback(e.target.value)}
                                                        className="w-full bg-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-zinc-600 resize-none outline-none h-20 border-none focus:ring-0 p-0"
                                                        placeholder="Add specific feedback..."
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        {/* Sticky Footer Action inside workspace column */}
                                        <div className="absolute bottom-0 left-0 right-0 bg-white dark:bg-zinc-900 border-t border-gray-200 dark:border-zinc-850 p-4 z-40 shadow-lg rounded-b-[2.5rem]">
                                            <div className="flex items-center gap-4">
                                                <div className="flex flex-col shrink-0">
                                                    <label className="text-[9px] text-gray-450 dark:text-orange-400 uppercase tracking-wider font-extrabold mb-0.5">Total Grade</label>
                                                    <div className="flex items-baseline gap-1 bg-gray-100 dark:bg-zinc-800 px-3 py-1 rounded-lg border border-gray-200 dark:border-zinc-750">
                                                        <span className="text-xl font-bold text-gray-900 dark:text-white font-mono">{grade || '--'}</span>
                                                        <span className="text-xs text-gray-400 font-mono">/100</span>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={handleSubmitGrade}
                                                    disabled={submitting || !grade}
                                                    className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 active:translate-y-0.5 transition-all text-white font-bold text-sm h-12 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-orange-500/20"
                                                >
                                                    <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'FILL' 1" }}>send</span>
                                                    {submitting ? 'Sending...' : 'Return to Student'}
                                                </button>
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <div className="flex flex-col items-center justify-center flex-1 text-gray-400">
                                        <span className="material-symbols-outlined text-5xl mb-2">assignment_turned_in</span>
                                        <p className="text-sm font-semibold">Select a student from queue to begin grading</p>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
};
