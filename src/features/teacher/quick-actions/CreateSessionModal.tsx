import { useState, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useTeacherAI } from '@/hooks/useTeacherAI';
import type { LessonPlanResponse } from '@/types/ai';

interface CreateSessionModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const CreateSessionModal = ({ isOpen, onClose }: CreateSessionModalProps) => {
    const { user, subjects } = useAuth();
    const { generateLessonPlan, isLoading: isGeneratingPlan } = useTeacherAI();
    const [isScheduling, setIsScheduling] = useState(false);
    const [students, setStudents] = useState<any[]>([]);
    const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
    const [isEditListOpen, setIsEditListOpen] = useState(false);
    const [lessonPlan, setLessonPlan] = useState<LessonPlanResponse | null>(null);
    const [isPlanExpanded, setIsPlanExpanded] = useState(false);


    // Helper to get current time rounded to nearest 15 mins
    const getRoundedTime = () => {
        const coeff = 1000 * 60 * 15;
        const date = new Date(Math.round(Date.now() / coeff) * coeff);
        return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    };

    const availableSubjects = (subjects && subjects.length > 0)
        ? subjects
        : ((user as any)?.subjects && (user as any).subjects.length > 0)
            ? (user as any).subjects
            : ['English', 'Mathematics', 'Physics', 'Chemistry', 'Biology'];

    const primarySubject = availableSubjects[0] || 'English';

    const [isCustomTitle, setIsCustomTitle] = useState(false);

    const [formData, setFormData] = useState({
        title: `${primarySubject} Class`,
        description: '',
        subject: primarySubject,
        dateOption: 'today', // 'today', 'tomorrow', 'custom'
        customDate: new Date().toISOString().split('T')[0],
        startTime: getRoundedTime(),
        duration: '60 min',
        sessionType: 'group',
        maxCapacity: 15,
        repeatWeekly: false,
    });

    // Synchronize initial subject and title when modal opens or teacher subjects are loaded
    useEffect(() => {
        if (isOpen) {
            const currentPrimary = availableSubjects[0] || 'English';
            setFormData(prev => ({
                ...prev,
                subject: currentPrimary,
                title: `${currentPrimary} Class`,
                startTime: getRoundedTime(),
            }));
            setIsCustomTitle(false);
        }
    }, [isOpen, subjects]);

    const handleSubjectSelect = (newSubject: string) => {
        setFormData(prev => {
            const isAutoTitle = !isCustomTitle || !prev.title.trim() || prev.title.endsWith(' Class') || prev.title.endsWith(' Session');
            return {
                ...prev,
                subject: newSubject,
                title: isAutoTitle ? `${newSubject} Class` : prev.title,
            };
        });
    };

    const activeSubjectsMap: Record<string, string> = {
        'Mathematics': 'functions',
        'Physics': 'blur_on',
        'Chemistry': 'science',
        'Biology': 'dna',
        'English': 'translate',
        'Computer Science': 'terminal',
        'History': 'history_edu'
    };

    // Fetch dynamic students
    useEffect(() => {
        async function fetchStudents() {
            try {
                if (!user?.id) return;
                
                // Fetch from both links and bookings
                const [linksRes, bookingsRes] = await Promise.all([
                    supabase
                        .from('teacher_student_links')
                        .select('student:profiles!teacher_student_links_student_id_fkey(*)')
                        .eq('teacher_id', user.id)
                        .eq('status', 'accepted'),
                    supabase
                        .from('bookings')
                        .select('student:profiles!bookings_student_id_fkey(*)')
                        .eq('teacher_id', user.id)
                ]);

                const studentMap = new Map();
                
                if (linksRes.data) {
                    linksRes.data.forEach((l: any) => {
                        if (l.student) studentMap.set(l.student.id, l.student);
                    });
                }
                
                if (bookingsRes.data) {
                    bookingsRes.data.forEach((b: any) => {
                        if (b.student) studentMap.set(b.student.id, b.student);
                    });
                }
                
                const uniqueStudents = Array.from(studentMap.values());
                setStudents(uniqueStudents);
                // By default, select all up to max capacity
                setSelectedStudents(uniqueStudents.map((s: any) => s.id).slice(0, formData.sessionType === 'individual' ? 1 : formData.maxCapacity));
                
            } catch (err) {
                console.error("Error fetching students:", err);
            }
        }
        if (isOpen) {
            fetchStudents();
        }
    }, [isOpen, user?.id]);

