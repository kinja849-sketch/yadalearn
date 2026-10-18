import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

export default function RateTeacher() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [teacherName, setTeacherName] = useState<string>('Your Teacher');

  useEffect(() => {
    async function resolveTeacher() {
      if (!id) return;
      try {
        // 1. Check if id directly matches a teacher profile
        const { data: prof } = await supabase
          .from('profiles')
          .select('id, full_name, role')
          .eq('id', id)
          .maybeSingle();

        if (prof && prof.role === 'teacher') {
          setTeacherId(prof.id);
          if (prof.full_name) setTeacherName(prof.full_name);
          return;
        }

        // 2. Check if id is a live_classes record (by id or room_id)
        const { data: lc } = await supabase
          .from('live_classes')
          .select('teacher_id, teacher:profiles!live_classes_teacher_id_fkey(full_name)')
          .or(`id.eq.${id},room_id.eq.${id}`)
          .maybeSingle();

        if (lc && lc.teacher_id) {
          setTeacherId(lc.teacher_id);
          if ((lc.teacher as any)?.full_name) setTeacherName((lc.teacher as any).full_name);
          return;
        }

        // 3. Check if id is a booking
        const { data: booking } = await supabase
          .from('bookings')
          .select('teacher_id, teacher:profiles!bookings_teacher_id_fkey(full_name)')
          .eq('id', id)
          .maybeSingle();

        if (booking && booking.teacher_id) {
          setTeacherId(booking.teacher_id);
          if ((booking.teacher as any)?.full_name) setTeacherName((booking.teacher as any).full_name);
          return;
        }

        // 4. If room_id style containing teacher UUID (e.g. class-teacherId-timestamp)
        const uuidMatch = id.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
        if (uuidMatch) {
          const potentialTeacherId = uuidMatch[0];
          const { data: teacherProf } = await supabase
            .from('profiles')
            .select('id, full_name, role')
            .eq('id', potentialTeacherId)
            .maybeSingle();

          if (teacherProf && teacherProf.role === 'teacher') {
            setTeacherId(teacherProf.id);
            if (teacherProf.full_name) setTeacherName(teacherProf.full_name);
            return;
          }
        }

        // 5. Fallback: Find teacher from current student's links or bookings
        if (user?.id) {
          const { data: link } = await supabase
            .from('teacher_student_links')
            .select('teacher_id, teacher:profiles!teacher_student_links_teacher_id_fkey(full_name)')
            .eq('student_id', user.id)
            .eq('status', 'accepted')
            .limit(1)
            .maybeSingle();

          if (link && link.teacher_id) {
            setTeacherId(link.teacher_id);
            if ((link.teacher as any)?.full_name) setTeacherName((link.teacher as any).full_name);
            return;
          }
        }
      } catch (err) {
        console.error('Error resolving teacher for rating:', err);
      }
    }
    resolveTeacher();
  }, [id, user?.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating === 0) {
      alert("Please select a rating.");
      return;
    }
    
    setIsSubmitting(true);
    try {
      const currentUserId = user?.id || localStorage.getItem('yadalearn-user-id');
      const targetTeacherId = teacherId;

      if (currentUserId && targetTeacherId) {
        // Insert into session_ratings
        const isUuidClass = id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
        const ratingPayload: any = {
          rater_id: currentUserId,
          rated_id: targetTeacherId,
          rating: rating,
          feedback: comment || null,
          rated_as: 'teacher'
        };
        if (isUuidClass) {
          ratingPayload.class_id = id;
        }

        const { error: ratingErr } = await supabase
          .from('session_ratings')
          .insert(ratingPayload);

        if (ratingErr) {
          console.error('session_ratings insert error:', ratingErr);
          throw ratingErr;
        }

        // Mark only the specific completed session as completed with the submitted rating
        if (id) {
          if (isUuidClass) {
            await supabase
              .from('bookings')
              .update({ status: 'completed', rating: rating })
              .eq('id', id);

            await supabase
              .from('live_classes')
              .update({ status: 'completed' })
              .eq('id', id);
          } else {
            await supabase
              .from('live_classes')
              .update({ status: 'completed' })
              .eq('room_id', id);

            // Find the specific booking for this student and teacher
            const todayStr = new Date().toISOString().split('T')[0];
            let targetBookingId: string | null = null;

            // 1. First search for today's booking that has no rating yet
            const { data: todayUnrated } = await supabase
              .from('bookings')
              .select('id')
              .eq('student_id', currentUserId)
              .eq('teacher_id', targetTeacherId)
              .eq('date', todayStr)
              .is('rating', null)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();

            if (todayUnrated?.id) {
              targetBookingId = todayUnrated.id;
            } else {
              // 2. Fallback to any recent unrated booking for this student and teacher
              const { data: recentUnrated } = await supabase
                .from('bookings')
                .select('id')
                .eq('student_id', currentUserId)
                .eq('teacher_id', targetTeacherId)
                .is('rating', null)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

              if (recentUnrated?.id) {
                targetBookingId = recentUnrated.id;
              }
            }

            if (targetBookingId) {
              await supabase
                .from('bookings')
                .update({ status: 'completed', rating: rating })
                .eq('id', targetBookingId);
            }
          }
        }

        // Recalculate average rating for target teacher
        const { data: allRatings } = await supabase
          .from('session_ratings')
          .select('rating')
          .eq('rated_id', targetTeacherId)
          .eq('rated_as', 'teacher');

        let newAverage = rating;
        if (allRatings && allRatings.length > 0) {
          const sum = allRatings.reduce((acc: number, curr: any) => acc + (curr.rating || 0), 0);
          newAverage = Math.round((sum / allRatings.length) * 10) / 10;
        }

        // Update teacher_profiles
        await supabase
          .from('teacher_profiles')
          .update({ rating: newAverage })
          .eq('id', targetTeacherId);

        // Broadcast real-time update event so teacher's dashboard receives immediate sync
        const channel = supabase.channel(`teacher-ratings-${targetTeacherId}`);
        await channel.subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            channel.send({
              type: 'broadcast',
              event: 'rating_updated',
              payload: { teacherId: targetTeacherId, rating: newAverage }
            });
            setTimeout(() => supabase.removeChannel(channel), 1000);
          }
        });
      }
    } catch (err: any) {
      console.error('Error submitting rating:', err);
      alert("Failed to submit rating: " + (err.message || err));
      return;
    } finally {
      setIsSubmitting(false);
    }
    alert("Thank you for your feedback!");
    navigate('/student-dashboard');
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-950 flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full bg-white dark:bg-zinc-900 rounded-3xl p-8 shadow-xl border border-gray-100 dark:border-zinc-800">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-orange-100 dark:bg-orange-500/20 text-orange-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="material-symbols-outlined text-3xl">star</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Rate Your Session</h1>
          <p className="text-gray-500 dark:text-zinc-400">How was your class? Your feedback helps us improve.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="flex justify-center gap-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onMouseEnter={() => setHoverRating(star)}
                onMouseLeave={() => setHoverRating(0)}
                onClick={() => setRating(star)}
                className="transition-transform hover:scale-110 active:scale-95 focus:outline-none"
              >
                <span className={`material-symbols-outlined text-4xl ${
                  (hoverRating || rating) >= star 
                    ? 'text-yellow-400 filled' 
                    : 'text-gray-300 dark:text-zinc-700'
                }`} style={{ fontVariationSettings: (hoverRating || rating) >= star ? "'FILL' 1" : "'FILL' 0" }}>
                  star
                </span>
              </button>
            ))}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-2">
              Additional Comments (Optional)
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="What did you enjoy? What could be better?"
              rows={4}
              className="w-full bg-gray-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 resize-none transition-all"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3.5 rounded-xl transition-colors disabled:opacity-50"
          >
            {isSubmitting ? 'Submitting...' : 'Submit Feedback'}
          </button>
          
          <button
            type="button"
            onClick={() => navigate('/student-dashboard')}
            className="w-full bg-transparent hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-500 dark:text-zinc-400 font-bold py-3.5 rounded-xl transition-colors"
          >
            Skip
          </button>
        </form>
      </div>
    </div>
  );
}
