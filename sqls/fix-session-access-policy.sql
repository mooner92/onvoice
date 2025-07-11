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