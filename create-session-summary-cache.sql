-- Create session_summary_cache table for efficient summary translation caching
CREATE TABLE IF NOT EXISTS session_summary_cache (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  language_code VARCHAR(10) NOT NULL,
  summary_text TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure one summary per session per language
  UNIQUE(session_id, language_code)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_session_summary_cache_session_lang 
ON session_summary_cache(session_id, language_code);

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