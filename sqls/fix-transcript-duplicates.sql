가ㅡ-- 🚫 Transcript 중복 방지를 위한 DB 제약 조건 추가
-- 같은 세션에서 같은 텍스트가 중복 저장되는 것을 완전히 차단

-- 1. 기존 중복 데이터 정리 (선택사항)
-- DELETE FROM transcripts 
-- WHERE id NOT IN (
--   SELECT MIN(id) 
--   FROM transcripts 
--   GROUP BY session_id, original_text
-- );

-- 2. Unique constraint 추가 (같은 세션에서 같은 텍스트 중복 방지)
ALTER TABLE transcripts 
ADD CONSTRAINT unique_session_text 
UNIQUE (session_id, original_text);

-- 3. Index 추가로 성능 향상
CREATE INDEX IF NOT EXISTS idx_transcripts_session_text 
ON transcripts(session_id, original_text);

-- 4. Translation cache 중복 방지 강화
ALTER TABLE translation_cache 
ADD CONSTRAINT unique_content_hash_language 
UNIQUE (content_hash, target_language);

-- 5. Index 추가
CREATE INDEX IF NOT EXISTS idx_translation_cache_content_hash_lang 
ON translation_cache(content_hash, target_language);

-- 6. Transcript status 업데이트를 위한 함수
CREATE OR REPLACE FUNCTION update_transcript_translation_status()
RETURNS TRIGGER AS $$
BEGIN
  -- translation_cache에 해당 transcript의 번역이 있으면 status를 'completed'로 업데이트
  IF EXISTS (
    SELECT 1 FROM translation_cache 
    WHERE transcript_id = NEW.id
  ) THEN
    UPDATE transcripts 
    SET translation_status = 'completed' 
    WHERE id = NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 7. Trigger 추가
DROP TRIGGER IF EXISTS trigger_update_transcript_status ON translation_cache;
CREATE TRIGGER trigger_update_transcript_status
  AFTER INSERT ON translation_cache
  FOR EACH ROW
  EXECUTE FUNCTION update_transcript_translation_status();

-- 8. 기존 데이터 정리 (중복 제거)
-- 같은 session_id와 original_text를 가진 중복 레코드 중 가장 오래된 것만 남기고 삭제
WITH duplicates AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY session_id, original_text 
           ORDER BY created_at ASC
         ) as rn
  FROM transcripts
)
DELETE FROM transcripts 
WHERE id IN (
  SELECT id FROM duplicates WHERE rn > 1
);

-- 9. 통계 확인
SELECT 
  'transcripts' as table_name,
  COUNT(*) as total_records,
  COUNT(DISTINCT session_id) as unique_sessions,
  COUNT(DISTINCT original_text) as unique_texts
FROM transcripts
UNION ALL
SELECT 
  'translation_cache' as table_name,
  COUNT(*) as total_records,
  COUNT(DISTINCT content_hash) as unique_hashes,
  COUNT(DISTINCT target_language) as unique_languages
FROM translation_cache; 