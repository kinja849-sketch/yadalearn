-- ==============================================================================
-- YadaLearn Database Performance Indexes
-- Eliminates statement timeout (error 57014) on bookings and chat_messages
-- Run this script in the Supabase Dashboard -> SQL Editor
-- ==============================================================================

-- 1. Bookings indexes
CREATE INDEX IF NOT EXISTS idx_bookings_student_id 
    ON public.bookings (student_id);

CREATE INDEX IF NOT EXISTS idx_bookings_student_created 
    ON public.bookings (student_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bookings_student_status 
    ON public.bookings (student_id, status);

CREATE INDEX IF NOT EXISTS idx_bookings_teacher_id 
    ON public.bookings (teacher_id);

CREATE INDEX IF NOT EXISTS idx_bookings_teacher_created 
    ON public.bookings (teacher_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bookings_teacher_status 
    ON public.bookings (teacher_id, status);

-- 2. Chat messages indexes
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender_id 
    ON public.chat_messages (sender_id);

CREATE INDEX IF NOT EXISTS idx_chat_messages_receiver_id 
    ON public.chat_messages (receiver_id);

CREATE INDEX IF NOT EXISTS idx_chat_messages_sender_created 
    ON public.chat_messages (sender_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_messages_receiver_created 
    ON public.chat_messages (receiver_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_messages_receiver_read 
    ON public.chat_messages (receiver_id, is_read);

CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation 
    ON public.chat_messages (sender_id, receiver_id, created_at ASC);

-- 3. Session ratings indexes
CREATE INDEX IF NOT EXISTS idx_session_ratings_rater 
    ON public.session_ratings (rater_id, rated_as, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_session_ratings_rated 
    ON public.session_ratings (rated_id, created_at DESC);

-- 4. Live classes indexes
CREATE INDEX IF NOT EXISTS idx_live_classes_status_created 
    ON public.live_classes (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_live_classes_room_id 
    ON public.live_classes (room_id);
