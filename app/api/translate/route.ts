import { NextRequest, NextResponse } from "next/server"
import { 
  getTranslationFromCache, 
  generateSmartMockTranslation,
  ALL_SUPPORTED_LANGUAGES
} from "@/lib/translation-cache"
import { addTranslationJob } from "@/lib/translation-queue"
import type { TranslationResponse } from "@/lib/types"

export async function POST(req: NextRequest) {
  try {
    const { text, targetLanguage, sessionId, sourceLanguage = 'auto' } = await req.json()

    console.log('🌍 Enhanced Translation API called:', {
      textLength: text?.length,
      targetLanguage,
      sourceLanguage,
      sessionId: sessionId ? sessionId.substring(0, 8) + '...' : 'none',
      timestamp: new Date().toLocaleTimeString(),
    })

    // 입력 검증
    if (!text || !targetLanguage) {
      return NextResponse.json({ error: 'Text and target language are required' }, { status: 400 })
    }

    // 텍스트가 너무 길면 거부
    if (text.length > 10000) {
      return NextResponse.json({ error: 'Text too long (max 10,000 characters)' }, { status: 400 })
    }

    // 영어로 번역 요청인데 이미 영어인 경우 건너뛰기
    if (targetLanguage === 'en' && /^[a-zA-Z0-9\s.,!?'"()-]+$/.test(text)) {
      console.log('⏭️ Skipping translation: text is already in English')
      return NextResponse.json({
        translatedText: text,
        engine: 'passthrough',
        fromCache: false,
        quality: 1.0,
      } as TranslationResponse)
    }

    // 같은 언어로 번역 요청인 경우 건너뛰기
    if (sourceLanguage === targetLanguage && sourceLanguage !== 'auto') {
      console.log('⏭️ Skipping translation: source and target are the same')
      return NextResponse.json({
        translatedText: text,
        engine: 'passthrough',
        fromCache: false,
        quality: 1.0,
      } as TranslationResponse)
    }

    console.log('🚀 Starting enhanced translation process...')

    // 1단계: 캐시에서 번역 조회
    console.log('1️⃣ Checking translation cache...')
    const cachedTranslation = await getTranslationFromCache(text, targetLanguage)

    if (cachedTranslation) {
      console.log(
        `✅ Cache hit! Using ${cachedTranslation.translation_engine} translation (quality: ${cachedTranslation.quality_score})`,
      )
      return NextResponse.json({
        translatedText: cachedTranslation.translated_text,
        engine: cachedTranslation.translation_engine,
        fromCache: true,
        quality: cachedTranslation.quality_score,
      } as TranslationResponse)
    }

    console.log('2️⃣ Cache miss - generating mock translation and queuing job...')

    // 2단계: 즉시 Mock 번역 응답 + 백그라운드 실제 번역
    const mockTranslation = generateSmartMockTranslation(text, targetLanguage)

    // 3단계: 백그라운드 번역 작업 큐에 추가
    const priority = calculatePriority(targetLanguage, sessionId)
    const jobId = addTranslationJob(text, targetLanguage, sessionId, priority)

    console.log(`📋 Translation job ${jobId} queued with priority ${priority} for "${text.substring(0, 30)}..."`)

    // 즉시 응답 (Mock 번역)
    return NextResponse.json({
      translatedText: mockTranslation,
      engine: 'mock',
      fromCache: false,
      isProcessing: true,
      jobId: jobId,
      quality: 0.5,
    } as TranslationResponse)
  } catch (error) {
    console.error('❌ Enhanced Translation API error:', error)
    return NextResponse.json({ error: 'Translation failed' }, { status: 500 })
  }
}

// 번역 우선순위 계산
function calculatePriority(targetLanguage: string, sessionId?: string): number {
  let priority = 5 // 기본 우선순위

  // 지원 언어는 높은 우선순위
  if (ALL_SUPPORTED_LANGUAGES.includes(targetLanguage)) {
    const index = ALL_SUPPORTED_LANGUAGES.indexOf(targetLanguage)
    priority += (ALL_SUPPORTED_LANGUAGES.length - index) * 2
  }

  // 활성 세션이 있으면 높은 우선순위
  if (sessionId) {
    priority += 15
  }

  return priority
}

// 번역 완료 상태 확인 API
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const text = searchParams.get('text')
    const targetLanguage = searchParams.get('targetLanguage')

    if (!text || !targetLanguage) {
      return NextResponse.json({ error: 'Text and target language are required' }, { status: 400 })
    }

    console.log(`🔍 Checking translation status for: "${text.substring(0, 30)}..." → ${targetLanguage}`)

    // 캐시에서 번역 조회
    const cachedTranslation = await getTranslationFromCache(text, targetLanguage)

    if (cachedTranslation) {
      console.log(
        `✅ Translation completed and cached: ${cachedTranslation.translation_engine} (quality: ${cachedTranslation.quality_score})`,
      )
      return NextResponse.json({
        completed: true,
        translatedText: cachedTranslation.translated_text,
        engine: cachedTranslation.translation_engine,
        quality: cachedTranslation.quality_score,
      })
    }

    console.log(`⏳ Translation still in progress for: "${text.substring(0, 30)}..." → ${targetLanguage}`)
    return NextResponse.json({
      completed: false,
      message: 'Translation still in progress',
    })
  } catch (error) {
    console.error('❌ Translation status check error:', error)
    return NextResponse.json({ error: 'Status check failed' }, { status: 500 })
  }
}
