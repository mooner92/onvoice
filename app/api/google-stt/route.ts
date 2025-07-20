import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const audio = formData.get('audio') as File
    const sessionId = formData.get('sessionId') as string
    const language = (formData.get('language') as string) || 'en-US'
    const enableGrammarCheck = formData.get('enableGrammarCheck') === 'true'

    console.log('🎯 Google STT API called with:', {
      audioSize: audio?.size,
      audioType: audio?.type,
      sessionId,
      language,
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

    console.log('Processing audio file with Google STT:', {
      size: audio.size,
      type: audio.type,
      name: audio.name,
      targetLanguage: language,
    })

    // Check if Google Cloud credentials are available
    if (!process.env.GOOGLE_CLOUD_CREDENTIALS) {
      console.log('Google Cloud credentials not configured, using placeholder')

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
        message: 'Using placeholder - configure GOOGLE_CLOUD_CREDENTIALS for real STT',
      })
    }

    let transcript = ''
    let confidence = 0
    let correctedText = ''

    try {
      // Step 1: Use Google Speech-to-Text API
      console.log('🔍 Using Google Speech-to-Text API...')
      
      // Convert audio to base64
      const audioBuffer = await audio.arrayBuffer()
      const audioBase64 = Buffer.from(audioBuffer).toString('base64')

      // Prepare request for Google Speech-to-Text
      const googleSTTRequest = {
        config: {
          encoding: 'WEBM_OPUS',
          sampleRateHertz: 16000,
          languageCode: language,
          enableAutomaticPunctuation: true,
          enableWordTimeOffsets: false,
          enableWordConfidence: true,
          model: 'latest_long',
          useEnhanced: true,
        },
        audio: {
          content: audioBase64,
        },
      }

      // Get access token for Google Cloud
      const credentials = JSON.parse(process.env.GOOGLE_CLOUD_CREDENTIALS)
      
      // For now, we'll use a simplified approach
      // In production, you'd need proper OAuth2 token management
      const googleSTTResponse = await fetch(
        `https://speech.googleapis.com/v1/speech:recognize?key=${process.env.GOOGLE_CLOUD_API_KEY}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(googleSTTRequest),
        }
      )

      if (!googleSTTResponse.ok) {
        const errorText = await googleSTTResponse.text()
        console.error('Google STT API error:', errorText)
        transcript = `[Audio received at ${new Date().toLocaleTimeString()}]`
        confidence = 0.5
      } else {
        const googleSTTData = await googleSTTResponse.json()
        
        if (googleSTTData.results && googleSTTData.results.length > 0) {
          transcript = googleSTTData.results[0].alternatives[0].transcript || ''
          confidence = googleSTTData.results[0].alternatives[0].confidence || 0.9
        } else {
          transcript = ''
          confidence = 0
        }
      }

      // Step 2: Use Gemini for grammar correction and improvement (if enabled)
      if (enableGrammarCheck && transcript) {
        console.log('🔧 Using Gemini for grammar correction and improvement...')
        
        try {
          const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${process.env.GEMINI_API_KEY}`, {
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

    // Save to Supabase (save both original and corrected versions)
    if (transcript) {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      )

      const { error: dbError } = await supabase.from('transcripts').insert([
        {
          session_id: sessionId,
          timestamp: new Date().toLocaleTimeString(),
          original_text: transcript,
          corrected_text: correctedText,
          created_at: new Date().toISOString(),
        },
      ])

      if (dbError) {
        console.error('Database error:', dbError)
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
    console.error('Google STT API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
} 