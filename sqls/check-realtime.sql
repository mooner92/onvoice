-- 📡 Realtime 활성화 상태 확인 및 설정

-- 1. 현재 활성화된 realtime 테이블 확인
SELECT schemaname, tablename 
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime';

-- 2. translation_cache 테이블에 대한 realtime 활성화 (필요한 경우)
-- 이미 활성화되어 있으면 오류가 발생할 수 있으므로 주석 처리
-- ALTER PUBLICATION supabase_realtime ADD TABLE translation_cache;

-- 3. RLS 정책 확인
SELECT * FROM pg_policies WHERE tablename = 'translation_cache';

-- 4. 테스트: 최근 번역 캐시 데이터 확인
SELECT 
    original_text,
    target_language,
    translated_text,
    created_at
FROM translation_cache
ORDER BY created_at DESC
LIMIT 10; 