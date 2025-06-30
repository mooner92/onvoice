import { NextRequest, NextResponse } from "next/server"
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

// Language code mappings for better accuracy
const LANGUAGE_NAMES: { [key: string]: string } = {
  'ko': 'Korean',
  'en': 'English', 
  'ja': 'Japanese',
  'zh': 'Chinese',
  'es': 'Spanish',
  'fr': 'French',
  'de': 'German',
  'pt': 'Portuguese',
  'ru': 'Russian',
  'ar': 'Arabic'
}

// Cache for translations to avoid duplicate API calls
const translationCache = new Map<string, string>()

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

    // Skip translation if target is English and text is already English
    if (targetLanguage === 'en' && /^[a-zA-Z0-9\s.,!?'"()-]+$/.test(text)) {
      return NextResponse.json({ translatedText: text })
    }

    // Check cache first
    const cacheKey = `${text.trim()}-${targetLanguage}`
    if (translationCache.has(cacheKey)) {
      return NextResponse.json({ 
        translatedText: translationCache.get(cacheKey),
        cached: true
      })
    }

    const targetLanguageName = LANGUAGE_NAMES[targetLanguage] || targetLanguage

    // Use GPT-4o-mini for fast, cost-effective translation
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a professional translator. Translate the given text to ${targetLanguageName}. 

RULES:
- Provide ONLY the translated text, no explanations
- Maintain the same tone and style  
- Keep technical terms accurate
- If the text is already in ${targetLanguageName}, return it as-is
- For partial sentences or incomplete thoughts, translate what's available naturally`
          },
          {
            role: "user", 
            content: text
          }
        ],
        max_tokens: Math.min(1000, text.length * 3),
        temperature: 0.1, // Low temperature for consistent translation
        stream: false
      })

      const translatedText = completion.choices[0]?.message?.content?.trim() || text

      // Cache the result
      translationCache.set(cacheKey, translatedText)

      // Clear cache if it gets too large (keep last 1000 entries)
      if (translationCache.size > 1000) {
        const entries = Array.from(translationCache.entries())
        translationCache.clear()
        entries.slice(-500).forEach(([key, value]) => {
          translationCache.set(key, value)
        })
      }

      return NextResponse.json({ 
        translatedText,
        model: 'gpt-4o-mini'
      })

    } catch (openaiError) {
      console.error('OpenAI translation error:', openaiError)
      
      // Fallback to Google Translate API if available
      if (process.env.GOOGLE_TRANSLATE_API_KEY) {
        try {
          const googleResponse = await fetch(
            `https://translation.googleapis.com/language/translate/v2?key=${process.env.GOOGLE_TRANSLATE_API_KEY}`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                q: text,
                target: targetLanguage,
                format: 'text'
              })
            }
          )

          if (googleResponse.ok) {
            const googleData = await googleResponse.json()
            const translatedText = googleData.data.translations[0].translatedText
            
            // Cache the result
            translationCache.set(cacheKey, translatedText)
            
            return NextResponse.json({ 
              translatedText,
              model: 'google-translate'
            })
          }
        } catch (googleError) {
          console.error('Google Translate error:', googleError)
        }
      }

      // Last resort: return mock translation with error indicator
      return NextResponse.json({ 
        translatedText: `[Translation unavailable] ${text}`,
        error: 'Translation service temporarily unavailable'
      })
    }

  } catch (error) {
    console.error('Translation API error:', error)
    return NextResponse.json(
      { error: 'Translation failed' },
      { status: 500 }
    )
  }
} 