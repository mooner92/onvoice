import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { addTranslationJob } from '@/lib/translation-queue'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const audio = formData.get('audio') as File
    const sessionId = formData.get('sessionId') as string
    const language = (formData.get('language') as string) || 'auto'
    const model = (formData.get('model') as string) || 'gemini-1.5-pro'
    const responseFormat = (formData.get('response_format') as string) || 'verbose_json'
    const temperature = (formData.get('temperature') as string) || '0'
    const prompt = (formData.get('prompt') as string) || ''
    const enableGrammarCheck = formData.get('enableGrammarCheck') === 'true'

    console.log('🎯 Enhanced STT API called with:', {
      audioSize: audio?.size,
      audioType: audio?.type,
      sessionId,
      language,
      model,
      responseFormat,
      temperature,
      hasPrompt: !!prompt,
      enableGrammarCheck,
      timestamp: new Date().toISOString(),
    })

    if (!audio || !sessionId) {
      console.error('Missing required data:', {
        audio: !!audio,
        sessionId: !!sessionId,
      })
      return NextResponse.json({ error: 'Audio file and session ID are required' }, { status: 400 })
    }

    // Check if audio has content
    if (audio.size === 0) {
      console.log('Empty audio file received')
      return NextResponse.json({ transcript: '', confidence: 0 }, { status: 200 })
    }

    console.log('Processing audio file:', {
      size: audio.size,
      type: audio.type,
      name: audio.name,
      targetLanguage: language,
    })

    let transcript = ''
    let confidence = 0
    let correctedText = ''

    try {
      // Step 1: Use Gemini for audio transcription
      console.log('🎵 Audio file analysis:', {
        size: audio.size,
        type: audio.type,
        name: audio.name,
        targetLanguage: language,
      })
      
      // 🚫 파일 크기 검증 (매우 작은 크기만 제외)
      if (audio.size < 50) {
        console.log('⚠️ Audio file too small, skipping...')
        return NextResponse.json({ 
          transcript: '', 
          confidence: 0, 
          error: 'Audio file too small' 
        })
      }
      
      if (audio.size > 25000000) { // 25MB
        console.log('⚠️ Audio file too large, skipping...')
        return NextResponse.json({ 
          transcript: '', 
          confidence: 0, 
          error: 'Audio file too large' 
        })
      }

      // 🎯 Whisper API 호출 준비
      const audioBuffer = await audio.arrayBuffer()
      
      // 오디오 파일 크기 체크 (Whisper API 제한: 25MB)
      const audioSizeInMB = audioBuffer.byteLength / (1024 * 1024)
      if (audioSizeInMB > 25) {
        console.log(`⚠️ Audio file too large (${audioSizeInMB.toFixed(2)}MB), skipping`)
        return NextResponse.json({ 
          transcript: '', 
          confidence: 0, 
          error: 'Audio file too large' 
        })
      }

      // 언어 설정
      const languageHint = language && language !== 'auto' ? 
        language.split('-')[0] : 'en'
      
      console.log('🌍 Using language hint:', languageHint)
      console.log('📝 Using context prompt for better accuracy')
      console.log('🚀 Calling Whisper API...')

      // Whisper API 호출 (오디오 전사용)
      const openaiApiKey = process.env.OPENAI_API_KEY
      if (!openaiApiKey) {
        console.log('❌ OpenAI API key not found, skipping audio transcription')
        return NextResponse.json({ 
          transcript: '', 
          confidence: 0, 
          error: 'OpenAI API key not configured' 
        })
      }

      // 오디오 파일을 실제 형식으로 변환
      const audioBlob = new Blob([audioBuffer], { type: audio.type })
      
      // 파일 확장자 결정
      let fileExtension = 'webm'
      if (audio.type.includes('mp3') || audio.type.includes('mpeg')) {
        fileExtension = 'mp3'
      } else if (audio.type.includes('wav')) {
        fileExtension = 'wav'
      } else if (audio.type.includes('m4a') || audio.type.includes('mp4')) {
        fileExtension = 'm4a'
      }
      
      const formData = new FormData()
      formData.append('file', audioBlob, `audio.${fileExtension}`)
      formData.append('model', 'whisper-1')
      formData.append('language', languageHint)
      formData.append('response_format', 'verbose_json')
      if (prompt) {
        formData.append('prompt', prompt)
      }

      const whisperResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
        },
        body: formData,
      })

      if (!whisperResponse.ok) {
        const errorText = await whisperResponse.text()
        console.error('Whisper API error:', errorText)
        
        console.log('❌ Whisper API failed, skipping chunk')
        return NextResponse.json({ 
          transcript: '', 
          confidence: 0, 
          error: 'Whisper API failed' 
        })
      } else {
        const whisperData = await whisperResponse.json()
        transcript = whisperData.text?.trim() || ''
        confidence = whisperData.segments?.[0]?.avg_logprob || 0.9
        console.log('✅ Whisper API success:', { transcript, confidence })
      }

      // Step 2: Use Gemini for grammar correction and improvement (if enabled)
      if (enableGrammarCheck && transcript) {
        console.log('🔧 Using Gemini for grammar correction and improvement...')
        
        try {
          // Use Gemini API for grammar correction
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
      } else {
        correctedText = transcript
      }

    } catch (error) {
      console.error('Audio processing failed:', error)
      transcript = `[Audio Processing Error - ${new Date().toLocaleTimeString()}]`
      correctedText = transcript
      confidence = 0.1
    }

    // Save to Supabase (only if sessionId is valid UUID)
    if (transcript && transcript.trim() && !transcript.includes('[Audio Processing Error')) {
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

        // 🚫 강력한 DB 중복 체크 (정확한 매칭 + 유사한 텍스트)
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
    console.error('❌ STT API error:', error)
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
