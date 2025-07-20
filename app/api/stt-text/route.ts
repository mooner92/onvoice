import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const text = formData.get('text') as string
    const sessionId = formData.get('sessionId') as string
    const language = (formData.get('language') as string) || 'auto'
    const model = (formData.get('model') as string) || 'whisper-1'
    const responseFormat = (formData.get('response_format') as string) || 'verbose_json'
    const temperature = (formData.get('temperature') as string) || '0'
    const prompt = (formData.get('prompt') as string) || ''
    const enableGrammarCheck = formData.get('enableGrammarCheck') === 'true'

    console.log('🎯 Text-based STT API called with:', {
      textLength: text?.length,
      sessionId,
      language,
      model,
      responseFormat,
      temperature,
      hasPrompt: !!prompt,
      enableGrammarCheck,
      timestamp: new Date().toLocaleTimeString(),
    })

    if (!text || !sessionId) {
      console.error('Missing required data:', {
        text: !!text,
        sessionId: !!sessionId,
      })
      return NextResponse.json({ error: 'Text and session ID are required' }, { status: 400 })
    }

    // Check if text has content
    if (text.trim().length === 0) {
      console.log('Empty text received')
      return NextResponse.json({ transcript: '', confidence: 0 }, { status: 200 })
    }

    console.log('Processing text:', {
      length: text.length,
      text: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
      targetLanguage: language,
    })

    let transcript = text.trim()
    let confidence = 0.9
    let correctedText = ''

    try {
      // Step 1: Use Gemini for grammar correction and improvement (if enabled)
      if (enableGrammarCheck && transcript) {
        console.log('🔧 Using Gemini for grammar correction and improvement...')
        
        try {
          // Use Gemini API for grammar correction
          const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              contents: [{
                parts: [{
                  text: `You are a professional presentation transcription editor. Your task is to:
1. Correct any grammar, spelling, or punctuation errors
2. Improve sentence structure and clarity for presentation flow
3. Maintain the original meaning and tone
4. Keep the text natural and presentation-ready
5. Preserve technical terms and proper nouns
6. Add proper punctuation where missing
7. 🌍 Preserve mixed language content exactly as spoken
8. Keep words in their original language (don't translate)
9. Maintain the natural flow of mixed language speech
10. Respect the primary and secondary language settings
11. 🚫 NEVER convert Korean words to English romanization
12. 🚫 NEVER convert English words to Korean
13. ✅ Keep Korean as Korean: "안녕하세요" not "annyeonghaseyo"
14. ✅ Keep English as English: "hello" not "헬로"
15. 🎤 Optimize for presentation delivery and audience engagement
16. 📝 Ensure smooth transitions between English and Korean

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

          if (geminiResponse.ok) {
            const geminiData = await geminiResponse.json()
            correctedText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || transcript
            console.log('✅ Gemini grammar correction completed')
          } else {
            console.error('Gemini API error:', await geminiResponse.text())
            correctedText = transcript // Fallback to original
          }
        } catch (geminiError) {
          console.error('Gemini API request failed:', geminiError)
          correctedText = transcript // Fallback to original
        }
      } else {
        correctedText = transcript
      }

    } catch (error) {
      console.error('Text processing failed:', error)
      transcript = `[Text Processing Error - ${new Date().toLocaleTimeString()}]`
      correctedText = transcript
      confidence = 0.1
    }

    // Save to Supabase (only if sessionId is valid UUID)
    if (transcript && transcript.trim() && !transcript.includes('[Text Processing Error')) {
      // UUID 형식 검증
      const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)
      
      if (isValidUUID) {
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
        )

                  // 🆕 테스트용 세션 생성 (sessions 테이블에 없을 경우)
          try {
            const { data: sessionData, error: sessionError } = await supabase
              .from('sessions')
              .select('id')
              .eq('id', sessionId)
              .single()

            if (sessionError && sessionError.code === 'PGRST116') {
              // 세션이 없으면 테스트용 세션 생성 (updated_at 컬럼 제외)
              console.log('🆕 Creating test session:', sessionId)
              const { error: insertError } = await supabase.from('sessions').insert({
                id: sessionId,
                title: 'Test Session',
                created_at: new Date().toISOString(),
                // updated_at 컬럼 제외 (스키마 캐시 문제)
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

        // Try to insert with corrected_text, fallback to original_text only if column doesn't exist
        let transcriptId: string | null = null
        
        try {
          const { data: insertData, error: dbError } = await supabase.from('transcripts').insert([
            {
              session_id: sessionId,
              timestamp: new Date().toLocaleTimeString(),
              original_text: transcript,
              corrected_text: correctedText,
              created_at: new Date().toISOString(),
            },
          ]).select('id')

          if (dbError) {
            console.log('Database error with corrected_text:', dbError)
            
            // Fallback: corrected_text 컬럼이 없는 경우
            try {
              const { data: fallbackData, error: fallbackError } = await supabase.from('transcripts').insert([
                {
                  session_id: sessionId,
                  timestamp: new Date().toLocaleTimeString(),
                  original_text: transcript,
                  created_at: new Date().toISOString(),
                },
              ]).select('id')

              if (fallbackError) {
                console.log('Fallback database error:', fallbackError)
              } else {
                transcriptId = fallbackData?.[0]?.id || null
                console.log('✅ Text saved to database (fallback):', transcriptId)
              }
            } catch (fallbackError) {
              console.error('Fallback database operation failed:', fallbackError)
            }
          } else {
            transcriptId = insertData?.[0]?.id || null
            console.log('✅ Text saved to database:', transcriptId)
          }
        } catch (dbError) {
          console.error('Database operation failed:', dbError)
        }
      } else {
        console.log('⚠️ Invalid session ID format, skipping database save')
      }
    }

    return NextResponse.json({
      transcript: correctedText || transcript,
      originalTranscript: transcript,
      confidence,
      duration: 0,
      grammarCorrected: enableGrammarCheck && correctedText !== transcript,
    })

  } catch (error) {
    console.error('Text-based STT API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 