-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create user_profiles table
CREATE TABLE user_profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  avatar_url TEXT,
  subscription_status TEXT DEFAULT 'free' CHECK (subscription_status IN ('free', 'premium')),
  subscription_expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create sessions table
CREATE TABLE sessions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  host_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  host_name TEXT NOT NULL,
  primary_language TEXT NOT NULL,
  category TEXT DEFAULT 'general' CHECK (category IN ('general', 'sports', 'economics', 'technology', 'education', 'business', 'medical', 'legal', 'entertainment', 'science')),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  summary TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ended_at TIMESTAMP WITH TIME ZONE,
  qr_code_url TEXT,
  session_url TEXT
);

-- Create session_participants table
CREATE TABLE session_participants (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  user_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('speaker', 'audience')),
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  left_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(session_id, user_id)
);

-- Create transcripts table
CREATE TABLE transcripts (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE NOT NULL,
  timestamp TEXT NOT NULL,
  original_text TEXT NOT NULL,
  translated_text TEXT,
  target_language TEXT,
  speaker_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_final BOOLEAN DEFAULT false
);

-- Create user_sessions table (for saved sessions)
CREATE TABLE user_sessions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('speaker', 'audience')),
  saved_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE,
  is_premium BOOLEAN DEFAULT FALSE,
  UNIQUE(user_id, session_id)
);

-- Create indexes for better performance
CREATE INDEX idx_sessions_host_id ON sessions(host_id);
CREATE INDEX idx_sessions_status ON sessions(status);
CREATE INDEX idx_sessions_category ON sessions(category);
CREATE INDEX idx_session_participants_session_id ON session_participants(session_id);
CREATE INDEX idx_session_participants_user_id ON session_participants(user_id);
CREATE INDEX idx_transcripts_session_id ON transcripts(session_id);
CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_session_id ON user_sessions(session_id);
CREATE INDEX idx_transcripts_final ON transcripts(session_id, is_final) WHERE is_final = true;

-- Create RLS (Row Level Security) policies
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;

-- User profiles policies
CREATE POLICY "Users can view their own profile" ON user_profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON user_profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile" ON user_profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Sessions policies
CREATE POLICY "Anyone can view active sessions" ON sessions
  FOR SELECT USING (status = 'active');

CREATE POLICY "Users can view sessions they hosted" ON sessions
  FOR SELECT USING (auth.uid() = host_id);

CREATE POLICY "Users can create sessions" ON sessions
  FOR INSERT WITH CHECK (auth.uid() = host_id);

CREATE POLICY "Hosts can update their sessions" ON sessions
  FOR UPDATE USING (auth.uid() = host_id);

-- Session participants policies
CREATE POLICY "Anyone can view session participants" ON session_participants
  FOR SELECT USING (true);

CREATE POLICY "Users can join sessions" ON session_participants
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own participation" ON session_participants
  FOR UPDATE USING (auth.uid() = user_id);

-- Transcripts policies
CREATE POLICY "Anyone can view transcripts for active sessions" ON transcripts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM sessions 
      WHERE sessions.id = transcripts.session_id 
      AND sessions.status = 'active'
    )
  );

CREATE POLICY "Hosts can view transcripts for their sessions" ON transcripts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM sessions 
      WHERE sessions.id = transcripts.session_id 
      AND sessions.host_id = auth.uid()
    )
  );

CREATE POLICY "Hosts can insert transcripts for their sessions" ON transcripts
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM sessions 
      WHERE sessions.id = transcripts.session_id 
      AND sessions.host_id = auth.uid()
    )
  );

-- User sessions policies
CREATE POLICY "Users can view their saved sessions" ON user_sessions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can save sessions" ON user_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their saved sessions" ON user_sessions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their saved sessions" ON user_sessions
  FOR DELETE USING (auth.uid() = user_id);

-- Create function to handle new user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_profiles (id, email, name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Create function to update user profile when auth user is updated
CREATE OR REPLACE FUNCTION handle_user_update()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE user_profiles
  SET 
    email = NEW.email,
    name = COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    avatar_url = NEW.raw_user_meta_data->>'avatar_url',
    updated_at = NOW()
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for user updates
CREATE TRIGGER on_auth_user_updated
  AFTER UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_user_update(); 




  -- 번역 캐시 테이블
CREATE TABLE translation_cache (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  content_hash TEXT UNIQUE,        -- 원문의 해시값
  original_text TEXT,
  target_language TEXT,
  translated_text TEXT,
  translation_engine TEXT,         -- 'gpt', 'google', 'local'
  quality_score FLOAT,            -- 번역 품질 점수
  usage_count INTEGER DEFAULT 0,  -- 사용 횟수
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP            -- 캐시 만료시간
);

-- 번역 캐시 인덱스 추가
CREATE INDEX idx_translation_cache_hash ON translation_cache(content_hash);
CREATE INDEX idx_translation_cache_lang ON translation_cache(target_language);
CREATE INDEX idx_translation_cache_expires ON translation_cache(expires_at);

-- 트랜스크립트에 번역 참조 추가
ALTER TABLE transcripts ADD COLUMN translation_cache_ids JSONB;
-- { "ko": "uuid1", "ja": "uuid2", "zh": "uuid3" }



-- 번역 상태 추적을 위한 컬럼 추가
ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS translation_status TEXT DEFAULT 'pending' CHECK (translation_status IN ('pending', 'processing', 'completed'));

-- 번역 상태별 인덱스 추가 (성능 최적화)
CREATE INDEX IF NOT EXISTS idx_transcripts_translation_status ON transcripts(session_id, translation_status, created_at);

-- 완료된 번역만 조회하는 인덱스
CREATE INDEX IF NOT EXISTS idx_transcripts_completed ON transcripts(session_id, created_at) WHERE translation_status = 'completed';


-- 📡 Realtime 활성화
--ALTER PUBLICATION supabase_realtime ADD TABLE transcripts;
ALTER PUBLICATION supabase_realtime ADD TABLE translation_cache;

-- 활성화 확인
SELECT schemaname, tablename 
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime';

-- Fix session access policy for public summary pages
-- Run this in Supabase SQL Editor

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Anyone can view active sessions" ON sessions;
DROP POLICY IF EXISTS "Users can view sessions they hosted" ON sessions;

-- Create new policies that allow public access to ended sessions
CREATE POLICY "Anyone can view ended sessions" ON sessions
  FOR SELECT USING (status = 'ended');

CREATE POLICY "Anyone can view active sessions" ON sessions
  FOR SELECT USING (status = 'active');

CREATE POLICY "Users can view sessions they hosted" ON sessions
  FOR SELECT USING (auth.uid() = host_id);

-- Verify the policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies 
WHERE tablename = 'sessions';