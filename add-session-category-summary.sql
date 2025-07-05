-- Add category and summary columns to sessions table
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general' CHECK (category IN ('general', 'sports', 'economics', 'technology', 'education', 'business', 'medical', 'legal', 'entertainment', 'science'));
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS summary TEXT;

-- Add index for category
CREATE INDEX IF NOT EXISTS idx_sessions_category ON sessions(category);

-- Update existing sessions to have default category
UPDATE sessions SET category = 'general' WHERE category IS NULL; 