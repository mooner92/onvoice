import { NextRequest, NextResponse } from "next/server"
import { VertexAI } from "@google-cloud/vertexai"
import { createClient } from "@supabase/supabase-js"
import { saveTranslationToCache, generateContentHash } from "@/lib/translation-cache"

// Vertex AI 클라이언트 초기화
const vertexAI = new VertexAI({
  project: process.env.GOOGLE_CLOUD_PROJECT_ID!,
  location: process.env.GOOGLE_CLOUD_LOCATION || 'us-central1',
})

// Supabase 클라이언트
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// 활성 세션 관리
interface GeminiLiveSession {
  sessionId: string
  targetLanguages: string[]
  isActive: boolean
  lastUpdate: Date
}

const activeSessions = new Map<string, GeminiLiveSession>()

export async function POST(req: NextRequest) {
  try {
    const { type, sessionId, audioData, targetLanguages, realtime, audioQuality } = await req.json()

    console.log(`🎯 Gemini Live ${type}:`, {
      sessionId,
      hasAudioData: !!audioData,
      targetLanguages,
      realtime: !!realtime,
      timestamp: new Date().toLocaleTimeString()
    })

    switch (type) {
      case 'start':
        return await handleStartSession(sessionId, targetLanguages || ['ko', 'zh', 'hi'])
      
      case 'audio':
        return await handleAudioStream(sessionId, audioData, realtime, audioQuality)
      
      case 'end':
        return await handleEndSession(sessionId)
      
      default:
        return NextResponse.json(
          { error: "Invalid type. Use 'start', 'audio', or 'end'" },
          { status: 400 }
        )
    }

  } catch (error) {
    console.error("❌ Gemini Live API error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

// 세션 시작 처리
async function handleStartSession(sessionId: string, targetLanguages: string[]) {
  try {
    console.log(`🚀 Starting Gemini Live session: ${sessionId}`)
    
    // 세션 정보 저장
    activeSessions.set(sessionId, {
      sessionId,
      targetLanguages,
      isActive: true,
      lastUpdate: new Date()
    })

    // Gemini 2.5 Flash 모델 초기화
    const model = vertexAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        maxOutputTokens: 8192,
        temperature: 0.1, // 일관성을 위해 낮은 temperature
      },
    })

    console.log(`✅ Gemini Live session ${sessionId} initialized`)
    
    return NextResponse.json({
      success: true,
      sessionId,
      targetLanguages,
      model: 'gemini-2.5-flash',
      message: 'Session started successfully'
    })

  } catch (error) {
    console.error(`❌ Failed to start session ${sessionId}:`, error)
    return NextResponse.json(
      { error: "Failed to start session" },
      { status: 500 }
    )
  }
}

