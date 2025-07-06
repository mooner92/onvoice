-- 📡 Supabase Realtime 활성화 스크립트
-- Supabase Dashboard > SQL Editor에서 실행하세요

-- 1. transcripts 테이블에 대한 realtime 활성화
ALTER PUBLICATION supabase_realtime ADD TABLE transcripts;

-- 2. translation_cache 테이블에 대한 realtime 활성화 (선택사항)
ALTER PUBLICATION supabase_realtime ADD TABLE translation_cache;

-- 3. 모든 사용자가 transcripts 변경사항을 구독할 수 있도록 허용
-- (이미 RLS 정책이 있지만 realtime을 위해 추가 확인)

-- 4. 현재 활성화된 realtime 테이블 확인
SELECT schemaname, tablename 
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime';

-- 5. transcripts 테이블의 RLS 정책 확인
SELECT * FROM pg_policies WHERE tablename = 'transcripts';

-- ✅ 이 스크립트 실행 후 콘솔에서 다음과 같은 로그가 나타나야 합니다:
-- 🔔 Setting up realtime subscription for completed transcripts...
-- 🔔 Realtime subscription status: SUBSCRIBED 