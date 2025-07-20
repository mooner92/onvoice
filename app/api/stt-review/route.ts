import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { saveTranslationToCache } from '@/lib/translation-cache'

// 언어 감지 함수
function detectLanguage(text: string): string {
  // 한국어 감지
  if (/[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(text)) {
    return 'ko'
  }
  // 중국어 감지
  if (/[\u4e00-\u9fff]/.test(text)) {
    return 'zh'
  }
  // 힌디어 감지
  if (/[\u0900-\u097f]/.test(text)) {
    return 'hi'
  }
  // 기본값은 영어
  return 'en'
}

// Gemini를 통한 검수 + 번역
async function reviewAndTranslateWithGemini(
  originalText: string,
  detectedLanguage: string
): Promise<{
  reviewedText: string
  translations: Record<string, string>
  quality: number
}> {
  const geminiApiKey = process.env.GEMINI_API_KEY
  if (!geminiApiKey) {
    throw new Error('Gemini API key not found')
  }

  // 입력 언어를 제외한 나머지 3개 언어
  const allLanguages = ['ko', 'zh', 'hi', 'en']
  const targetLanguages = allLanguages.filter(lang => lang !== detectedLanguage)

  // 언어별 이름 매핑
  const languageNames: Record<string, string> = {
    ko: 'Korean',
    zh: 'Chinese',
    hi: 'Hindi',
    en: 'English'
  }

  // 검수 및 번역 프롬프트 구성
  let prompt = ''
  
  if (detectedLanguage === 'en') {
    prompt = `Here is the raw text straight from STT, fix the grammar and remove noise errors like ah, emmm and add the punctuation to make it clear and easy to read.

Also translate the corrected text to ${targetLanguages.map(lang => languageNames[lang]).join(', ')}.

Original text: "${originalText}"

Please return a JSON response with this exact format:
{
  "reviewedText": "corrected English text here",
  "translations": {
    "ko": "Korean translation here",
    "zh": "Chinese translation here", 
    "hi": "Hindi translation here"
  },
  "quality": 0.95
}`
  } else {
    const inputLanguageName = languageNames[detectedLanguage]
    prompt = `Here is the raw text straight from STT in ${inputLanguageName}, fix the grammar and remove noise errors and add the punctuation to make it clear and easy to read.

Also translate the corrected text to ${targetLanguages.map(lang => languageNames[lang]).join(', ')}.

Original text: "${originalText}"

Please return a JSON response with this exact format:
{
  "reviewedText": "corrected ${inputLanguageName} text here",
  "translations": {
    ${targetLanguages.map(lang => `"${lang}": "${languageNames[lang]} translation here"`).join(',\n    ')}
  },
  "quality": 0.95
}`
  }

  console.log(`🤖 Gemini review + translation for: "${originalText.substring(0, 50)}..." (${detectedLanguage} → ${targetLanguages.join(', ')})`)

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${geminiApiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: Math.max(Math.ceil(originalText.length * 6), 1000),
        },
      }),
    }
  )

  if (!response.ok) {
    const errorText = await response.text()
    console.error('Gemini API error:', response.status, errorText)
    throw new Error('Gemini API request failed')
  }

  const data = await response.json()

  if (data.candidates && data.candidates[0] && data.candidates[0].content) {
    const candidate = data.candidates[0]

    if (candidate.content.parts && candidate.content.parts[0] && candidate.content.parts[0].text) {
      let content = candidate.content.parts[0].text.trim()

      // JSON 파싱 (마크다운 코드 블록 제거)
      if (content.startsWith('```json')) {
        content = content.replace(/^```json\s*/, '').replace(/\s*```$/, '')
      } else if (content.startsWith('```')) {
        content = content.replace(/^```\s*/, '').replace(/\s*```$/, '')
      }

      try {
        const result = JSON.parse(content)
        
        console.log(`✅ Gemini review + translation completed`)
        
        return {
          reviewedText: result.reviewedText || originalText,
          translations: result.translations || {},
          quality: result.quality || 0.9
        }
      } catch (parseError) {
        console.error('JSON parsing error:', parseError)
        throw new Error('Failed to parse Gemini response')
      }
    }
  }

  throw new Error('Invalid Gemini response structure')
}

export async function POST(req: NextRequest) {
  try {
    const { originalText, sessionId, transcriptId } = await req.json()

    console.log('🔍 STT Review API called:', {
      textLength: originalText?.length,
      sessionId: sessionId?.substring(0, 8) + '...',
      transcriptId: transcriptId?.substring(0, 8) + '...',
      timestamp: new Date().toLocaleTimeString(),
    })

    // 입력 검증
    if (!originalText || !sessionId || !transcriptId) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 })
    }

    // 언어 감지
    const detectedLanguage = detectLanguage(originalText)
    console.log(`🌍 Detected language: ${detectedLanguage}`)

    // Gemini 검수 + 번역
    const result = await reviewAndTranslateWithGemini(originalText, detectedLanguage)

    // Supabase 클라이언트 생성
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // 1. transcripts 테이블에 검수된 텍스트 저장
    const { error: updateError } = await supabase
      .from('transcripts')
      .update({
        reviewed_text: result.reviewedText,
        detected_language: detectedLanguage,
        review_status: 'completed'
      })
      .eq('id', transcriptId)

    if (updateError) {
      console.error('Error updating transcript:', updateError)
      return NextResponse.json({ error: 'Failed to update transcript' }, { status: 500 })
    }

    // 2. 번역 결과를 translation_cache에 저장
    const cachePromises = Object.entries(result.translations).map(async ([targetLang, translatedText]) => {
      if (translatedText && translatedText.trim()) {
        try {
          await saveTranslationToCache(
            result.reviewedText, // 검수된 텍스트를 원본으로 사용
            targetLang,
            translatedText,
            'gemini-review',
            result.quality
          )
          console.log(`✅ Cached translation: ${targetLang}`)
        } catch (cacheError) {
          console.error(`❌ Cache error for ${targetLang}:`, cacheError)
        }
      }
    })

    await Promise.all(cachePromises)

    console.log(`🎉 STT review + translation completed for transcript ${transcriptId}`)

    return NextResponse.json({
      success: true,
      reviewedText: result.reviewedText,
      detectedLanguage: detectedLanguage,
      translations: result.translations,
      quality: result.quality
    })

  } catch (error) {
    console.error('❌ STT Review API error:', error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Internal server error' 
    }, { status: 500 })
  }
} 