// 오디오 스트림 처리
async function handleAudioStream(sessionId: string, audioData: string, realtime: boolean, audioQuality?: any) {
  try {
    const session = activeSessions.get(sessionId)
    if (!session || !session.isActive) {
      return NextResponse.json(
        { error: "Session not found or inactive" },
        { status: 404 }
      )
    }

    console.log(`🎵 Processing audio for session: ${sessionId}`)

    // Skip processing if audio quality is too low
    if (audioQuality && !audioQuality.hasSpeech) {
      console.log('🔇 Skipping low quality audio')
      return NextResponse.json({
        success: true,
        result: null,
        message: 'Audio quality too low'
      })
    }

    // Gemini 2.5 Flash 모델로 오디오 처리
    const model = vertexAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
    })

    // 오디오 데이터 유효성 검사
    if (!audioData || audioData.length === 0) {
      console.log('⚠️ Empty audio data received')
      return NextResponse.json({
        success: false,
        error: "Empty audio data"
      }, { status: 400 })
    }

    // 오디오 데이터가 너무 작으면 스킵 (무음일 가능성)
    const audioBuffer = Buffer.from(audioData, 'base64')
    if (audioBuffer.length < 2000) { // Increased threshold
      console.log('⚠️ Audio too small, likely silence')
      return NextResponse.json({
        success: true,
        result: null,
        message: 'Audio too small (silence)'
      })
    }

    console.log('📊 Audio data info:', {
      base64Length: audioData.length,
      bufferSize: audioBuffer.length,
      sizeKB: Math.round(audioBuffer.length / 1024),
      sessionId: sessionId,
      targetLanguages: session.targetLanguages,
      realtime: !!realtime,
      audioQuality: audioQuality?.confidence || 'unknown'
    })

    // Optimize prompt for real-time processing with language specification
    const promptText = realtime 
      ? "Transcribe this audio and translate to Korean, Chinese, and Hindi. Return only the transcription and translations, no explanations."
      : "Transcribe this audio and provide Korean, Chinese, and Hindi translations in JSON format."

    // Gemini Live API 호출 - 실시간 최적화
    const result = await model.generateContent({
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: 'audio/wav',
                data: audioData
              }
            },
            {
              text: promptText
            }
          ]
        }
      ],
      generationConfig: realtime ? {
        temperature: 0.1, // Lower temperature for faster, more deterministic responses
        maxOutputTokens: 300, // Reduced for faster response
        topK: 10,
        topP: 0.8
      } : undefined
    })

    const response = result.response
    const text = response.candidates?.[0]?.content?.parts?.[0]?.text || ''

    console.log('🤖 Raw Gemini response:', text.substring(0, 200) + '...')

    // JSON 응답 파싱 (더 견고한 처리)
    let processedResult
    try {
      // 프롬프트 텍스트 제거 (혹시 포함되어 있다면)
      let cleanedText = text
      
      // 시스템 프롬프트나 지시사항이 응답에 포함된 경우 제거
      const unwantedPhrases = [
        'Transcribe this audio and translate to Korean, Chinese, and Hindi',
        'Return only the transcription and translations, no explanations',
        'Transcribe this audio and provide Korean, Chinese, and Hindi translations in JSON format',
        'The transcribed English audio is:',
        'Here are the translations:',
        'Korean translation:',
        'Chinese translation:',
        'Hindi translation:',
        'English transcription:',
        'Korean:',
        'Chinese:',
        'Hindi:',
        'Return JSON format:',
        'Audio to process:'
      ]
      
      for (const phrase of unwantedPhrases) {
        cleanedText = cleanedText.replace(phrase, '')
      }
      
      // JSON 블록을 찾아서 파싱
      const jsonMatch = cleanedText.match(/\{[\s\S]*\}/)
      const jsonText = jsonMatch ? jsonMatch[0] : cleanedText.trim()
      
      // JSON이 아닌 경우 직접 텍스트로 처리
      if (!jsonText.startsWith('{')) {
        console.log('📝 Non-JSON response, treating as direct transcription:', jsonText)
        
        // 빈 텍스트이거나 의미없는 텍스트 필터링 (완화된 필터)
        if (!jsonText || 
            jsonText.length < 2 || 
            unwantedPhrases.some(phrase => jsonText.toLowerCase().includes(phrase.toLowerCase()))) {
          console.log('⚠️ Filtered out low-quality text:', jsonText)
          return NextResponse.json({
            success: true,
            result: null,
            message: 'Low quality transcription filtered'
          })
        }
        
        // 텍스트에서 번역 추출 시도
        const extractedTranslations = extractTranslationsFromText(jsonText)
        
        processedResult = {
          original: {
            text: extractedTranslations.original || jsonText,
            language: 'auto'
          },
          translations: extractedTranslations.translations || {
            ko: extractedTranslations.korean || jsonText,
            zh: extractedTranslations.chinese || jsonText,
            hi: extractedTranslations.hindi || jsonText
          },
          confidence: audioQuality?.confidence || 0.8
        }
      } else {
        processedResult = JSON.parse(jsonText)
      }
      
      console.log('✅ Successfully processed Gemini response:', processedResult)
    } catch (parseError) {
      console.error('❌ Failed to parse Gemini response:', parseError)
      console.log('📝 Raw response text:', text)
      
      return NextResponse.json({
        success: false,
        error: "Failed to parse transcription result"
      }, { status: 500 })
    }

    // 데이터베이스에 저장 (중복 제거 및 품질 필터링)
    let transcriptionText = null
    
    // 다양한 응답 구조 처리
    if (processedResult.transcription) {
      transcriptionText = processedResult.transcription
    } else if (processedResult.original?.text) {
      transcriptionText = processedResult.original.text
    } else if (processedResult.english_transcription) {
      transcriptionText = processedResult.english_transcription
    } else if (processedResult.original_transcript) {
      transcriptionText = processedResult.original_transcript
    } else if (processedResult.original_transcription) {
      transcriptionText = processedResult.original_transcription
    } else if (processedResult.english_text) {
      transcriptionText = processedResult.english_text
    } else if (typeof processedResult === 'string') {
      transcriptionText = processedResult
    }

    console.log('💾 Attempting to save transcription:', {
      text: transcriptionText?.substring(0, 50) + '...',
      length: transcriptionText?.length,
      hasTranslations: !!processedResult.translations
    })

    // 전사 저장 (완화된 조건)
    if (transcriptionText && 
        transcriptionText.trim().length > 1 && 
        !isDuplicateTranscription(sessionId, transcriptionText)) {
      
      const { data: transcript, error: insertError } = await supabase
        .from("transcripts")
        .insert([
          {
            session_id: sessionId,
            timestamp: new Date().toLocaleTimeString(),
            original_text: transcriptionText.trim(),
            created_at: new Date().toISOString(),
            is_final: true,
            translation_status: 'completed'
            // confidence 컬럼이 없으면 제거
          }
        ])
        .select()

      if (insertError) {
        console.error(`❌ DB insert error:`, insertError)
      } else {
        console.log(`✅ TRANSCRIPT SAVED: ${transcript?.[0]?.id} - "${transcriptionText.trim()}"`)
        console.log(`📊 Session: ${sessionId}, Length: ${transcriptionText.trim().length} chars`)
      }

      // 번역 결과를 캐시에 저장 (기존 시스템과 호환)
      const translations = processedResult.translations || 
                          processedResult.korean || 
                          processedResult.chinese || 
                          processedResult.hindi || 
                          {}

      // 언어 코드 매핑 (Gemini 응답을 표준 언어 코드로 변환)
      const languageMapping: Record<string, string> = {
        'korean': 'ko',
        'ko': 'ko',
        'chinese': 'zh',
        'chinese_simplified': 'zh',
        'zh': 'zh',
        'zh-CN': 'zh',
        'zh-Hans': 'zh',
        'hindi': 'hi',
        'hi': 'hi',
        'english': 'en',
        'en': 'en'
      }

      const cachePromises = []
      
      // 올바른 번역 데이터만 처리 (개별 문자 제외)
      for (const [originalLang, translation] of Object.entries(translations)) {
        const targetLang = languageMapping[originalLang.toLowerCase()]
        
        // 유효한 언어 코드이고 번역이 의미있는 경우만 저장
        if (targetLang && 
            typeof translation === 'string' && 
            translation.trim().length > 2 &&
            !targetLang.match(/^[a-z]$/)) { // 단일 문자 언어 코드 제외
          
          try {
            const cachePromise = saveTranslationToCache(
              transcriptionText,
              targetLang,
              translation.trim(),
              'gemini-live'
            )
            cachePromises.push(cachePromise)
            console.log(`📝 Queued translation cache: ${targetLang} = "${translation.trim()}"`)
          } catch (error) {
            console.error(`❌ Error queuing translation cache for ${targetLang}:`, error)
          }
        }
      }

      // 병렬로 캐시 저장 실행
      if (cachePromises.length > 0) {
        try {
          const results = await Promise.allSettled(cachePromises)
          const successful = results.filter(r => r.status === 'fulfilled').length
          const failed = results.filter(r => r.status === 'rejected').length
          console.log(`📊 Translation cache results: ${successful} saved, ${failed} failed`)
        } catch (error) {
          console.error('❌ Error saving translation caches:', error)
        }
      }
    } else {
      console.log('⚠️ Transcription filtered out (low quality or duplicate)')
    }

    // 응답 반환 (항상 성공으로 반환하여 클라이언트가 계속 작동하도록)
    return NextResponse.json({
      success: true,
      result: {
        transcriptionText,
        translations: processedResult.translations || {},
        confidence: processedResult.confidence || audioQuality?.confidence || 0.8
      }
    })

  } catch (error) {
    console.error("❌ Error in handleAudioStream:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

// 중복 전사 검사 (간단한 구현)
const recentTranscriptions = new Map<string, string[]>()

function isDuplicateTranscription(sessionId: string, text: string): boolean {
  const cleaned = text.trim().toLowerCase()
  
  if (!recentTranscriptions.has(sessionId)) {
    recentTranscriptions.set(sessionId, [])
  }
  
  const recent = recentTranscriptions.get(sessionId)!
  
  // 최근 3개 전사와 비교 (완화된 중복 검사)
  const isDuplicate = recent.some(prev => {
    const similarity = calculateSimilarity(cleaned, prev)
    return similarity > 0.9 // 90% 이상 유사하면 중복으로 간주
  })
  
  if (!isDuplicate) {
    recent.push(cleaned)
    // 최근 5개만 유지
    if (recent.length > 5) {
      recent.shift()
    }
  }
  
  return isDuplicate
}

// 텍스트 유사도 계산 (Levenshtein distance 기반)
function calculateSimilarity(str1: string, str2: string): number {
  const longer = str1.length > str2.length ? str1 : str2
  const shorter = str1.length > str2.length ? str2 : str1
  
  if (longer.length === 0) return 1.0
  
  const distance = levenshteinDistance(longer, shorter)
  return (longer.length - distance) / longer.length
}

function levenshteinDistance(str1: string, str2: string): number {
  const matrix = []
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i]
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        )
      }
    }
  }
  
  return matrix[str2.length][str1.length]
}

