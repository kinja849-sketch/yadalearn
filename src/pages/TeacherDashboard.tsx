import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { SessionStatus } from '@/types/enums';
import type { Student } from '@/types/schema';
import { useAuth } from '@/contexts/AuthContext';
import { useTeacherDashboardData } from '@/hooks/useTeacherDashboardData';
import { removeImageBackground } from '@/utils/imageProcessor';
import { fetchGeoLocation } from '@/utils/geo';
import { ScanQRModal } from '@/components/ScanQRModal';
import { seedDatabase } from '@/utils/seedData'; // Import seed utility
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Play, 
  Calendar as CalendarIcon, 
  Edit3, 
  Users, 
  Megaphone, 
  Upload, 
  MoreHorizontal, 
  ChevronRight, 
  Home, 
  Settings as SettingsIcon, 
  Bell,
  Menu,
  Sparkles
} from 'lucide-react';
import { BottomNav } from '@/components/BottomNav';
import { StudentProfileModal } from '@/components/ProfileModals';
import {
  StartClassModal,
  CreateSessionModal,
  ReviewSubmissionsModal,
  StudentOverviewModal,
  QuickAnnouncementModal,
  ClassLinkModal,
  UploadMaterialsModal,
  RateStudentModal,
  TeacherAICoPilotModal
} from '@/features/teacher/quick-actions';

import { MessageTeacherModal } from '@/features/student/quick-actions/MessageTeacherModal';
import { cn } from '@/lib/utils';
import { checkAndAutoCancelExpiredSessions } from '@/utils/sessionManager';

