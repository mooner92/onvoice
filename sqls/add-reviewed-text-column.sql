-- Add reviewed_text column to transcripts table
-- This column will store the Gemini-reviewed and corrected text

ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS reviewed_text TEXT;
ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS detected_language TEXT;
ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS review_status TEXT DEFAULT 'pending' CHECK (review_status IN ('pending', 'processing', 'completed', 'failed'));

-- Add index for better performance
CREATE INDEX IF NOT EXISTS idx_transcripts_review_status ON transcripts(session_id, review_status, created_at);

-- Update existing records to have default review_status
UPDATE transcripts SET review_status = 'pending' WHERE review_status IS NULL; 