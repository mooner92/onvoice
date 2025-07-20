import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { addTranslationJob } from '@/lib/translation-queue'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const audio = formData.get('audio') as File
    const sessionId = formData.get('sessionId') as string
    const language = (formData.get('language') as string) || 'auto'
    const model = (formData.get('model') as string) || 'whisper-1'
    const responseFormat = (formData.get('response_format') as string) || 'verbose_json'
    const temperature = (formData.get('temperature') as string) || '0'
    const prompt = (formData.get('prompt') as string) || ''
    const enableGrammarCheck = formData.get('enableGrammarCheck') === 'true'
    const useGemini = formData.get('useGemini') === 'true'

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
      timestamp: new Date().toLocaleTimeString(),
    })

    if (!audio || !sessionId) {
      console.error('Missing required data:', {
        audio: !!audio,
        sessionId: !!sessionId,
      })
      return NextResponse.json({ error: 'Audio file and session ID are required' }, { status: 400 })
    }

    // Check if audio file has content
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

    // Check if OpenAI API key is available
    if (!process.env.OPENAI_API_KEY) {
      console.log('OpenAI API key not configured, using placeholder')

      // Generate realistic placeholder text that varies
      const placeholderTexts = [
        "Welcome to today's lecture on artificial intelligence.",
        'Machine learning is transforming various industries.',
        'Deep learning models require large amounts of data.',
        'Natural language processing enables human-computer interaction.',
        'Computer vision allows machines to interpret visual information.',
        'Reinforcement learning helps AI agents learn through trial and error.',
        'Neural networks are inspired by the human brain structure.',
        'Data preprocessing is crucial for model performance.',
        'Feature engineering can significantly improve results.',
        'Cross-validation helps prevent overfitting in models.',
      ]

      // Use timestamp to create some variation but consistency within same session
      const textIndex = Math.floor(Date.now() / 10000) % placeholderTexts.length
      const randomText = placeholderTexts[textIndex]

      return NextResponse.json({
        transcript: randomText,
        confidence: 0.9,
        isPlaceholder: true,
        message: 'Using placeholder - configure OPENAI_API_KEY for real STT',
      })
    }

    let transcript = ''
    let confidence = 0
    let correctedText = ''

    try {
      // Step 1: Use Whisper for transcription
      const whisperFormData = new FormData()
      
      // 🎯 정확한 파일 확장자 감지
      const getFileExtension = (mimeType: string, fileName?: string) => {
        // MIME 타입 기반 확장자 매핑 (Whisper API 호환만)
        const mimeToExtension: { [key: string]: string } = {
          'audio/webm': 'webm',
          'audio/mp4': 'm4a',
          'audio/wav': 'wav',
          'audio/ogg': 'ogg',
          'audio/mp3': 'mp3',
          'audio/mpeg': 'mp3',
          'audio/mpga': 'mp3'
        }
        
        // 🚫 Whisper API가 지원하지 않는 형식 필터링
        if (mimeType.includes('codecs=opus') || mimeType.includes('codecs=vorbis')) {
          console.log(`⚠️ Unsupported codec detected: ${mimeType}, using fallback`)
          mimeType = mimeType.split(';')[0] // codecs 부분 제거
        }
        
        // 파일명에서 확장자 추출 시도
        if (fileName) {
          const nameExtension = fileName.split('.').pop()?.toLowerCase()
          if (nameExtension && ['webm', 'm4a', 'wav', 'ogg', 'mp3'].includes(nameExtension)) {
            console.log(`🎵 Using extension from filename: ${nameExtension}`)
            return nameExtension
          }
        }
        
        // MIME 타입에서 확장자 추출
        const extension = mimeToExtension[mimeType] || 'webm'
        console.log(`🎵 Using extension from MIME type: ${mimeType} → ${extension}`)
        return extension
      }
      
      const fileExtension = getFileExtension(audio.type, audio.name)
      
      console.log(`🎵 Audio file analysis:`, {
        size: audio.size,
        type: audio.type,
        name: audio.name,
        extension: fileExtension,
        targetLanguage: language,
      })
      
      // 🚫 파일 크기 및 형식 검증 강화
      if (audio.size < 5000) { // 최소 크기 증가
        console.log('⚠️ Audio file too small, skipping...')
        return NextResponse.json({ 
          transcript: '', 
          confidence: 0, 
          error: 'Audio file too small' 
        })
      }
      
      // 🚫 Whisper API 지원 형식 검증
      const supportedFormats = ['webm', 'm4a', 'mp3', 'wav', 'ogg']
      if (!supportedFormats.includes(fileExtension)) {
        console.log(`⚠️ Unsupported format: ${fileExtension}, skipping...`)
        return NextResponse.json({ 
          transcript: '', 
          confidence: 0, 
          error: `Unsupported audio format: ${fileExtension}` 
        })
      }
      
      // 🚫 파일 크기 상한 검증 (너무 큰 파일 방지)
      if (audio.size > 25000000) { // 25MB
        console.log('⚠️ Audio file too large, skipping...')
        return NextResponse.json({ 
          transcript: '', 
          confidence: 0, 
          error: 'Audio file too large' 
        })
      }
      
      // 🎯 Whisper API 호출 준비
      whisperFormData.append('file', audio, `audio.${fileExtension}`)
      whisperFormData.append('model', model)

      // 언어 설정 (ISO-639-1 형식으로 변환)
      if (language && language !== 'auto') {
        const languageMap: { [key: string]: string } = {
          'en-US': 'en',
          'en-GB': 'en',
          'ko-KR': 'ko',
          'ja-JP': 'ja',
          'zh-CN': 'zh',
          'es-ES': 'es',
          'fr-FR': 'fr',
          'de-DE': 'de',
        }
        
        const isoLanguage = languageMap[language] || language.split('-')[0]
        whisperFormData.append('language', isoLanguage)
        console.log(`🌍 Using language hint: ${isoLanguage} (converted from ${language})`)
      } else {
        console.log('🔍 Using auto language detection for best results')
      }

      whisperFormData.append('response_format', responseFormat)
      whisperFormData.append('temperature', temperature)

      // 컨텍스트 프롬프트 추가
      if (prompt) {
        whisperFormData.append('prompt', prompt)
        console.log('📝 Using context prompt for better accuracy')
      }

      console.log('🚀 Calling Whisper API...')
      const whisperResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: whisperFormData,
      })

      if (!whisperResponse.ok) {
        const errorText = await whisperResponse.text()
        console.error('Whisper API error:', errorText)
        
        // 🚫 재시도 로직 제거 - 프론트엔드에서 이미 올바른 형식으로 변환됨
        console.log('❌ Whisper API failed, skipping chunk')
        return NextResponse.json({ 
          transcript: '', 
          confidence: 0, 
          error: 'Whisper API failed' 
        })
      } else {
        const whisperData = await whisperResponse.json()
        transcript = whisperData.text?.trim() || ''
        confidence = whisperData.avg_logprob || 0.9
        console.log('✅ Whisper API success:', { transcript, confidence })
      }

      // Step 2: Use Gemini for grammar correction and improvement (if enabled)
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
      console.error('API request failed:', error)
      transcript = `[STT Error - Audio at ${new Date().toLocaleTimeString()}]`
      correctedText = transcript
      confidence = 0.1
    }

    // Save to Supabase (only if sessionId is valid UUID)
    if (transcript && transcript.trim() && !transcript.includes('[Audio received at')) {
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
            // 세션이 없으면 테스트용 세션 생성
            console.log('🆕 Creating test session:', sessionId)
            await supabase.from('sessions').insert({
              id: sessionId,
              title: 'Test Session',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
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
            console.error('Database error with corrected_text:', dbError)
            
            // Fallback: insert without corrected_text
            const { data: fallbackData, error: fallbackError } = await supabase.from('transcripts').insert([
              {
                session_id: sessionId,
                timestamp: new Date().toLocaleTimeString(),
                original_text: transcript,
                created_at: new Date().toISOString(),
              },
            ]).select('id')
            
            if (fallbackError) {
              console.error('Fallback database error:', fallbackError)
            } else if (fallbackData && fallbackData[0]) {
              transcriptId = fallbackData[0].id
            }
          } else if (insertData && insertData[0]) {
            transcriptId = insertData[0].id
          }

          // 번역 큐에 작업 추가 (모든 지원 언어로 번역)
          if (transcriptId && correctedText) {
            console.log('🔄 Adding translation jobs for all supported languages...')
            
            // 지원되는 모든 언어에 대해 번역 작업 추가
            const supportedLanguages = ['ko', 'zh', 'hi', 'ja', 'es', 'fr', 'de']
            
            for (const lang of supportedLanguages) {
              addTranslationJob(correctedText, lang, sessionId, 1, transcriptId)
            }
            
            console.log(`📝 Added ${supportedLanguages.length} translation jobs for transcript ID: ${transcriptId}`)
          }
        } catch (error) {
          console.error('Database insertion error:', error)
        }
      } else {
        console.log('⚠️ Skipping database save - invalid sessionId format:', sessionId)
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
    console.error('STT API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
