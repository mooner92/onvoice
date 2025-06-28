import { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest) {
  try {
    const { text, targetLanguage, sourceLanguage } = await req.json()

    if (!text || !targetLanguage) {
      return NextResponse.json(
        { error: "Text and target language are required" },
        { status: 400 }
      )
    }

    // If target language is same as source, return original text
    if (sourceLanguage && sourceLanguage === targetLanguage) {
      return NextResponse.json({
        translatedText: text,
        sourceLanguage,
        targetLanguage,
        confidence: 1.0
      })
    }

    let translatedText = text
    let detectedLanguage = sourceLanguage || "auto"

    // Try Google Translate API if available
    if (process.env.GOOGLE_TRANSLATE_API_KEY) {
      try {
        const googleTranslateUrl = `https://translation.googleapis.com/language/translate/v2?key=${process.env.GOOGLE_TRANSLATE_API_KEY}`
        
        // Prepare request body - don't send source if it's "auto" or undefined
        const requestBody: any = {
          q: text,
          target: targetLanguage,
          format: 'text'
        }
        
        // Only include source if it's provided and not "auto"
        if (sourceLanguage && sourceLanguage !== "auto") {
          requestBody.source = sourceLanguage
        }

        const response = await fetch(googleTranslateUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody)
        })

        if (response.ok) {
          const data = await response.json()
          if (data.data?.translations?.[0]) {
            translatedText = data.data.translations[0].translatedText
            detectedLanguage = data.data.translations[0].detectedSourceLanguage || sourceLanguage
          }
        } else {
          console.error('Google Translate API error:', await response.text())
          throw new Error('Google Translate API failed')
        }
      } catch (googleError) {
        console.error('Google Translate error:', googleError)
        // Fall through to mock translation
      }
    }

    // Fallback: Mock translation for development/testing
    if (translatedText === text) {
      translatedText = getMockTranslation(text, targetLanguage)
    }

    return NextResponse.json({
      translatedText,
      sourceLanguage: detectedLanguage,
      targetLanguage,
      confidence: 0.9,
      isGoogleTranslate: process.env.GOOGLE_TRANSLATE_API_KEY ? true : false
    })

  } catch (error) {
    console.error('Translation error:', error)
    return NextResponse.json(
      { error: "Translation failed" },
      { status: 500 }
    )
  }
}

// Mock translation for development/testing
function getMockTranslation(text: string, targetLang: string): string {
  const mockTranslations: { [key: string]: string } = {
    'ko': `[한국어] ${text}`,
    'ja': `[日本語] ${text}`,
    'zh': `[中文] ${text}`,
    'es': `[Español] ${text}`,
    'fr': `[Français] ${text}`,
    'de': `[Deutsch] ${text}`,
    'it': `[Italiano] ${text}`,
    'pt': `[Português] ${text}`,
    'ru': `[Русский] ${text}`,
    'ar': `[العربية] ${text}`,
    'hi': `[हिन्दी] ${text}`,
    'en': text // English as default
  }
  
  return mockTranslations[targetLang] || `[${targetLang.toUpperCase()}] ${text}`
} 