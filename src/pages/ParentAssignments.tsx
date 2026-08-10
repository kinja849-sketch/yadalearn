import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BottomNav } from '@/components/BottomNav';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronLeft } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { format, parseISO } from 'date-fns';

export default function ParentAssignments() {
    const navigate = useNavigate();
    const location = useLocation();
    const { user } = useAuth();

    const searchParams = new URLSearchParams(location.search);
    const paramStudentId = searchParams.get('studentId') || searchParams.get('student');
    const initialStudentId = paramStudentId || location.state?.studentId || localStorage.getItem('yadalearn_selected_student_id');

    const [selectedChild, setSelectedChild] = useState<any>(initialStudentId || null);
    const [selectedChildName, setSelectedChildName] = useState<string>('');
    const [childrenData, setChildrenData] = useState<any[]>(location.state?.childrenList || []);
    
    const [assignments, setAssignments] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    const handleSelectChild = (childId: string) => {
        setSelectedChild(childId);
        localStorage.setItem('yadalearn_selected_student_id', childId);
        navigate(`/parent/assignments?studentId=${childId}`, { replace: true });
    };

    useEffect(() => {
        if (childrenData.length === 0 && user?.id) {
            fetchChildren();
        }
    }, [user]);

    async function fetchChildren() {
        const { data: links } = await supabase
            .from('parent_student_links')
            .select(`
                student_id,
                student:profiles!parent_student_links_student_id_fkey(
                    id, full_name, avatar_url,
                    student_profiles(grade_level)
                )
            `)
            .eq('parent_id', user?.id);

        if (links) {
            const mapped = links.map((link: any) => ({
                id: link.student.id,
                name: link.student.full_name,
                grade: link.student.student_profiles?.[0]?.grade_level || 'General',
                avatar: link.student.avatar_url
            }));
            setChildrenData(mapped);
            const match = initialStudentId && mapped.find(c => c.id === initialStudentId);
            const chosenId = match ? match.id : (selectedChild && mapped.some(c => c.id === selectedChild) ? selectedChild : mapped[0].id);
            setSelectedChild(chosenId);
            localStorage.setItem('yadalearn_selected_student_id', chosenId);
        }
    }

    useEffect(() => {
        if (selectedChild) {
            const child = childrenData.find(c => c.id === selectedChild);
            if (child) setSelectedChildName(child.name);
            fetchAssignments();
        }
    }, [selectedChild, childrenData]);

    const fetchAssignments = async () => {
        setLoading(true);
        try {
            const { data: enrollments } = await supabase
                .from('enrollments')
                .select('course_id, courses(title)')
                .eq('student_id', selectedChild)
                .eq('status', 'active');

            if (!enrollments || enrollments.length === 0) {
                setAssignments([]);
                return;
            }

            const courseIds = enrollments.map(e => e.course_id);
            const courseMap = enrollments.reduce((acc: any, curr: any) => {
                acc[curr.course_id] = curr.courses?.title || 'Unknown Course';
                return acc;
            }, {});

            const { data: assignmentsData } = await supabase
                .from('assignments')
                .select('*')
                .in('course_id', courseIds)
                .order('due_date', { ascending: true });

            if (assignmentsData) {
                const { data: submissionsData } = await supabase
                    .from('submissions')
                    .select('*')
                    .eq('student_id', selectedChild);

                const submissionsMap = (submissionsData || []).reduce((acc: any, curr: any) => {
                    acc[curr.assignment_id] = curr;
                    return acc;
                }, {});

                const now = new Date();
                
                const mappedAssignments = assignmentsData.map(a => {
                    const submission = submissionsMap[a.id];
                    let status = 'To Do';
                    if (submission) {
                        status = submission.grade ? 'Graded' : 'Submitted';
                    } else if (new Date(a.due_date) < now) {
                        status = 'Missing';
                    }

                    return {
                        ...a,
                        courseTitle: courseMap[a.course_id],
                        status,
                        submission
                    };
                });
                setAssignments(mappedAssignments);
            }
        } catch (error) {
            console.error("Error fetching assignments:", error);
        } finally {
            setLoading(false);
        }
    };

    const overdue = assignments.filter(a => a.status === 'Missing');
    const todo = assignments.filter(a => a.status === 'To Do');
    const done = assignments.filter(a => a.status === 'Submitted' || a.status === 'Graded');

    return (
        <div className="min-h-screen bg-white pb-24">
            <div className="sticky top-0 z-20 bg-white/80 backdrop-blur-xl border-b border-gray-100">
                <div className="max-w-md mx-auto px-6 h-16 flex items-center justify-between">
                    <button 
                        onClick={() => navigate('/parent-dashboard')}
                        className="w-10 h-10 rounded-full flex items-center justify-center bg-gray-50 text-gray-600 hover:bg-gray-100 transition-colors"
                    >
                        <ChevronLeft className="w-6 h-6" />
                    </button>
                    <h1 className="text-[17px] font-bold text-gray-900 tracking-tight">Assignments</h1>
                    <div className="w-10" />
                </div>
            </div>

            <main className="max-w-md mx-auto px-6 pt-6">
                {!selectedChild ? (
                    <>
                        <div className="mb-8">
                            <h2 className="text-2xl md:text-3xl font-black tracking-tight text-gray-900">Select a Child</h2>
                        </div>
                        
                        {childrenData.length > 0 ? (
                            <div className="grid grid-cols-1 gap-4">
                                {childrenData.map(child => (
                                    <Card 
                                        key={child.id} 
                                        className="border border-gray-100 shadow-sm rounded-3xl overflow-hidden cursor-pointer hover:shadow-md transition-shadow hover:border-emerald-200 group"
                                        onClick={() => setSelectedChild(child.id)}
                                    >
                                        <CardContent className="p-5 flex items-center gap-4">
                                            {child.avatar ? (
                                                <img src={child.avatar} alt={child.name} className="w-16 h-16 rounded-2xl object-cover bg-gray-100" />
                                            ) : (
                                                <div className="w-16 h-16 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-xl">
                                                    {child.name.charAt(0)}
                                                </div>
                                            )}
                                            <div className="flex-1">
                                                <h3 className="font-bold text-gray-900 text-lg group-hover:text-emerald-600 transition-colors">{child.name}</h3>
                                                <p className="text-sm text-gray-500 font-medium">Grade {child.grade}</p>
                                            </div>
                                            <ChevronLeft className="w-6 h-6 text-gray-300 rotate-180" />
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-6 text-gray-500 text-sm">
                                No children linked yet.
                            </div>
                        )}
                    </>
                ) : (
                    <>
                        <div className="flex items-center gap-4 mb-6">
                            <Button variant="outline" size="sm" onClick={() => setSelectedChild(null)} className="rounded-full flex items-center gap-1 text-gray-600 border-gray-200 hover:bg-gray-100 hover:text-gray-900">
                                <ChevronLeft className="w-4 h-4" /> Back to Children
                            </Button>
                        </div>

                        {loading ? (
                            <div className="flex justify-center p-8">
                                <div className="animate-spin h-8 w-8 border-4 border-emerald-500 border-t-transparent rounded-full"></div>
                            </div>
                        ) : assignments.length === 0 ? (
                            <div className="text-center py-12 px-6 border-2 border-dashed border-gray-100 rounded-[2rem]">
                                <p className="text-gray-500 font-medium">No assignments found for this student.</p>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                {overdue.length > 0 && (
                                    <section>
                                        <div className="flex items-center gap-2 mb-3">
                                            <h3 className="text-red-600 tracking-tight text-sm font-black uppercase">⚠️ Overdue</h3>
                                            <div className="h-px bg-red-100 flex-1"></div>
                                            <span className="text-[10px] font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded-full">{overdue.length}</span>
                                        </div>
                                        <div className="grid gap-3">
                                            {overdue.map(a => (
                                                <div key={a.id} className="p-4 rounded-3xl border border-red-100 bg-red-50/30">
                                                    <h4 className="font-bold text-gray-900 text-lg">{a.title}</h4>
                                                    <p className="text-sm text-gray-500 mb-2">{a.courseTitle}</p>
                                                    <div className="flex justify-between items-center mt-2 pt-3 border-t border-red-100">
                                                        <span className="text-xs font-bold text-red-600 uppercase tracking-wide">Due {format(parseISO(a.due_date), 'MMM d, h:mm a')}</span>
                                                        <span className="text-[10px] font-extrabold uppercase bg-red-100 text-red-700 px-2 py-1 rounded-lg shrink-0">Missing</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </section>
                                )}

                                {todo.length > 0 && (
                                    <section>
                                        <div className="flex items-center gap-2 mb-3">
                                            <h3 className="text-gray-800 tracking-tight text-sm font-black uppercase">📅 To Do</h3>
                                            <div className="h-px bg-gray-200 flex-1"></div>
                                            <span className="text-[10px] font-bold text-gray-700 bg-gray-100 px-2 py-0.5 rounded-full">{todo.length}</span>
                                        </div>
                                        <div className="grid gap-3">
                                            {todo.map(a => (
                                                <div key={a.id} className="p-4 rounded-3xl border border-gray-200 bg-white">
                                                    <h4 className="font-bold text-gray-900 text-lg">{a.title}</h4>
                                                    <p className="text-sm text-gray-500 mb-2">{a.courseTitle}</p>
                                                    <div className="flex justify-between items-center mt-2 pt-3 border-t border-gray-100">
                                                        <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Due {format(parseISO(a.due_date), 'MMM d, h:mm a')}</span>
                                                        <span className="text-[10px] font-extrabold uppercase bg-emerald-50 text-emerald-700 px-2 py-1 rounded-lg shrink-0">Pending</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </section>
                                )}

                                {done.length > 0 && (
                                    <section>
                                        <div className="flex items-center gap-2 mb-3">
                                            <h3 className="text-gray-400 tracking-tight text-sm font-black uppercase">✅ Completed</h3>
                                            <div className="h-px bg-gray-100 flex-1"></div>
                                            <span className="text-[10px] font-bold text-gray-500 bg-gray-50 px-2 py-0.5 rounded-full">{done.length}</span>
                                        </div>
                                        <div className="grid gap-3 opacity-75">
                                            {done.map(a => (
                                                <div key={a.id} className="p-4 rounded-3xl border border-gray-100 bg-gray-50">
                                                    <h4 className="font-bold text-gray-600 text-lg">{a.title}</h4>
                                                    <p className="text-sm text-gray-400 mb-2">{a.courseTitle}</p>
                                                    <div className="flex justify-between items-center mt-2 pt-3 border-t border-gray-200/50">
                                                        <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">Completed</span>
                                                        <span className="text-[10px] font-extrabold uppercase bg-gray-200 text-gray-600 px-2 py-1 rounded-lg shrink-0">
                                                            {a.status === 'Graded' ? `Grade: ${a.submission.grade}` : 'Submitted'}
                                                        </span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </section>
                                )}
                            </div>
                        )}
                    </>
                )}
            </main>
            <BottomNav />
        </div>
    );
}
