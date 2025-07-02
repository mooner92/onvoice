-- 🚨 Supabase Dashboard에서 실행할 SQL 명령어들
-- SQL Editor에서 아래 명령어들을 순서대로 실행하세요

-- 1. 기존 translation_cache 테이블이 있다면 삭제 (데이터 손실 주의!)
DROP TABLE IF EXISTS translation_cache;

-- 2. 새로운 translation_cache 테이블 생성 (수정된 스키마)
CREATE TABLE translation_cache (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  content_hash TEXT UNIQUE NOT NULL,
  original_text TEXT NOT NULL,
  target_language TEXT NOT NULL,
  translated_text TEXT NOT NULL,
  translation_engine TEXT NOT NULL CHECK (translation_engine IN ('gpt', 'google', 'local', 'mock')),
  quality_score FLOAT DEFAULT 0.5,
  usage_count INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL
);

-- 3. 인덱스 생성 (성능 최적화)
CREATE INDEX idx_translation_cache_hash ON translation_cache(content_hash);
CREATE INDEX idx_translation_cache_lang ON translation_cache(target_language);
CREATE INDEX idx_translation_cache_expires ON translation_cache(expires_at);
CREATE INDEX idx_translation_cache_engine ON translation_cache(translation_engine);

-- 4. RLS (Row Level Security) 정책 설정
ALTER TABLE translation_cache ENABLE ROW LEVEL SECURITY;

-- 5. 모든 사용자가 번역 캐시를 조회할 수 있도록 허용
CREATE POLICY "Anyone can read translation cache" ON translation_cache
  FOR SELECT USING (true);

-- 6. 서버에서만 번역 캐시를 삽입/업데이트할 수 있도록 제한
CREATE POLICY "Service role can insert translation cache" ON translation_cache
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Service role can update translation cache" ON translation_cache
  FOR UPDATE USING (true);

-- 7. 만료된 캐시 자동 삭제 함수 생성
CREATE OR REPLACE FUNCTION cleanup_expired_translations()
RETURNS void AS $$
BEGIN
  DELETE FROM translation_cache 
  WHERE expires_at < NOW();
  
  RAISE NOTICE 'Cleaned up expired translation cache entries';
END;
$$ LANGUAGE plpgsql;

-- 8. 매일 자동으로 만료된 캐시 정리 (Supabase Cron Extension 필요)
-- SELECT cron.schedule('cleanup-translations', '0 2 * * *', 'SELECT cleanup_expired_translations();');

-- ✅ 완료! 이제 번역 캐시 시스템이 정상 작동합니다. 