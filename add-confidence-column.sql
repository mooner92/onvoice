-- Add confidence column to existing transcripts table
-- Run this in Supabase SQL Editor

ALTER TABLE transcripts 
ADD COLUMN IF NOT EXISTS confidence FLOAT DEFAULT 0.8;

-- Add translation_status column if it doesn't exist
ALTER TABLE transcripts 
ADD COLUMN IF NOT EXISTS translation_status TEXT DEFAULT 'pending' 
CHECK (translation_status IN ('pending', 'processing', 'completed'));

-- Create index for confidence queries
CREATE INDEX IF NOT EXISTS idx_transcripts_confidence ON transcripts(confidence);

-- Update existing records to have confidence values
UPDATE transcripts 
SET confidence = 0.8 
WHERE confidence IS NULL;

-- Update existing records to have translation_status
UPDATE transcripts 
SET translation_status = 'completed' 
WHERE translation_status IS NULL;

-- Verify the changes
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'transcripts' 
AND column_name IN ('confidence', 'translation_status'); 