import { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest) {
  try {
    const { text, targetLanguage, sourceLanguage = 'auto' } = await req.json()

    console.log('Translation API called:', {
      textLength: text?.length,
      targetLanguage,
      sourceLanguage,
      timestamp: new Date().toLocaleTimeString()
    })

    if (!text || !targetLanguage) {
      return NextResponse.json(
        { error: "Text and target language are required" },
        { status: 400 }
      )
    }

    // Skip translation if target is English and source appears to be English
    if (targetLanguage === 'en' && /^[a-zA-Z\s.,!?'-]+$/.test(text)) {
      return NextResponse.json({
        translatedText: text,
        sourceLanguage: 'en',
        confidence: 1.0,
        provider: 'skip'
      })
    }

    let translatedText = text
    let confidence = 0.9
    let provider = 'gpt'

    // Try GPT-4 for translation first (faster and often better quality)
    if (process.env.OPENAI_API_KEY) {
      try {
        const languageNames: { [key: string]: string } = {
          'ko': 'Korean',
          'ja': 'Japanese', 
          'zh': 'Chinese',
          'es': 'Spanish',
          'fr': 'French',
          'de': 'German',
          'it': 'Italian',
          'pt': 'Portuguese',
          'ru': 'Russian',
          'ar': 'Arabic',
          'hi': 'Hindi',
          'en': 'English'
        }

        const targetLangName = languageNames[targetLanguage] || targetLanguage
        
        const prompt = `Translate the following text to ${targetLangName}. Only return the translation, no explanations:

${text}`

        console.log(`🤖 Using GPT-4 for translation to ${targetLangName}`)

        const gptResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini', // Faster and cheaper than gpt-4
            messages: [
              {
                role: 'system',
                content: 'You are a professional translator. Provide natural, accurate translations without explanations.'
              },
              {
                role: 'user',
                content: prompt
              }
            ],
            max_tokens: text.length * 2, // Reasonable limit
            temperature: 0.3, // Low temperature for consistent translations
          }),
        })

        if (gptResponse.ok) {
          const gptData = await gptResponse.json()
          translatedText = gptData.choices?.[0]?.message?.content?.trim() || text
          console.log(`✅ GPT translation completed: ${text.substring(0, 50)}... → ${translatedText.substring(0, 50)}...`)
        } else {
          console.error('GPT translation failed:', await gptResponse.text())
          throw new Error('GPT translation failed')
        }

      } catch (gptError) {
        console.error('GPT translation error:', gptError)
        // Fall back to Google Translate
        provider = 'google-fallback'
        
        if (process.env.GOOGLE_TRANSLATE_API_KEY) {
          try {
            console.log('🔄 Falling back to Google Translate')
            
            const googleResponse = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${process.env.GOOGLE_TRANSLATE_API_KEY}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                q: text,
                target: targetLanguage,
                format: 'text'
              }),
            })

            if (googleResponse.ok) {
              const googleData = await googleResponse.json()
              translatedText = googleData.data.translations[0].translatedText
              confidence = 0.8
            } else {
              throw new Error('Google Translate failed')
            }
          } catch (googleError) {
            console.error('Google Translate error:', googleError)
            // Final fallback to mock translation
            provider = 'mock'
            translatedText = `[${targetLanguage.toUpperCase()}] ${text}`
            confidence = 0.1
          }
        } else {
          // No Google API key, use mock
          provider = 'mock'
          translatedText = `[${targetLanguage.toUpperCase()}] ${text}`
          confidence = 0.1
        }
      }
    } else {
      // No OpenAI API key, try Google directly
      if (process.env.GOOGLE_TRANSLATE_API_KEY) {
        try {
          console.log('🌐 Using Google Translate (no OpenAI key)')
          
          const googleResponse = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${process.env.GOOGLE_TRANSLATE_API_KEY}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              q: text,
              target: targetLanguage,
              format: 'text'
            }),
          })

          if (googleResponse.ok) {
            const googleData = await googleResponse.json()
            translatedText = googleData.data.translations[0].translatedText
            provider = 'google'
            confidence = 0.8
          } else {
            throw new Error('Google Translate failed')
          }
        } catch (googleError) {
          console.error('Google Translate error:', googleError)
          provider = 'mock'
          translatedText = `[${targetLanguage.toUpperCase()}] ${text}`
          confidence = 0.1
        }
      } else {
        // No API keys available
        provider = 'mock'
        translatedText = `[${targetLanguage.toUpperCase()}] ${text}`
        confidence = 0.1
      }
    }

    return NextResponse.json({
      translatedText,
      sourceLanguage,
      targetLanguage,
      confidence,
      provider,
      originalLength: text.length,
      translatedLength: translatedText.length
    })

  } catch (error) {
    console.error("Translation API error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
} 