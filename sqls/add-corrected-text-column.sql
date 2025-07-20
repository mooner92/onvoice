-- Add corrected_text column to transcripts table
ALTER TABLE transcripts 
ADD COLUMN IF NOT EXISTS corrected_text TEXT;

-- Add index for better performance
CREATE INDEX IF NOT EXISTS idx_transcripts_corrected_text 
ON transcripts(corrected_text);

-- Update existing records to have corrected_text same as original_text
UPDATE transcripts 
SET corrected_text = original_text 
WHERE corrected_text IS NULL; 