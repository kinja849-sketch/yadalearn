import React, { useState, useEffect } from 'react';
import { BottomNav } from '@/components/BottomNav';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useNavigate, useLocation } from 'react-router-dom';
import { MessageTeacherModal } from '@/features/student/quick-actions/MessageTeacherModal';
import { ChevronLeft } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { startOfWeek, addDays, isSameDay } from 'date-fns';

const ParentProgress = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const paramStudentId = searchParams.get('studentId') || searchParams.get('student');
  const initialStudentId = paramStudentId || location.state?.studentId || localStorage.getItem('yadalearn_selected_student_id');

  const [selectedChild, setSelectedChild] = useState<string | null>(initialStudentId || null);
  const [isMessageModalOpen, setIsMessageModalOpen] = useState(false);
  const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(null);
  const [childrenData, setChildrenData] = useState<any[]>([]);
  const [scheduleData, setScheduleData] = useState<any[]>([]);
  const [completedSessions, setCompletedSessions] = useState<any[]>([]);
  const [weeklyProgress, setWeeklyProgress] = useState<number[]>([0, 0, 0, 0, 0]);
  const [overallPercentage, setOverallPercentage] = useState(0);

  const handleSelectChild = (childId: string) => {
    setSelectedChild(childId);
    localStorage.setItem('yadalearn_selected_student_id', childId);
    navigate(`/child-progress?studentId=${childId}`, { replace: true });
  };

  useEffect(() => {
    async function fetchChildren() {
      if (!user?.id) return;
      const { data: links } = await supabase
        .from('parent_student_links')
        .select(`
          student_id,
          student:profiles!parent_student_links_student_id_fkey(
            id, full_name, avatar_url,
            student_profiles(grade_level)
          )
        `)
        .eq('parent_id', user.id);

      if (links && links.length > 0) {
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
    fetchChildren();
  }, [user]);

  useEffect(() => {
    async function fetchChildData() {
      if (!selectedChild) return;
      
      const { data: bookings } = await supabase
        .from('bookings')
        .select(`
          id, subject, date, time, status, rating, teacher_id,
          teacher:profiles!bookings_teacher_id_fkey(full_name)
        `)
        .eq('student_id', selectedChild);

      if (bookings) {
        // Calculate upcoming
        const now = new Date();
        const upcoming = bookings
          .filter(b => b.status === 'confirmed')
          .map(b => {
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
            return {
              ...b,
              dateObj,
              dayLabel: dateObj.toDateString() === now.toDateString() ? 'Today' : b.date,
              teacherName: b.teacher?.full_name || 'Teacher'
            };
          })
          .filter(b => b.dateObj >= now)
          .sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime())
          .slice(0, 5);

        setScheduleData(upcoming);

        // Calculate progress (Mon-Fri completion rate based on past classes)
        const weekStart = startOfWeek(now, { weekStartsOn: 1 }); // Monday
        const weekDays = Array.from({ length: 5 }).map((_, i) => addDays(weekStart, i));
        
        let completedCount = 0;
        let totalCount = 0;
        
        const dailyHeights = weekDays.map(day => {
          const dayBookings = bookings.filter(b => b.date === day.toISOString().split('T')[0]);
          if (dayBookings.length === 0) return 20; // baseline height
          
          totalCount += dayBookings.length;
          const completed = dayBookings.filter(b => b.status === 'completed' || b.rating !== null).length;
          completedCount += completed;
          
          return 20 + Math.min(80, (completed / dayBookings.length) * 80);
        });
        
        setWeeklyProgress(dailyHeights);
        setOverallPercentage(totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0);
        // Filter completed sessions
        const past = bookings
          .filter(b => b.status === 'completed' || b.rating !== null)
          .map(b => ({
            ...b,
            teacherName: b.teacher?.full_name || 'Teacher'
          }))
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setCompletedSessions(past);
      }
    }
    
    fetchChildData();
  }, [selectedChild]);

  const handleMessageTeacher = (teacherId: string) => {
    setSelectedTeacherId(teacherId);
    setIsMessageModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-white p-6 pt-12 pb-6 shadow-sm flex items-center sticky top-0 z-20">
        <Button variant="ghost" size="icon" onClick={() => navigate('/parent-dashboard')} className="mr-3 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-full h-10 w-10">
          <ChevronLeft className="h-6 w-6" />
        </Button>
        <h1 className="text-2xl font-bold text-gray-900">Child's Progress</h1>
      </div>

      <div className="p-6 space-y-6">
        {!selectedChild ? (
          // LIST VIEW OF CHILDREN
          <>
            <h2 className="text-xl font-bold text-gray-900 mb-4">Select a Child</h2>
            {childrenData.length > 0 ? (
              <div className="grid grid-cols-1 gap-4">
                {childrenData.map(child => (
                  <Card 
                    key={child.id} 
                    className="border border-gray-100 shadow-sm rounded-3xl overflow-hidden cursor-pointer hover:shadow-md transition-shadow hover:border-emerald-200 group"
                    onClick={() => handleSelectChild(child.id)}
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
                No children linked yet. Please scan a QR code from the dashboard.
              </div>
            )}
          </>
        ) : (
          // SPECIFIC CHILD DASHBOARD
          <>
            <div className="flex items-center gap-4 mb-2 -mt-2">
              <Button variant="outline" size="sm" onClick={() => setSelectedChild(null)} className="rounded-full flex items-center gap-1 text-gray-600 border-gray-200 hover:bg-gray-100 hover:text-gray-900">
                <ChevronLeft className="w-4 h-4" /> Back to Children
              </Button>
            </div>

            <Card className="border-0 shadow-sm rounded-3xl overflow-hidden">
              <CardContent className="p-6">
                <h3 className="font-bold text-gray-900 mb-4 text-lg">Overall Academic Progress</h3>
                <div className="h-48 bg-gradient-to-tr from-emerald-50 to-emerald-100 rounded-2xl border border-emerald-100/50 flex items-end justify-between p-4 px-6 relative overflow-hidden">
                  {weeklyProgress.map((height, i) => (
                    <div key={i} className="w-10 bg-emerald-400 rounded-t-lg transition-all duration-1000 ease-out relative" style={{ height: `${height}%` }}>
                      {i === 3 && overallPercentage > 0 && (
                        <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[10px] font-bold py-1 px-2 rounded whitespace-nowrap shadow-lg">
                          {overallPercentage}%
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="flex justify-between text-xs text-gray-500 font-medium mt-2 px-6">
                  <span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span>
                </div>
              </CardContent>
            </Card>

            <section>
              <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
                <span className="material-symbols-outlined mr-2 text-emerald-500">calendar_month</span>
                Upcoming Classes
              </h2>
              {scheduleData.length > 0 ? (
                <div className="space-y-4">
                  {scheduleData.map(item => (
                    <Card key={item.id} className="border-0 shadow-sm rounded-3xl overflow-hidden">
                      <CardContent className="p-5 flex items-center gap-4">
                        <div className="h-14 w-14 rounded-2xl bg-emerald-50 flex flex-col items-center justify-center text-emerald-600">
                          <span className="text-xs font-bold uppercase">{item.dayLabel.slice(0,3)}</span>
                          <span className="text-[10px] font-black">{item.time.split(' ')[0]}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-bold text-gray-900 truncate">{item.subject}</h4>
                          <p className="text-sm text-gray-500 truncate flex items-center">
                            <span className="material-symbols-outlined text-[16px] mr-1">person</span>
                            {item.teacherName}
                          </p>
                        </div>
                        <Button 
                          variant="outline" 
                          size="icon" 
                          className="rounded-full border-gray-200 text-gray-600 hover:text-emerald-600 hover:bg-emerald-50 shrink-0"
                          onClick={() => handleMessageTeacher(item.teacher_id)}
                        >
                          <span className="material-symbols-outlined">chat</span>
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500 bg-white rounded-3xl shadow-sm">
                  No upcoming classes scheduled.
                </div>
              )}
            </section>

            <section>
              <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center mt-8">
                <span className="material-symbols-outlined mr-2 text-green-500">check_circle</span>
                Completed Sessions
              </h2>
              {completedSessions.length > 0 ? (
                <div className="space-y-4">
                  {completedSessions.map(item => (
                    <Card key={item.id} className="border-0 shadow-sm rounded-3xl overflow-hidden bg-white opacity-80 hover:opacity-100 transition-opacity">
                      <CardContent className="p-4 flex items-center gap-4">
                        <div className="h-12 w-12 rounded-2xl bg-green-50 flex flex-col items-center justify-center text-green-600 shrink-0">
                          <span className="material-symbols-outlined text-xl">done</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-bold text-gray-900 truncate text-sm">{item.subject}</h4>
                          <p className="text-xs text-gray-500 font-medium mt-0.5">{item.date}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-0.5">Teacher</p>
                          <p className="text-sm text-gray-900 font-bold bg-gray-100 px-2 py-1 rounded-lg inline-block">{item.teacherName}</p>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500 bg-white rounded-3xl shadow-sm text-sm">
                  No completed sessions yet.
                </div>
              )}
            </section>
          </>
        )}
      </div>

      <BottomNav />
      {isMessageModalOpen && selectedTeacherId && (
        <MessageTeacherModal 
          isOpen={isMessageModalOpen}
          onClose={() => {
            setIsMessageModalOpen(false);
            setSelectedTeacherId(null);
          }}
          recipientId={selectedTeacherId}
        />
      )}
    </div>
  );
};

export default ParentProgress;