    useEffect(() => {
        // Enforce capacity limits when type changes
        if (formData.sessionType === 'individual') {
            if (selectedStudents.length > 1) {
                setSelectedStudents(prev => prev.slice(0, 1));
            }
        } else {
            if (selectedStudents.length > formData.maxCapacity) {
                setSelectedStudents(prev => prev.slice(0, formData.maxCapacity));
            }
        }
    }, [formData.sessionType, formData.maxCapacity]);

    const handleStudentToggle = (id: string) => {
        setSelectedStudents(prev => {
            if (prev.includes(id)) {
                return prev.filter(sId => sId !== id);
            } else {
                const limit = formData.sessionType === 'individual' ? 1 : formData.maxCapacity;
                if (prev.length >= limit) {
                    if (formData.sessionType === 'individual') {
                        return [id]; // Swap the selected student for individual
                    }
                    return prev; // Ignore if max capacity reached for group
                }
                return [...prev, id];
            }
        });
    };

    const handleSchedule = async () => {
        if (!user?.id) return;
        
        if (selectedStudents.length === 0) {
            alert("Please select at least one student to schedule the class.");
            return;
        }

        setIsScheduling(true);
        try {
            const getFormattedDate = () => {
                if (formData.dateOption === 'custom') return formData.customDate;
                const d = new Date();
                if (formData.dateOption === 'tomorrow') d.setDate(d.getDate() + 1);
                const yyyy = d.getFullYear();
                const mm = String(d.getMonth() + 1).padStart(2, '0');
                const dd = String(d.getDate()).padStart(2, '0');
                return `${yyyy}-${mm}-${dd}`;
            };

            const sessionDate = getFormattedDate();
            const scheduledStart = new Date(`${sessionDate}T${formData.startTime}`).toISOString();
            const roomId = `class-${user.id}-${sessionDate}`;

            const finalTitle = formData.title.trim() || `${formData.subject} Class`;

            // 1. Insert into live_classes
            const { error: liveClassError } = await supabase.from('live_classes').insert({
                teacher_id: user.id,
                room_id: roomId,
                status: 'scheduled',
                title: finalTitle,
                subject: formData.subject,
                scheduled_at: scheduledStart
            });
            
            if (liveClassError) {
                console.error("Live Class Insert Error:", liveClassError);
                throw new Error("Could not save to live_classes: " + liveClassError.message);
            }

            // 2. Insert bookings, ensure links, send chat messages, and broadcast for each student
            for (const studentId of selectedStudents) {
                // Ensure accepted link exists so RLS allows student to view live_classes
                try {
                    const { data: existingLink } = await supabase
                        .from('teacher_student_links')
                        .select('id')
                        .eq('teacher_id', user.id)
                        .eq('student_id', studentId)
                        .maybeSingle();

                    if (!existingLink) {
                        await supabase.from('teacher_student_links').insert({
                            teacher_id: user.id,
                            student_id: studentId,
                            status: 'accepted'
                        });
                    } else {
                        await supabase.from('teacher_student_links').update({
                            status: 'accepted'
                        }).eq('id', existingLink.id);
                    }
                } catch (linkErr) {
                    console.warn("Could not ensure teacher_student_links:", linkErr);
                }

                // Create booking for calendar sync
                const { data: newBooking, error: bookingError } = await supabase
                    .from('bookings')
                    .insert({
                        student_id: studentId,
                        teacher_id: user.id,
                        subject: formData.subject,
                        date: sessionDate,
                        time: formData.startTime,
                        status: 'confirmed'
                    })
                    .select('id')
                    .single();

                if (bookingError) throw bookingError;

                if (newBooking) {
                    const initiated = JSON.parse(localStorage.getItem('initiated_bookings') || '[]');
                    initiated.push(newBooking.id);
                    localStorage.setItem('initiated_bookings', JSON.stringify(initiated));
                }

                // Send automated chat message
                const msgContent = `Hi! I've scheduled a new session: "${finalTitle}". It will start on ${sessionDate} at ${formData.startTime}. [Join Meeting](/meeting/${roomId})`;
                await supabase.from('chat_messages').insert({
                    sender_id: user.id,
                    receiver_id: studentId,
                    message: msgContent,
                    is_read: false
                });

                // Broadcast real-time session creation event
                try {
                    const channel = supabase.channel(`student-live-session-${studentId}`);
                    channel.subscribe((status) => {
                        if (status === 'SUBSCRIBED') {
                            channel.send({
                                type: 'broadcast',
                                event: 'session_created',
                                payload: { roomId, teacherId: user.id, studentId, title: finalTitle }
                            });
                            setTimeout(() => supabase.removeChannel(channel), 1000);
                        }
                    });

                    // Redundant global session broadcast
                    const globalCh = supabase.channel('yadalearn-live-sessions');
                    globalCh.subscribe((status) => {
                        if (status === 'SUBSCRIBED') {
                            globalCh.send({
                                type: 'broadcast',
                                event: 'session_created',
                                payload: { roomId, teacherId: user.id, studentId, title: finalTitle }
                            });
                            setTimeout(() => supabase.removeChannel(globalCh), 1000);
                        }
                    });
                } catch (bcErr) {
                    console.warn("Broadcast error (non-fatal):", bcErr);
                }
            }

            alert(`✅ Session "${finalTitle}" scheduled successfully with ${selectedStudents.length} student(s)!`);
            onClose();
            window.location.reload();
        } catch (err: any) {
            console.error("Error scheduling session:", err);
            alert("Failed to schedule session: " + err.message);
        } finally {
            setIsScheduling(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="!max-w-4xl mx-auto bg-white dark:bg-zinc-900 text-gray-900 dark:text-white border-0 p-0 overflow-hidden max-h-[85vh] flex flex-col rounded-[2.5rem] shadow-2xl">
                {/* Header */}
                <div className="flex-none bg-white dark:bg-zinc-900 pt-6 pb-4 px-6 z-20 border-b border-gray-100 dark:border-zinc-800">
                    {/* Top App Bar */}
                    <div className="flex items-center justify-between">
                        <button
                            onClick={onClose}
                            className="text-gray-500 dark:text-orange-400 text-base font-bold leading-normal shrink-0 hover:opacity-80 transition-opacity"
                        >
                            Cancel
                        </button>
                        <h2 className="text-gray-900 dark:text-white text-xl font-extrabold leading-tight tracking-[-0.015em] text-center">New Session</h2>
                        <div className="w-12"></div>
                    </div>
                </div>

                {/* Scrollable Form Content */}
                <div className="flex-1 overflow-y-auto p-6 pb-28">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Left Column: Basic Details */}
                        <div className="space-y-6">
                            <div className="flex flex-col gap-1">
                                <label className="text-sm font-bold text-gray-500 dark:text-orange-400 ml-1">Title</label>
                                <input
                                    className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl px-4 py-3.5 text-base font-medium text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-all font-semibold"
                                    placeholder="e.g., English Class"
                                    type="text"
                                    value={formData.title}
                                    onChange={(e) => {
                                        setIsCustomTitle(true);
                                        setFormData({ ...formData, title: e.target.value });
                                    }}
                                />
                            </div>
                            <div className="flex flex-col gap-1">
                                <div className="flex items-center justify-between ml-1">
                                    <label className="text-sm font-bold text-gray-500 dark:text-orange-400">What is the lesson? <span className="text-xs opacity-50 font-normal">(Optional)</span></label>
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            const plan = await generateLessonPlan(formData.subject, formData.title, formData.duration);
                                            if (plan) {
                                                setLessonPlan(plan);
                                                setIsPlanExpanded(true);
                                            }
                                        }}
                                        disabled={isGeneratingPlan || !formData.title.trim()}
                                        className="text-xs font-bold text-orange-600 dark:text-orange-400 hover:text-orange-700 flex items-center gap-1 active:scale-95 transition-transform"
                                    >
                                        {isGeneratingPlan ? (
                                            <>
                                                <div className="size-3 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                                                <span>Planning...</span>
                                            </>
                                        ) : (
                                            <>
                                                <span>✨ AI Lesson Planner</span>
                                            </>
                                        )}
                                    </button>
                                </div>
                                <textarea
                                    className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 resize-none transition-all font-semibold"
                                    placeholder="Add details about the session..."
                                    rows={2}
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                />

