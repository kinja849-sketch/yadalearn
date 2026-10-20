import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Home, Search, Calendar, User, Settings, LogOut, Menu } from 'lucide-react';
import { BottomNav } from '@/components/BottomNav';
import { TeacherProfileModal } from '@/components/ProfileModals';
import type { Teacher } from '@/types/schema';
import { JoinClassModal } from '@/features/student/quick-actions/JoinClassModal';
import { BookClassModal } from '@/features/student/quick-actions/BookClassModal';
import { AIStudyBuddyModal } from '@/features/student/quick-actions/AIStudyBuddyModal';
import { AssignmentsModal } from '@/features/student/quick-actions/AssignmentsModal';
import { MessageTeacherModal } from '@/features/student/quick-actions/MessageTeacherModal';
import { useDashboardData } from '@/hooks/useDashboardData';
import { supabase } from '@/lib/supabase';
import { ScanQRModal } from '@/components/ScanQRModal';

import { useAuth } from '@/contexts/AuthContext';
import { removeImageBackground } from '@/utils/imageProcessor';
import { fetchGeoLocation } from '@/utils/geo';
import { checkAndAutoCancelExpiredSessions, parseDateTimeHelper } from '@/utils/sessionManager';


interface StudentDashboardProps {
  viewAsStudentId?: string;
  onBackToParent?: () => void;
}

