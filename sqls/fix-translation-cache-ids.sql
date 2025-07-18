-- Fix translation_cache_ids field issues
-- Run this in Supabase SQL Editor

-- 1. 현재 translation_cache_ids 필드 상태 확인
SELECT 
  id,
  original_text,
  translation_cache_ids,
  translation_status,
  created_at
FROM transcripts 
WHERE session_id = '9bd03158-bca0-4d11-ba02-592754b53bb4'  -- 최근 세션 ID
ORDER BY created_at DESC
LIMIT 5;

-- 2. translation_cache 테이블에 실제로 저장된 번역 확인
SELECT 
  id,
  original_text,
  target_language,
  translated_text,
  created_at
FROM translation_cache 
WHERE original_text IN (
  SELECT original_text 
  FROM transcripts 
  WHERE session_id = '9bd03158-bca0-4d11-ba02-592754b53bb4'
)
ORDER BY created_at DESC
LIMIT 10;

-- 3. translation_cache_ids가 NULL이거나 빈 객체인 transcript들을 수정
-- 최근 transcript들의 translation_cache_ids를 올바르게 업데이트
UPDATE transcripts 
SET translation_cache_ids = (
  SELECT jsonb_object_agg(tc.target_language, tc.id)
  FROM translation_cache tc
  WHERE tc.original_text = transcripts.original_text
    AND tc.target_language IN ('ko', 'zh', 'hi', 'en')
)
WHERE session_id = '9bd03158-bca0-4d11-ba02-592754b53bb4'
  AND translation_status = 'completed'
  AND (translation_cache_ids IS NULL OR translation_cache_ids = '{}'::jsonb);

-- 4. 업데이트 결과 확인
SELECT 
  id,
  original_text,
  translation_cache_ids,
  translation_status,
  created_at
FROM transcripts 
WHERE session_id = '9bd03158-bca0-4d11-ba02-592754b53bb4'
ORDER BY created_at DESC
LIMIT 5;

-- 5. JSONB 필드 인덱스 추가 (성능 최적화)
CREATE INDEX IF NOT EXISTS idx_transcripts_cache_ids ON transcripts USING GIN (translation_cache_ids);

-- 6. translation_cache_ids 필드에 대한 쿼리 최적화를 위한 함수 생성
CREATE OR REPLACE FUNCTION get_translation_cache_ids(text_content TEXT)
RETURNS JSONB AS $$
BEGIN
  RETURN (
    SELECT jsonb_object_agg(tc.target_language, tc.id)
    FROM translation_cache tc
    WHERE tc.original_text = text_content
      AND tc.target_language IN ('ko', 'zh', 'hi', 'en')
  );
END;
$$ LANGUAGE plpgsql;

-- 7. 모든 완료된 transcript에 대해 translation_cache_ids 업데이트
UPDATE transcripts 
SET translation_cache_ids = get_translation_cache_ids(original_text)
WHERE translation_status = 'completed'
  AND (translation_cache_ids IS NULL OR translation_cache_ids = '{}'::jsonb);

-- 8. 최종 확인
SELECT 
  COUNT(*) as total_transcripts,
  COUNT(translation_cache_ids) as with_cache_ids,
  COUNT(*) - COUNT(translation_cache_ids) as without_cache_ids
FROM transcripts 
WHERE session_id = '9bd03158-bca0-4d11-ba02-592754b53bb4'; 