// 저품질 전사 검사 (완화된 버전)
function isLowQualityTranscription(text: string): boolean {
  const cleaned = text.trim().toLowerCase()
  
  // 매우 기본적인 노이즈 패턴만 검사
  const noisePatterns = [
    /^[^\w\s]*$/, // 특수문자만
    /^(.)\1{6,}$/, // 6개 이상 반복 문자 (aaaaaa)
    /^[\s\.,!?]*$/, // 공백과 구두점만
    /^(\.{3,}|…+)$/, // 점만
  ]

  for (const pattern of noisePatterns) {
    if (pattern.test(cleaned)) {
      return true
    }
  }

  // 매우 짧은 텍스트만 필터링
  if (cleaned.length < 1) return true
  
  return false
}

// 텍스트에서 번역 추출
function extractTranslationsFromText(text: string): {
  original?: string
  korean?: string
  chinese?: string
  hindi?: string
  translations?: Record<string, string>
} {
  const result: any = {}
  
  // 다양한 패턴으로 번역 추출
  const patterns = [
    // "The transcribed English audio is: ..." 패턴
    /The transcribed English audio is:\s*"([^"]+)"/i,
    /English:\s*"([^"]+)"/i,
    /Original:\s*"([^"]+)"/i,
    
    // Korean 패턴
    /Korean[^:]*:\s*"([^"]+)"/i,
    /Korean[^:]*:\s*([^*\n]+)/i,
    /한국어[^:]*:\s*"([^"]+)"/i,
    /한국어[^:]*:\s*([^*\n]+)/i,
    
    // Chinese 패턴  
    /Chinese[^:]*:\s*"([^"]+)"/i,
    /Chinese[^:]*:\s*([^*\n]+)/i,
    /中文[^:]*:\s*"([^"]+)"/i,
    /中文[^:]*:\s*([^*\n]+)/i,
    
    // Hindi 패턴
    /Hindi[^:]*:\s*"([^"]+)"/i,
    /Hindi[^:]*:\s*([^*\n]+)/i,
    /हिन्दी[^:]*:\s*"([^"]+)"/i,
    /हिन्दी[^:]*:\s*([^*\n]+)/i,
  ]
  
  // 원본 텍스트 추출
  const originalMatch = text.match(/The transcribed English audio is:\s*"([^"]+)"/i) ||
                       text.match(/English:\s*"([^"]+)"/i) ||
                       text.match(/Original:\s*"([^"]+)"/i)
  
  if (originalMatch) {
    result.original = originalMatch[1].trim()
  }
  
  // 한국어 번역 추출
  const koreanMatch = text.match(/Korean[^:]*:\s*"([^"]+)"/i) ||
                     text.match(/Korean[^:]*:\s*([^*\n]+)/i) ||
                     text.match(/한국어[^:]*:\s*"([^"]+)"/i) ||
                     text.match(/한국어[^:]*:\s*([^*\n]+)/i)
  
  if (koreanMatch) {
    result.korean = koreanMatch[1].trim()
  }
  
  // 중국어 번역 추출
  const chineseMatch = text.match(/Chinese[^:]*:\s*"([^"]+)"/i) ||
                      text.match(/Chinese[^:]*:\s*([^*\n]+)/i) ||
                      text.match(/中文[^:]*:\s*"([^"]+)"/i) ||
                      text.match(/中文[^:]*:\s*([^*\n]+)/i)
  
  if (chineseMatch) {
    result.chinese = chineseMatch[1].trim()
  }
  
  // 힌디어 번역 추출
  const hindiMatch = text.match(/Hindi[^:]*:\s*"([^"]+)"/i) ||
                    text.match(/Hindi[^:]*:\s*([^*\n]+)/i) ||
                    text.match(/हिन्दी[^:]*:\s*"([^"]+)"/i) ||
                    text.match(/हिन्दी[^:]*:\s*([^*\n]+)/i)
  
  if (hindiMatch) {
    result.hindi = hindiMatch[1].trim()
  }
  
  // translations 객체 생성
  if (result.korean || result.chinese || result.hindi) {
    result.translations = {}
    if (result.korean) result.translations.ko = result.korean
    if (result.chinese) result.translations.zh = result.chinese
    if (result.hindi) result.translations.hi = result.hindi
  }
  
  return result
}

