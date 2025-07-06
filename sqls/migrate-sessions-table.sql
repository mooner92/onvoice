-- Migrate sessions table to add category and summary columns
-- Run this on your Supabase database

-- Add category column with constraint
ALTER TABLE sessions 
ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general';

-- Add constraint for category values
ALTER TABLE sessions 
ADD CONSTRAINT sessions_category_check 
CHECK (category IN ('general', 'sports', 'economics', 'technology', 'education', 'business', 'medical', 'legal', 'entertainment', 'science'));

-- Add summary column
ALTER TABLE sessions 
ADD COLUMN IF NOT EXISTS summary TEXT;

-- Add index for better performance
CREATE INDEX IF NOT EXISTS idx_sessions_category ON sessions(category);

-- Update existing sessions to have default category
UPDATE sessions 
SET category = 'general' 
WHERE category IS NULL;

-- Optional: Add session_mode column for future Gemini Live integration
ALTER TABLE sessions 
ADD COLUMN IF NOT EXISTS session_mode TEXT DEFAULT 'whisper' 
CHECK (session_mode IN ('whisper', 'gemini-live', 'hybrid'));

-- Add index for session_mode
CREATE INDEX IF NOT EXISTS idx_sessions_mode ON sessions(session_mode);

-- Verify the changes
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'sessions' 
AND column_name IN ('category', 'summary', 'session_mode'); 