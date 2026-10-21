import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export function useDashboardData(studentId?: string) {
    const { user, subjects: studentSubjects } = useAuth();
    const userId = studentId || user?.id;
    const [upcomingClasses, setUpcomingClasses] = useState<any[]>(() => {
        try {
            const cached = localStorage.getItem('yadalearn-cached-classes');
            return cached ? JSON.parse(cached) : [];
        } catch (e) {
            return [];
        }
    });
    const [topTeachers, setTopTeachers] = useState<any[]>(() => {
        try {
            const cached = localStorage.getItem('yadalearn-cached-teachers');
            return cached ? JSON.parse(cached) : [];
        } catch (e) {
            return [];
        }
    });
    const [unratedClasses, setUnratedClasses] = useState<any[]>([]);
    const [allBookings, setAllBookings] = useState<any[]>([]);
    const [completedCount, setCompletedCount] = useState<number>(0);
    const [totalCount, setTotalCount] = useState<number>(0);
    const [loading, setLoading] = useState(true);
    const [fetchTrigger, setFetchTrigger] = useState(0);

    const refetch = () => setFetchTrigger(prev => prev + 1);

    useEffect(() => {
        async function fetchData() {
            if (!userId) {
                setLoading(false);
                return;
            }

            try {
                // Fetch subjects and all bookings in parallel
                let currentSubjects = studentSubjects || [];
                const profilePromise = currentSubjects.length === 0 
                    ? supabase.from('profiles').select('subjects').eq('id', userId).single()
                    : Promise.resolve({ data: { subjects: currentSubjects } });

                const bookingsPromise = supabase
                    .from('bookings')
                    .select(`
                        id,
                        subject,
                        date,
                        time,
                        rating,
                        status,
                        teacher_id,
                        created_at,
                        teacher:profiles!bookings_teacher_id_fkey(id, full_name, avatar_url)
                    `)
                    .eq('student_id', userId)
                    .order('created_at', { ascending: false })
                    .limit(50);

                const [profileRes, bookingsRes] = await Promise.all([profilePromise, bookingsPromise]);

                if (currentSubjects.length === 0 && profileRes.data?.subjects) {
                    currentSubjects = profileRes.data.subjects;
                }

                const allBookings = bookingsRes.data || [];
                setAllBookings(allBookings);
                
                // Process upcoming and unrated classes
                const now = new Date();
                const parseBookingDateTime = (dateStr: string, timeStr: string) => {
                    try {
                        const [year, month, day] = dateStr.split('-').map(Number);
                        const match12 = timeStr.match(/^(\d+):(\d+)\s*(AM|PM)$/i);
                        const match24 = timeStr.match(/^(\d+):(\d+)$/);
                        let hours = 0; let minutes = 0;
                        if (match12) {
                            hours = Number(match12[1]);
                            minutes = Number(match12[2]);
                            const ampm = match12[3].toUpperCase();
                            if (ampm === 'PM' && hours < 12) hours += 12;
                            if (ampm === 'AM' && hours === 12) hours = 0;
                        } else if (match24) {
                            hours = Number(match24[1]);
                            minutes = Number(match24[2]);
                        }
                        return new Date(year, month - 1, day, hours, minutes);
                    } catch (e) { return new Date(0); }
                };

                const upcoming = [];
                const unratedPast = [];
                const teacherIds = new Set<string>();

                for (const b of allBookings) {
                    if (b.teacher_id) teacherIds.add(b.teacher_id);
                    
                    if (b.status === 'confirmed') {
                        const bookingTime = parseBookingDateTime(b.date, b.time);
                        if (bookingTime > now) {
                            upcoming.push({
                                id: b.id,
                                title: b.subject,
                                day: `${b.date} ${b.time}`,
                                time: b.time,
                                isQuiz: b.subject.toLowerCase().includes('quiz'),
                                teacherName: b.teacher?.full_name || 'Teacher'
                            });
                        } else if (b.rating === null) {
                            unratedPast.push({
                                id: b.id,
                                title: b.subject,
                                date: b.date,
                                time: b.time,
                                teacherId: b.teacher?.id,
                                teacherName: b.teacher?.full_name || 'Teacher',
                                teacherAvatar: b.teacher?.avatar_url || 'https://i.pravatar.cc/150'
                            });
                        }
                    }
                }

                const validBookings = allBookings.filter((b: any) => b.status !== 'cancelled' && b.status !== 'rejected');
                const completed = validBookings.filter((b: any) => {
                    const bookingTime = parseBookingDateTime(b.date, b.time);
                    return (b.status === 'completed' || b.status === 'attended') && bookingTime <= now;
                }).length;

                setCompletedCount(completed);
                setTotalCount(validBookings.length);

                setUpcomingClasses(upcoming);
                localStorage.setItem('yadalearn-cached-classes', JSON.stringify(upcoming));
                setUnratedClasses(unratedPast);

                // Fetch teachers
                let finalTeachersData = [];
                const tIds = Array.from(teacherIds);

                if (tIds.length > 0) {
                    const { data } = await supabase
                        .from('profiles')
                        .select(`id, full_name, avatar_url, subjects, bio, is_online, teacher_profiles (rating, min_rate, max_rate)`)
                        .in('id', tIds)
                        .eq('role', 'teacher')
                        .eq('onboarding_completed', true);
                    finalTeachersData = data || [];
                }

                if (finalTeachersData.length === 0) {
                    let query = supabase
                        .from('profiles')
                        .select(`id, full_name, avatar_url, subjects, bio, is_online, teacher_profiles (rating, min_rate, max_rate)`)
                        .eq('role', 'teacher')
                        .eq('onboarding_completed', true);
                    if (currentSubjects.length > 0) query = query.overlaps('subjects', currentSubjects);
                    const { data } = await query.limit(5);
                    finalTeachersData = data || [];
                }

                if (finalTeachersData.length === 0) {
                    const { data } = await supabase
                        .from('profiles')
                        .select(`id, full_name, avatar_url, subjects, bio, is_online, teacher_profiles (rating, min_rate, max_rate)`)
                        .eq('role', 'teacher')
                        .eq('onboarding_completed', true)
                        .limit(5);
                    finalTeachersData = data || [];
                }

                const teachers = finalTeachersData.map((t: any) => {
                    const tp = Array.isArray(t.teacher_profiles) ? (t.teacher_profiles[0] || {}) : (t.teacher_profiles || {});
                    return {
                        id: t.id,
                        name: t.full_name || 'Unknown Teacher',
                        avatar: t.avatar_url || 'https://i.pravatar.cc/150',
                        subjects: t.subjects || ['General'],
                        rating: tp.rating != null ? Number(tp.rating) : 0,
                        reviews: 12,
                        rateMin: tp.min_rate || 40,
                        rateMax: tp.max_rate || 80,
                        yearsExperience: 8,
                        bio: t.bio || 'Experienced teacher.',
                        isOnline: !!t.is_online
                    };
                });

                setTopTeachers(teachers);
                localStorage.setItem('yadalearn-cached-teachers', JSON.stringify(teachers));

            } catch (err) {
                console.error('Error fetching dashboard data:', err);
            } finally {
                setLoading(false);
            }
        }

        fetchData();
    }, [userId, studentSubjects, fetchTrigger]);

    return { upcomingClasses, topTeachers, unratedClasses, allBookings, completedCount, totalCount, loading, refetch };
}
