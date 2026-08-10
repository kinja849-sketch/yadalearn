import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BottomNav } from '@/components/BottomNav';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronLeft, CheckCircle2, Clock, XCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';

export default function ParentClasses() {
    const navigate = useNavigate();
    const location = useLocation();
    const { user } = useAuth();

    const searchParams = new URLSearchParams(location.search);
    const paramStudentId = searchParams.get('studentId') || searchParams.get('student');
    const initialStudentId = paramStudentId || location.state?.studentId || localStorage.getItem('yadalearn_selected_student_id');

    const [selectedChild, setSelectedChild] = useState<any>(initialStudentId || null);
    const [selectedChildName, setSelectedChildName] = useState<string>('');
    const [childrenData, setChildrenData] = useState<any[]>(location.state?.childrenList || []);
    
    const [classes, setClasses] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    const handleSelectChild = (childId: string) => {
        setSelectedChild(childId);
        localStorage.setItem('yadalearn_selected_student_id', childId);
        navigate(`/parent/classes?studentId=${childId}`, { replace: true });
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
            fetchClasses();
        }
    }, [selectedChild, childrenData]);

    const fetchClasses = async () => {
        setLoading(true);
        try {
            const { data } = await supabase
                .from('bookings')
                .select(`
                    id, subject, date, time, status, rating, teacher_id,
                    teacher:profiles!bookings_teacher_id_fkey(full_name)
                `)
                .eq('student_id', selectedChild);

            if (data) {
                const now = new Date();
                const processedClasses = data.map(b => {
                    const [year, month, day] = b.date.split('-').map(Number);
                    const match = b.time.match(/^(\d+):(\d+)\s*(AM|PM)$/i);
                    let hours = 0; let minutes = 0;
                    if (match) {
                        hours = Number(match[1]);
                        minutes = Number(match[2]);
                        const ampm = match[3].toUpperCase();
                        if (ampm === 'PM' && hours < 12) hours += 12;
                        if (ampm === 'AM' && hours === 12) hours = 0;
                    }
                    const dateObj = new Date(year, month - 1, day, hours, minutes);
                    const hasTakenPlace = dateObj < now;
                    
                    let attendanceStatus = 'upcoming';
                    if (hasTakenPlace) {
                        if (b.status === 'completed' || b.rating !== null) attendanceStatus = 'attended';
                        else if (b.status === 'cancelled') attendanceStatus = 'cancelled';
                        else attendanceStatus = 'missed';
                    } else if (b.status === 'cancelled') {
                        attendanceStatus = 'cancelled';
                    }

                    return {
                        ...b,
                        dateObj,
                        hasTakenPlace,
                        attendanceStatus,
                        teacherName: b.teacher?.full_name || 'Teacher'
                    };
                }).sort((a, b) => b.dateObj.getTime() - a.dateObj.getTime()); // newest first

                setClasses(processedClasses);
            }
        } catch (error) {
            console.error("Error fetching classes:", error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-white pb-24">
            {/* Header */}
            <div className="sticky top-0 z-20 bg-white/80 backdrop-blur-xl border-b border-gray-100">
                <div className="max-w-md mx-auto px-6 h-16 flex items-center justify-between">
                    <button 
                        onClick={() => navigate('/parent-dashboard')}
                        className="w-10 h-10 rounded-full flex items-center justify-center bg-gray-50 text-gray-600 hover:bg-gray-100 transition-colors"
                    >
                        <ChevronLeft className="w-6 h-6" />
                    </button>
                    <h1 className="text-[17px] font-bold text-gray-900 tracking-tight">Classes</h1>
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
                        ) : classes.length === 0 ? (
                            <div className="text-center py-12 px-6 border-2 border-dashed border-gray-100 rounded-[2rem]">
                                <p className="text-gray-500 font-medium">No classes found for this student.</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <h3 className="text-xl font-bold text-gray-900 mb-2">Class History</h3>
                                
                                {classes.map(cls => (
                                    <div key={cls.id} className="p-5 rounded-[2rem] border border-gray-100 bg-gray-50 shadow-sm flex items-center gap-4">
                                        <div className="flex-1">
                                            <h4 className="font-bold text-gray-900 text-lg">{cls.subject}</h4>
                                            <p className="text-sm text-gray-500 font-medium mt-1">
                                                {format(cls.dateObj, 'MMM d, yyyy')} • {cls.time}
                                            </p>
                                            <p className="text-xs text-gray-400 mt-1">Teacher: <span className="text-gray-600">{cls.teacherName}</span></p>
                                        </div>
                                        <div className="flex flex-col items-end gap-1 shrink-0">
                                            {cls.attendanceStatus === 'upcoming' && (
                                                <div className="flex items-center text-blue-600 bg-blue-50 px-3 py-1.5 rounded-xl text-sm font-bold">
                                                    <Clock className="w-4 h-4 mr-1.5" />
                                                    Upcoming
                                                </div>
                                            )}
                                            {cls.attendanceStatus === 'attended' && (
                                                <div className="flex items-center text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-xl text-sm font-bold">
                                                    <CheckCircle2 className="w-4 h-4 mr-1.5" />
                                                    Attended
                                                </div>
                                            )}
                                            {cls.attendanceStatus === 'cancelled' && (
                                                <div className="flex items-center text-gray-500 bg-gray-100 px-3 py-1.5 rounded-xl text-sm font-bold">
                                                    <XCircle className="w-4 h-4 mr-1.5" />
                                                    Cancelled
                                                </div>
                                            )}
                                            {cls.attendanceStatus === 'missed' && (
                                                <div className="flex items-center text-red-600 bg-red-50 px-3 py-1.5 rounded-xl text-sm font-bold">
                                                    <XCircle className="w-4 h-4 mr-1.5" />
                                                    Missed
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </main>
            <BottomNav />
        </div>
    );
}
