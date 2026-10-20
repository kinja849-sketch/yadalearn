-- =============================================
-- SUPABASE SCHEMA: AI CONVERSATION & MEMORY PERSISTENCE
-- =============================================

-- Table to store persistent conversation memory and student context
CREATE TABLE IF NOT EXISTS ai_conversation_memory (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  session_id TEXT NOT NULL,
  role TEXT CHECK (role IN ('user', 'assistant', 'system')) NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Table to store user-approved long-term notes & preferences
CREATE TABLE IF NOT EXISTS ai_student_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  note TEXT NOT NULL,
  category TEXT DEFAULT 'general',
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Indexes for low-latency retrieval
CREATE INDEX IF NOT EXISTS idx_ai_conversation_memory_user_session 
  ON ai_conversation_memory(user_id, session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_student_notes_user 
  ON ai_student_notes(user_id, created_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE ai_conversation_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_student_notes ENABLE ROW LEVEL SECURITY;

-- Drop old policies if existing
DROP POLICY IF EXISTS "Users can view own conversation memory" ON ai_conversation_memory;
DROP POLICY IF EXISTS "Users can insert own conversation memory" ON ai_conversation_memory;
DROP POLICY IF EXISTS "Users can view own student notes" ON ai_student_notes;
DROP POLICY IF EXISTS "Users can manage own student notes" ON ai_student_notes;

-- RLS Policies strictly enforcing user isolation: auth.uid() = user_id
CREATE POLICY "Users can view own conversation memory" 
  ON ai_conversation_memory FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own conversation memory" 
  ON ai_conversation_memory FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own student notes" 
  ON ai_student_notes FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own student notes" 
  ON ai_student_notes FOR ALL 
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
