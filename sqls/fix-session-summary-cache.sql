-- Fix session_summary_cache table structure
-- Run this in Supabase SQL Editor

-- First, clear existing data (if any)
DELETE FROM session_summary_cache;

-- Drop and recreate the table with correct structure
DROP TABLE IF EXISTS session_summary_cache;

-- Create session_summary_cache table with correct structure
CREATE TABLE session_summary_cache (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  language_code VARCHAR(10) NOT NULL,
  summary_text TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure one summary per session per language
  UNIQUE(session_id, language_code)
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_session_summary_cache_session_lang 
ON session_summary_cache(session_id, language_code);

CREATE INDEX IF NOT EXISTS idx_session_summary_cache_session_id 
ON session_summary_cache(session_id);

CREATE INDEX IF NOT EXISTS idx_session_summary_cache_language 
ON session_summary_cache(language_code);

-- Enable RLS (Row Level Security)
ALTER TABLE session_summary_cache ENABLE ROW LEVEL SECURITY;

-- Allow public read access (for public summary pages)
CREATE POLICY "Allow public read access to session summary cache" 
ON session_summary_cache FOR SELECT 
USING (true);

-- Allow authenticated users to insert/update their own session summaries
CREATE POLICY "Allow authenticated users to manage session summary cache" 
ON session_summary_cache FOR ALL 
USING (
  auth.uid() IN (
    SELECT host_id FROM sessions WHERE id = session_id
  )
);

-- Allow service role to manage all session summaries (for API operations)
CREATE POLICY "Allow service role to manage session summary cache" 
ON session_summary_cache FOR ALL 
USING (auth.role() = 'service_role');

-- Add trigger to update updated_at
CREATE OR REPLACE FUNCTION update_session_summary_cache_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_session_summary_cache_updated_at
  BEFORE UPDATE ON session_summary_cache
  FOR EACH ROW
  EXECUTE FUNCTION update_session_summary_cache_updated_at();

-- Verify the table structure
SELECT 
  column_name, 
  data_type, 
  is_nullable, 
  column_default,
  character_maximum_length
FROM information_schema.columns 
WHERE table_name = 'session_summary_cache' 
ORDER BY ordinal_position; 