const TeacherDashboard = () => {
  const navigate = useNavigate();
  const { user, isLoaded, userRole, logout, refreshUser } = useAuth();
  const { teacherSchedule, topStudents, stats, pendingBookings, loading } = useTeacherDashboardData(); // Use the hook
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [detectedCountry, setDetectedCountry] = useState<string | null>(null);
  const [detectedCountryName, setDetectedCountryName] = useState<string | null>(null);

  const getFlagEmoji = (countryCode: string) => {
    const codePoints = countryCode
      .toUpperCase()
      .split('')
      .map(char => 127397 + char.charCodeAt(0));
    try {
      return String.fromCodePoint(...codePoints);
    } catch (e) {
      return '';
    }
  };

  useEffect(() => {
    async function detectGeo() {
      try {
        const geo = await fetchGeoLocation();

        if (geo && user?.id) {
          setDetectedCountry(geo.countryCode);
          setDetectedCountryName(geo.countryName);
          
          // Update database profiles table if database country does not match or is empty
          const { data: profile } = await supabase
            .from('profiles')
            .select('country')
            .eq('id', user.id)
            .single();
             
          if (profile && (!profile.country || profile.country.trim() !== geo.countryName)) {
            await supabase
              .from('profiles')
              .update({ country: geo.countryName })
              .eq('id', user.id);
            
            if (refreshUser) {
              await refreshUser();
            }
          }
        }
      } catch (err) {
        console.error("IP geolocation failed:", err);
      }
    }
    detectGeo();
  }, [user?.id]);

  const parseDateTime = (dateStr: string, timeStr: string) => {
    try {
      const parts = dateStr.split('-');
      if (parts.length !== 3) return new Date(0);
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);

      const match12 = timeStr.match(/^(\d+):(\d+)\s*(AM|PM)$/i);
      const match24 = timeStr.match(/^(\d+):(\d+)$/);
      let hours = 0;
      let minutes = 0;
      if (match12) {
        hours = parseInt(match12[1], 10);
        minutes = parseInt(match12[2], 10);
        const ampm = match12[3].toUpperCase();
        if (ampm === 'PM' && hours < 12) hours += 12;
        if (ampm === 'AM' && hours === 12) hours = 0;
      } else if (match24) {
        hours = parseInt(match24[1], 10);
        minutes = parseInt(match24[2], 10);
      }
      return new Date(year, month, day, hours, minutes);
    } catch (e) {
      return new Date(0);
    }
  };

  // Find the next upcoming/active event based on the current actual time (strictly within 1 hour)
  const getNextUpcomingEvent = (schedule: any[]) => {
    if (!schedule || schedule.length === 0) return null;
    const now = new Date();
    
    const upcoming = schedule.filter((event: any) => {
      if (event.status === 'cancelled' || event.status === 'rejected') return false;
      const start = parseDateTime(event.date, event.time);
      const end = new Date(start.getTime() + 60 * 60 * 1000); // 1 hour duration
      return end > now;
    });

    return upcoming.length > 0 ? upcoming[0] : null;
  };

  const [nextEvent, setNextEvent] = useState<any>(null);

  useEffect(() => {
    if (user?.id) {
      checkAndAutoCancelExpiredSessions({ teacherId: user.id });
    }
  }, [user?.id]);

  useEffect(() => {
    if (teacherSchedule && teacherSchedule.length > 0) {
      const next = getNextUpcomingEvent(teacherSchedule);
      setNextEvent(next);
    } else {
      setNextEvent(null);
    }
  }, [teacherSchedule]);
  const [activeSessionInfo, setActiveSessionInfo] = useState<{ room_id: string; title: string } | null>(null);
  const [isStartingClass, setIsStartingClass] = useState(false);

  const handleStartClassDirectly = async () => {
    if (!user?.id || isStartingClass) return;
    setIsStartingClass(true);

    try {
      const d = new Date();
      const todayStr = [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
      const nowMs = Date.now();
      const ONE_HOUR_MS = 60 * 60 * 1000;

      // 1. Check if there's already an active, live, or scheduled class for this teacher
      const { data: existingClasses } = await supabase
        .from('live_classes')
        .select('id, room_id, status, title, subject, scheduled_at, created_at')
        .eq('teacher_id', user.id)
        .in('status', ['live', 'active', 'scheduled'])
        .order('created_at', { ascending: false });

      let validClass = null;
      if (existingClasses && existingClasses.length > 0) {
        const expiredIds: string[] = [];
        for (const c of existingClasses) {
          const sTime = new Date(c.scheduled_at || c.created_at).getTime();
          if (sTime > 0 && nowMs > sTime + ONE_HOUR_MS) {
            expiredIds.push(c.id);
          } else if (!validClass) {
            validClass = c;
          }
        }
        if (expiredIds.length > 0) {
          // Batch cancel and nullify links in one request
          supabase.from('live_classes').update({ status: 'cancelled', room_id: null }).in('id', expiredIds).catch(() => {});
        }
      }

      let roomName = '';
      if (validClass) {
        roomName = validClass.room_id || `class-${user.id}-${todayStr}`;
        // Update its status to live
        await supabase
          .from('live_classes')
          .update({ status: 'live', room_id: roomName })
          .eq('id', validClass.id);
      } else {
        // Fallback: create fresh active room for today
        roomName = `class-${user.id}-${todayStr}`;
        const teacherSubject = (user as any)?.subjects?.[0] || 'Live Session';
        await supabase.from('live_classes').insert({
          teacher_id: user.id,
          room_id: roomName,
          status: 'live',
          scheduled_at: new Date().toISOString(),
          title: nextEvent?.title || `${teacherSubject} Class`,
          subject: nextEvent?.subject || teacherSubject
        });
      }

      // 2. Ensure today's bookings for this teacher and linked students are confirmed
      try {
        await supabase
          .from('bookings')
          .update({ status: 'confirmed' })
          .eq('teacher_id', user.id)
          .eq('date', todayStr);
      } catch (bErr) {
        console.warn('Booking status sync warning:', bErr);
      }

      // 3. Broadcast to linked students and today's booked students so student dashboards immediately activate
      try {
        const [linksRes, todayBookingsRes] = await Promise.all([
          supabase.from('teacher_student_links').select('student_id').eq('teacher_id', user.id),
          supabase.from('bookings').select('student_id').eq('teacher_id', user.id).eq('date', todayStr)
        ]);

        const studentIdSet = new Set<string>();
        if (linksRes.data) {
          linksRes.data.forEach((l: any) => { if (l.student_id) studentIdSet.add(l.student_id); });
        }
        if (todayBookingsRes.data) {
          todayBookingsRes.data.forEach((b: any) => { if (b.student_id) studentIdSet.add(b.student_id); });
        }

        const studentIds = Array.from(studentIdSet);
        studentIds.forEach((sId: string) => {
          const ch = supabase.channel(`student-live-session-${sId}`);
          ch.subscribe((status) => {
            if (status === 'SUBSCRIBED') {
              ch.send({
                type: 'broadcast',
                event: 'session_created',
                payload: { roomId: roomName, teacherId: user.id, studentId: sId, title: nextEvent?.title || 'Live Class' }
              });
              setTimeout(() => supabase.removeChannel(ch), 1000);
            }
          });
        });

        // Global broadcast redundancy
        const globalCh = supabase.channel('yadalearn-live-sessions');
        globalCh.subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            globalCh.send({
              type: 'broadcast',
              event: 'session_created',
              payload: { roomId: roomName, teacherId: user.id, title: nextEvent?.title || 'Live Class' }
            });
            setTimeout(() => supabase.removeChannel(globalCh), 1000);
          }
        });
      } catch (bcErr) {
        console.warn('Broadcast to students warning:', bcErr);
      }

      // Immediately navigate directly into the meeting
      navigate(`/meeting/${roomName}`);
    } catch (err) {
      console.error('Failed to start class directly:', err);
      alert('Could not start class. Please try again.');
    } finally {
      setIsStartingClass(false);
    }
  };
  const [isScanQRModalOpen, setIsScanQRModalOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [selectedStudentIdForChat, setSelectedStudentIdForChat] = useState<string | undefined>(undefined);
  const [presenceData, setPresenceData] = useState<Record<string, boolean>>({});
  
  const isSaturday = new Date().getDay() === 6;
  const [isRateStudentModalOpen, setIsRateStudentModalOpen] = useState(false);

  useEffect(() => {
    // Fetch initial presence
    const fetchInitialPresence = async () => {
      const { data } = await supabase.from('profiles').select('id, is_online');
      if (data) {
        const mapping = data.reduce((acc: any, curr: any) => {
          acc[curr.id] = !!curr.is_online;
          return acc;
        }, {});
        setPresenceData(mapping);
      }
    };
    fetchInitialPresence();

    // Subscribe to real-time changes
    const channel = supabase
      .channel('presence-channel-teacher')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'profiles'
      }, (payload) => {
        const updated = payload.new;
        setPresenceData(prev => ({
          ...prev,
          [updated.id]: !!updated.is_online
        }));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const [lastMessages, setLastMessages] = useState<Record<string, any>>({});
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});

  const fetchLastMessages = async () => {
    if (!user?.id) return;
    let deletedSet = new Set<string>();
    try {
      const saved = localStorage.getItem(`deleted_messages_${user.id}`);
      if (saved) deletedSet = new Set(JSON.parse(saved));
    } catch {}

    const { data } = await supabase
      .from('chat_messages')
      .select('id, message, sender_id, receiver_id, is_read, created_at, attachment_type')
      .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
      .order('created_at', { ascending: false })
      .limit(100);

    if (data) {
      const reversedData = [...data].reverse();
      const filtered = reversedData.filter((m: any) => !deletedSet.has(m.id));
      const mapping: any = {};
      const counts: Record<string, number> = {};
      filtered.forEach((m: any) => {
        const partnerId = m.sender_id === user.id ? m.receiver_id : m.sender_id;
        mapping[partnerId] = {
          message: m.message,
          sender_id: m.sender_id,
          is_read: !!m.is_read,
          created_at: m.created_at,
          attachment_type: m.attachment_type
        };
        if (!m.is_read && m.receiver_id === user.id) {
          counts[partnerId] = (counts[partnerId] || 0) + 1;
        }
      });
      setLastMessages(mapping);
      setUnreadCounts(counts);
    }
  };

  useEffect(() => {
    if (!user?.id) return;

    fetchLastMessages();

    // Subscribe to real-time changes
    const channel = supabase
      .channel('dashboard-last-messages-teacher')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'chat_messages'
      }, () => {
        fetchLastMessages();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);
  const [selectedDateStr, setSelectedDateStr] = useState<string>(() => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  });
  const [uploading, setUploading] = useState(false);
  const [localImage, setLocalImage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleImageClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const resizeProfileImage = (base64Str: string): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = base64Str;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(base64Str);
          return;
        }

        const targetWidth = 250;
        const targetHeight = 300;
        canvas.width = targetWidth;
        canvas.height = targetHeight;

        // Draw image keeping proportions
        const imgRatio = img.width / img.height;
        const targetRatio = targetWidth / targetHeight;
        let sx = 0, sy = 0, sWidth = img.width, sHeight = img.height;

        if (imgRatio > targetRatio) {
          sWidth = img.height * targetRatio;
          sx = (img.width - sWidth) / 2;
        } else {
          sHeight = img.width / targetRatio;
          sy = (img.height - sHeight) / 2;
        }

        ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, targetWidth, targetHeight);
        resolve(canvas.toDataURL('image/png')); 
      };
      img.onerror = () => {
        resolve(base64Str);
      };
    });
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const savedUser = localStorage.getItem('yadalearn-user');
    const parsedUser = savedUser ? JSON.parse(savedUser) : null;
    const userId = user?.id || parsedUser?.id;

    if (!userId) {
      console.error("Upload failed: User not identified.");
      alert("User not identified. Please try logging in again.");
      return;
    }

    setUploading(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64String = reader.result as string;
      try {
        const resizedImage = await resizeProfileImage(base64String);
        const processedImage = await removeImageBackground(resizedImage);
        
        const { error } = await supabase
          .from('profiles')
          .update({ avatar_url: processedImage })
          .eq('id', userId);

        if (error) {
          console.error('Error saving image in profiles table:', error);
          alert('Failed to save image: ' + error.message);
        } else {
          // Immediately update local UI state so the change is instant
          setLocalImage(processedImage);
          
          // Update cached user locally to prevent reload flickering and empty placeholder
          const savedUser = JSON.parse(localStorage.getItem('yadalearn-user') || '{}');
          savedUser.imageUrl = processedImage;
          localStorage.setItem('yadalearn-user', JSON.stringify(savedUser));
          
          // Refresh user context state dynamically without reloading the page!
          await refreshUser();
        }
      } catch (err) {
        console.error('CRITICAL: Image processing/upload failed:', err);
        alert('Image upload failed: ' + (err as Error).message);
      } finally {
        setUploading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleApproveBooking = async (bookingId: string) => {
    try {
      const { error } = await supabase
        .from('bookings')
        .update({ status: 'confirmed' })
        .eq('id', bookingId);
      if (error) throw error;
      window.location.reload();
    } catch (err) {
      console.error('Error approving booking:', err);
      alert('Failed to approve booking request.');
    }
  };

  const handleRejectBooking = async (bookingId: string) => {
    try {
      const { error } = await supabase
        .from('bookings')
        .update({ status: 'rejected' })
        .eq('id', bookingId);
      if (error) throw error;
      window.location.reload();
    } catch (err) {
      console.error('Error rejecting booking:', err);
      alert('Failed to reject booking request.');
    }
  };

  const handleCancelClass = async (classId: string) => {
    if (!confirm('Are you sure you want to cancel this class?')) return;
    try {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(classId);
      const query = classId.startsWith('class-')
        ? supabase.from('live_classes').update({ status: 'cancelled' }).eq('room_id', classId)
        : isUuid
        ? supabase.from('live_classes').update({ status: 'cancelled' }).eq('id', classId)
        : supabase.from('live_classes').update({ status: 'cancelled' }).eq('room_id', classId);
      const { error } = await query;

      if (error) throw error;
      alert('Class cancelled successfully.');
      window.location.reload();
    } catch (err) {
      console.error('Error cancelling class:', err);
      alert('Failed to cancel class.');
    }
  };

  // Helper to generate calendar days for the current month with full date strings
  const getCalendarDays = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const prevMonthTotalDays = new Date(year, month, 0).getDate();
    
    const days: { date: number; isCurrentMonth: boolean; isToday: boolean; dateStr: string }[] = [];
    
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const d = prevMonthTotalDays - i;
      const m = month === 0 ? 11 : month - 1;
      const y = month === 0 ? year - 1 : year;
      const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push({ date: d, isCurrentMonth: false, isToday: false, dateStr });
    }
    for (let i = 1; i <= totalDays; i++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      days.push({ date: i, isCurrentMonth: true, isToday: i === now.getDate(), dateStr });
    }
    const remaining = days.length % 7;
    if (remaining > 0) {
      for (let i = 1; i <= (7 - remaining); i++) {
        const m = month === 11 ? 0 : month + 1;
        const y = month === 11 ? year + 1 : year;
        const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        days.push({ date: i, isCurrentMonth: false, isToday: false, dateStr });
      }
    }
    return days;
  };

  // Use real stats from the database
  const studentProgress = {
    completedTasks: (stats as any).completedTasks || 0,
    pendingTasks: (stats as any).pendingTasks || 0
  };

  // ALL hooks must be called before any conditional logic
  useEffect(() => {
    if (isLoaded) {
      const savedRole = localStorage.getItem('yadalearn-user-role');
      const savedUser = localStorage.getItem('yadalearn-user');
      const isTeacher = userRole === 'teacher' || savedRole === 'teacher';
      const hasUser = user || savedUser;

      if (!hasUser || !isTeacher) {
        navigate('/role-selection');
      }
    }
  }, [user, isLoaded, userRole, navigate]);

  // Listen for custom events from BottomNav
  useEffect(() => {
    const handleOpenStudentsModal = () => setActiveModal('students');
    const handleOpenClassModal = () => setActiveModal('class');
    const handleOpenEarningsModal = () => setActiveModal('earnings');

    window.addEventListener('openStudentsModal', handleOpenStudentsModal);
    window.addEventListener('openClassModal', handleOpenClassModal);
    window.addEventListener('openEarningsModal', handleOpenEarningsModal);

    return () => {
      window.removeEventListener('openStudentsModal', handleOpenStudentsModal);
      window.removeEventListener('openClassModal', handleOpenClassModal);
      window.removeEventListener('openEarningsModal', handleOpenEarningsModal);
    };
  }, []);

  // Compute derived values after all hooks are called
  const savedRole = localStorage.getItem('yadalearn-user-role');
  const savedUser = localStorage.getItem('yadalearn-user');
  const isTeacher = userRole === 'teacher' || savedRole === 'teacher';
  const hasUser = user || savedUser;
  const currentUser = user || (savedUser ? JSON.parse(savedUser) : null);
  const isReady = isLoaded && hasUser && isTeacher;
  const shouldRedirectToLogin = isLoaded && !hasUser;
  const shouldRedirectToRoleSelection = isLoaded && hasUser && !isTeacher;

  // Handle redirects after hooks but before render
  if (shouldRedirectToLogin) {
    navigate('/login');
    return null;
  }

  if (shouldRedirectToRoleSelection) {
    navigate('/role-selection');
    return null;
  }

  // Show loading state after hooks are called
  if (!isReady) {
    return (
      <div className="min-h-screen bg-background-light dark:bg-background-dark flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  const handleStudentClick = (student: Student) => {
    setSelectedStudent(student);
    setIsModalOpen(true);
  };

  const totalTasks = studentProgress.completedTasks + studentProgress.pendingTasks;
  const progressPercentage = Math.round((studentProgress.completedTasks / totalTasks) * 100);
  const strokeDasharray = `${progressPercentage}, 100`;

  return (
    <div className="flex min-h-screen bg-[#FAF8F6] dark:bg-zinc-950 font-sans text-slate-800 dark:text-slate-200 w-full relative overflow-x-hidden">

      {/* Sidebar on desktop */}
      <aside className={`hidden flex-col justify-between w-64 p-8 border-r border-slate-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 shrink-0 sticky top-0 h-screen z-10 ${!isSidebarCollapsed ? 'md:flex' : 'md:hidden'}`}>
        <div className="flex flex-col gap-10">
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2.5 px-1">
              <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-slate-50 dark:bg-zinc-800 flex items-center justify-center overflow-hidden shrink-0 border border-slate-100 dark:border-zinc-700 shadow-sm relative">
                <img 
                  src="/logo (2).png" 
                  alt="YadaLearn Logo" 
                  className="absolute w-[185%] h-[185%] max-w-none object-contain top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" 
                />
              </div>
              <span className="font-extrabold text-xl text-slate-900 dark:text-white tracking-tight">YadaLearn</span>
            </div>
            <button 
              onClick={() => setIsSidebarCollapsed(true)} 
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-550 dark:text-zinc-400 transition-colors"
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>
          
          <nav className="flex flex-col gap-1.5">
            {[
              { label: 'Home', path: '/teacher-dashboard', icon: Home },
              { label: 'Students', path: '/teacher-students', icon: Users },
              { label: 'Calendar', path: '/teacher-calendar', icon: CalendarIcon }
            ].map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <button
                  key={item.label}
                  onClick={() => navigate(item.path)}
                  className={cn(
                    "flex items-center gap-3.5 px-4 py-3 rounded-2xl transition-all text-left w-full",
                    isActive
                      ? "bg-[#FF7D46]/10 text-[#FF7D46] dark:text-orange-450 border border-[#FF7D46]/15 font-bold"
                      : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-zinc-800/50 font-semibold"
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
        
        {/* Bottom actions matching reference image */}
        <div className="flex flex-col gap-4">


          <button
            onClick={() => navigate('/settings')}
            className="flex items-center gap-3.5 px-4 py-3 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-zinc-800/50 rounded-2xl font-semibold transition-all text-left w-full"
          >
            <SettingsIcon className="h-5 w-5" />
            <span>Settings</span>
          </button>
          <button
            onClick={() => {
              logout();
            }}
            className="flex items-center gap-3.5 px-4 py-3 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-zinc-800/50 rounded-2xl font-semibold transition-all text-left w-full"
          >
            <Avatar className="h-6 w-6">
              <AvatarImage src={localImage || currentUser?.avatarUrl || currentUser?.imageUrl} />
              <AvatarFallback className="bg-purple-600 text-white text-[10px] font-bold">
                {currentUser?.name ? currentUser.name.split(' ').map((n: string) => n[0]).join('') : 'T'}
              </AvatarFallback>
            </Avatar>
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="relative flex-1 overflow-y-auto px-4 md:px-10 py-10 pb-28 md:pb-10 w-full bg-transparent overflow-x-hidden">
        {/* Soft floating background blobs for glassmorphism refraction */}
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-[#FF7D46]/5 dark:bg-orange-950/5 blur-[120px] rounded-full pointer-events-none z-0" />
        <div className="absolute bottom-[20%] right-[-10%] w-[60%] h-[60%] bg-purple-200/5 dark:bg-purple-950/5 blur-[150px] rounded-full pointer-events-none z-0" />

        {/* Header with hamburger toggle */}
        <header className="relative flex justify-start items-center mb-6 pt-2 z-10">
          {isSidebarCollapsed && (
            <button 
              onClick={() => setIsSidebarCollapsed(false)} 
              className="hidden md:flex p-2.5 rounded-xl bg-white/60 dark:bg-zinc-800/60 backdrop-blur-md border border-slate-200/40 dark:border-zinc-700/40 text-slate-700 dark:text-zinc-200 shadow-sm hover:scale-105 active:scale-95 transition-all"
            >
              <Menu className="h-6 w-6" />
            </button>
          )}
        </header>

        {/* Hidden File Input for Portrait Upload */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleImageUpload}
          accept="image/*"
          className="hidden"
        />

        {/* Hero Section (No Card Wrapper) */}
        <div className="relative flex flex-col md:flex-row items-center md:items-start justify-start gap-12 mt-4 md:mt-0 mb-4 pt-4 w-full z-10">

           {/* Portrait Image Area (Interactive / Uploadable) */}
           <div className="relative shrink-0 md:-mb-[135px] z-30 group">
             {/* Soft, organic localized peach/apricot glow behind the portrait (circular aura, no clipping) */}
             <div className="absolute top-[45%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-[480px] h-[480px] md:w-[640px] md:h-[640px] bg-[radial-gradient(circle,rgba(255,125,70,0.85)_0%,rgba(255,185,130,0.45)_50%,transparent_75%)] blur-[60px] pointer-events-none z-0" />
             {currentUser?.imageUrl ? (
               <div className="relative">
                 <div 
                   className="w-64 h-80 md:w-72 md:h-96 rounded-[2rem] border border-white/40 bg-white/20 dark:bg-zinc-900/30 backdrop-blur-xl shadow-2xl shadow-slate-300/40 dark:shadow-black/40 flex items-center justify-center relative cursor-pointer overflow-hidden z-10 transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl hover:shadow-slate-400/50 dark:hover:shadow-black/60" 
                   onClick={handleImageClick}
                 >
                   {/* Photograph processed with blurred background and sharp individual */}
                   <img
                     src={localImage || currentUser.imageUrl}
                     alt="Teacher Portrait"
                     className="w-full h-full object-cover select-none transition-transform duration-300 group-hover:scale-[1.01]"
                   />

                   {/* Dark overlay mask that dims the image on hover to signal editability */}
                   <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none rounded-[2rem] z-16" />
                   
                   {/* Frosted glass highlight overlay over the portrait */}
                   <div className="absolute inset-0 border border-white/20 bg-gradient-to-tr from-white/10 via-white/5 to-transparent pointer-events-none rounded-[2rem] z-15 backdrop-blur-[0.5px]" />
                 </div>
                 
                  {/* Country Geolocation Flag Badge (Circular Flag, bottom-right edge corner overlap) */}
                  {detectedCountry && (
                    <div 
                      className="absolute bottom-16 -right-5 z-40 transition-transform duration-300 group-hover:scale-105"
                      title={`Detected Country: ${detectedCountryName}`}
                    >
                      <div className="w-11 h-11 rounded-full overflow-hidden border-2 border-slate-300 dark:border-zinc-655 shadow-[inset_0_2px_4px_rgba(255,255,255,0.4),0_4px_10px_rgba(0,0,0,0.25)] flex items-center justify-center bg-zinc-100 shrink-0 relative">
                        <img 
                          src={`https://flagcdn.com/w80/${detectedCountry.toLowerCase()}.png`} 
                          alt={detectedCountryName || 'Flag'} 
                          className="w-full h-full object-cover scale-[1.15]" 
                        />
                        <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-white/30 pointer-events-none rounded-full" />
                      </div>
                    </div>
                  )}

                 {/* Floating Edit Badge (Moved to bottom-left corner to prevent overlapping the bottom-right flag badge) */}
                 <div 
                   onClick={handleImageClick}
                   className="absolute bottom-4 left-4 bg-white dark:bg-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-700 p-3 rounded-full shadow-xl opacity-0 group-hover:opacity-100 transition-all duration-200 flex items-center justify-center border border-slate-100 dark:border-zinc-700 hover:scale-110 z-50 cursor-pointer w-11 h-11"
                 >
                   <span className="material-symbols-outlined text-base text-slate-700 dark:text-zinc-300">edit</span>
                 </div>
               </div>
             ) : (
               <div className="relative">
                 <div
                   onClick={handleImageClick}
                   className="w-64 h-80 md:w-72 md:h-96 rounded-[2rem] border border-white/40 bg-white/20 dark:bg-zinc-900/30 backdrop-blur-xl shadow-[0_20px_50px_rgba(255,125,70,0.15)] flex flex-col items-center justify-center gap-3 cursor-pointer hover:scale-[1.02] transition-all group z-10"
                 >
                  <div className="w-12 h-12 rounded-full bg-purple-50 dark:bg-purple-950/20 flex items-center justify-center text-[#FF7D46] group-hover:scale-115 transition-transform duration-200 shadow-sm border border-purple-100/50 dark:border-zinc-800">
                    <span className="material-symbols-outlined text-2xl">upload</span>
                  </div>
                  <div className="text-center px-4">
                    <p className="text-xs font-bold text-slate-600 dark:text-zinc-300">Upload Portrait</p>
                    <p className="text-[10px] font-semibold text-slate-400 dark:text-zinc-500 mt-1">Recommended:<br/>Professional Photo</p>
                  </div>
                </div>

                {/* Country Geolocation Flag Badge (Circular Flag, bottom-right edge corner overlap) */}
                {detectedCountry && (
                    <div 
                      className="absolute bottom-16 -right-5 z-40 transition-transform duration-300 group-hover:scale-105"
                      title={`Detected Country: ${detectedCountryName}`}
                    >
                      <div className="w-11 h-11 rounded-full overflow-hidden border-2 border-slate-300 dark:border-zinc-650 shadow-[inset_0_2px_4px_rgba(255,255,255,0.4),0_4px_10px_rgba(0,0,0,0.25)] flex items-center justify-center bg-zinc-100 shrink-0 relative">
                        <img 
                          src={`https://flagcdn.com/w80/${detectedCountry.toLowerCase()}.png`} 
                          alt={detectedCountryName || 'Flag'} 
                          className="w-full h-full object-cover scale-[1.15]" 
                        />
                        <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-white/30 pointer-events-none rounded-full" />
                      </div>
                    </div>
                  )}
              </div>
            )}
            {uploading && (
              <div className="absolute inset-0 bg-white/60 dark:bg-zinc-950/60 rounded-[2rem] backdrop-blur-sm flex items-center justify-center z-30">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
              </div>
            )}
          </div>

          <div className="flex-1 flex flex-col lg:flex-row items-center lg:items-start justify-between gap-8 pt-6 w-full text-center md:text-left">
            <div className="flex-1 text-center md:text-left">
              <h2 className="text-gray-900 dark:text-white text-[28px] font-black tracking-[-0.03em] leading-none">
                Welcome back, {currentUser?.name?.split(' ')[0] || 'Teacher'}
              </h2>
              <p className="text-gray-500 dark:text-zinc-400 font-medium text-lg tracking-[-0.01em]">
                You have {stats.activeCourses ? 'a session coming up' : `${pendingBookings.length} pending bookings`} today.
              </p>
              {isSaturday && (
                <div 
                  onClick={() => setIsRateStudentModalOpen(true)}
                  className="mt-4 p-4 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 cursor-pointer hover:shadow-lg transition-all text-white flex items-center justify-between group"
                >
                  <div>
                    <h3 className="font-bold text-lg">Weekly Student Review</h3>
                    <p className="text-orange-50 text-sm">It's Saturday! Time to rate your students' progress for the week.</p>
                  </div>
                  <div className="bg-white/20 p-2 rounded-full group-hover:bg-white/30 transition-colors">
                    <span className="material-symbols-outlined">star</span>
                  </div>
                </div>
              )}
              
              {currentUser?.bio && (
                <p className="text-sm font-semibold text-slate-500 dark:text-zinc-400 mt-2 mb-6 max-w-md italic leading-relaxed border-l-2 border-purple-500/35 pl-3 text-left">
                  "{currentUser.bio}"
                </p>
              )}
              
              {/* Profile Stats List */}
              <div className="flex flex-col gap-2.5 max-w-xs mx-auto md:mx-0 mt-6">
                <div className="flex items-center gap-1.5 text-sm">
                  <span className="text-slate-600 dark:text-slate-350 font-semibold">Active Courses:</span>
                  <span className="font-extrabold text-slate-800 dark:text-slate-100">{stats.activeCourses ?? 0}</span>
                </div>
                <div className="flex items-center gap-1.5 text-sm">
                  <span className="text-slate-600 dark:text-slate-355 font-semibold">Registered Students:</span>
                  <span className="font-extrabold text-slate-800 dark:text-slate-100">{stats.totalStudents ?? 0}</span>
                </div>
                 <div className="flex items-center gap-1.5 text-sm">
                  <span className="text-slate-600 dark:text-slate-355 font-semibold">Avg. Course Rating:</span>
                  <span className="font-extrabold text-slate-800 dark:text-slate-100">{stats.avgRating ? Number(stats.avgRating).toFixed(1) : "0.0"}</span>
                </div>
              </div>
            </div>

            {/* Teacher Daily Rating Progress Widget */}
            <div className="shrink-0 flex flex-col items-center justify-center p-5 bg-white/45 dark:bg-zinc-900/30 backdrop-blur-md border border-white/20 rounded-[2.5rem] shadow-sm z-20 hover:scale-[1.02] transition-transform">
              {/* Circular Liquid Progress Animation */}
              <div className="relative w-44 h-44 rounded-full border border-orange-500/35 overflow-hidden flex items-center justify-center bg-orange-50/10 dark:bg-zinc-950/20 shadow-[0_8px_32px_0_rgba(255,125,70,0.15)] shrink-0">
                <style>{`
                  @keyframes wave-rotation-1 {
                    from { transform: translate(-50%, 0) rotate(0deg); }
                    to { transform: translate(-50%, 0) rotate(360deg); }
                  }
                  @keyframes wave-rotation-2 {
                    from { transform: translate(-50%, 0) rotate(45deg); }
                    to { transform: translate(-50%, 0) rotate(405deg); }
                  }
                `}</style>
                
                {/* Liquid Wave 1 */}
                <div 
                  className="absolute bg-gradient-to-t from-[#FF7D46]/60 to-[#FFB982]/60 w-[200%] h-[200%] rounded-[38%] opacity-85"
                  style={{
                    left: '50%',
                    bottom: `${(stats.todayProgressPercent || 0) - 200}%`,
                    animation: 'wave-rotation-1 12s infinite linear'
                  }}
                />
                
                {/* Liquid Wave 2 */}
                <div 
                  className="absolute bg-gradient-to-t from-[#FF7D46]/40 to-[#FFB982]/40 w-[195%] h-[195%] rounded-[40%] opacity-65"
                  style={{
                    left: '50%',
                    bottom: `${(stats.todayProgressPercent || 0) - 195}%`,
                    animation: 'wave-rotation-2 9s infinite linear'
                  }}
                />

                {/* Rating Percentage Center Value */}
                <div className="relative z-10 flex flex-col items-center justify-center select-none text-center">
                  <span className="text-4xl font-black text-slate-800 dark:text-white drop-shadow-sm leading-none">
                    {Math.round(stats.todayProgressPercent || 0)}%
                  </span>
                  <span className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider mt-1.5">Rating</span>
                </div>
              </div>
              
              <p className="text-[10px] font-extrabold text-slate-650 dark:text-zinc-405 mt-3 tracking-wide text-center uppercase">
                Today's Rating Progress
              </p>
            </div>
          </div>
        </div>

        {/* Pending Booking Requests Alert Banner */}
        {pendingBookings && pendingBookings.length > 0 && (
          <div className="mb-10 space-y-4">
            {pendingBookings.map((booking: any) => (
              <div key={booking.id} className="relative overflow-hidden bg-gradient-to-r from-purple-500/10 via-pink-500/10 to-transparent border border-purple-500/20 dark:border-purple-800/30 p-5 md:p-6 rounded-[2rem] flex flex-col md:flex-row items-center justify-between gap-5 backdrop-blur-xl shadow-lg transition-all animate-in fade-in slide-in-from-top-4 duration-300">
                <div className="absolute top-0 right-0 w-48 h-48 bg-purple-500/5 blur-3xl rounded-full pointer-events-none" />
                <div className="flex items-center gap-4 text-left w-full md:w-auto">
                  <div className="w-12 h-12 rounded-2xl bg-purple-100 dark:bg-purple-950/40 flex items-center justify-center text-purple-600 dark:text-purple-400 shrink-0 shadow-sm border border-purple-200/30">
                    <span className="material-symbols-outlined text-2xl font-bold animate-pulse">notifications_active</span>
                  </div>
                  <div>
                    <h3 className="font-extrabold text-sm text-slate-800 dark:text-white tracking-tight">New Booking & Registration Request!</h3>
                    <p className="text-xs font-semibold text-slate-500 dark:text-zinc-400 mt-1 leading-relaxed">
                      <span className="font-bold text-slate-850 dark:text-slate-200">{booking.student?.full_name || 'A Student'}</span> wants to register and book a session for <span className="font-bold text-slate-850 dark:text-slate-200">{booking.subject}</span> on <span className="font-bold text-slate-850 dark:text-slate-200">{booking.date}</span> at <span className="font-bold text-slate-850 dark:text-slate-200">{booking.time}</span>.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 w-full md:w-auto shrink-0 justify-end z-10">
                  <Button
                    onClick={() => handleRejectBooking(booking.id)}
                    variant="outline"
                    className="border-red-500/30 text-red-650 hover:bg-red-50 dark:border-red-900/20 dark:text-red-400 dark:hover:bg-red-950/20 px-5 py-2.5 rounded-full font-bold text-xs shadow-sm cursor-pointer"
                  >
                    Reject
                  </Button>
                  <Button
                    onClick={() => handleApproveBooking(booking.id)}
                    className="bg-purple-600 hover:bg-purple-700 text-white px-5 py-2.5 rounded-full font-bold text-xs shadow-md hover:shadow-lg transition-shadow cursor-pointer"
                  >
                    Approve & Register
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Action Grid & Planning */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 mb-10 z-20 relative">
          {/* Quick Actions Panel */}
          <div className="lg:col-span-3 bg-white/75 dark:bg-zinc-900/60 backdrop-blur-xl rounded-[2rem] p-6 md:p-8 shadow-[-12px_24px_50px_-10px_rgba(255,140,100,0.32),_0_8px_24px_rgba(0,0,0,0.02)] border-t-2 border-t-[#FFBCA0] border-l-2 border-l-[#FFC3A0]/65 border-r border-r-slate-200/40 border-b border-b-slate-200/40 z-10 relative">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-slate-800 dark:text-white tracking-tight">Quick Actions</h2>
              <button className="w-8 h-8 flex items-center justify-center hover:bg-slate-100/50 dark:hover:bg-zinc-800/50 rounded-full shrink-0 text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-white">
                <MoreHorizontal className="h-5 w-5" />
              </button>
            </div>
            
            {/* AI Teaching Co-Pilot Banner */}
            <div
              onClick={() => setActiveModal('ai-copilot')}
              className="mb-4 p-4 rounded-2xl bg-gradient-to-r from-[#FF7D46]/15 via-orange-100/40 to-purple-500/10 hover:from-[#FF7D46]/25 dark:from-orange-950/30 dark:via-zinc-850 dark:to-purple-950/20 border border-[#FF7D46]/30 dark:border-orange-500/30 shadow-sm flex items-center justify-between cursor-pointer hover:scale-[1.01] active:scale-[0.99] transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className="size-11 rounded-2xl bg-gradient-to-tr from-[#FF7D46] to-amber-400 flex items-center justify-center p-1.5 shadow-md shadow-orange-500/20">
                  <img src="/logo (2).png" alt="Aoede" className="w-full h-full object-contain" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-extrabold text-slate-800 dark:text-zinc-100">Aoede AI Co-Pilot</h3>
                    <span className="text-[10px] bg-orange-500 text-white font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider">
                      AI Mentor
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">Classroom discussion starters, grading assistant, & lesson planning</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/80 dark:bg-zinc-800/80 text-[#FF7D46] dark:text-orange-400 font-bold text-xs shadow-sm group-hover:bg-orange-500 group-hover:text-white transition-all shrink-0">
                <Sparkles className="size-3.5" />
                <span>Launch Co-Pilot</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div
                onClick={handleStartClassDirectly}
                className="bg-white/50 hover:bg-white/70 dark:bg-zinc-800/30 dark:hover:bg-zinc-800/50 p-5 rounded-[1.5rem] border border-white/60 dark:border-zinc-700/20 shadow-sm flex flex-col items-center justify-center gap-2 cursor-pointer hover:scale-[1.02] active:scale-95 transition-all text-center h-28"
              >
                <div className="w-10 h-10 rounded-full bg-[#FF7D46]/10 flex items-center justify-center">
                  <Play className="h-5 w-5 text-[#FF7D46] dark:text-orange-450" />
                </div>
                <p className="text-xs font-bold text-slate-750 dark:text-zinc-200">
                  {isStartingClass ? 'Starting...' : 'Start Class'}
                </p>
              </div>

              <div
                onClick={() => setActiveModal('create-session')}
                className="bg-white/50 hover:bg-white/70 dark:bg-zinc-800/30 dark:hover:bg-zinc-800/50 p-5 rounded-[1.5rem] border border-white/60 dark:border-zinc-700/20 shadow-sm flex flex-col items-center justify-center gap-2 cursor-pointer hover:scale-[1.02] active:scale-95 transition-all text-center h-28"
              >
                <div className="w-10 h-10 rounded-full bg-[#FF7D46]/10 flex items-center justify-center">
                  <CalendarIcon className="h-5 w-5 text-[#FF7D46] dark:text-orange-450" />
                </div>
                <p className="text-xs font-bold text-slate-750 dark:text-zinc-200">Create Session</p>
              </div>

              <div
                onClick={() => setActiveModal('review-submissions')}
                className="bg-white/50 hover:bg-white/70 dark:bg-zinc-800/30 dark:hover:bg-zinc-800/50 p-5 rounded-[1.5rem] border border-white/60 dark:border-zinc-700/20 shadow-sm flex flex-col items-center justify-center gap-2 cursor-pointer hover:scale-[1.02] active:scale-95 transition-all text-center h-28"
              >
                <div className="w-10 h-10 rounded-full bg-[#FF7D46]/10 flex items-center justify-center">
                  <Edit3 className="h-5 w-5 text-[#FF7D46] dark:text-orange-450" />
                </div>
                <p className="text-xs font-bold text-slate-750 dark:text-zinc-200">Review Assignments</p>
              </div>



              <div
                onClick={() => setActiveModal('student-overview')}
                className="bg-white/50 hover:bg-white/70 dark:bg-zinc-800/30 dark:hover:bg-zinc-800/50 p-5 rounded-[1.5rem] border border-white/60 dark:border-zinc-700/20 shadow-sm flex flex-col items-center justify-center gap-2 cursor-pointer hover:scale-[1.02] active:scale-95 transition-all text-center h-28"
              >
                <div className="w-10 h-10 rounded-full bg-[#FF7D46]/10 flex items-center justify-center">
                  <Users className="h-5 w-5 text-[#FF7D46] dark:text-orange-450" />
                </div>
                <p className="text-xs font-bold text-slate-750 dark:text-zinc-200">Students</p>
              </div>

              <div
                onClick={() => setActiveModal('announcement')}
                className="bg-white/50 hover:bg-white/70 dark:bg-zinc-800/30 dark:hover:bg-zinc-800/50 p-5 rounded-[1.5rem] border border-white/60 dark:border-zinc-700/20 shadow-sm flex flex-col items-center justify-center gap-2 cursor-pointer hover:scale-[1.02] active:scale-95 transition-all text-center h-28"
              >
                <div className="w-10 h-10 rounded-full bg-[#FF7D46]/10 flex items-center justify-center">
                  <Megaphone className="h-5 w-5 text-[#FF7D46] dark:text-orange-450" />
                </div>
                <p className="text-xs font-bold text-slate-750 dark:text-zinc-200">Announcements</p>
              </div>

              <div
                onClick={() => setActiveModal('upload-materials')}
                className="bg-white/50 hover:bg-white/70 dark:bg-zinc-800/30 dark:hover:bg-zinc-800/50 p-5 rounded-[1.5rem] border border-white/60 dark:border-zinc-700/20 shadow-sm flex flex-col items-center justify-center gap-2 cursor-pointer hover:scale-[1.02] active:scale-95 transition-all text-center h-28"
              >
                <div className="w-10 h-10 rounded-full bg-[#FF7D46]/10 flex items-center justify-center">
                  <Upload className="h-5 w-5 text-[#FF7D46] dark:text-orange-450" />
                </div>
                <p className="text-xs font-bold text-slate-750 dark:text-zinc-200">Upload Materials</p>
              </div>
            </div>
          </div>

          {/* Right Column: Calendar */}
          <div className="lg:col-span-2 flex flex-col gap-8 z-10 relative">

            {/* Calendar & Planning Panel */}
            <div className="flex-1 bg-white/75 dark:bg-zinc-900/60 backdrop-blur-xl rounded-[2rem] p-6 md:p-8 border-t-2 border-t-[#FFBCA0] border-l-2 border-l-[#FFC3A0]/65 border-r border-r-slate-200/40 border-b border-b-slate-200/40 flex flex-col relative">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-slate-800 dark:text-white tracking-tight">Calendar & Planning</h2>
                <button className="w-8 h-8 flex items-center justify-center hover:bg-slate-100/50 dark:hover:bg-zinc-800/50 rounded-full shrink-0 text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-white">
                  <MoreHorizontal className="h-5 w-5" />
                </button>
              </div>
              
              <div className="flex flex-col sm:flex-row gap-6 justify-between items-start">
                {/* Calendar Widget */}
                <div className="w-full sm:w-1/2 max-w-[200px] shrink-0">
                  <div className="grid grid-cols-7 gap-y-1 gap-x-1 text-center">
                    {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, idx) => (
                      <span key={idx} className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase h-6 flex items-center justify-center">{day}</span>
                    ))}
                    {getCalendarDays().map((d, idx) => {
                      const isSelected = d.dateStr === selectedDateStr;
                      const hasPlans = teacherSchedule.some((s: any) => s.date === d.dateStr);
                      return (
                        <div 
                          key={idx} 
                          onClick={() => setSelectedDateStr(d.dateStr)}
                          className="relative flex items-center justify-center h-7 w-7 mx-auto cursor-pointer transition-all hover:bg-slate-100/50 dark:hover:bg-zinc-800/50 rounded-full"
                        >
                          <span className={
                            isSelected
                              ? "bg-slate-800 text-white dark:bg-white dark:text-slate-950 font-bold text-xs rounded-full w-6 h-6 flex items-center justify-center shadow-sm"
                              : d.isToday
                                ? "border border-slate-400 text-slate-800 dark:border-white dark:text-white font-bold text-xs rounded-full w-6 h-6 flex items-center justify-center shadow-sm"
                                : d.isCurrentMonth
                                  ? "text-slate-750 dark:text-zinc-100 font-semibold text-xs"
                                  : "text-slate-350 dark:text-zinc-650 font-medium text-[10px]"
                          }>
                            {d.date}
                          </span>
                          {hasPlans && (
                            <span className={`absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full ${isSelected ? 'bg-orange-400' : 'bg-[#FF7D46]'}`} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Schedule and Events */}
                <div className="flex-1 w-full space-y-4">
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">Daily Schedule & Planning</p>
                    
                    {(() => {
                      const filtered = teacherSchedule.filter((session: any) => session.date === selectedDateStr);
                      const now = new Date();
                      
                      if (filtered.length > 0) {
                        return filtered.map((session) => {
                          const sessionTime = parseDateTime(session.date, session.time);
                          const hasPassed = session.status === 'completed' || session.status === 'cancelled';
                          const isNext = nextEvent && session.id === nextEvent.id;
                          
                          if (hasPassed) {
                            return (
                              <div key={session.id} className="flex items-center gap-3 p-2.5 bg-slate-50/50 dark:bg-zinc-800/10 border-l-4 border-slate-300 rounded-r-xl border border-y-slate-100/50 border-r-slate-100/50 dark:border-y-transparent dark:border-r-transparent opacity-60">
                                <span className="font-bold text-[10px] text-slate-400 dark:text-zinc-500 whitespace-nowrap line-through">{session.time}</span>
                                <span className="text-xs font-semibold text-slate-555 dark:text-zinc-400 truncate line-through flex-1">{session.title}</span>
                                <span className="material-symbols-outlined text-xs text-slate-400 shrink-0">check_circle</span>
                              </div>
                            );
                          }
                          
                          if (isNext) {
                            return (
                              <div key={session.id} className="flex items-center gap-3 p-2.5 bg-purple-50/80 dark:bg-purple-950/20 border-l-4 border-purple-500 rounded-r-xl border border-y-purple-100 dark:border-y-transparent ring-2 ring-purple-500/20 ring-offset-1 dark:ring-offset-zinc-900 shadow-sm transition-all hover:scale-[1.01]">
                                <span className="font-bold text-[10px] text-purple-650 dark:text-purple-400 whitespace-nowrap">{session.time}</span>
                                <span className="text-xs font-bold text-slate-850 dark:text-white truncate flex-1">{session.title}</span>
                                <span className="bg-purple-500 text-white text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded-full tracking-wider animate-pulse shrink-0">Next Up</span>
                                <button onClick={() => handleCancelClass(session.id)} className="shrink-0 text-slate-400 hover:text-red-500 transition-colors ml-1" title="Cancel Class">
                                  <span className="material-symbols-outlined text-[14px]">cancel</span>
                                </button>
                              </div>
                            );
                          }
                          
                          return (
                            <div key={session.id} className="flex items-center gap-3 p-2.5 bg-blue-50/60 dark:bg-blue-950/10 border-l-4 border-blue-500 rounded-r-xl border border-y-blue-100/30 dark:border-y-transparent group">
                              <span className="font-bold text-[10px] text-blue-600 dark:text-blue-400 whitespace-nowrap">{session.time}</span>
                              <span className="text-xs font-semibold text-slate-700 dark:text-zinc-200 truncate flex-1">{session.title}</span>
                              <button onClick={() => handleCancelClass(session.id)} className="shrink-0 text-slate-400 opacity-0 group-hover:opacity-100 hover:text-red-500 transition-all ml-1" title="Cancel Class">
                                <span className="material-symbols-outlined text-[14px]">cancel</span>
                              </button>
                            </div>
                          );
                        });
                      } else {
                        return (
                          <div className="flex flex-col items-center justify-center p-4 bg-white/30 dark:bg-zinc-800/10 border border-dashed border-slate-200 dark:border-zinc-700/20 rounded-2xl">
                            <CalendarIcon className="h-5 w-5 text-slate-400 dark:text-zinc-500 mb-1" />
                            <p className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">No Scheduled Plans</p>
                          </div>
                        );
                      }
                    })()}
                  </div>
 
                  {nextEvent && (
                    <div className="p-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-xl text-white shadow-sm border-l-4 border-purple-300">
                      <p className="text-[10px] font-bold opacity-80 uppercase tracking-wider mb-0.5">Upcoming Events & Deadlines</p>
                      <p className="text-xs font-bold">{nextEvent.title}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Registered Students Table */}
        <div className="bg-white/75 dark:bg-zinc-900/60 backdrop-blur-xl rounded-[2rem] p-6 md:p-8 shadow-[-12px_24px_50px_-10px_rgba(255,140,100,0.32),_0_8px_24px_rgba(0,0,0,0.02)] border-t-2 border-t-[#FFBCA0] border-l-2 border-l-[#FFC3A0]/65 border-r border-r-slate-200/40 border-b border-b-slate-200/40 mb-10 z-10 relative">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-slate-800 dark:text-white tracking-tight">Registered Students</h2>
            <button className="w-8 h-8 flex items-center justify-center hover:bg-slate-100/50 dark:hover:bg-zinc-800/50 rounded-full shrink-0 text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-white">
              <MoreHorizontal className="h-5 w-5" />
            </button>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200/50 dark:border-white/10 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                  <th className="pb-3 font-semibold">Student</th>
                  <th className="pb-3 font-semibold">Enrolled Subjects</th>
                  <th className="pb-3 font-semibold">Last Activity</th>
                  <th className="pb-3 font-semibold">Registration Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {loading && (!topStudents || topStudents.length === 0) ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-slate-500 dark:text-zinc-400 font-semibold text-xs">
                      <div className="flex items-center justify-center gap-2">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-[#FF7D46]"></div>
                        <span>Loading registered students...</span>
                      </div>
                    </td>
                  </tr>
                ) : topStudents && topStudents.length > 0 ? (
                  topStudents.map((student) => (
                     <tr 
                      key={student.id} 
                      onClick={() => {
                        setSelectedStudentIdForChat(student.id);
                        setActiveModal('message');
                      }}
                      className="hover:bg-slate-50/30 dark:hover:bg-white/5 transition-colors cursor-pointer"
                    >
                      <td className="py-3.5 flex items-center gap-3 text-slate-800 dark:text-white text-sm">
                        <div className="relative shrink-0">
                          <Avatar className="h-9 w-9">
                            <AvatarImage src={student.avatar} />
                            <AvatarFallback className="bg-gradient-to-br from-blue-400 to-purple-400 text-white">
                              {student.name.split(' ').map((n: string) => n[0]).join('')}
                            </AvatarFallback>
                          </Avatar>
                          <div className={cn(
                            "absolute bottom-0 right-0 w-2.5 h-2.5 border border-white dark:border-zinc-900 rounded-full",
                            (presenceData[student.id] ?? (student.lastActive === 'Active now')) ? "bg-green-500" : "bg-gray-300"
                          )} />
                          {/* Unread Message Badge on Avatar */}
                          {unreadCounts[student.id] > 0 && (
                            <div className="absolute -top-1.5 -right-1.5 bg-emerald-500 text-white text-[9px] font-bold h-4 min-w-4 px-1 rounded-full flex items-center justify-center border border-white dark:border-zinc-900 shadow-sm animate-pulse z-10">
                              {unreadCounts[student.id]}
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="font-bold truncate">{student.name}</span>
                          {lastMessages[student.id] && (
                            <span className={cn(
                              "text-xs truncate max-w-[200px] mt-0.5",
                              (!lastMessages[student.id].is_read && lastMessages[student.id].sender_id !== user?.id)
                                ? "text-slate-900 dark:text-white font-bold"
                                : "text-gray-400 font-normal"
                            )}>
                              {lastMessages[student.id].sender_id === user?.id ? "You: " : ""}
                              {lastMessages[student.id].attachment_type === 'image' ? '📷 Image' :
                               lastMessages[student.id].attachment_type === 'audio' ? '🎤 Voice note' :
                               lastMessages[student.id].message}
                            </span>
                          )}
                        </div>
                        {lastMessages[student.id] && !lastMessages[student.id].is_read && lastMessages[student.id].sender_id !== user?.id && (
                          <div className="w-2.5 h-2.5 bg-purple-500 rounded-full shrink-0 ml-auto mr-2 shadow-sm animate-pulse" />
                        )}
                      </td>
                      <td className="py-3.5 text-slate-700 dark:text-slate-200 text-xs font-bold">
                        {student.learningSubjects && student.learningSubjects.length > 0
                          ? student.learningSubjects[0] + ' Subjects'
                          : 'English Subjects'}
                      </td>
                      <td className="py-3.5 text-slate-600 dark:text-slate-355 text-xs font-medium">
                        {(presenceData[student.id] ?? (student.lastActive === 'Active now')) ? 'Active now' : 'Offline'}
                      </td>
                      <td className="py-3.5">
                        <span className={`inline-block px-3 py-1 text-[10px] font-bold rounded-full ${
                          student.sessionsCompleted > 5
                            ? 'bg-slate-150 text-slate-600 dark:bg-white/10 dark:text-slate-350'
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-250 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-transparent'
                        }`}>
                          {student.sessionsCompleted > 5 ? 'Graduated' : 'Active'}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-slate-500 dark:text-zinc-400 font-semibold text-xs">
                      No registered students found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      <div className="md:hidden">
        <BottomNav />
      </div>

      <StudentProfileModal
        student={selectedStudent}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onMessage={(studentId) => {
          setSelectedStudentIdForChat(studentId);
          setActiveModal('message');
        }}
      />

      <MessageTeacherModal
        isOpen={activeModal === 'message'}
        onClose={() => { setActiveModal(null); setSelectedStudentIdForChat(undefined); fetchLastMessages(); }}
        recipientId={selectedStudentIdForChat}
        onMessagesRead={fetchLastMessages}
      />

      {/* Teacher Quick Action Modals */}
      {/* Rate Student Modal */}
      <RateStudentModal
        isOpen={isRateStudentModalOpen}
        onClose={() => setIsRateStudentModalOpen(false)}
        students={topStudents}
      />

      <StartClassModal
        isOpen={activeModal === 'start-class'}
        onClose={() => setActiveModal(null)}
        session={nextEvent}
      />
      <CreateSessionModal
        isOpen={activeModal === 'create-session'}
        onClose={() => setActiveModal(null)}
      />
      <ReviewSubmissionsModal
        isOpen={activeModal === 'review-submissions'}
        onClose={() => setActiveModal(null)}
      />
      <StudentOverviewModal
        isOpen={activeModal === 'student-overview'}
        onClose={() => setActiveModal(null)}
      />
      <QuickAnnouncementModal
        isOpen={activeModal === 'announcement'}
        onClose={() => setActiveModal(null)}
      />
      <UploadMaterialsModal
        isOpen={activeModal === 'upload-materials'}
        onClose={() => setActiveModal(null)}
      />

      <TeacherAICoPilotModal
        isOpen={activeModal === 'ai-copilot'}
        onClose={() => setActiveModal(null)}
        onOpenAction={(modalName) => setActiveModal(modalName)}
      />
      
      <ScanQRModal 
        isOpen={isScanQRModalOpen}
        onClose={() => setIsScanQRModalOpen(false)}
      />


      {/* Legacy Modals (kept from original implementation) */}
      {activeModal === 'students' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-4xl bg-white max-h-[90vh] overflow-hidden">
            <CardHeader className="border-b">
              <CardTitle className="flex items-center justify-between">
                <span className="text-fluid-lg">My Students</span>
                <button
                  onClick={() => setActiveModal(null)}
                  className="text-gray-500 hover:text-gray-700 text-xl"
                >
                  ✕
                </button>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 max-h-[calc(90vh-80px)] overflow-y-auto">
              <div className="p-6 space-y-4">
                {topStudents.slice(0, 8).map((student) => (
                  <div key={student.id} className="bg-gray-50 rounded-lg p-4 hover:bg-gray-100 transition-colors">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-12 w-12">
                          <AvatarImage src={student.avatar} />
                          <AvatarFallback className="bg-gradient-to-br from-blue-400 to-purple-400 text-white">
                            {student.name.split(' ').map(n => n[0]).join('')}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <h3 className="font-bold text-gray-800 text-fluid-base">{student.name}</h3>
                          <p className="text-sm text-gray-600">{student.country} • {student.learningSubjects?.[0] || 'Mathematics'}</p>
                          <p className="text-xs text-gray-500">{student.sessionsCompleted} sessions completed</p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        className="bg-black hover:bg-gray-900 text-white rounded-full"
                        onClick={() => {
                          handleStudentClick(student);
                          setActiveModal(null);
                        }}
                      >
                        View Profile
                      </Button>
                    </div>

                    <div className="bg-white rounded-md p-3 mb-3">
                      <h4 className="font-semibold text-sm text-gray-800 mb-2">Current Assignments</h4>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-700">Mathematics Homework #5</span>
                          <Badge className="bg-yellow-100 text-yellow-700 text-xs">Due Tomorrow</Badge>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-700">Algebra Practice Set</span>
                          <Badge className="bg-green-100 text-green-700 text-xs">Completed</Badge>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white rounded-md p-3">
                      <h4 className="font-semibold text-sm text-gray-800 mb-2">Study Materials</h4>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs"
                          onClick={() => {
                            const input = document.createElement('input');
                            input.type = 'file';
                            input.accept = '.pdf,.doc,.docx,.ppt,.pptx';
                            input.onchange = (e) => {
                              const file = (e.target as HTMLInputElement).files?.[0];
                              if (file) {
                                alert(`📁 "${file.name}" uploaded successfully for ${student.name}!`);
                              }
                            };
                            input.click();
                          }}
                        >
                          <Upload className="w-3 h-3 mr-1" />
                          Upload Material
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs"
                          onClick={() => {
                            alert(`📚 Recent uploads for ${student.name}:\\n• Algebra Formulas.pdf\\n• Geometry Cheat Sheet.docx\\n• Practice Problems Set 3.pdf`);
                          }}
                        >
                          View Materials
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeModal === 'class' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md bg-white">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Start Class</span>
                <button
                  onClick={() => setActiveModal(null)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  ✕
                </button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="text-center">
                <h3 className="text-lg font-bold text-gray-800 mb-2">Choose Your Option</h3>
                <p className="text-sm text-gray-600">Generate class link or QR code for students to join</p>
              </div>

              <div className="space-y-4">
                <Button
                  className="w-full bg-green-600 hover:bg-green-700 text-white py-3 rounded-lg"
                  onClick={() => {
                    alert('🎥 Class Link Generated!\\n\\nLink: https://yadalearn.com/class/abc123\\n\\nStudents can join using this link.');
                    setActiveModal(null);
                  }}
                >
                  <span className="material-symbols-outlined mr-2">videocam</span>
                  Generate Class Link
                </Button>

                <Button
                  variant="outline"
                  className="w-full border-2 border-gray-300 hover:border-gray-400 py-3 rounded-lg"
                  onClick={() => {
                    setActiveModal('show-qr');
                  }}
                >
                  <span className="material-symbols-outlined mr-2">qr_code_2</span>
                  Generate QR Code
                </Button>
              </div>

              <div className="text-xs text-gray-500 text-center">
                Students will join via WebRTC-based video hosting (like Google Meet)
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeModal === 'show-qr' && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <Card className="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-[2rem] border-0 shadow-2xl animate-in zoom-in-95 duration-200">
            <CardHeader className="text-center pt-8">
              <CardTitle className="text-2xl font-bold text-slate-800 dark:text-white">Your QR Code</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-6 pb-8">
              <div className="bg-white p-4 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.12)]">
                <img 
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(window.location.origin + '/link/' + user?.id)}`}
                  alt="Your unique QR Code"
                  className="w-48 h-48 md:w-56 md:h-56 object-contain"
                />
              </div>
              <p className="text-sm text-slate-500 dark:text-zinc-400 text-center px-4 font-medium leading-relaxed">
                Students can scan this personalized QR code to instantly link with you.
              </p>
              <Button 
                onClick={() => setActiveModal(null)}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl py-6 font-bold shadow-lg shadow-indigo-200 dark:shadow-none"
              >
                Close
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {activeModal === 'schedule' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-2xl bg-white">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Schedule Management</span>
                <button
                  onClick={() => setActiveModal(null)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  ✕
                </button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-gray-800 mb-3">Set Availability</h3>
                  <div className="grid grid-cols-7 gap-2 mb-4">
                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
                      <button
                        key={day}
                        className="p-2 text-sm bg-gray-100 hover:bg-blue-100 rounded-lg transition-colors"
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-bold text-gray-800 mb-3">Time Slots</h3>
                  <div className="grid grid-cols-3 gap-2">
                    {['9:00 AM', '2:00 PM', '7:00 PM'].map((time) => (
                      <button
                        key={time}
                        className="p-3 text-sm bg-green-100 hover:bg-green-200 rounded-lg transition-colors"
                      >
                        {time}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button
                    className="flex-1 bg-black hover:bg-gray-900 text-white"
                    onClick={() => {
                      alert('✅ Availability updated successfully!');
                      setActiveModal(null);
                    }}
                  >
                    Save Schedule
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setActiveModal(null)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeModal === 'earnings' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-2xl bg-white">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Earnings Summary</span>
                <button
                  onClick={() => setActiveModal(null)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  ✕
                </button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-4 bg-green-50 rounded-lg">
                    <p className="text-sm text-gray-600">This Month</p>
                    <p className="text-2xl font-bold text-green-600">$2,450</p>
                  </div>
                  <div className="text-center p-4 bg-blue-50 rounded-lg">
                    <p className="text-sm text-gray-600">Total Earnings</p>
                    <p className="text-2xl font-bold text-blue-600">$15,750</p>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-bold text-gray-800 mb-3">Recent Transactions</h3>
                  <div className="space-y-3">
                    {[
                      { student: 'John Smith', amount: '$50', status: 'Completed', date: 'Today' },
                      { student: 'Sarah Johnson', amount: '$75', status: 'Completed', date: 'Yesterday' },
                      { student: 'Mike Davis', amount: '$60', status: 'Pending', date: '2 days ago' },
                    ].map((transaction, index) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div>
                          <p className="font-medium text-gray-800">{transaction.student}</p>
                          <p className="text-sm text-gray-600">{transaction.date}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-gray-800">{transaction.amount}</p>
                          <Badge className={
                            transaction.status === 'Completed'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-yellow-100 text-yellow-700'
                          }>
                            {transaction.status}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => {
                      alert('💳 Payout requested successfully!');
                      setActiveModal(null);
                    }}
                  >
                    Request Payout
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setActiveModal(null)}
                  >
                    Close
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default TeacherDashboard;