const StudentDashboard = ({ viewAsStudentId, onBackToParent }: StudentDashboardProps = {}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, refreshUser, logout } = useAuth();
  const currentStudentId = viewAsStudentId || user?.id || (() => {
    try {
      const cached = localStorage.getItem('yadalearn-user');
      return cached ? JSON.parse(cached).id : undefined;
    } catch {
      return undefined;
    }
  })();
  const [selectedTeacher, setSelectedTeacher] = useState<Teacher | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [isScanQRModalOpen, setIsScanQRModalOpen] = useState(false);
  const [selectedTeacherIdForChat, setSelectedTeacherIdForChat] = useState<string | undefined>(undefined);
  const [selectedTeacherIdForBooking, setSelectedTeacherIdForBooking] = useState<string | undefined>(undefined);
  const [presenceData, setPresenceData] = useState<Record<string, boolean>>({});
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const { topTeachers, upcomingClasses, unratedClasses, loading } = useDashboardData(viewAsStudentId);
  const [liveClassInfo, setLiveClassInfo] = useState<{ room_id: string; teacher_id: string } | null>(null);
  const [allBookings, setAllBookings] = useState<any[]>([]);
  const [completedCount, setCompletedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  const fetchBookings = useCallback(async () => {
    if (!currentStudentId) return;

    // Fetch bookings and submitted teacher ratings in parallel
    const [bookingsRes, ratingsRes] = await Promise.all([
      supabase
        .from('bookings')
        .select(`
          id,
          subject,
          date,
          time,
          status,
          rating,
          teacher_id,
          created_at,
          teacher:profiles!bookings_teacher_id_fkey(id, full_name, avatar_url)
        `)
        .eq('student_id', currentStudentId)
        .order('created_at', { ascending: false }),
      supabase
        .from('session_ratings')
        .select('id, class_id, rated_id, rating, created_at')
        .eq('rater_id', currentStudentId)
        .eq('rated_as', 'teacher')
        .order('created_at', { ascending: false })
    ]);

    const bookingsData = bookingsRes.data;
    const ratingsData = ratingsRes.data || [];
    
    if (bookingsData) {
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
        } catch (e) {
          return new Date(0);
        }
      };

      setAllBookings(bookingsData);
      
      // Derive active session for instant Join Class button activation (strictly within 1 hour window)
      const activeBooking = bookingsData.find((b: any) => {
        if (b.status !== 'confirmed' && b.status !== 'active') return false;
        if (b.rating != null) return false;
        const bTime = parseBookingDateTime(b.date, b.time).getTime();
        return bTime > 0 && now.getTime() <= bTime + (60 * 60 * 1000);
      });

      if (activeBooking) {
        const tId = activeBooking.teacher?.id || activeBooking.teacher_id;
        if (tId) {
          setLiveClassInfo({
            room_id: `class-${tId}-${activeBooking.date}`,
            teacher_id: tId
          });
        }
      } else {
        // If booking expired past 1 hour, clear live class info so link is nullified
        setLiveClassInfo(null);
      }
      
      const validBookings = bookingsData.filter((b: any) => b.status !== 'cancelled' && b.status !== 'rejected');
      const completed = validBookings.filter((b: any) => {
        const bookingTime = parseBookingDateTime(b.date, b.time);
        return (b.status === 'completed' || b.status === 'attended') && bookingTime <= now;
      }).length;

      setCompletedCount(completed);
      setTotalCount(validBookings.length);
    }
  }, [currentStudentId]);

  useEffect(() => {
    // Check for any currently active or scheduled live class created by a teacher
    const fetchLiveClass = async () => {
      // Auto-cancel any session or booking where start time is older than 1 hour in background (non-blocking)
      checkAndAutoCancelExpiredSessions({ studentId: currentStudentId }).catch(() => {});

      const now = Date.now();
      const ONE_HOUR_MS = 60 * 60 * 1000;

      // 1. Query live_classes table for active, live, or scheduled sessions
      try {
        const { data } = await supabase
          .from('live_classes')
          .select('id, room_id, teacher_id, status, scheduled_at, created_at')
          .in('status', ['live', 'active', 'scheduled'])
          .order('created_at', { ascending: false });

        if (data && data.length > 0) {
          // Filter strictly for sessions within the 1-hour window that have an active room link
          const validClasses = data.filter((c: any) => {
            if (!c.room_id) return false;
            const schedTime = new Date(c.scheduled_at || c.created_at).getTime();
            return schedTime > 0 && now <= schedTime + ONE_HOUR_MS;
          });

          if (validClasses.length > 0) {
            const active = validClasses.find((c: any) => c.status === 'live' || c.status === 'active');
            const session = active || validClasses[0];
            setLiveClassInfo({ room_id: session.room_id, teacher_id: session.teacher_id });
            return;
          }
        }
      } catch (err) {
        console.warn("live_classes query error (checking fallbacks):", err);
      }

      if (currentStudentId) {
        // 2. Check student's recent chat messages containing meeting links for active sessions (within 1 hour)
        try {
          const { data: messages } = await supabase
            .from('chat_messages')
            .select('message, sender_id, created_at')
            .eq('receiver_id', currentStudentId)
            .order('created_at', { ascending: false })
            .limit(20);

          if (messages && messages.length > 0) {
            const sessionMsg = messages.find((m: any) => {
              if (!m.message || !m.message.includes('/meeting/')) return false;
              const msgTime = new Date(m.created_at).getTime();
              return msgTime > 0 && now <= msgTime + ONE_HOUR_MS;
            });

            if (sessionMsg) {
              const match = sessionMsg.message.match(/\/meeting\/([a-zA-Z0-9_-]+)/);
              if (match && match[1]) {
                const roomId = match[1];
                setLiveClassInfo({ room_id: roomId, teacher_id: sessionMsg.sender_id });
                return;
              }
            }
          }
        } catch (msgErr) {
          console.warn("chat_messages lookup error:", msgErr);
        }

        // 3. Check for any active or confirmed session booking within 1 hour
        try {
          const { data: recentBookings } = await supabase
            .from('bookings')
            .select('id, teacher_id, date, time, status, rating, created_at')
            .eq('student_id', currentStudentId)
            .in('status', ['confirmed', 'active'])
            .order('created_at', { ascending: false });

          if (recentBookings && recentBookings.length > 0) {
            const validBooking = recentBookings.find((b: any) => {
              if (b.rating != null) return false;
              const bTime = parseDateTimeHelper(b.date, b.time).getTime();
              return bTime > 0 && now <= bTime + ONE_HOUR_MS;
            });

            if (validBooking) {
              const roomId = `class-${validBooking.teacher_id}-${validBooking.date}`;
              setLiveClassInfo({ room_id: roomId, teacher_id: validBooking.teacher_id });
              return;
            }
          }
        } catch (bookingErr) {
          console.warn("bookings lookup error:", bookingErr);
        }
      }

      // If no valid active session within 1 hour, nullify liveClassInfo
      setLiveClassInfo(null);
    };

    fetchLiveClass();

    // Listen for new classes starting, scheduled, or ending
    const liveClassChannel = supabase
      .channel('live-classes-student')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'live_classes'
      }, (payload) => {
        if (payload.new && (payload.new.status === 'live' || payload.new.status === 'active' || payload.new.status === 'scheduled')) {
          setLiveClassInfo({ room_id: payload.new.room_id, teacher_id: payload.new.teacher_id });
        } else if (payload.new && (payload.new.status === 'ended' || payload.new.status === 'completed' || payload.new.status === 'cancelled')) {
          fetchLiveClass();
        }
      })
      .subscribe();

    // Listen for real-time broadcast session_created event from teacher (targeted channel)
    const broadcastChannel = currentStudentId ? supabase
      .channel(`student-live-session-${currentStudentId}`)
      .on('broadcast', { event: 'session_created' }, (payload) => {
        if (payload.payload?.roomId) {
          setLiveClassInfo({ room_id: payload.payload.roomId, teacher_id: payload.payload.teacherId });
          fetchBookings();
        }
      })
      .subscribe() : null;

    // Listen for global real-time session_created broadcast
    const globalSessionChannel = supabase
      .channel('yadalearn-live-sessions')
      .on('broadcast', { event: 'session_created' }, (payload) => {
        if (payload.payload?.roomId && (!payload.payload?.studentId || payload.payload.studentId === currentStudentId)) {
          setLiveClassInfo({ room_id: payload.payload.roomId, teacher_id: payload.payload.teacherId });
          fetchBookings();
        }
      })
      .subscribe();

    // Listen for real-time chat messages with meeting links
    const sessionMsgChannel = currentStudentId ? supabase
      .channel(`student-session-msgs-${currentStudentId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
        filter: `receiver_id=eq.${currentStudentId}`
      }, (payload) => {
        if (payload.new?.message && payload.new.message.includes('/meeting/')) {
          const match = payload.new.message.match(/\/meeting\/([a-zA-Z0-9_-]+)/);
          if (match && match[1]) {
            setLiveClassInfo({ room_id: match[1], teacher_id: payload.new.sender_id });
            fetchBookings();
          }
        }
      })
      .subscribe() : null;

    // Listen for real-time bookings creation/updates for this student
    const bookingsChannel = currentStudentId ? supabase
      .channel(`student-bookings-${currentStudentId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'bookings',
        filter: `student_id=eq.${currentStudentId}`
      }, () => {
        fetchLiveClass();
        fetchBookings();
      })
      .subscribe() : null;

    return () => {
      supabase.removeChannel(liveClassChannel);
      if (broadcastChannel) supabase.removeChannel(broadcastChannel);
      supabase.removeChannel(globalSessionChannel);
      if (sessionMsgChannel) supabase.removeChannel(sessionMsgChannel);
      if (bookingsChannel) supabase.removeChannel(bookingsChannel);
    };
  }, [currentStudentId, fetchBookings]);

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
      .channel('presence-channel-student')
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
      .select('*')
      .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
      .order('created_at', { ascending: true });

    if (data) {
      const filtered = data.filter((m: any) => !deletedSet.has(m.id));
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

      // Check for active/scheduled session meeting link from teacher
      for (let i = filtered.length - 1; i >= 0; i--) {
        const m = filtered[i];
        if (m.sender_id !== user.id && m.message && m.message.includes('/meeting/')) {
          const match = m.message.match(/\/meeting\/([a-zA-Z0-9_-]+)/);
          if (match && match[1]) {
            const roomId = match[1];
            supabase
              .from('live_classes')
              .select('status')
              .eq('room_id', roomId)
              .maybeSingle()
              .then(({ data: lc }) => {
                if (!lc || (lc.status !== 'completed' && lc.status !== 'cancelled')) {
                  setLiveClassInfo({ room_id: roomId, teacher_id: m.sender_id });
                }
              });
            break;
          }
        }
      }
    }
  };

  useEffect(() => {
    if (!user?.id) return;

    fetchLastMessages();

    // Subscribe to real-time chat message changes for instant session activation
    const channel = supabase
      .channel('dashboard-last-messages-student')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'chat_messages'
      }, (payload: any) => {
        if (payload?.new?.message && payload.new.message.includes('/meeting/')) {
          const match = payload.new.message.match(/\/meeting\/([a-zA-Z0-9_-]+)/);
          if (match && match[1]) {
            setLiveClassInfo({ room_id: match[1], teacher_id: payload.new.sender_id });
          }
        }
        fetchLastMessages();
      })
      .subscribe();

    // Listen for class completion to cleanly deactivate
    const endChannel = supabase
      .channel('dashboard-class-end-listener')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'live_classes'
      }, (payload: any) => {
        if (payload?.new && (payload.new.status === 'completed' || payload.new.status === 'cancelled')) {
          setLiveClassInfo(prev => prev && prev.room_id === payload.new.room_id ? null : prev);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(endChannel);
    };
  }, [user?.id]);

  const [weeklyProgress, setWeeklyProgress] = useState<number | null>(null);
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
          const { data: profile, error } = await supabase
            .from('profiles')
            .select('country')
            .eq('id', viewAsStudentId || user.id)
            .single();
             
          if (profile && (!profile.country || profile.country.trim() !== geo.countryName)) {
            await supabase
              .from('profiles')
              .update({ country: geo.countryName })
              .eq('id', viewAsStudentId || user.id);
            
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


  const [selectedDateStr, setSelectedDateStr] = useState<string>(() => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  });

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

  const getNextUpcomingEvent = (schedule: any[]) => {
    if (!schedule || schedule.length === 0) return null;
    const now = new Date();
    
    const upcoming = schedule.filter((event: any) => {
      const start = parseDateTime(event.date, event.time);
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      return end > now;
    });

    return upcoming.length > 0 ? upcoming[0] : null;
  };

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

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  useEffect(() => {
    async function fetchWeeklyRating() {
      const studentId = viewAsStudentId || user?.id;
      if (!studentId) return;

      const now = new Date();
      const isSaturday = now.getDay() === 6; // 6 = Saturday

      if (!isSaturday) {
        setWeeklyProgress(0);
        return;
      }

      // If Saturday, query rating submitted by teacher for this student today
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const { data: weeklyRatings } = await supabase
        .from('session_ratings')
        .select('rating, created_at')
        .eq('rated_id', studentId)
        .eq('rated_as', 'student')
        .gte('created_at', startOfToday)
        .order('created_at', { ascending: false })
        .limit(1);

      if (weeklyRatings && weeklyRatings.length > 0) {
        const weeklyPct = Math.round((weeklyRatings[0].rating / 5.0) * 100);
        setWeeklyProgress(weeklyPct);
      } else {
        setWeeklyProgress(0);
      }
    }
    fetchWeeklyRating();
  }, [viewAsStudentId, user?.id]);

  const studentSchedule = allBookings.map((b: any) => ({
    id: b.id,
    date: b.date,
    time: b.time,
    title: `${b.subject} with ${b.teacher?.full_name || 'Teacher'}`,
    status: b.status,
    rating: b.rating,
    teacherId: b.teacher?.id,
    teacherName: b.teacher?.full_name || 'Teacher',
    teacherAvatar: b.teacher?.avatar_url
  }));

  const nextEvent = getNextUpcomingEvent(studentSchedule);
  const progressPercent = weeklyProgress ?? 0;

  const activeLiveClass = useMemo(() => {
    if (liveClassInfo) return liveClassInfo;

    const now = Date.now();
    const ONE_HOUR_MS = 60 * 60 * 1000;

    // 1. Check allBookings for latest confirmed/active unrated session (strictly within 1 hour)
    const activeBooking = allBookings.find((b: any) => {
      if (b.status !== 'confirmed' && b.status !== 'active') return false;
      if (b.rating != null) return false;
      const bTime = parseDateTime(b.date, b.time).getTime();
      return bTime > 0 && now <= bTime + ONE_HOUR_MS;
    });

    if (activeBooking) {
      const tId = activeBooking.teacher?.id || activeBooking.teacher_id;
      if (tId) {
        return {
          room_id: `class-${tId}-${activeBooking.date}`,
          teacher_id: tId,
          title: activeBooking.subject
        };
      }
    }

    // 2. Check nextEvent if it is upcoming or active confirmed and unrated (strictly within 1 hour)
    if (nextEvent && (nextEvent.status === 'confirmed' || nextEvent.status === 'active') && nextEvent.rating == null) {
      const nTime = parseDateTime(nextEvent.date, nextEvent.time).getTime();
      if (nTime > 0 && now <= nTime + ONE_HOUR_MS) {
        const tId = nextEvent.teacherId || nextEvent.teacher?.id;
        if (tId) {
          return {
            room_id: `class-${tId}-${nextEvent.date}`,
            teacher_id: tId,
            title: nextEvent.title
          };
        }
      }
    }

    return null;
  }, [liveClassInfo, allBookings, nextEvent]);


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

  const [uploading, setUploading] = useState(false);
  const [localImage, setLocalImage] = useState<string | null>(null);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const savedUser = localStorage.getItem('yadalearn-user');
    const parsedUser = savedUser ? JSON.parse(savedUser) : null;
    const userId = viewAsStudentId || user?.id || parsedUser?.id;

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
          // Immediately update local UI state so the change is instant without a refresh
          setLocalImage(processedImage);
          
          // Update cached user locally to prevent reload flickering and empty placeholder
          const savedUser = JSON.parse(localStorage.getItem('yadalearn-user') || '{}');
          savedUser.imageUrl = processedImage;
          localStorage.setItem('yadalearn-user', JSON.stringify(savedUser));
          
          // Refresh user context state dynamically without reloading the page!
          if (refreshUser) {
            await refreshUser();
          }
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

  const [isRatingModalOpen, setIsRatingModalOpen] = useState(false);
  const [selectedBookingToRate, setSelectedBookingToRate] = useState<any | null>(null);
  const [ratingValue, setRatingValue] = useState<number>(0);
  const [ratingHoverValue, setRatingHoverValue] = useState<number>(0);
  const [isSubmittingRating, setIsSubmittingRating] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleImageClick = () => {
    fileInputRef.current?.click();
  };

  const userId = user?.id;
  const userName = user?.name || user?.firstName || 'Student';

  // Dynamic Join CTA based on authentic calendar bookings starting soon (within 30 minutes)
  const now = new Date();
  const nextClass = upcomingClasses.length > 0 ? upcomingClasses[0] : null;
  
  let showJoinCTA = false;
  let timeRemainingStr = "";
  if (nextClass && nextClass.day) {
    try {
      const classTime = new Date(nextClass.day);
      const diffMs = classTime.getTime() - now.getTime();
      const diffMins = Math.round(diffMs / 60000);
      
      if (diffMins >= -10 && diffMins <= 15) {
        showJoinCTA = true;
        timeRemainingStr = diffMins > 0 ? `Starts in ${diffMins} mins` : "Active Now";
      }
    } catch (e) {
      console.error("Error parsing class time:", e);
    }
  }


  const handleTeacherClick = (teacher: Teacher) => {
    setSelectedTeacher(teacher);
    setIsModalOpen(true);
  };



  return (
    <div className="flex min-h-screen bg-[#FCFAF5] dark:bg-zinc-950 font-sans text-[#1C1B19] dark:text-slate-200 w-full relative overflow-x-hidden">
      {/* Sidebar Navigation */}
      <aside className={`hidden flex-col justify-between w-64 bg-white/40 dark:bg-zinc-900/30 backdrop-blur-md border-r border-slate-200/20 dark:border-zinc-850/20 p-8 shrink-0 relative z-25 ${!isSidebarCollapsed ? 'md:flex' : 'md:hidden'}`}>
        <div className="flex flex-col gap-8">
          <div className="flex items-center justify-between">
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

          <nav className="flex flex-col gap-2">
            {[
              { label: 'Home', path: '/student-dashboard', icon: Home },
              { label: 'Search', path: '/student-search', icon: Search },
              { label: 'Calendar', path: '/student-calendar', icon: Calendar },
              { label: 'Profile', path: '/settings', icon: User }
            ].map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <button
                  key={item.label}
                  onClick={() => {
                    navigate(item.path);
                  }}
                  className={cn(
                    "flex items-center gap-3.5 px-4 py-3 rounded-2xl font-bold transition-all text-left w-full",
                    isActive
                      ? "bg-[#5B4A9F]/10 text-[#5B4A9F] dark:text-purple-400 border border-[#5B4A9F]/15 font-bold"
                      : "text-slate-600 dark:text-slate-400 hover:bg-white/40 dark:hover:bg-zinc-800/30 font-semibold"
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="flex flex-col gap-4">
          <button
            onClick={() => { navigate('/settings'); }}
            className="flex items-center gap-3.5 px-4 py-3 text-slate-600 dark:text-slate-400 hover:bg-white/40 dark:hover:bg-zinc-800/30 rounded-2xl font-semibold transition-all text-left w-full"
          >
            <Settings className="h-5 w-5" />
            <span>Settings</span>
          </button>
          <button
            onClick={() => {
              logout();
            }}
            className="flex items-center gap-3.5 px-4 py-3 text-slate-600 dark:text-[#F43F5E] hover:bg-white/40 dark:hover:bg-zinc-800/30 rounded-2xl font-semibold transition-all text-left w-full"
          >
            <Avatar className="h-6 w-6">
              <AvatarImage src={localImage || user?.imageUrl} />
              <AvatarFallback className="bg-purple-600 text-white text-[10px] font-bold">
                {userName ? userName.split(' ').map((n: string) => n[0]).join('') : 'S'}
              </AvatarFallback>
            </Avatar>
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="relative flex-1 overflow-y-auto px-4 md:px-10 py-10 pb-28 lg:pb-10 w-full bg-transparent overflow-x-hidden">
        {/* Soft floating background blobs for glassmorphism refraction */}
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-[#5B4A9F]/10 dark:bg-purple-900/10 blur-[120px] rounded-full pointer-events-none z-0" />
        <div className="absolute bottom-[20%] right-[-10%] w-[60%] h-[60%] bg-rose-200/10 dark:bg-rose-900/10 blur-[150px] rounded-full pointer-events-none z-0" />

        {/* Header (Desktop matching layout) */}
        <header className="relative flex justify-between items-center mb-8 z-10">
          <div className="flex items-center gap-4">
            {isSidebarCollapsed && !viewAsStudentId && (
              <button 
                onClick={() => setIsSidebarCollapsed(false)} 
                className="hidden md:flex p-2.5 rounded-xl bg-white/60 dark:bg-zinc-800/60 backdrop-blur-md border border-slate-200/40 dark:border-zinc-700/40 text-slate-700 dark:text-zinc-200 shadow-sm hover:scale-105 active:scale-95 transition-all"
              >
                <Menu className="h-6 w-6" />
              </button>
            )}
            {viewAsStudentId && onBackToParent && (
              <button 
                onClick={onBackToParent}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:hover:bg-emerald-800/40 text-emerald-700 dark:text-emerald-300 rounded-xl font-bold transition-all shadow-sm"
              >
                <span className="material-symbols-outlined text-lg">arrow_back</span>
                <span>Back to Parent Dashboard</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-4 cursor-pointer" onClick={() => navigate('/settings')}>
            <div className="relative">
              <div className="relative w-12 h-12 rounded-full border border-white/30 bg-white/10 dark:bg-zinc-950/15 backdrop-blur-md shadow-sm overflow-hidden flex items-center justify-center select-none">
                {user?.imageUrl ? (
                  <>
                    <img
                      src={localImage || user?.imageUrl}
                      alt={userName}
                      className="w-full h-full object-cover object-center pointer-events-none"
                    />
                    {/* Frosted glass highlight overlay */}
                    <div className="absolute inset-0 border border-white/25 rounded-full bg-gradient-to-tr from-white/10 via-transparent to-white/5 pointer-events-none" />
                  </>
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-white/15 dark:bg-zinc-900/10 rounded-full">
                    <span className="material-symbols-outlined text-xl text-slate-500">person</span>
                  </div>
                )}
              </div>
              {Object.values(lastMessages).some((msg: any) => !msg.is_read && msg.sender_id !== user?.id) && (
                <div className="absolute top-0 right-0 w-3.5 h-3.5 bg-red-500 border-2 border-white dark:border-zinc-900 rounded-full animate-pulse z-20" />
              )}
            </div>
          </div>
        </header>

        {/* Hero Section (No Card Wrapper - matching Teacher Dashboard) */}
        <div className="relative flex flex-col md:flex-row items-center md:items-start justify-start gap-12 mt-4 md:mt-0 mb-4 pt-4 w-full z-10">
          {/* Portrait Image Area (Interactive / Uploadable) */}
          <div className="relative shrink-0 md:-mb-[55px] z-30 group">
            {/* Soft, organic localized lavender glow behind the portrait (circular aura, no clipping) */}
            <div className="absolute top-[45%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-[480px] h-[480px] md:w-[640px] md:h-[640px] bg-[radial-gradient(circle,rgba(143,129,214,0.85)_0%,rgba(175,160,250,0.45)_50%,transparent_75%)] blur-[60px] pointer-events-none z-0" />
            
            {user?.imageUrl ? (
              <div className="relative">
                <div 
                  className="w-64 h-80 md:w-72 md:h-96 rounded-[2rem] border border-white/40 bg-white/20 dark:bg-zinc-900/30 backdrop-blur-xl shadow-2xl shadow-slate-300/40 dark:shadow-black/40 flex items-center justify-center relative cursor-pointer overflow-hidden z-10 transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl hover:shadow-slate-400/50 dark:hover:shadow-black/60" 
                  onClick={handleImageClick}
                >
                  <img
                    src={localImage || user?.imageUrl}
                    alt={userName}
                    className="w-full h-full object-cover select-none transition-transform duration-300 group-hover:scale-[1.01]"
                  />
                  
                  {/* Dark overlay mask that dims the image on hover to signal editability */}
                  <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none rounded-[2rem] z-16" />

                  {/* Frosted glass highlight overlay over the portrait (removed backdrop-blur to prevent obscuring subject) */}
                  <div className="absolute inset-0 border border-white/30 dark:border-white/20 bg-gradient-to-br from-white/20 via-white/5 to-transparent pointer-events-none rounded-[2rem] z-15" />
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
                  className="w-64 h-80 md:w-72 md:h-96 rounded-[2rem] border border-white/40 bg-white/20 dark:bg-zinc-900/30 backdrop-blur-xl shadow-[0_20px_50px_rgba(91,74,159,0.15)] flex flex-col items-center justify-center gap-3 cursor-pointer hover:scale-[1.02] transition-all group z-10"
                >
                  <div className="w-12 h-12 rounded-full bg-purple-50 dark:bg-purple-950/20 flex items-center justify-center text-[#8F81D6] group-hover:scale-115 transition-transform duration-200 shadow-sm border border-purple-100/50 dark:border-zinc-800">
                    <span className="material-symbols-outlined text-2xl">upload</span>
                  </div>
                  <div className="text-center px-4">
                    <p className="text-xs font-bold text-slate-655 dark:text-zinc-300">Upload Portrait</p>
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
            
            <input 
              type="file" 
              ref={fileInputRef}
              accept="image/*" 
              className="hidden" 
              onChange={handleImageUpload} 
            />
          </div>

          {/* Student Welcome Details (Matching Teacher Dashboard Layout) */}
          <div className="flex-1 flex flex-col lg:flex-row items-center lg:items-start justify-between gap-8 pt-6 w-full text-center md:text-left">
            <div className="flex-1 text-center md:text-left">
              <h1 className="text-3xl md:text-4xl font-extrabold text-slate-800 dark:text-white tracking-tight mb-1 font-serif">
                {userName}
              </h1>
              <p className="text-lg font-bold text-slate-850 dark:text-slate-100">Welcome Back,</p>
              
              {/* Profile Stats List */}
              <div className="flex flex-col gap-2.5 max-w-xs mx-auto md:mx-0 mt-6">
                <div className="flex items-center gap-1.5 text-sm">
                  <span className="text-slate-600 dark:text-slate-350 font-semibold">Active Classes:</span>
                  <span className="font-extrabold text-slate-850 dark:text-slate-100">{upcomingClasses?.length || 0}</span>
                </div>
                <div className="flex items-center gap-1.5 text-sm">
                  <span className="text-slate-600 dark:text-slate-355 font-semibold">Status:</span>
                  <span className="font-extrabold text-emerald-600 dark:text-emerald-400">Active Student</span>
                </div>
              </div>
            </div>

            {/* Student Progress Widget */}
            <div className="shrink-0 flex flex-col items-center justify-center p-5 bg-white/45 dark:bg-zinc-900/30 backdrop-blur-md border border-white/20 rounded-[2.5rem] shadow-sm z-20 hover:scale-[1.02] transition-transform">
              {/* Circular Liquid Progress Animation */}
              <div className="relative w-44 h-44 rounded-full border border-purple-500/35 overflow-hidden flex items-center justify-center bg-purple-50/10 dark:bg-zinc-950/20 shadow-[0_8px_32px_0_rgba(91,74,159,0.15)] shrink-0">
                {/* Liquid Wave 1 */}
                <div 
                  className="absolute bg-gradient-to-t from-[#5B4A9F]/60 to-[#8F81D6]/60 w-[200%] h-[200%] rounded-[38%] opacity-85"
                  style={{
                    left: '50%',
                    bottom: `${progressPercent - 200}%`,
                    animation: 'wave-rotation-1 12s infinite linear'
                  }}
                />
                
                {/* Liquid Wave 2 */}
                <div 
                  className="absolute bg-gradient-to-t from-[#5B4A9F]/40 to-[#8F81D6]/40 w-[195%] h-[195%] rounded-[40%] opacity-65"
                  style={{
                    left: '50%',
                    bottom: `${progressPercent - 195}%`,
                    animation: 'wave-rotation-2 9s infinite linear'
                  }}
                />

                {/* Percentage Center Value */}
                <div className="relative z-10 flex flex-col items-center justify-center select-none text-center">
                  <span className="text-4xl font-black text-slate-800 dark:text-white drop-shadow-sm leading-none">
                    {progressPercent}%
                  </span>
                  <span className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-wider mt-1.5">Completed</span>
                </div>
              </div>
              
              <p className="text-[10px] font-extrabold text-slate-650 dark:text-zinc-405 mt-3 tracking-wide text-center uppercase">
                Course Progress
              </p>
            </div>
          </div>
        </div>

        {/* Action Grid & Planning */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 mb-10 z-20 relative">
          {/* Quick Actions Panel */}
          <div className="lg:col-span-3 bg-white/75 dark:bg-zinc-900/60 backdrop-blur-xl rounded-[2rem] p-6 md:p-8 shadow-[-12px_24px_50px_-10px_rgba(91,74,159,0.15),_0_8px_24px_rgba(0,0,0,0.02)] border-t-2 border-t-[#E0DAF5] border-l-2 border-l-[#E9E4F9]/65 border-r border-r-slate-200/40 border-b border-b-slate-200/40 z-10 relative">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-slate-800 dark:text-white tracking-tight">Quick Actions</h2>
              <button className="w-8 h-8 flex items-center justify-center hover:bg-slate-100/50 dark:hover:bg-zinc-800/50 rounded-full shrink-0 text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-white">
                <span className="material-symbols-outlined">more_horiz</span>
              </button>
            </div>
            
            <div className="grid grid-cols-3 gap-4">
              <div
                onClick={() => setActiveModal('book-class')}
                className="bg-white/50 hover:bg-white/70 dark:bg-zinc-800/30 dark:hover:bg-zinc-800/50 p-5 rounded-[1.5rem] border border-white/60 dark:border-zinc-700/20 shadow-sm flex flex-col items-center justify-center gap-2 cursor-pointer hover:scale-[1.02] active:scale-95 transition-all text-center h-28"
              >
                <div className="w-10 h-10 rounded-full bg-[#5B4A9F]/10 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[#8F81D6] dark:text-purple-400 text-xl">event</span>
                </div>
                <p className="text-xs font-bold text-slate-750 dark:text-zinc-200">Book Class</p>
              </div>

              <div
                onClick={() => setActiveModal('assignments')}
                className="bg-white/50 hover:bg-white/70 dark:bg-zinc-800/30 dark:hover:bg-zinc-800/50 p-5 rounded-[1.5rem] border border-white/60 dark:border-zinc-700/20 shadow-sm flex flex-col items-center justify-center gap-2 cursor-pointer hover:scale-[1.02] active:scale-95 transition-all text-center h-28"
              >
                <div className="w-10 h-10 rounded-full bg-[#5B4A9F]/10 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[#8F81D6] dark:text-purple-400 text-xl">assignment</span>
                </div>
                <p className="text-xs font-bold text-slate-750 dark:text-zinc-200">Assignments</p>
              </div>

              <div
                onClick={() => setActiveModal('message')}
                className="bg-white/50 hover:bg-white/70 dark:bg-zinc-800/30 dark:hover:bg-zinc-800/50 p-5 rounded-[1.5rem] border border-white/60 dark:border-zinc-700/20 shadow-sm flex flex-col items-center justify-center gap-2 cursor-pointer hover:scale-[1.02] active:scale-95 transition-all text-center h-28"
              >
                <div className="w-10 h-10 rounded-full bg-[#5B4A9F]/10 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[#8F81D6] dark:text-purple-400 text-xl">mail</span>
                </div>
                <p className="text-xs font-bold text-slate-750 dark:text-zinc-200">Messages</p>
              </div>

              <div
                onClick={() => activeLiveClass ? navigate(`/meeting/${activeLiveClass.room_id}`) : null}
                className={cn(
                  "p-5 rounded-[1.5rem] border shadow-sm flex flex-col items-center justify-center gap-2 text-center h-28 transition-all relative",
                  activeLiveClass
                    ? "bg-gradient-to-br from-[#5B4A9F]/10 via-purple-50/80 to-[#8F81D6]/15 dark:from-purple-950/40 dark:to-indigo-950/40 border-[#8F81D6]/80 dark:border-purple-400/80 shadow-md ring-2 ring-[#5B4A9F]/20 cursor-pointer hover:scale-[1.03] active:scale-95 animate-in fade-in"
                    : "bg-gray-100/30 dark:bg-zinc-900/20 border-gray-200/40 dark:border-zinc-800/20 opacity-50 cursor-not-allowed pointer-events-none grayscale"
                )}
              >
                {activeLiveClass && (
                  <span className="absolute top-2.5 right-2.5 flex h-2.5 w-2.5" title="Class in progress">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                  </span>
                )}
                <div className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center transition-all",
                  activeLiveClass
                    ? "bg-gradient-to-tr from-[#5B4A9F] to-[#8F81D6] text-white shadow-md shadow-purple-500/25 animate-pulse"
                    : "bg-[#5B4A9F]/10"
                )}>
                  <span className={cn(
                    "material-symbols-outlined text-xl transition-all",
                    activeLiveClass ? "text-white scale-110" : "text-[#8F81D6] dark:text-purple-400"
                  )}>
                    videocam
                  </span>
                </div>
                <p className={cn(
                  "text-xs font-bold transition-all",
                  activeLiveClass ? "text-[#5B4A9F] dark:text-purple-300 font-extrabold" : "text-slate-750 dark:text-zinc-200"
                )}>
                  Join Class
                </p>
              </div>

              <div
                onClick={() => setActiveModal('ai-buddy')}
                className="bg-white/50 hover:bg-white/70 dark:bg-zinc-800/30 dark:hover:bg-zinc-800/50 p-5 rounded-[1.5rem] border border-white/60 dark:border-zinc-700/20 shadow-sm flex flex-col items-center justify-center gap-2 cursor-pointer hover:scale-[1.02] active:scale-95 transition-all text-center h-28"
              >
                <div className="w-10 h-10 rounded-full bg-[#5B4A9F]/10 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[#8F81D6] dark:text-purple-400 text-xl">psychology</span>
                </div>
                <p className="text-xs font-bold text-slate-750 dark:text-zinc-200">AI Buddy</p>
              </div>


            </div>
          </div>

          {/* Right Column: Calendar */}
          <div className="lg:col-span-2 flex flex-col gap-8 z-10 relative">
            {/* Calendar & Planning Panel */}
            <div className="flex-1 bg-white/75 dark:bg-zinc-900/60 backdrop-blur-xl rounded-[2rem] p-6 md:p-8 border-t-2 border-t-[#E0DAF5] border-l-2 border-l-[#E9E4F9]/65 border-r border-r-slate-200/40 border-b border-b-slate-200/40 flex flex-col relative">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-slate-800 dark:text-white tracking-tight">Calendar & Planning</h2>
                <button className="w-8 h-8 flex items-center justify-center hover:bg-slate-100/50 dark:hover:bg-zinc-800/50 rounded-full shrink-0 text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-white">
                  <span className="material-symbols-outlined">more_horiz</span>
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
                      const hasPlans = studentSchedule.some((s: any) => s.date === d.dateStr);
                      return (
                        <div 
                          key={idx} 
                          onClick={() => setSelectedDateStr(d.dateStr)}
                          className="relative flex items-center justify-center h-7 w-7 mx-auto cursor-pointer transition-all hover:bg-slate-100/50 dark:hover:bg-zinc-800/50 rounded-full"
                        >
                          <span className={
                            isSelected
                              ? "bg-[#5B4A9F] text-white dark:bg-white dark:text-slate-950 font-bold text-xs rounded-full w-6 h-6 flex items-center justify-center shadow-sm"
                              : d.isToday
                                ? "border border-[#5B4A9F] text-[#5B4A9F] dark:border-white dark:text-white font-bold text-xs rounded-full w-6 h-6 flex items-center justify-center shadow-sm"
                                : d.isCurrentMonth
                                  ? "text-slate-750 dark:text-zinc-100 font-semibold text-xs"
                                  : "text-slate-350 dark:text-zinc-650 font-medium text-[10px]"
                          }>
                            {d.date}
                          </span>
                          {hasPlans && (
                            <span className={`absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full ${isSelected ? 'bg-purple-300' : 'bg-[#5B4A9F]'}`} />
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
                      const filtered = studentSchedule.filter((session: any) => session.date === selectedDateStr);
                      const now = new Date();
                      
                      if (filtered.length > 0) {
                        return filtered.map((session: any) => {
                          const sessionTime = parseDateTime(session.date, session.time);
                          const hasPassed = sessionTime < now;
                          const isNext = nextEvent && session.id === nextEvent.id;
                          
                          if (session.status === 'cancelled') {
                            return (
                              <div key={session.id} className="flex items-center gap-3 p-2.5 bg-red-50/50 dark:bg-red-900/10 border-l-4 border-red-300 rounded-r-xl border border-y-red-100/50 border-r-red-100/50 dark:border-y-transparent dark:border-r-transparent opacity-60">
                                <span className="font-bold text-[10px] text-red-400 dark:text-red-500 whitespace-nowrap line-through">{session.time}</span>
                                <span className="text-xs font-semibold text-red-500 dark:text-red-400 truncate line-through flex-1">{session.title}</span>
                                <span className="material-symbols-outlined text-xs text-red-400 shrink-0">cancel</span>
                              </div>
                            );
                          }
                          
                          if (hasPassed || session.status === 'completed') {
                            return (
                              <div key={session.id} className="flex items-center justify-between gap-3 p-2.5 bg-slate-50/50 dark:bg-zinc-800/10 border-l-4 border-slate-300 rounded-r-xl border border-y-slate-100/50 border-r-slate-100/50 dark:border-y-transparent dark:border-r-transparent opacity-90">
                                <span className="font-bold text-[10px] text-slate-400 dark:text-zinc-500 whitespace-nowrap line-through">{session.time}</span>
                                <span className="text-xs font-semibold text-slate-555 dark:text-zinc-400 truncate flex-1">{session.title}</span>
                                {session.rating ? (
                                  <span className="text-[11px] font-extrabold text-amber-500 flex items-center gap-0.5 shrink-0" title="Teacher rated">
                                    ⭐ Rated {session.rating}
                                  </span>
                                ) : (
                                  <button
                                    onClick={() => {
                                      setSelectedBookingToRate(session);
                                      setRatingValue(0);
                                      setIsRatingModalOpen(true);
                                    }}
                                    className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-[10px] rounded-lg transition-all shadow-xs cursor-pointer shrink-0"
                                  >
                                    Rate Teacher
                                  </button>
                                )}
                              </div>
                            );
                          }
                          
                          if (isNext) {
                            return (
                              <div key={session.id} className="flex items-center gap-3 p-2.5 bg-purple-50/80 dark:bg-purple-950/20 border-l-4 border-[#5B4A9F] rounded-r-xl border border-y-purple-150 dark:border-y-transparent ring-2 ring-[#5B4A9F]/20 ring-offset-1 dark:ring-offset-zinc-900 shadow-sm transition-all hover:scale-[1.01]">
                                <span className="font-bold text-[10px] text-[#5B4A9F] dark:text-purple-400 whitespace-nowrap">{session.time}</span>
                                <span className="text-xs font-bold text-slate-850 dark:text-white truncate flex-1">{session.title}</span>
                                <span className="bg-[#5B4A9F] text-white text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded-full tracking-wider animate-pulse shrink-0">Next Up</span>
                              </div>
                            );
                          }
                          
                          return (
                            <div key={session.id} className="flex items-center gap-3 p-2.5 bg-indigo-50/60 dark:bg-indigo-950/10 border-l-4 border-indigo-500 rounded-r-xl border border-y-indigo-100/30 dark:border-y-transparent">
                              <span className="font-bold text-[10px] text-indigo-650 dark:text-indigo-400 whitespace-nowrap">{session.time}</span>
                              <span className="text-xs font-semibold text-slate-700 dark:text-zinc-200 truncate flex-1">{session.title}</span>
                            </div>
                          );
                        });
                      } else {
                        return (
                          <div className="flex flex-col items-center justify-center p-6 text-center bg-gray-50/50 dark:bg-zinc-800/10 rounded-2xl border border-dashed border-gray-200 dark:border-zinc-700">
                            <span className="material-symbols-outlined text-gray-400 dark:text-zinc-650 text-2xl mb-1">event_busy</span>
                            <p className="text-[11px] font-semibold text-gray-550 dark:text-zinc-400">No scheduled classes</p>
                          </div>
                        );
                      }
                    })()}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Live Class Alert Banner */}
        {activeLiveClass && (
          <div className="mx-4 md:mx-6 mt-6 p-4 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-xl shadow-purple-500/20 flex flex-col sm:flex-row items-center justify-between gap-4 animate-in slide-in-from-top-4">
            <div className="flex items-center gap-3">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
              </span>
              <div>
                <h3 className="font-bold text-lg">A teacher has started a live session!</h3>
                <p className="text-purple-100 text-sm">Join now to participate in the real-time class.</p>
              </div>
            </div>
            <button 
              onClick={() => navigate(`/meeting/${activeLiveClass.room_id}`)}
              className="w-full sm:w-auto px-6 py-2 bg-white text-purple-700 font-bold rounded-xl shadow-md hover:scale-105 active:scale-95 transition-all"
            >
              Join Class
            </button>
          </div>
        )}

        {/* My Teachers Section */}
        <div className="bg-white/75 dark:bg-zinc-900/60 backdrop-blur-xl rounded-[2rem] p-6 md:p-8 shadow-[-12px_24px_50px_-10px_rgba(91,74,159,0.15),_0_8px_24px_rgba(0,0,0,0.02)] border-t-2 border-t-[#E0DAF5] border-l-2 border-l-[#E9E4F9]/65 border-r border-r-slate-200/40 border-b border-b-slate-200/40 mb-10 z-10 relative">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-slate-800 dark:text-white tracking-tight">My Teachers</h2>
            <button className="w-8 h-8 flex items-center justify-center hover:bg-slate-100/50 dark:hover:bg-zinc-800/50 rounded-full shrink-0 text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-white">
              <span className="material-symbols-outlined">more_horiz</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 dark:border-white/5 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-zinc-500">
                  <th className="pb-3 font-semibold">Teacher</th>
                  <th className="pb-3 font-semibold">Enrolled Subjects</th>
                  <th className="pb-3 font-semibold">Rating</th>
                  <th className="pb-3 font-semibold">Registration Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                 {loading && (!topTeachers || topTeachers.length === 0) ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-slate-500 dark:text-zinc-400 font-semibold text-xs">
                      <div className="flex items-center justify-center gap-2">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-650"></div>
                        <span>Loading registered teachers...</span>
                      </div>
                    </td>
                  </tr>
                ) : topTeachers && topTeachers.length > 0 ? (
                  topTeachers.map((teacher: any) => (
                    <tr 
                      key={teacher.id} 
                      onClick={() => {
                        setSelectedTeacherIdForChat(teacher.id);
                        setActiveModal('message');
                      }}
                      className="hover:bg-slate-50/30 dark:hover:bg-white/5 transition-colors cursor-pointer"
                    >
                      <td className="py-3.5 flex items-center gap-3 text-slate-800 dark:text-white text-sm">
                        <div className="relative shrink-0">
                          <Avatar className="h-9 w-9">
                            <AvatarImage src={teacher.avatar} />
                            <AvatarFallback className="bg-gradient-to-br from-purple-400 to-pink-400 text-white">
                              {teacher.name.split(' ').map((n: string) => n[0]).join('')}
                            </AvatarFallback>
                          </Avatar>
                          <div className={cn(
                            "absolute bottom-0 right-0 w-2.5 h-2.5 border border-white dark:border-zinc-900 rounded-full",
                            (presenceData[teacher.id] ?? teacher.isOnline) ? "bg-green-500" : "bg-gray-300"
                          )} />
                          {/* Unread Message Badge on Avatar */}
                          {unreadCounts[teacher.id] > 0 && (
                            <div className="absolute -top-1.5 -right-1.5 bg-emerald-500 text-white text-[9px] font-bold h-4 min-w-4 px-1 rounded-full flex items-center justify-center border border-white dark:border-zinc-900 shadow-sm animate-pulse z-10">
                              {unreadCounts[teacher.id]}
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="font-bold truncate">{teacher.name}</span>
                          {lastMessages[teacher.id] && (
                            <span className={cn(
                              "text-xs truncate max-w-[200px] mt-0.5",
                              (!lastMessages[teacher.id].is_read && lastMessages[teacher.id].sender_id !== user?.id)
                                ? "text-slate-900 dark:text-white font-bold"
                                : "text-gray-400 font-normal"
                            )}>
                              {lastMessages[teacher.id].sender_id === user?.id ? "You: " : ""}
                              {lastMessages[teacher.id].attachment_type === 'image' ? '📷 Image' :
                               lastMessages[teacher.id].attachment_type === 'audio' ? '🎤 Voice note' :
                               lastMessages[teacher.id].message}
                            </span>
                          )}
                        </div>
                        {lastMessages[teacher.id] && !lastMessages[teacher.id].is_read && lastMessages[teacher.id].sender_id !== user?.id && (
                          <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full shrink-0 ml-auto mr-2 shadow-sm animate-pulse" />
                        )}
                      </td>
                      <td className="py-3.5 text-slate-700 dark:text-slate-200 text-xs font-bold">
                        {teacher.subjects && teacher.subjects.length > 0
                          ? teacher.subjects.join(', ')
                          : 'General Subjects'}
                      </td>
                      <td className="py-3.5 text-slate-655 dark:text-slate-355 text-xs font-medium">
                        ⭐ {Number(teacher.rating || 0).toFixed(1)}
                      </td>
                      <td className="py-3.5">
                        <span className="inline-block px-3 py-1 text-[10px] font-bold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-250 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-transparent">
                          Active Contract
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-slate-500 dark:text-zinc-400 font-semibold text-xs">
                      No registered teachers found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {activeModal !== 'ai-buddy' && <BottomNav />}
      <TeacherProfileModal
        teacher={selectedTeacher}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onMessage={(teacherId) => {
          setSelectedTeacherIdForChat(teacherId);
          setActiveModal('message');
        }}
        onBook={(teacherId) => {
          setSelectedTeacherIdForBooking(teacherId);
          setActiveModal('book-class');
        }}
      />

      <JoinClassModal 
        isOpen={activeModal === 'join-class'} 
        onClose={() => setActiveModal(null)} 
        className={nextClass ? nextClass.title : 'Spanish Conversation'} 
        teacherName={nextClass?.teacherName} 
      />
      <BookClassModal 
        isOpen={activeModal === 'book-class'} 
        onClose={() => { setActiveModal(null); setSelectedTeacherIdForBooking(undefined); }} 
        teacherId={selectedTeacherIdForBooking}
      />
      <AIStudyBuddyModal isOpen={activeModal === 'ai-buddy'} onClose={() => setActiveModal(null)} />
      <AssignmentsModal isOpen={activeModal === 'assignments'} onClose={() => setActiveModal(null)} />
      <MessageTeacherModal 
        isOpen={activeModal === 'message'} 
        onClose={() => { setActiveModal(null); setSelectedTeacherIdForChat(undefined); fetchLastMessages(); }} 
        recipientId={selectedTeacherIdForChat}
        onMessagesRead={fetchLastMessages}
      />

      <ScanQRModal 
        isOpen={isScanQRModalOpen}
        onClose={() => setIsScanQRModalOpen(false)}
      />

      {/* Rate Session Modal */}
      {isRatingModalOpen && selectedBookingToRate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 rounded-[2.5rem] p-6 max-w-sm w-full border border-gray-150 dark:border-zinc-800 shadow-2xl relative">
            <button 
              onClick={() => setIsRatingModalOpen(false)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center bg-gray-100 dark:bg-zinc-800 text-gray-500 hover:text-gray-800 dark:hover:text-white"
            >
              <span className="material-symbols-outlined text-lg">close</span>
            </button>
            
            <div className="flex flex-col items-center text-center mt-2">
              <Avatar className="w-16 h-16 border-2 border-indigo-500 shadow-md mb-3">
                <AvatarImage src={selectedBookingToRate.teacherAvatar} />
                <AvatarFallback className="bg-indigo-100 text-indigo-800 font-bold">{selectedBookingToRate.teacherName[0]}</AvatarFallback>
              </Avatar>
              <h3 className="font-extrabold text-lg text-slate-800 dark:text-white">Rate your session</h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1 px-4 leading-relaxed">
                Please rate your <strong>{selectedBookingToRate.title}</strong> class with <strong>{selectedBookingToRate.teacherName}</strong>.
              </p>
              
              {/* Star Rating Selectors */}
              <div className="flex items-center gap-2 my-6">
                {[1, 2, 3, 4, 5].map((star) => {
                  const isHoveredOrSelected = star <= (ratingHoverValue || ratingValue);
                  return (
                    <button
                      key={star}
                      onMouseEnter={() => setRatingHoverValue(star)}
                      onMouseLeave={() => setRatingHoverValue(0)}
                      onClick={() => setRatingValue(star)}
                      className="text-3xl focus:outline-none transition-transform hover:scale-125 cursor-pointer"
                    >
                      <span className={`material-symbols-outlined ${
                        isHoveredOrSelected ? 'text-amber-500 font-bold fill-current' : 'text-slate-350 dark:text-zinc-650'
                      }`} style={{ fontVariationSettings: "'FILL' 1" }}>
                        star
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Submit Button */}
              <Button
                onClick={async () => {
                  if (ratingValue === 0) {
                    alert("Please select a rating before submitting!");
                    return;
                  }
                  setIsSubmittingRating(true);
                  try {
                    const targetTeacherId = selectedBookingToRate.teacherId || selectedBookingToRate.teacher?.id;
                    if (!user?.id || !targetTeacherId) {
                      throw new Error("Missing user or teacher details for rating");
                    }

                    // 1. Insert real row into session_ratings
                    const { error: ratingErr } = await supabase
                      .from('session_ratings')
                      .insert({
                        rater_id: user.id,
                        rated_id: targetTeacherId,
                        rating: ratingValue,
                        rated_as: 'teacher'
                      });

                    if (ratingErr) throw ratingErr;

                    // 2. Also update booking row if applicable
                    if (selectedBookingToRate.id) {
                      await supabase
                        .from('bookings')
                        .update({ rating: ratingValue, status: 'completed' })
                        .eq('id', selectedBookingToRate.id);

                      setAllBookings(prev => prev.map(b => b.id === selectedBookingToRate.id ? { ...b, rating: ratingValue, status: 'completed' } : b));
                    }

                    // 3. Recalculate average rating for teacher and write to teacher_profiles
                    const { data: allRatings } = await supabase
                      .from('session_ratings')
                      .select('rating')
                      .eq('rated_id', targetTeacherId)
                      .eq('rated_as', 'teacher');

                    let newAvg = ratingValue;
                    if (allRatings && allRatings.length > 0) {
                      const sum = allRatings.reduce((acc: number, curr: any) => acc + (curr.rating || 0), 0);
                      newAvg = Math.round((sum / allRatings.length) * 10) / 10;
                    }

                    await supabase
                      .from('teacher_profiles')
                      .update({ rating: newAvg })
                      .eq('id', targetTeacherId);

                    // 4. Real-time broadcast notification
                    const channel = supabase.channel(`teacher-ratings-${targetTeacherId}`);
                    await channel.subscribe((status) => {
                      if (status === 'SUBSCRIBED') {
                        channel.send({
                          type: 'broadcast',
                          event: 'rating_updated',
                          payload: { teacherId: targetTeacherId, rating: newAvg }
                        });
                        setTimeout(() => supabase.removeChannel(channel), 1000);
                      }
                    });

                    alert(`Thank you! Your rating of ${ratingValue} stars has been recorded.`);
                    setIsRatingModalOpen(false);
                    window.location.reload();
                  } catch (e: any) {
                    console.error("Error submitting rating:", e);
                    alert("Failed to submit rating: " + e.message);
                  } finally {
                    setIsSubmittingRating(false);
                  }
                }}
                disabled={isSubmittingRating || ratingValue === 0}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-2xl shadow-lg shadow-indigo-500/25 transition-all disabled:opacity-50 cursor-pointer"
              >
                {isSubmittingRating ? "Submitting..." : "Submit Rating"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentDashboard;
