import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { detectLanguage } from '@/lib/translation-cache'
import { saveTranslationToCache } from '@/lib/translation-cache'

// Gemini 검수 + 번역 함수 (직접 호출)
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

// In-memory session storage for quick access
interface SessionData {
  fullTranscript: string
  lastUpdate: Date
}

const activeSessions = new Map<string, SessionData>()

export async function POST(req: NextRequest) {
  try {
    const { type, sessionId, transcript, isPartial } = await req.json()

    console.log(`🎯 STT Stream ${type}:`, {
      sessionId,
      hasTranscript: !!transcript,
      isPartial,
      timestamp: new Date().toLocaleTimeString(),
    })

    switch (type) {
      case 'start':
        // Initialize session
        if (!activeSessions.has(sessionId)) {
          activeSessions.set(sessionId, {
            fullTranscript: '',
            lastUpdate: new Date(),
          })
          console.log(`🚀 STT session ${sessionId} initialized`)
        }
        return NextResponse.json({ success: true })

      case 'transcript':
        // Update session transcript
        const session = activeSessions.get(sessionId)
        if (!session) {
          console.error(`❌ Session ${sessionId} not found for transcript update`)
          return NextResponse.json({ error: 'Session not found' }, { status: 404 })
        }

        // 텍스트 유효성 검증
        const cleanedTranscript = transcript?.trim()
        if (!cleanedTranscript || cleanedTranscript.length < 3) {
          console.log(`⚠️ Skipping empty or too short transcript: "${cleanedTranscript}"`)
          return NextResponse.json({
            success: true,
            message: 'Transcript too short, skipped',
          })
        }

        // 중복 방지: 같은 텍스트가 이미 처리되었는지 확인
        if (session.fullTranscript.includes(cleanedTranscript)) {
          console.log(`⚠️ Duplicate transcript detected, skipping: "${cleanedTranscript.substring(0, 30)}..."`)
          return NextResponse.json({
            success: true,
            message: 'Duplicate transcript, skipped',
          })
        }

        if (!isPartial && cleanedTranscript) {
          // Only append final transcripts (not partial)
          session.fullTranscript += cleanedTranscript + ' '
          session.lastUpdate = new Date()
          console.log(`📝 Final transcript added to session ${sessionId}:`, cleanedTranscript)

          // Save EACH final sentence immediately to Supabase
          const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

          const dbInsertStart = Date.now()
          console.log(`💾 Inserting transcript to DB: "${cleanedTranscript.substring(0, 50)}..."`)

          const { data, error: insertError } = await supabase
            .from('transcripts')
            .insert([
              {
                session_id: sessionId,
                timestamp: new Date().toLocaleTimeString(),
                original_text: cleanedTranscript,
                created_at: new Date().toISOString(),
                is_final: true,
                review_status: 'pending', // 검수 대기 상태로 설정
                translation_status: 'pending', // 번역 대기 상태로 설정
              },
            ])
            .select()

          const dbInsertTime = Date.now() - dbInsertStart

          if (insertError) {
            console.error(`❌ DB insert error (${dbInsertTime}ms):`, insertError)
            return NextResponse.json({ error: 'Database error' }, { status: 500 })
          }

          console.log(`✅ Transcript saved (id): ${data?.[0]?.id} - DB insert: ${dbInsertTime}ms`)
          const transcriptId = data?.[0]?.id

          // 🚀 Gemini 검수 + 번역 실행 (백그라운드)
          console.log('🌍 Starting Gemini review + translation...')

          // 검수 및 번역 상태를 'processing'으로 업데이트
          const statusUpdateStart = Date.now()
          await supabase.from('transcripts').update({ 
            review_status: 'processing',
            translation_status: 'processing' 
          }).eq('id', transcriptId)
          const statusUpdateTime = Date.now() - statusUpdateStart

          console.log(`🔄 Review & translation status updated to 'processing' (${statusUpdateTime}ms)`)

          try {
            // 언어 감지
            const detectedLanguage = detectLanguage(cleanedTranscript)
            console.log(`🌍 Detected language: ${detectedLanguage}`)

            // Gemini 검수 + 번역 직접 호출
            const reviewStart = Date.now()
            const reviewResult = await reviewAndTranslateWithGemini(cleanedTranscript, detectedLanguage)
            const reviewTime = Date.now() - reviewStart

            console.log(
              `🚀 Gemini review + translation completed in ${reviewTime}ms for "${cleanedTranscript.substring(0, 30)}..."`,
            )

            // 1. transcripts 테이블에 검수된 텍스트 저장
            console.log(`💾 Updating transcript ${transcriptId} with reviewed text: "${reviewResult.reviewedText.substring(0, 30)}..."`)
            
            const { error: updateError } = await supabase
              .from('transcripts')
              .update({
                reviewed_text: reviewResult.reviewedText,
                detected_language: detectedLanguage,
                review_status: 'completed'
              })
              .eq('id', transcriptId)

            if (updateError) {
              console.error('❌ Error updating transcript with reviewed text:', updateError)
              throw new Error('Failed to update transcript')
            } else {
              console.log(`✅ Successfully updated transcript ${transcriptId} with reviewed text`)
            }

            // 2. 번역 결과를 translation_cache에 저장하고 ID 수집
            const cacheIds: Record<string, string> = {}
            const cachePromises = Object.entries(reviewResult.translations).map(async ([targetLang, translatedText]) => {
              if (translatedText && translatedText.trim()) {
                try {
                  const cacheId = await saveTranslationToCache(
                    reviewResult.reviewedText, // 검수된 텍스트를 원본으로 사용
                    targetLang,
                    translatedText,
                    'gemini-review',
                    reviewResult.quality
                  )
                  
                  if (cacheId) {
                    cacheIds[targetLang] = cacheId
                    console.log(`✅ Cached translation: ${targetLang} (ID: ${cacheId})`)
                  }
                } catch (cacheError) {
                  console.error(`❌ Cache error for ${targetLang}:`, cacheError)
                }
              }
            })

            await Promise.all(cachePromises)

            // 3. transcripts 테이블에 translation_cache_ids 업데이트
            if (Object.keys(cacheIds).length > 0) {
              console.log(`💾 Updating transcript ${transcriptId} with cache IDs:`, cacheIds)
              
              const { error: updateError } = await supabase
                .from('transcripts')
                .update({ 
                  translation_cache_ids: cacheIds,
                  translation_status: 'completed' 
                })
                .eq('id', transcriptId)

              if (updateError) {
                console.error('❌ Error updating translation_cache_ids:', updateError)
              } else {
                console.log(`✅ Successfully updated transcript ${transcriptId} with ${Object.keys(cacheIds).length} cache IDs`)
              }
            } else {
              console.log(`⚠️ No cache IDs to update for transcript ${transcriptId}`)
              // 번역 완료 상태로 업데이트
              await supabase.from('transcripts').update({ translation_status: 'completed' }).eq('id', transcriptId)
            }

            return NextResponse.json({
              success: true,
              transcriptId: transcriptId,
              originalText: cleanedTranscript,
              reviewedText: reviewResult.reviewedText,
              detectedLanguage: detectedLanguage,
              reviewCompleted: true,
              translationCompleted: true,
              translatedLanguages: Object.keys(reviewResult.translations || {}),
              reviewTime: reviewTime,
              totalTime: Date.now() - dbInsertStart,
            })
          } catch (reviewError) {
            console.error('❌ Gemini review + translation failed:', reviewError)

            // 검수 및 번역 실패 시 상태를 pending으로 되돌림
            await supabase.from('transcripts').update({ 
              review_status: 'failed',
              translation_status: 'failed' 
            }).eq('id', transcriptId)

            // 검수 및 번역 실패해도 transcript 저장은 성공으로 처리
            return NextResponse.json({
              success: true,
              transcriptId: transcriptId,
              originalText: cleanedTranscript,
              reviewCompleted: false,
              translationCompleted: false,
              reviewError: reviewError instanceof Error ? reviewError.message : 'Unknown error',
              note: 'Transcript saved but review + translation failed',
            })
          }
        }

        return NextResponse.json({
          success: true,
          message: isPartial ? 'Partial transcript received' : 'Final transcript processed',
        })

      case 'end':
        // End session and clean up memory
        const ended = activeSessions.delete(sessionId)
        console.log(`🧹 Session ${sessionId} memory cleanup (${ended ? 'removed' : 'not found'})`)
        return NextResponse.json({ success: true, cleaned: ended })

      default:
        return NextResponse.json({ error: "Invalid type. Use 'start', 'transcript', or 'end'" }, { status: 400 })
    }
  } catch (error) {
    console.error('❌ STT Stream error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// GET endpoint to retrieve current session transcript
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const sessionId = searchParams.get('sessionId')

    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID is required' }, { status: 400 })
    }

    const session = activeSessions.get(sessionId)
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    return NextResponse.json({
      transcript: session.fullTranscript,
      lastUpdate: session.lastUpdate,
      length: session.fullTranscript.length,
    })
  } catch (error) {
    console.error('STT Stream GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
