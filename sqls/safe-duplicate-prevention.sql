-- 🛡️ 안전한 중복 방지 스키마 (선택적 실행)
-- 기존 데이터에 영향을 주지 않고 새로운 중복만 방지

-- 1. 기존 데이터는 그대로 두고, 새로운 중복만 방지하는 방법
-- (기존 데이터 정리는 수동으로 확인 후 실행)

-- 2. Index만 추가 (성능 향상, 기존 데이터 영향 없음)
CREATE INDEX IF NOT EXISTS idx_transcripts_session_text_safe 
ON transcripts(session_id, original_text);

CREATE INDEX IF NOT EXISTS idx_translation_cache_content_hash_lang_safe 
ON translation_cache(content_hash, target_language);

-- 3. 통계 확인 (실행 전후 비교용)
SELECT 
  'BEFORE' as check_time,
  'transcripts' as table_name,
  COUNT(*) as total_records,
  COUNT(DISTINCT session_id) as unique_sessions,
  COUNT(DISTINCT original_text) as unique_texts,
  COUNT(*) - COUNT(DISTINCT session_id || '|' || original_text) as duplicate_pairs
FROM transcripts
UNION ALL
SELECT 
  'BEFORE' as check_time,
  'translation_cache' as table_name,
  COUNT(*) as total_records,
  COUNT(DISTINCT content_hash) as unique_hashes,
  COUNT(DISTINCT target_language) as unique_languages,
  COUNT(*) - COUNT(DISTINCT content_hash || '|' || target_language) as duplicate_pairs
FROM translation_cache;

-- 4. 중복 데이터 확인 (실제 삭제 전 확인용)
-- SELECT 
--   session_id,
--   original_text,
--   COUNT(*) as duplicate_count,
--   MIN(created_at) as first_created,
--   MAX(created_at) as last_created
-- FROM transcripts 
-- GROUP BY session_id, original_text 
-- HAVING COUNT(*) > 1
-- ORDER BY duplicate_count DESC
-- LIMIT 10;

-- 5. 번역 캐시 중복 확인
-- SELECT 
--   content_hash,
--   target_language,
--   COUNT(*) as duplicate_count,
--   MIN(created_at) as first_created,
--   MAX(created_at) as last_created
-- FROM translation_cache 
-- GROUP BY content_hash, target_language 
-- HAVING COUNT(*) > 1
-- ORDER BY duplicate_count DESC
-- LIMIT 10;

-- 6. 안전한 중복 제거 (선택적 실행)
-- WITH duplicates AS (
--   SELECT id,
--          ROW_NUMBER() OVER (
--            PARTITION BY session_id, original_text 
--            ORDER BY created_at ASC
--          ) as rn
--   FROM transcripts
-- )
-- DELETE FROM transcripts 
-- WHERE id IN (
--   SELECT id FROM duplicates WHERE rn > 1
-- );

-- 7. 번역 캐시 중복 제거 (선택적 실행)
-- WITH cache_duplicates AS (
--   SELECT id,
--          ROW_NUMBER() OVER (
--            PARTITION BY content_hash, target_language 
--            ORDER BY created_at ASC
--          ) as rn
--   FROM translation_cache
-- )
-- DELETE FROM translation_cache 
-- WHERE id IN (
--   SELECT id FROM cache_duplicates WHERE rn > 1
-- ); 