// 세션 종료 처리
async function handleEndSession(sessionId: string) {
  try {
    const session = activeSessions.get(sessionId)
    if (!session) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      )
    }

    console.log(`🛑 Ending Gemini Live session: ${sessionId}`)

    // 세션 비활성화
    session.isActive = false
    
    // 메모리에서 제거
    activeSessions.delete(sessionId)

    return NextResponse.json({
      success: true,
      sessionId,
      message: 'Session ended successfully'
    })

  } catch (error) {
    console.error(`❌ Failed to end session ${sessionId}:`, error)
    return NextResponse.json(
      { error: "Failed to end session" },
      { status: 500 }
    )
  }
}

// GET 엔드포인트: 세션 상태 확인
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const sessionId = searchParams.get('sessionId')

    if (!sessionId) {
      return NextResponse.json(
        { error: "Session ID is required" },
        { status: 400 }
      )
    }

    const session = activeSessions.get(sessionId)
    if (!session) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      )
    }

    return NextResponse.json({
      sessionId: session.sessionId,
      targetLanguages: session.targetLanguages,
      isActive: session.isActive,
      lastUpdate: session.lastUpdate,
      uptime: Date.now() - session.lastUpdate.getTime()
    })

  } catch (error) {
    console.error("Gemini Live GET error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
} 