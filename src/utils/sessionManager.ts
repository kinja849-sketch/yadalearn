import { supabase } from '@/lib/supabase';

export const parseDateTimeHelper = (dateStr: string, timeStr: string): Date => {
  try {
    if (!dateStr) return new Date(0);
    const parts = dateStr.split('-');
    if (parts.length !== 3) return new Date(0);
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);

    let hours = 0;
    let minutes = 0;
    if (timeStr) {
      const match12 = timeStr.match(/^(\d+):(\d+)\s*(AM|PM)$/i);
      const match24 = timeStr.match(/^(\d+):(\d+)$/);
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
    }
    return new Date(year, month, day, hours, minutes);
  } catch (e) {
    return new Date(0);
  }
};

/**
 * Checks if a session or booking is older than 1 hour past its scheduled start time.
 * If the session did not take place within 1 hour:
 * 1. Automatically marks the class as 'cancelled' in Supabase.
 * 2. Nullifies the room_id link (room_id = null).
 * 3. Automatically marks the booking as 'cancelled' in Supabase.
 */
export const checkAndAutoCancelExpiredSessions = async (options?: {
  studentId?: string;
  teacherId?: string;
}) => {
  const now = Date.now();
  const ONE_HOUR_MS = 60 * 60 * 1000;

  try {
    // 1. Check live_classes table
    let classesQuery = supabase
      .from('live_classes')
      .select('id, room_id, status, scheduled_at, created_at, teacher_id')
      .in('status', ['scheduled', 'active', 'live']);

    if (options?.teacherId) {
      classesQuery = classesQuery.eq('teacher_id', options.teacherId);
    }

    const { data: activeClasses } = await classesQuery;
    if (activeClasses && activeClasses.length > 0) {
      const expiredClassIds: string[] = [];
      for (const cls of activeClasses) {
        const schedTime = new Date(cls.scheduled_at || cls.created_at).getTime();
        // If 1 hour has elapsed past the scheduled time, assume cancelled and nullify link
        if (schedTime > 0 && now > schedTime + ONE_HOUR_MS) {
          expiredClassIds.push(cls.id);
        }
      }
      if (expiredClassIds.length > 0) {
        await supabase
          .from('live_classes')
          .update({ status: 'cancelled', room_id: null })
          .in('id', expiredClassIds);
      }
    }

    // 2. Check bookings table
    let bookingsQuery = supabase
      .from('bookings')
      .select('id, date, time, status, rating, teacher_id, student_id')
      .in('status', ['confirmed', 'active', 'pending']);

    if (options?.studentId) {
      bookingsQuery = bookingsQuery.eq('student_id', options.studentId);
    } else if (options?.teacherId) {
      bookingsQuery = bookingsQuery.eq('teacher_id', options.teacherId);
    }

    const { data: activeBookings } = await bookingsQuery;
    if (activeBookings && activeBookings.length > 0) {
      const expiredBookingIds: string[] = [];
      for (const b of activeBookings) {
        if (b.rating != null) continue; // completed/rated
        const bTime = parseDateTimeHelper(b.date, b.time);
        if (bTime.getTime() > 0 && now > bTime.getTime() + ONE_HOUR_MS) {
          expiredBookingIds.push(b.id);
        }
      }
      if (expiredBookingIds.length > 0) {
        // Use 'rejected' status to comply with PostgreSQL check constraint bookings_status_check
        await supabase
          .from('bookings')
          .update({ status: 'rejected' })
          .in('id', expiredBookingIds);
      }
    }
  } catch (err) {
    console.warn('[SessionManager] Error auto-cancelling expired sessions:', err);
  }
};
