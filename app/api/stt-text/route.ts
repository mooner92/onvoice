import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { addTranslationJob } from '@/lib/translation-queue'

export async function POST(req: NextRequest) {
  try {
    const { text, sessionId, language, enableGrammarCheck = true } = await req.json()

    if (!text || !text.trim()) {
      return NextResponse.json({ 
        error: 'Text is required' 
      }, { status: 400 })
    }

    if (!sessionId || !sessionId.trim()) {
      return NextResponse.json({ 
        error: 'Session ID is required' 
      }, { status: 400 })
    }

    console.log('🎯 STT Text API called with:', {
      textLength: text.length,
      sessionId: sessionId.substring(0, 8) + '...',
      language,
      enableGrammarCheck,
      timestamp: new Date().toLocaleTimeString()
    })

    const transcript = text.trim()
    let correctedText = transcript
    const confidence = 0.9

    // 🎯 Gemini로 문법 교정 (선택사항)
    if (enableGrammarCheck && transcript) {
      console.log('🔧 Using Gemini for grammar correction and improvement...')
      
      try {
        const correctionResponse = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: `You are a professional transcription editor. Your task is to:
1. Correct any grammar, spelling, or punctuation errors
2. Improve sentence structure and clarity
3. Maintain the original meaning and tone
4. Keep the text natural and conversational
5. Preserve technical terms and proper nouns
6. Add proper punctuation where missing

Return only the corrected text without explanations.

Original text: "${transcript}"`
              }]
            }],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 1000,
            }
          }),
        })

        if (correctionResponse.ok) {
          const correctionData = await correctionResponse.json()
          correctedText = correctionData.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || transcript
          console.log('✅ Gemini grammar correction completed')
        } else {
          console.error('Gemini correction API error:', await correctionResponse.text())
          correctedText = transcript
        }
      } catch (correctionError) {
        console.error('Gemini correction API request failed:', correctionError)
        correctedText = transcript
      }
    }

    // 🗄️ DB에 저장
    if (transcript && transcript.trim()) {
      // UUID 형식 검증
      const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)
      
      if (isValidUUID) {
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
        )

        // 🆕 테스트용 세션 생성 (sessions 테이블에 없을 경우)
        try {
          const { error: sessionError } = await supabase
            .from('sessions')
            .select('id')
            .eq('id', sessionId)
            .single()

          if (sessionError && sessionError.code === 'PGRST116') {
            // 세션이 없으면 테스트용 세션 생성
            console.log('🆕 Creating test session:', sessionId)
            const { error: insertError } = await supabase.from('sessions').insert({
              id: sessionId,
              title: 'Test Session',
              host_id: '00000000-0000-0000-0000-000000000000', // 기본 호스트 ID
              created_at: new Date().toISOString(),
            })
            
            if (insertError) {
              console.log('⚠️ Session creation failed:', insertError)
            } else {
              console.log('✅ Test session created successfully')
            }
          }
        } catch (sessionCreateError) {
          console.log('⚠️ Session creation failed (continuing anyway):', sessionCreateError)
        }

        // 🚫 강력한 DB 중복 체크
        const normalizedText = transcript.trim().toLowerCase()
        
        // 1. 정확한 매칭 먼저 시도
        const { data: existingTranscripts, error: checkError } = await supabase
          .from('transcripts')
          .select('id, original_text')
          .eq('session_id', sessionId)
          .eq('original_text', transcript.trim())
          .limit(1)

        if (checkError) {
          console.error('❌ DB check failed:', checkError)
        } else if (existingTranscripts && existingTranscripts.length > 0) {
          console.log('🚫 Exact duplicate found, skipping save')
          return NextResponse.json({
            transcript: correctedText || transcript,
            originalTranscript: transcript,
            confidence,
            duration: 0,
            grammarCorrected: !!correctedText && correctedText !== transcript,
            duplicate: true,
            saved: false
          })
        }

        // 2. 유사한 텍스트 체크 (90% 이상 유사도)
        const { data: similarTranscripts, error: similarError } = await supabase
          .from('transcripts')
          .select('id, original_text')
          .eq('session_id', sessionId)
          .limit(10)

        if (!similarError && similarTranscripts) {
          const isSimilar = similarTranscripts.some(existing => {
            const similarity = calculateSimilarity(normalizedText, existing.original_text.toLowerCase())
            return similarity > 0.9
          })

          if (isSimilar) {
            console.log('🚫 Similar transcript found, skipping save')
            return NextResponse.json({
              transcript: correctedText || transcript,
              originalTranscript: transcript,
              confidence,
              duration: 0,
              grammarCorrected: !!correctedText && correctedText !== transcript,
              duplicate: true,
              saved: false
            })
          }
        }

        // 🎯 DB에 저장
        const { data: insertData, error: insertError } = await supabase
          .from('transcripts')
          .insert({
            session_id: sessionId,
            timestamp: new Date().toISOString(),
            original_text: transcript.trim(),
            translated_text: correctedText || transcript.trim(),
            target_language: language,
            is_final: true,
            created_at: new Date().toISOString(),
          })
          .select('id')
          .single()

        if (insertError) {
          console.error('❌ Failed to save transcript:', insertError)
          return NextResponse.json({
            transcript: correctedText || transcript,
            originalTranscript: transcript,
            confidence,
            duration: 0,
            grammarCorrected: !!correctedText && correctedText !== transcript,
            saved: false,
            error: 'Database save failed'
          })
        }

        console.log('✅ Transcript saved to DB:', insertData?.id)

        // 🎯 번역 작업 추가
        if (insertData?.id) {
          try {
            // 🎯 주 언어를 제외한 3개 언어로 번역
            const targetLanguages = ['ko', 'zh', 'hi'].filter(lang => lang !== language.split('-')[0])
            
            for (const targetLang of targetLanguages) {
              console.log(`🔍 Debug - Adding translation job: text="${(correctedText || transcript).substring(0, 30)}...", targetLang="${targetLang}"`)
              await addTranslationJob(correctedText || transcript, targetLang, sessionId, undefined, insertData.id)
            }
            
            console.log(`✅ Translation jobs added for languages: ${targetLanguages.join(', ')}`)
          } catch (translationError) {
            console.error('❌ Failed to add translation job:', translationError)
          }
        }
      } else {
        console.log('⚠️ Invalid session ID format, skipping DB save')
      }
    }

    return NextResponse.json({
      transcript: correctedText || transcript,
      originalTranscript: transcript,
      confidence,
      duration: 0,
      grammarCorrected: !!correctedText && correctedText !== transcript,
      saved: true
    })

  } catch (error) {
    console.error('❌ STT Text API error:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

// 유사도 계산 함수
function calculateSimilarity(text1: string, text2: string): number {
  const words1 = text1.split(/\s+/)
  const words2 = text2.split(/\s+/)
  
  const set1 = new Set(words1)
  const set2 = new Set(words2)
  
  const intersection = new Set([...set1].filter(x => set2.has(x)))
  const union = new Set([...set1, ...set2])
  
  return intersection.size / union.size
} 