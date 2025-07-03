import { createClient } from "@supabase/supabase-js"
import crypto from "crypto"
import type { TranslationCache } from "./types"

// Supabase 클라이언트 (서버용)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// UUID v4 생성 함수 (DB DEFAULT 대신 코드에서 생성)
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0
    const v = c == 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

// 콘텐츠 해시 생성
export function generateContentHash(text: string, targetLanguage: string): string {
  return crypto
    .createHash('sha256')
    .update(`${text}:${targetLanguage}`)
    .digest('hex')
}

// 캐시에서 번역 조회
export async function getTranslationFromCache(
  text: string, 
  targetLanguage: string
): Promise<TranslationCache | null> {
  try {
    const contentHash = generateContentHash(text, targetLanguage)
    
    const { data, error } = await supabase
      .from('translation_cache')
      .select('*')
      .eq('content_hash', contentHash)
      .eq('target_language', targetLanguage)
      .gte('expires_at', new Date().toISOString())
      .single()
    
    if (error || !data) {
      console.log(`🔍 Cache miss for: "${text.substring(0, 30)}..." → ${targetLanguage}`)
      return null
    }
    
    console.log(`✅ Cache hit for: "${text.substring(0, 30)}..." → ${targetLanguage} (${data.translation_engine})`)
    
    // 사용 횟수 증가 (에러가 발생해도 번역은 반환)
    try {
      await supabase
        .from('translation_cache')
        .update({ usage_count: data.usage_count + 1 })
        .eq('id', data.id)
    } catch (updateError) {
      console.warn('Failed to update usage count:', updateError)
    }
    
    return data as TranslationCache
  } catch (error) {
    console.error('Error getting translation from cache:', error)
    return null
  }
}

// 캐시에 번역 저장 (개선된 버전)
export async function saveTranslationToCache(
  text: string,
  targetLanguage: string,
  translatedText: string,
  engine: string,
  qualityScore: number = 0.9
): Promise<string | null> {
  try {
    const contentHash = generateContentHash(text, targetLanguage)
    const id = generateUUID() // 명시적 ID 생성
    const now = new Date().toISOString()
    const expiresAt = new Date()
    
    // GPT 번역은 30일, Google은 14일, Local은 7일 유지
    const daysToKeep = engine === 'gpt' ? 30 : engine === 'google' ? 14 : 7
    expiresAt.setDate(expiresAt.getDate() + daysToKeep)
    
    // 중복 체크 먼저 수행
    const existing = await getTranslationFromCache(text, targetLanguage)
    if (existing) {
      console.log(`📋 Translation already cached: "${text.substring(0, 30)}..." → ${targetLanguage}`)
      return existing.id
    }
    
    console.log(`💾 Saving to cache: "${text.substring(0, 30)}..." → ${targetLanguage} (${engine})`)
    
    const { data, error } = await supabase
      .from('translation_cache')
      .insert({
        id: id, // 명시적으로 ID 지정
        content_hash: contentHash,
        original_text: text,
        target_language: targetLanguage,
        translated_text: translatedText,
        translation_engine: engine,
        quality_score: qualityScore,
        usage_count: 1,
        created_at: now, // 명시적으로 생성 시간 지정
        expires_at: expiresAt.toISOString()
      })
      .select('id')
      .single()
    
    if (error) {
      console.error('❌ Error saving translation to cache:', error)
      
      // 중복 키 에러인 경우 기존 캐시 반환
      if (error.code === '23505') { // unique_violation
        console.log('🔄 Duplicate cache entry, fetching existing...')
        const existingCache = await getTranslationFromCache(text, targetLanguage)
        return existingCache?.id || null
      }
      
      return null
    }
    
    console.log(`✅ Successfully cached: "${text.substring(0, 30)}..." → ${targetLanguage} (ID: ${data?.id || id})`)
    return data?.id || id
  } catch (error) {
    console.error('❌ Error saving translation to cache:', error)
    return null
  }
}

// 여러 언어의 번역을 배치로 저장
export async function saveBatchTranslationsToCache(
  text: string,
  translations: Record<string, { text: string; engine: string; quality: number }>
): Promise<Record<string, string>> {
  const cacheIds: Record<string, string> = {}
  
  for (const [language, translation] of Object.entries(translations)) {
    const cacheId = await saveTranslationToCache(
      text,
      language,
      translation.text,
      translation.engine,
      translation.quality
    )
    
    if (cacheId) {
      cacheIds[language] = cacheId
    }
  }
  
  return cacheIds
}

// 인기 언어 목록 (우선순위 번역용) - 사용량이 많은 3개 언어로 축소
export const PRIORITY_LANGUAGES = ['ko', 'zh', 'hi']

// 번역 우선순위 계산
export function calculateTranslationPriority(
  targetLanguage: string,
  sessionId?: string
): number {
  let priority = 5 // 기본 우선순위
  
  // 인기 언어는 높은 우선순위
  if (PRIORITY_LANGUAGES.includes(targetLanguage)) {
    priority += PRIORITY_LANGUAGES.indexOf(targetLanguage) * 2
  }
  
  // 세션이 활성화된 경우 높은 우선순위
  if (sessionId) {
    priority += 10
  }
  
  return priority
}

// 스마트 Mock 번역 생성 (즉시 응답용)
export function generateSmartMockTranslation(
  text: string, 
  targetLanguage: string
): string {
  const languageNames: Record<string, string> = {
    'ko': '한국어',
    'ja': '日本語', 
    'zh': '中文',
    'es': 'Español',
    'fr': 'Français',
    'de': 'Deutsch',
    'hi': 'हिन्दी',
    'ru': 'Русский',
    'ar': 'العربية',
    'pt': 'Português',
    'it': 'Italiano'
  }
  
  const langName = languageNames[targetLanguage] || targetLanguage.toUpperCase()
  
  // 짧은 텍스트는 더 자연스럽게
  if (text.length < 20) {
    return `[${langName}] ${text}`
  }
  
  // 긴 텍스트는 번역 중 표시
  return `[AI 번역 중...] ${text}`
}

