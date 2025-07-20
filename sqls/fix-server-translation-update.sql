-- Fix server-side translation_cache_ids update logic
-- Run this in Supabase SQL Editor

-- 1. 트리거 함수 생성 - translation_cache에 새 번역이 추가될 때 자동으로 transcript 업데이트
CREATE OR REPLACE FUNCTION update_transcript_cache_ids()
RETURNS TRIGGER AS $$
BEGIN
  -- 새로운 번역이 추가되면 해당 원문을 가진 transcript의 translation_cache_ids 업데이트
  UPDATE transcripts 
  SET translation_cache_ids = COALESCE(translation_cache_ids, '{}'::jsonb) || 
                             jsonb_build_object(NEW.target_language, NEW.id)
  WHERE original_text = NEW.original_text
    AND translation_status = 'completed';
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. 트리거 생성
DROP TRIGGER IF EXISTS translation_cache_insert_trigger ON translation_cache;
CREATE TRIGGER translation_cache_insert_trigger
  AFTER INSERT ON translation_cache
  FOR EACH ROW
  EXECUTE FUNCTION update_transcript_cache_ids();

-- 3. 기존 데이터 복구 - 모든 완료된 transcript에 대해 translation_cache_ids 재생성
UPDATE transcripts 
SET translation_cache_ids = (
  SELECT jsonb_object_agg(tc.target_language, tc.id)
  FROM translation_cache tc
  WHERE tc.original_text = transcripts.original_text
    AND tc.target_language IN ('ko', 'zh', 'hi', 'en')
)
WHERE translation_status = 'completed'
  AND (translation_cache_ids IS NULL OR translation_cache_ids = '{}'::jsonb);

-- 4. 인덱스 최적화
CREATE INDEX IF NOT EXISTS idx_translation_cache_original_text ON translation_cache(original_text);
CREATE INDEX IF NOT EXISTS idx_translation_cache_target_lang ON translation_cache(target_language);
CREATE INDEX IF NOT EXISTS idx_transcripts_original_text ON transcripts(original_text);

-- 5. 성능 최적화를 위한 뷰 생성
CREATE OR REPLACE VIEW transcript_with_translations AS
SELECT 
  t.id,
  t.session_id,
  t.original_text,
  t.translation_cache_ids,
  t.translation_status,
  t.created_at,
  jsonb_object_agg(tc.target_language, tc.translated_text) as translations
FROM transcripts t
LEFT JOIN translation_cache tc ON tc.original_text = t.original_text
WHERE t.translation_status = 'completed'
GROUP BY t.id, t.session_id, t.original_text, t.translation_cache_ids, t.translation_status, t.created_at;

-- 6. 확인 쿼리
SELECT 
  id,
  original_text,
  translation_cache_ids,
  translations
FROM transcript_with_translations 
WHERE session_id = '9bd03158-bca0-4d11-ba02-592754b53bb4'
ORDER BY created_at DESC
LIMIT 5; 