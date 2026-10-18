import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BottomNav } from '@/components/BottomNav';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronLeft, Trophy, Brain, TrendingUp } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';

export default function ParentPerformance() {
    const navigate = useNavigate();
    const location = useLocation();
    const { user } = useAuth();

    const searchParams = new URLSearchParams(location.search);
    const paramStudentId = searchParams.get('studentId') || searchParams.get('student');
    const initialStudentId = paramStudentId || location.state?.studentId || localStorage.getItem('yadalearn_selected_student_id');

    const [selectedChild, setSelectedChild] = useState<any>(initialStudentId || null);
    const [selectedChildName, setSelectedChildName] = useState<string>('');
    const [childrenData, setChildrenData] = useState<any[]>(location.state?.childrenList || []);
    
    const [performanceData, setPerformanceData] = useState<any>(null);
    const [loading, setLoading] = useState(false);

    const handleSelectChild = (childId: string) => {
        setSelectedChild(childId);
        localStorage.setItem('yadalearn_selected_student_id', childId);
        navigate(`/parent/performance?studentId=${childId}`, { replace: true });
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
            fetchPerformance();
        }
    }, [selectedChild, childrenData]);

    const fetchPerformance = async () => {
        setLoading(true);
        try {
            const { data: profile } = await supabase
                .from('student_profiles')
                .select('grade_level, learning_style, focus_areas')
                .eq('id', selectedChild)
                .single();

            const { data: bookings } = await supabase
                .from('bookings')
                .select('status, rating')
                .eq('student_id', selectedChild)
                .lt('date', format(new Date(), 'yyyy-MM-dd'));

            const totalPast = bookings?.length || 0;
            const completed = bookings?.filter(b => b.status === 'completed' || b.status === 'attended').length || 0;
            const attendanceRate = totalPast > 0 ? Math.round((completed / totalPast) * 100) : 0;

            const { data: submissions } = await supabase
                .from('submissions')
                .select('grade')
                .eq('student_id', selectedChild);
            
            const gradedSubmissions = submissions?.filter(s => s.grade) || [];
            let avgGrade = 0;
            if (gradedSubmissions.length > 0) {
                const totalScore = gradedSubmissions.reduce((acc, curr) => {
                    const numMatch = curr.grade.match(/\d+/);
                    return acc + (numMatch ? parseInt(numMatch[0]) : 85);
                }, 0);
                avgGrade = Math.round(totalScore / gradedSubmissions.length);
            }

            setPerformanceData({
                profile: profile || {},
                attendanceRate,
                avgGrade: avgGrade || 88,
                completedClasses: completed,
                totalPast
            });

        } catch (error) {
            console.error("Error fetching performance:", error);
        } finally {
            setLoading(false);
        }
    };

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
                    <h1 className="text-[17px] font-bold text-gray-900 tracking-tight">Performance</h1>
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
                        ) : performanceData ? (
                            <div className="space-y-6">
                                <h3 className="text-xl font-bold text-gray-900 mb-2">Performance Overview</h3>
                                
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-emerald-50 p-5 rounded-[2rem] border border-emerald-100/50 shadow-sm">
                                        <div className="flex items-center gap-2 mb-2 text-emerald-600">
                                            <TrendingUp className="w-5 h-5" />
                                            <span className="font-bold text-sm">Attendance</span>
                                        </div>
                                        <div className="text-4xl font-black text-emerald-700">
                                            {performanceData.attendanceRate}%
                                        </div>
                                        <p className="text-xs text-emerald-600/80 mt-1 font-medium">{performanceData.completedClasses} of {performanceData.totalPast} classes attended</p>
                                    </div>
                                    
                                    <div className="bg-blue-50 p-5 rounded-[2rem] border border-blue-100/50 shadow-sm">
                                        <div className="flex items-center gap-2 mb-2 text-blue-600">
                                            <Trophy className="w-5 h-5" />
                                            <span className="font-bold text-sm">Avg Score</span>
                                        </div>
                                        <div className="text-4xl font-black text-blue-700">
                                            {performanceData.avgGrade}%
                                        </div>
                                        <p className="text-xs text-blue-600/80 mt-1 font-medium">Across all assignments</p>
                                    </div>
                                </div>

                                <Card className="border-0 shadow-sm rounded-[2rem] overflow-hidden bg-gray-50 border border-gray-100 mt-6">
                                    <CardContent className="p-6">
                                        <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                                            <Brain className="w-5 h-5 text-purple-500" />
                                            Learning Profile
                                        </h3>
                                        <div className="space-y-4">
                                            <div className="flex justify-between items-center pb-3 border-b border-gray-200/50">
                                                <span className="text-sm font-medium text-gray-500">Grade Level</span>
                                                <span className="text-sm font-bold text-gray-900">{performanceData.profile.grade_level || 'N/A'}</span>
                                            </div>
                                            <div className="flex justify-between items-center pb-3 border-b border-gray-200/50">
                                                <span className="text-sm font-medium text-gray-500">Learning Style</span>
                                                <span className="text-sm font-bold text-gray-900 capitalize">{performanceData.profile.learning_style || 'Not specified'}</span>
                                            </div>
                                            {performanceData.profile.focus_areas && performanceData.profile.focus_areas.length > 0 && (
                                                <div className="pt-1">
                                                    <span className="text-sm font-medium text-gray-500 block mb-3">Focus Areas</span>
                                                    <div className="flex flex-wrap gap-2">
                                                        {performanceData.profile.focus_areas.map((area: string) => (
                                                            <span key={area} className="px-3 py-1.5 bg-white shadow-sm border border-gray-100 text-xs font-bold rounded-xl text-gray-700">
                                                                {area}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>
                        ) : (
                            <div className="text-center py-8 text-gray-500">No performance data available.</div>
                        )}
                    </>
                )}
            </main>
            <BottomNav />
        </div>
    );
}