// 번역 엔진 품질 평가
export function getEngineQuality(engine: string): number {
  switch (engine) {
    case 'gpt': return 0.95
    case 'google': return 0.75
    case 'local': return 0.3
    default: return 0.5
  }
}

// 캐시 통계 조회
export async function getCacheStats(): Promise<{
  totalEntries: number
  byEngine: Record<string, number>
  byLanguage: Record<string, number>
  averageQuality: number
}> {
  try {
    const { data, error } = await supabase
      .from('translation_cache')
      .select('translation_engine, target_language, quality_score')
      .gte('expires_at', new Date().toISOString())
    
    if (error || !data) {
      return { totalEntries: 0, byEngine: {}, byLanguage: {}, averageQuality: 0 }
    }
    
    const byEngine: Record<string, number> = {}
    const byLanguage: Record<string, number> = {}
    let totalQuality = 0
    
    data.forEach(entry => {
      byEngine[entry.translation_engine] = (byEngine[entry.translation_engine] || 0) + 1
      byLanguage[entry.target_language] = (byLanguage[entry.target_language] || 0) + 1
      totalQuality += entry.quality_score || 0
    })
    
    return {
      totalEntries: data.length,
      byEngine,
      byLanguage,
      averageQuality: data.length > 0 ? totalQuality / data.length : 0
    }
  } catch (error) {
    console.error('Error getting cache stats:', error)
    return { totalEntries: 0, byEngine: {}, byLanguage: {}, averageQuality: 0 }
  }
}

// 만료된 캐시 정리 (옵션)
export async function cleanupExpiredCache(): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('translation_cache')
      .delete()
      .lt('expires_at', new Date().toISOString())
      .select('id')
    
    if (error) {
      console.error('Error cleaning up expired cache:', error)
      return 0
    }
    
    const deletedCount = data?.length || 0
    console.log(`🧹 Cleaned up ${deletedCount} expired cache entries`)
    return deletedCount
  } catch (error) {
    console.error('Error cleaning up expired cache:', error)
    return 0
  }
}

// 🆕 캐시 크기 최적화: 사용 빈도 기반 정리
export async function cleanupLowUsageCache(minUsageCount: number = 2): Promise<number> {
  try {
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    
    const { data, error } = await supabase
      .from('translation_cache')
      .delete()
      .lt('usage_count', minUsageCount)
      .lt('created_at', thirtyDaysAgo.toISOString())
      .select('id')
    
    if (error) {
      console.error('Error cleaning up low usage cache:', error)
      return 0
    }
    
    const deletedCount = data?.length || 0
    console.log(`🧹 Cleaned up ${deletedCount} low-usage cache entries`)
    return deletedCount
  } catch (error) {
    console.error('Error cleaning up low usage cache:', error)
    return 0
  }
}

// 🆕 캐시 크기 모니터링
export async function getCacheSize(): Promise<{
  totalEntries: number
  estimatedSizeMB: number
  oldestEntry: string
  newestEntry: string
}> {
  try {
    const { data, error } = await supabase
      .from('translation_cache')
      .select('id, created_at, original_text, translated_text')
      .gte('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
    
    if (error || !data) {
      return { totalEntries: 0, estimatedSizeMB: 0, oldestEntry: '', newestEntry: '' }
    }
    
    let totalBytes = 0
    data.forEach(entry => {
      totalBytes += (entry.original_text?.length || 0) + (entry.translated_text?.length || 0) + 100 // 메타데이터 추정
    })
    
    return {
      totalEntries: data.length,
      estimatedSizeMB: totalBytes / (1024 * 1024),
      oldestEntry: data[data.length - 1]?.created_at || '',
      newestEntry: data[0]?.created_at || ''
    }
  } catch (error) {
    console.error('Error getting cache size:', error)
    return { totalEntries: 0, estimatedSizeMB: 0, oldestEntry: '', newestEntry: '' }
  }
}

// 🆕 스마트 캐시 정리 (크기 기반)
export async function smartCacheCleanup(maxSizeMB: number = 100): Promise<number> {
  const cacheSize = await getCacheSize()
  
  if (cacheSize.estimatedSizeMB <= maxSizeMB) {
    console.log(`✅ Cache size (${cacheSize.estimatedSizeMB.toFixed(2)}MB) is within limit (${maxSizeMB}MB)`)
    return 0
  }
  
  console.log(`⚠️ Cache size (${cacheSize.estimatedSizeMB.toFixed(2)}MB) exceeds limit (${maxSizeMB}MB)`)
  
  // 1. 만료된 항목 먼저 정리
  let cleaned = await cleanupExpiredCache()
  
  // 2. 낮은 사용 빈도 항목 정리
  cleaned += await cleanupLowUsageCache(1)
  
  // 3. 여전히 크다면 오래된 항목 정리
  const newSize = await getCacheSize()
  if (newSize.estimatedSizeMB > maxSizeMB) {
    const sixtyDaysAgo = new Date()
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)
    
    const { data, error } = await supabase
      .from('translation_cache')
      .delete()
      .lt('created_at', sixtyDaysAgo.toISOString())
      .select('id')
    
    if (!error && data) {
      cleaned += data.length
      console.log(`🧹 Cleaned up ${data.length} old cache entries`)
    }
  }
  
  return cleaned
} 