                                {lessonPlan && (
                                    <div className="mt-2 p-4 bg-orange-50/70 dark:bg-zinc-850/80 rounded-2xl border border-orange-200/80 dark:border-zinc-700 space-y-3 text-xs">
                                        <div className="flex items-center justify-between">
                                            <span className="font-extrabold text-orange-800 dark:text-orange-300 flex items-center gap-1.5 uppercase tracking-wider text-[11px]">
                                                ✨ Lesson Outline & Discussion Starter
                                            </span>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => setFormData(prev => ({ ...prev, description: lessonPlan.descriptionText }))}
                                                    className="px-2 py-0.5 rounded bg-orange-500 hover:bg-orange-600 text-white font-bold text-[10px] shadow-sm transition-all"
                                                >
                                                    Insert into Description
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setIsPlanExpanded(!isPlanExpanded)}
                                                    className="text-gray-500 hover:text-gray-700 text-xs font-bold"
                                                >
                                                    {isPlanExpanded ? 'Collapse' : 'Expand'}
                                                </button>
                                            </div>
                                        </div>

                                        {isPlanExpanded && (
                                            <div className="space-y-3 pt-1 border-t border-orange-200/50 dark:border-zinc-700/50">
                                                <div>
                                                    <span className="font-bold text-gray-800 dark:text-zinc-200 block mb-1">Icebreaker Hook:</span>
                                                    <p className="text-gray-600 dark:text-zinc-400 italic bg-white/70 dark:bg-zinc-900/60 p-2.5 rounded-lg border border-orange-100 dark:border-zinc-800">
                                                        {lessonPlan.hook}
                                                    </p>
                                                </div>

                                                <div>
                                                    <span className="font-bold text-gray-800 dark:text-zinc-200 block mb-1">Session Timeline:</span>
                                                    <div className="grid grid-cols-2 gap-1.5">
                                                        {lessonPlan.timeline.map((step, idx) => (
                                                            <div key={idx} className="p-2 bg-white/70 dark:bg-zinc-900/60 rounded-lg border border-orange-100 dark:border-zinc-800">
                                                                <div className="flex justify-between items-center text-[10px] font-bold text-orange-600 dark:text-orange-400">
                                                                    <span>{step.phase}</span>
                                                                    <span className="font-mono">{step.duration}</span>
                                                                </div>
                                                                <p className="text-[10px] text-gray-600 dark:text-zinc-400 mt-0.5 line-clamp-2">{step.activity}</p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>

                                                <div>
                                                    <span className="font-bold text-gray-800 dark:text-zinc-200 block mb-1">Discussion Questions:</span>
                                                    <ul className="space-y-1 list-none pl-0">
                                                        {lessonPlan.discussionQuestions.map((q, idx) => (
                                                            <li key={idx} className="flex items-start gap-1.5 text-gray-700 dark:text-zinc-300 bg-white/50 dark:bg-zinc-900/40 p-2 rounded-lg border border-orange-100/60 dark:border-zinc-800">
                                                                <span className="font-bold text-orange-500 shrink-0">Q{idx + 1}:</span>
                                                                <span>{q}</span>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="space-y-4">
                                <h3 className="text-gray-900 dark:text-white text-lg font-bold ml-1">Subject</h3>
                                <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
                                    {availableSubjects.map(subject => (
                                        <button
                                            key={subject}
                                            onClick={() => handleSubjectSelect(subject)}
                                            className={`flex h-10 shrink-0 items-center justify-center gap-x-2 rounded-full pl-4 pr-5 transition-transform active:scale-95 ${formData.subject === subject
                                                    ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20'
                                                    : 'bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700/60 text-gray-600 dark:text-zinc-300'
                                                }`}
                                        >
                                            <span className="material-symbols-outlined text-[20px]">{activeSubjectsMap[subject] || 'menu_book'}</span>
                                            <p className="text-sm font-bold">{subject}</p>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Right Column: Timing & Logistics */}
                        <div className="space-y-6">
                            {/* Timing Section */}
                            <div className="pt-2 pb-4 px-4 bg-gray-50 dark:bg-zinc-800/50 rounded-2xl border border-gray-100 dark:border-zinc-800">
                                <h3 className="text-gray-900 dark:text-white text-lg font-bold mb-3 capitalize">
                                    {new Intl.DateTimeFormat('en-US', { weekday: 'long', hour: 'numeric', minute: 'numeric' }).format(new Date())}
                                </h3>
                                {/* Date Selector */}
                                <div className="flex gap-2 mb-4 relative">
                                    <button
                                        onClick={() => setFormData({ ...formData, dateOption: 'today' })}
                                        className={`flex-1 py-2.5 rounded-lg font-semibold text-sm transition-colors text-center ${formData.dateOption === 'today'
                                                ? 'bg-orange-100 dark:bg-orange-950/30 border border-orange-500 text-orange-600 dark:text-orange-400'
                                                : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'
                                            }`}
                                    >
                                        Today
                                    </button>
                                    <button
                                        onClick={() => setFormData({ ...formData, dateOption: 'tomorrow' })}
                                        className={`flex-1 py-2.5 rounded-lg font-semibold text-sm transition-colors text-center ${formData.dateOption === 'tomorrow'
                                                ? 'bg-orange-100 dark:bg-orange-950/30 border border-orange-500 text-orange-600 dark:text-orange-400'
                                                : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                                            }`}
                                    >
                                        Tomorrow
                                    </button>
                                    
                                    <div className="relative flex">
                                        <button 
                                            onClick={() => setFormData({ ...formData, dateOption: 'custom' })}
                                            className={`px-4 py-2.5 rounded-lg border font-medium text-sm transition-colors flex items-center justify-center ${formData.dateOption === 'custom' ? 'bg-orange-100 border-orange-500 text-orange-600 dark:bg-orange-950/30 dark:text-orange-400' : 'bg-white border-gray-200 text-gray-600 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300'}`}
                                        >
                                            <span className="material-symbols-outlined text-[20px]">calendar_month</span>
                                        </button>
                                        {formData.dateOption === 'custom' && (
                                            <input 
                                                type="date" 
                                                className="absolute top-full right-0 mt-1 bg-white border border-gray-200 rounded-lg p-2 z-10 dark:bg-zinc-800 dark:border-zinc-700" 
                                                value={formData.customDate} 
                                                onChange={(e) => setFormData({...formData, customDate: e.target.value})}
                                            />
                                        )}
                                    </div>
                                </div>

                                {/* Time & Duration */}
                                <div className="flex gap-4">
                                    <div className="flex-1 flex flex-col gap-1">
                                        <label className="text-xs font-bold text-gray-500 dark:text-orange-400 ml-1">Start Time</label>
                                        <div className="relative">
                                            <input
                                                className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl px-4 py-3 text-base font-medium text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 font-semibold"
                                                type="time"
                                                value={formData.startTime}
                                                onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                    <div className="flex-1 flex flex-col gap-1">
                                        <label className="text-xs font-bold text-gray-500 dark:text-orange-400 ml-1">Duration</label>
                                        <select
                                            className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl px-4 py-3 text-base font-medium text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 appearance-none font-semibold"
                                            value={formData.duration}
                                            onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                                        >
                                            <option>30 min</option>
                                            <option>60 min</option>
                                            <option>90 min</option>
                                            <option>120 min</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            {/* Logistics Section */}
                            <div className="space-y-4 pt-2">
                                <h3 className="text-gray-900 dark:text-white text-lg font-bold">Logistics</h3>

                                {/* Session Type Segmented Control */}
                                <div className="bg-gray-100 dark:bg-zinc-800 p-1 rounded-xl flex">
                                    <button
                                        onClick={() => setFormData({ ...formData, sessionType: 'group' })}
                                        className={`flex-1 py-2 rounded-lg font-semibold text-sm transition-all ${formData.sessionType === 'group'
                                                ? 'bg-white dark:bg-zinc-700 shadow-sm text-gray-900 dark:text-white'
                                                : 'text-gray-500 dark:text-gray-400'
                                            }`}
                                    >
                                        Group
                                    </button>
                                    <button
                                        onClick={() => setFormData({ ...formData, sessionType: 'individual' })}
                                        className={`flex-1 py-2 rounded-lg font-semibold text-sm transition-all ${formData.sessionType === 'individual'
                                                ? 'bg-white dark:bg-zinc-700 shadow-sm text-gray-900 dark:text-white'
                                                : 'text-gray-500 dark:text-gray-400'
                                            }`}
                                    >
                                        Individual
                                    </button>
                                </div>

                                {/* Capacity Stepper */}
                                {formData.sessionType === 'group' && (
                                    <div className="flex items-center justify-between bg-white dark:bg-zinc-800 p-4 rounded-xl border border-gray-200 dark:border-zinc-700/60">
                                        <div className="flex flex-col">
                                            <span className="text-base font-medium text-gray-900 dark:text-white">Max Capacity</span>
                                            <span className="text-xs text-gray-500 dark:text-orange-400">Students allowed</span>
                                        </div>
                                        <div className="flex items-center gap-4 bg-gray-50 dark:bg-zinc-900 rounded-lg p-1 border border-gray-100 dark:border-zinc-800">
                                            <button
                                                onClick={() => setFormData({ ...formData, maxCapacity: Math.max(1, formData.maxCapacity - 1) })}
                                                className="w-8 h-8 flex items-center justify-center rounded bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-white hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors"
                                            >
                                                <span className="material-symbols-outlined text-[18px]">remove</span>
                                            </button>
                                            <span className="text-base font-bold text-gray-900 dark:text-white w-8 text-center">{formData.maxCapacity}</span>
                                            <button
                                                onClick={() => setFormData({ ...formData, maxCapacity: formData.maxCapacity + 1 })}
                                                className="w-8 h-8 flex items-center justify-center rounded bg-orange-500 text-white hover:bg-orange-600 transition-colors"
                                            >
                                                <span className="material-symbols-outlined text-[18px]">add</span>
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Attendees */}
                                <div className="flex flex-col gap-2">
                                    <div className="flex justify-between items-end">
                                        <label className="text-sm font-bold text-gray-500 dark:text-orange-400">Attendees</label>
                                        <span 
                                            className="text-xs font-extrabold text-orange-600 dark:text-orange-400 cursor-pointer hover:underline"
                                            onClick={() => setIsEditListOpen(!isEditListOpen)}
                                        >
                                            {isEditListOpen ? 'Done' : 'Edit List'}
                                        </span>
                                    </div>
                                    
                                    {!isEditListOpen ? (
                                        <div 
                                            className="bg-white dark:bg-zinc-800 p-4 rounded-xl flex items-center justify-between cursor-pointer active:scale-[0.99] transition-transform border border-gray-200 dark:border-zinc-700/60"
                                            onClick={() => setIsEditListOpen(true)}
                                        >
                                            <div className="flex items-center -space-x-3 overflow-hidden">
                                                {students.filter(s => selectedStudents.includes(s.id)).slice(0, 3).map((student) => (
                                                    student.avatar_url ? (
                                                        <img key={student.id} className="inline-block h-10 w-10 rounded-full ring-2 ring-white dark:ring-zinc-900 object-cover border border-gray-100 dark:border-zinc-700" src={student.avatar_url} alt={student.full_name} />
                                                    ) : (
                                                        <div key={student.id} className="inline-block h-10 w-10 rounded-full ring-2 ring-white dark:ring-zinc-900 bg-orange-100 dark:bg-orange-950/30 flex items-center justify-center text-xs font-bold text-orange-600 border border-orange-200">
                                                            {(student.full_name || 'S')[0]}
                                                        </div>
                                                    )
                                                ))}
                                                {selectedStudents.length > 3 && (
                                                    <div className="h-10 w-10 rounded-full ring-2 ring-white dark:ring-zinc-900 bg-gray-200 dark:bg-zinc-700 flex items-center justify-center text-xs font-bold text-gray-600 dark:text-white border border-gray-100 dark:border-zinc-700">
                                                        +{selectedStudents.length - 3}
                                                    </div>
                                                )}
                                                {selectedStudents.length === 0 && (
                                                    <span className="text-xs text-gray-500 font-bold pl-2">No students selected</span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2 text-orange-600 dark:text-orange-400">
                                                <span className="text-sm font-bold">{selectedStudents.length} Selected</span>
                                                <span className="material-symbols-outlined text-[20px]">expand_more</span>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700/60 rounded-xl p-2 max-h-48 overflow-y-auto">
                                            {students.length === 0 ? (
                                                <div className="p-4 text-center text-sm text-gray-500">No linked students found.</div>
                                            ) : (
                                                students.map(student => {
                                                    const isSelected = selectedStudents.includes(student.id);
                                                    return (
                                                        <div 
                                                            key={student.id} 
                                                            className={`flex items-center justify-between p-2 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-zinc-700/50 transition-colors ${isSelected ? 'bg-orange-50/50 dark:bg-orange-950/20' : ''}`}
                                                            onClick={() => handleStudentToggle(student.id)}
                                                        >
                                                            <div className="flex items-center gap-3">
                                                                {student.avatar_url ? (
                                                                    <img className="size-8 rounded-full object-cover border border-gray-200" src={student.avatar_url} alt={student.full_name} />
                                                                ) : (
                                                                    <div className="size-8 rounded-full bg-orange-100 text-orange-700 font-bold flex items-center justify-center text-xs">
                                                                        {(student.full_name || 'S')[0]}
                                                                    </div>
                                                                )}
                                                                <span className={`text-sm font-semibold ${isSelected ? 'text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-300'}`}>{student.full_name}</span>
                                                            </div>
                                                            <div className={`size-5 rounded-full border-2 flex items-center justify-center transition-colors ${isSelected ? 'bg-orange-500 border-orange-500' : 'border-gray-300 dark:border-gray-600'}`}>
                                                                {isSelected && <span className="material-symbols-outlined text-white text-[14px]">check</span>}
                                                            </div>
                                                        </div>
                                                    )
                                                })
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Sticky Footer CTA */}
                <div className="absolute bottom-0 left-0 w-full bg-white dark:bg-zinc-900 border-t border-gray-200 dark:border-zinc-800 p-4 z-50">
                    <button
                        onClick={handleSchedule}
                        disabled={isScheduling || selectedStudents.length === 0}
                        className="w-full bg-orange-500 text-white text-lg font-bold py-4 rounded-xl shadow-lg shadow-orange-500/25 active:scale-[0.98] transition-all flex items-center justify-center gap-2 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <span className="material-symbols-outlined">calendar_add_on</span>
                        {isScheduling ? "Scheduling..." : "Schedule Session"}
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    );
};
