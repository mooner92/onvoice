-- Update translation_engine constraint to include gemini-live
ALTER TABLE translation_cache DROP CONSTRAINT IF EXISTS translation_cache_translation_engine_check;
ALTER TABLE translation_cache ADD CONSTRAINT translation_cache_translation_engine_check 
CHECK (translation_engine IN ('gpt', 'google', 'local', 'mock', 'gemini-live'));
