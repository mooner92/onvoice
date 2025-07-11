-- Fix transcript access policy for ended sessions
-- This allows audience to view transcripts for sessions they participated in or saved

-- Add new policy for users who have saved sessions
CREATE POLICY "Users can view transcripts for saved sessions" ON transcripts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_sessions 
      WHERE user_sessions.session_id = transcripts.session_id 
      AND user_sessions.user_id = auth.uid()
    )
  );

-- Add new policy for public summary pages (anyone can view transcripts for ended sessions)
CREATE POLICY "Anyone can view transcripts for ended sessions on summary pages" ON transcripts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM sessions 
      WHERE sessions.id = transcripts.session_id 
      AND sessions.status = 'ended'
    )
  );

-- Update sessions policy to allow viewing ended sessions for summary pages
DROP POLICY IF EXISTS "Anyone can view ended sessions" ON sessions;
CREATE POLICY "Anyone can view ended sessions" ON sessions
  FOR SELECT USING (status = 'ended'); 