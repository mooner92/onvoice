import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import type { TranslationCache } from './types'

// 환경 감지
const isVercel = process.env.VERCEL === '1'

// Supabase 클라이언트 (서버용) - 연결 최적화
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  db: {
    schema: 'public',
  },
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
  realtime: {
    params: {
      eventsPerSecond: isVercel ? 5 : 10, // Vercel에서는 더 보수적으로
    },
  },
  global: {
    headers: {
      'x-application-name': 'onvoice-translation-cache',
      'x-environment': isVercel ? 'vercel' : 'local',
    },
  },
})

// UUID v4 생성 함수 (DB DEFAULT 대신 코드에서 생성)
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0
    const v = c == 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

// 콘텐츠 해시 생성
export function generateContentHash(text: string, targetLanguage: string): string {
  return crypto.createHash('sha256').update(`${text}:${targetLanguage}`).digest('hex')
}

// 캐시에서 번역 조회
export async function getTranslationFromCache(text: string, targetLanguage: string): Promise<TranslationCache | null> {
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

// 🚀 고성능 캐시 저장 (중복 방지 강화, 메트릭 수집)
export async function saveTranslationToCache(
  text: string,
  targetLanguage: string,
  translatedText: string,
  engine: string,
  qualityScore: number = 0.9,
): Promise<string | null> {
  const startTime = Date.now()

  try {
    const contentHash = generateContentHash(text, targetLanguage)
    const id = generateUUID() // 명시적 ID 생성
    const now = new Date().toISOString()
    const expiresAt = new Date()

    // GPT 번역은 30일, Google은 14일, Local은 7일 유지
    const daysToKeep = engine === 'gpt' ? 30 : engine === 'google' ? 14 : 7
    expiresAt.setDate(expiresAt.getDate() + daysToKeep)

    // 🚀 최적화된 중복 체크 (직접 해시 확인)
    const duplicateCheckStart = Date.now()
    
    // 먼저 해시로 빠르게 확인
    const { data: hashCheck, error: hashError } = await supabase
      .from('translation_cache')
      .select('id, usage_count')
      .eq('content_hash', contentHash)
      .eq('target_language', targetLanguage)
      .gte('expires_at', new Date().toISOString())
      .single()
    
    const duplicateCheckTime = Date.now() - duplicateCheckStart
    metrics.cacheCheckTime.push(duplicateCheckTime)
    
    if (hashCheck && !hashError) {
      // 기존 항목의 사용 횟수 증가 (백그라운드)
      supabase
        .from('translation_cache')
        .update({ usage_count: hashCheck.usage_count + 1 })
        .eq('id', hashCheck.id)
        .then(({ error }) => {
          if (error) {
            console.warn(`⚠️ Failed to update usage count for ${hashCheck.id}:`, error)
          }
        })
      
      const totalTime = Date.now() - startTime
      console.log(
        `🎯 Cache hit (fast path): "${text.substring(0, 30)}..." → ${targetLanguage} (check: ${duplicateCheckTime}ms, total: ${totalTime}ms)`,
      )
      return hashCheck.id
    }
    
    // 텍스트 품질 검증
    if (!translatedText || translatedText.trim().length < 1) {
      console.log(`⚠️ Empty or invalid translation, skipping cache: "${text.substring(0, 30)}..." → ${targetLanguage}`)
      return null
    }
    
    // 언어별 문자 패턴 검증
    const isValidTranslation = validateTranslationQuality(text, translatedText, targetLanguage)
    if (!isValidTranslation) {
      console.log(`⚠️ Low quality translation detected, skipping cache: "${text.substring(0, 30)}..." → ${targetLanguage}`)
      return null
    }

    const insertStart = Date.now()
    console.log(`💾 Saving to cache: "${text.substring(0, 30)}..." → ${targetLanguage} (${engine}, quality: ${qualityScore})`)

    const { data, error } = await supabase
      .from('translation_cache')
      .insert({
        id: id, // 명시적으로 ID 지정
        content_hash: contentHash,
        original_text: text.substring(0, 2000), // 텍스트 길이 제한
        target_language: targetLanguage,
        translated_text: translatedText.substring(0, 2000), // 번역 길이 제한
        translation_engine: engine,
        quality_score: Math.min(Math.max(qualityScore, 0), 1), // 0-1 범위 보장
        usage_count: 1,
        created_at: now, // 명시적으로 생성 시간 지정
        expires_at: expiresAt.toISOString(),
      })
      .select('id')
      .single()

    const insertTime = Date.now() - insertStart
    const totalTime = Date.now() - startTime
    
    // 성능 메트릭 수집
    metrics.dbInsertTime.push(insertTime)
    metrics.totalSaveTime.push(totalTime)
    
    // 메트릭 배열 크기 제한 (메모리 관리)
    if (metrics.dbInsertTime.length > 100) {
      metrics.dbInsertTime = metrics.dbInsertTime.slice(-50)
    }
    if (metrics.cacheCheckTime.length > 100) {
      metrics.cacheCheckTime = metrics.cacheCheckTime.slice(-50)
    }
    if (metrics.totalSaveTime.length > 100) {
      metrics.totalSaveTime = metrics.totalSaveTime.slice(-50)
    }

    if (error) {
      console.error(`❌ Error saving translation to cache (${totalTime}ms):`, error)

      // 중복 키 에러인 경우 기존 캐시 반환
      if (error.code === '23505' || error.message?.includes('duplicate key')) {
        console.log('🔄 Duplicate cache entry detected, fetching existing...')
        try {
          const existingCache = await getTranslationFromCache(text, targetLanguage)
          if (existingCache) {
            console.log(`♻️ Returning existing cache ID: ${existingCache.id}`)
            return existingCache.id
          }
        } catch (fetchError) {
          console.error('❌ Failed to fetch existing cache:', fetchError)
        }
      }

      return null
    }

    console.log(
      `✅ Successfully cached: "${text.substring(0, 30)}..." → ${targetLanguage} (ID: ${data.id}) - Insert: ${insertTime}ms, Total: ${totalTime}ms`,
    )
    
    // 백그라운드에서 스마트 캐시 정리 (비동기)
    if (Math.random() < 0.01) { // 1% 확률로 정리 실행
      smartCacheCleanup(100).catch(err => 
        console.warn('Background cache cleanup failed:', err)
      )
    }
    
    return data.id
  } catch (error) {
    console.error('❌ Error saving translation to cache:', error)
    return null
  }
}

// 🚀 고성능 배치 저장 (병렬 처리)
export async function saveBatchTranslationsToCache(
  text: string,
  translations: Record<string, { text: string; engine: string; quality: number }>,
): Promise<Record<string, string>> {
  const cacheIds: Record<string, string> = {}
  
  console.log(`📦 Batch saving ${Object.keys(translations).length} translations for: "${text.substring(0, 30)}..."`)
  const batchStartTime = Date.now()

  // 병렬 처리로 성능 향상
  const savePromises = Object.entries(translations).map(async ([language, translation]) => {
    const cacheId = await saveTranslationToCache(
      text,
      language,
      translation.text,
      translation.engine,
      translation.quality,
    )
    return { language, cacheId }
  })

  const results = await Promise.allSettled(savePromises)
  
  let successCount = 0
  let errorCount = 0
  
  results.forEach((result, index) => {
    if (result.status === 'fulfilled' && result.value.cacheId) {
      cacheIds[result.value.language] = result.value.cacheId
      successCount++
    } else {
      errorCount++
      const language = Object.keys(translations)[index]
      console.warn(`⚠️ Failed to cache translation for ${language}:`, 
        result.status === 'rejected' ? result.reason : 'No cache ID returned')
    }
  })
  
  const batchTime = Date.now() - batchStartTime
  console.log(`📦 Batch save completed: ${successCount} success, ${errorCount} errors (${batchTime}ms)`)

  return cacheIds
}

// 🆕 번역 품질 검증 함수
function validateTranslationQuality(
  originalText: string, 
  translatedText: string, 
  targetLanguage: string
): boolean {
  // 기본 검증
  if (!translatedText || translatedText.trim().length === 0) {
    return false
  }
  
  // 원문과 번역문이 동일한 경우 (번역 실패 가능성)
  if (originalText.trim() === translatedText.trim()) {
    // 단, 짧은 텍스트나 숫자/기호만 있는 경우는 허용
    if (originalText.length < 10 || /^[\d\s\p{P}]+$/u.test(originalText)) {
      return true
    }
    return false
  }
  
  // 언어별 문자 패턴 검증
  switch (targetLanguage) {
    case 'ko':
      // 한글이 포함되어 있는지 확인
      return /[가-힣]/.test(translatedText)
    case 'zh':
      // 중국어 문자가 포함되어 있는지 확인
      return /[\u4e00-\u9fff]/.test(translatedText)
    case 'hi':
      // 힌디어 문자가 포함되어 있는지 확인
      return /[\u0900-\u097f]/.test(translatedText)
    case 'en':
      // 영어 알파벳이 포함되어 있는지 확인
      return /[a-zA-Z]/.test(translatedText)
    default:
      return true // 기타 언어는 기본 허용
  }
}

// 🆕 모든 지원 언어 (기존의 고정된 3개에서 확장)
export const ALL_SUPPORTED_LANGUAGES = ['ko', 'en', 'zh', 'hi']

// 🆕 기본 우선순위 언어 (하위 호환성을 위해 유지)
export const PRIORITY_LANGUAGES = ['ko', 'zh', 'hi']

// 🆕 입력 언어에 따른 대상 언어 결정 함수
export function getTargetLanguages(inputLanguage: string): string[] {
  // 입력 언어를 제외한 나머지 3개 언어 반환
  return ALL_SUPPORTED_LANGUAGES.filter((lang) => lang !== inputLanguage)
}

// 🎯 향상된 다국어 감지 (정확도 개선)
export function detectLanguage(text: string): string {
  const cleanText = text.trim()
  if (cleanText.length === 0) return 'en'

  // 언어별 문자 및 패턴 분석
  const koreanChars = (cleanText.match(/[가-힣]/g) || []).length
  const chineseChars = (cleanText.match(/[\u4e00-\u9fff]/g) || []).length  
  const hindiChars = (cleanText.match(/[\u0900-\u097f]/g) || []).length
  const englishChars = (cleanText.match(/[a-zA-Z]/g) || []).length
  
  // 특수 문자와 숫자 제외한 실제 텍스트 길이
  const textOnlyLength = cleanText.replace(/[\s\p{P}\d]/gu, '').length
  
  if (textOnlyLength === 0) {
    console.log(`🔤 No text characters found, defaulting to English`)
    return 'en'
  }
  
  // 각 언어별 비율 계산 (개선된 임계값)
  const koreanRatio = koreanChars / textOnlyLength
  const chineseRatio = chineseChars / textOnlyLength
  const hindiRatio = hindiChars / textOnlyLength
  const englishRatio = englishChars / textOnlyLength
  
  console.log(`🔍 Language detection ratios: KO(${koreanRatio.toFixed(2)}) ZH(${chineseRatio.toFixed(2)}) HI(${hindiRatio.toFixed(2)}) EN(${englishRatio.toFixed(2)})`)
  
  // 절대적 우선순위 (90% 이상)
  if (koreanRatio > 0.9) return 'ko'
  if (chineseRatio > 0.9) return 'zh' 
  if (hindiRatio > 0.9) return 'hi'
  if (englishRatio > 0.9) return 'en'
  
  // 높은 신뢰도 (50% 이상)
  if (koreanRatio > 0.5) return 'ko'
  if (chineseRatio > 0.5) return 'zh'
  if (hindiRatio > 0.5) return 'hi'
  if (englishRatio > 0.5) return 'en'
  
  // 중간 신뢰도 (20% 이상이면서 다른 언어보다 2배 이상)
  if (koreanRatio > 0.2 && koreanRatio > chineseRatio * 2 && koreanRatio > hindiRatio * 2) return 'ko'
  if (chineseRatio > 0.2 && chineseRatio > koreanRatio * 2 && chineseRatio > hindiRatio * 2) return 'zh'
  if (hindiRatio > 0.2 && hindiRatio > koreanRatio * 2 && hindiRatio > chineseRatio * 2) return 'hi'
  
  // 낮은 신뢰도 (10% 이상)
  if (koreanRatio > 0.1) return 'ko'
  if (chineseRatio > 0.1) return 'zh'
  if (hindiRatio > 0.1) return 'hi'
  
  // 영어 문자가 있으면 영어, 없으면 기본값 영어
  const detectedLang = englishChars > 0 ? 'en' : 'en'
  console.log(`🤔 Low confidence language detection for: "${cleanText.substring(0, 30)}..." - using: ${detectedLang}`)
  return detectedLang
}

// 🎯 지능형 즉시 응답 번역 생성 (품질 개선)
export function generateSmartMockTranslation(text: string, targetLanguage: string): string {
  const languageNames: Record<string, string> = {
    ko: '한국어',
    ja: '日本語', 
    zh: '中文',
    es: 'Español',
    fr: 'Français',
    de: 'Deutsch',
    hi: 'हिन्दी',
    ru: 'Русский',
    ar: 'العربية',
    pt: 'Português',
    it: 'Italiano',
    en: 'English'
  }

  const langName = languageNames[targetLanguage] || targetLanguage.toUpperCase()
  
  // 매우 짧은 텍스트 (10자 미만)
  if (text.length < 10) {
    return `[${langName}] ${text}`
  }
  
  // 짧은 텍스트 (30자 미만) - 간단한 패턴 변환
  if (text.length < 30) {
    return `[${langName}] ${text}`
  }
  
  // 중간 길이 텍스트 (100자 미만)
  if (text.length < 100) {
    return `🔄 [${langName}] ${text.substring(0, 50)}...`
  }

  // 긴 텍스트 - AI 번역 중 표시
  return `🤖 [AI ${langName} 번역 중...] ${text.substring(0, 40)}...`
}

// 번역 엔진 품질 평가
export function getEngineQuality(engine: string): number {
  switch (engine) {
    case 'gpt':
      return 0.95
    case 'google':
      return 0.75
    case 'local':
      return 0.3
    default:
      return 0.5
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
      return {
        totalEntries: 0,
        byEngine: {},
        byLanguage: {},
        averageQuality: 0,
      }
    }

    const byEngine: Record<string, number> = {}
    const byLanguage: Record<string, number> = {}
    let totalQuality = 0

    data.forEach((entry) => {
      byEngine[entry.translation_engine] = (byEngine[entry.translation_engine] || 0) + 1
      byLanguage[entry.target_language] = (byLanguage[entry.target_language] || 0) + 1
      totalQuality += entry.quality_score || 0
    })

    return {
      totalEntries: data.length,
      byEngine,
      byLanguage,
      averageQuality: data.length > 0 ? totalQuality / data.length : 0,
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
      return {
        totalEntries: 0,
        estimatedSizeMB: 0,
        oldestEntry: '',
        newestEntry: '',
      }
    }

    let totalBytes = 0
    data.forEach((entry) => {
      totalBytes += (entry.original_text?.length || 0) + (entry.translated_text?.length || 0) + 100 // 메타데이터 추정
    })

    return {
      totalEntries: data.length,
      estimatedSizeMB: totalBytes / (1024 * 1024),
      oldestEntry: data[data.length - 1]?.created_at || '',
      newestEntry: data[0]?.created_at || '',
    }
  } catch (error) {
    console.error('Error getting cache size:', error)
    return {
      totalEntries: 0,
      estimatedSizeMB: 0,
      oldestEntry: '',
      newestEntry: '',
    }
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

// 🆕 성능 메트릭스 수집
interface PerformanceMetrics {
  dbInsertTime: number[]
  cacheCheckTime: number[]
  totalSaveTime: number[]
  environment: string
}

const metrics: PerformanceMetrics = {
  dbInsertTime: [],
  cacheCheckTime: [],
  totalSaveTime: [],
  environment: isVercel ? 'vercel' : 'local',
}

// 성능 통계 조회
export function getPerformanceStats(): {
  environment: string
  dbInsert: { avg: number; min: number; max: number; count: number }
  cacheCheck: { avg: number; min: number; max: number; count: number }
  totalSave: { avg: number; min: number; max: number; count: number }
} {
  const calculateStats = (arr: number[]) => {
    if (arr.length === 0) return { avg: 0, min: 0, max: 0, count: 0 }
    const sum = arr.reduce((a, b) => a + b, 0)
    return {
      avg: Math.round(sum / arr.length),
      min: Math.min(...arr),
      max: Math.max(...arr),
      count: arr.length,
    }
  }

  return {
    environment: metrics.environment,
    dbInsert: calculateStats(metrics.dbInsertTime),
    cacheCheck: calculateStats(metrics.cacheCheckTime),
    totalSave: calculateStats(metrics.totalSaveTime),
  }
}

// 🆕 UI에서 사용할 언어 정의
export const LANGUAGE_DEFINITIONS = [
  { code: 'ko', name: 'Korean', flag: '🇰🇷' },
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'zh', name: 'Chinese', flag: '🇨🇳' },
  { code: 'hi', name: 'Hindi', flag: '🇮🇳' },
]

// 🆕 특정 언어를 제외한 언어 목록 가져오기 (UI용)
export function getAvailableLanguagesForUI(excludeLanguage?: string) {
  return LANGUAGE_DEFINITIONS.filter((lang) => lang.code !== excludeLanguage)
}
