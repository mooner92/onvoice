import { NextRequest, NextResponse } from "next/server"

// DeepL 지원 언어 코드 매핑
const DEEPL_LANGUAGE_MAP: { [key: string]: string } = {
  'ko': 'KO',      // Korean
  'en': 'EN',      // English
  'ja': 'JA',      // Japanese
  'zh': 'ZH',      // Chinese (simplified)
  'es': 'ES',      // Spanish
  'fr': 'FR',      // French
  'de': 'DE',      // German
  'pt': 'PT-PT',   // Portuguese
  'ru': 'RU',      // Russian
  'it': 'IT',      // Italian
  'pl': 'PL',      // Polish
  'nl': 'NL',      // Dutch
  'da': 'DA',      // Danish
  'sv': 'SV',      // Swedish
  'no': 'NB',      // Norwegian
  'fi': 'FI',      // Finnish
  'cs': 'CS',      // Czech
  'sk': 'SK',      // Slovak
  'sl': 'SL',      // Slovenian
  'et': 'ET',      // Estonian
  'lv': 'LV',      // Latvian
  'lt': 'LT',      // Lithuanian
  'hu': 'HU',      // Hungarian
  'bg': 'BG',      // Bulgarian
  'ro': 'RO',      // Romanian
  'el': 'EL',      // Greek
  'tr': 'TR',      // Turkish
  'ar': 'AR',      // Arabic
  'id': 'ID',      // Indonesian
  'uk': 'UK'       // Ukrainian
}

// Google Translate 언어 코드 매핑 (fallback용)
const GOOGLE_LANGUAGE_MAP: { [key: string]: string } = {
  'ko': 'ko', 'en': 'en', 'ja': 'ja', 'zh': 'zh-cn', 'es': 'es',
  'fr': 'fr', 'de': 'de', 'pt': 'pt', 'ru': 'ru', 'it': 'it',
  'pl': 'pl', 'nl': 'nl', 'da': 'da', 'sv': 'sv', 'no': 'no',
  'fi': 'fi', 'cs': 'cs', 'sk': 'sk', 'sl': 'sl', 'et': 'et',
  'lv': 'lv', 'lt': 'lt', 'hu': 'hu', 'bg': 'bg', 'ro': 'ro',
  'el': 'el', 'tr': 'tr', 'ar': 'ar', 'id': 'id', 'uk': 'uk'
}

async function translateWithDeepL(text: string, targetLanguage: string, sourceLanguage: string = 'auto'): Promise<string | null> {
  try {
    const deeplApiKey = process.env.DEEPL_API_KEY
    if (!deeplApiKey) {
      console.log('DeepL API key not found, skipping DeepL translation')
      return null
    }

    const targetLang = DEEPL_LANGUAGE_MAP[targetLanguage]
    if (!targetLang) {
      console.log(`Unsupported language for DeepL: ${targetLanguage}`)
      return null
    }

    const url = 'https://api-free.deepl.com/v2/translate'
    const params = new URLSearchParams({
      'auth_key': deeplApiKey,
      'text': text,
      'target_lang': targetLang,
      'preserve_formatting': '1'
    })

    // 소스 언어가 지정되고 DeepL에서 지원하는 경우 추가
    if (sourceLanguage !== 'auto' && DEEPL_LANGUAGE_MAP[sourceLanguage]) {
      params.append('source_lang', DEEPL_LANGUAGE_MAP[sourceLanguage])
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('DeepL API error:', response.status, errorText)
      return null
    }

    const data = await response.json()
    if (data.translations && data.translations.length > 0) {
      const translatedText = data.translations[0].text
      console.log('✅ DeepL translation successful')
      return translatedText
    }

    return null
  } catch (error) {
    console.error('DeepL translation error:', error)
    return null
  }
}

async function translateWithGoogle(text: string, targetLanguage: string): Promise<string | null> {
  try {
    const targetLang = GOOGLE_LANGUAGE_MAP[targetLanguage]
    if (!targetLang) {
      console.log(`Unsupported language for Google Translate: ${targetLanguage}`)
      return null
    }

    const encodedText = encodeURIComponent(text)
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodedText}`
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    })
    
    if (response.ok) {
      const data = await response.json()
      if (data && data[0] && data[0][0] && data[0][0][0]) {
        console.log('✅ Google Translate fallback successful')
        return data[0][0][0]
      }
    }
    
    return null
  } catch (error) {
    console.error('Google Translate error:', error)
    return null
  }
}

function getLocalTranslation(text: string, targetLang: string): string {
  const translations: { [key: string]: { [lang: string]: string } } = {
    // 기본 인사말
    'hello': { 'ko': '안녕하세요', 'ja': 'こんにちは', 'zh': '你好', 'es': 'hola', 'fr': 'bonjour', 'de': 'hallo' },
    'welcome': { 'ko': '환영합니다', 'ja': 'ようこそ', 'zh': '欢迎', 'es': 'bienvenido', 'fr': 'bienvenue', 'de': 'willkommen' },
    'thank you': { 'ko': '감사합니다', 'ja': 'ありがとう', 'zh': '谢谢', 'es': 'gracias', 'fr': 'merci', 'de': 'danke' },
    
    // 학술 용어
    'lecture': { 'ko': '강의', 'ja': '講義', 'zh': '讲座', 'es': 'conferencia', 'fr': 'conférence', 'de': 'vorlesung' },
    'presentation': { 'ko': '발표', 'ja': 'プレゼンテーション', 'zh': '演示', 'es': 'presentación', 'fr': 'présentation', 'de': 'präsentation' },
    'session': { 'ko': '세션', 'ja': 'セッション', 'zh': '会议', 'es': 'sesión', 'fr': 'session', 'de': 'sitzung' },
    'question': { 'ko': '질문', 'ja': '質問', 'zh': '问题', 'es': 'pregunta', 'fr': 'question', 'de': 'frage' },
    'answer': { 'ko': '답변', 'ja': '答え', 'zh': '答案', 'es': 'respuesta', 'fr': 'réponse', 'de': 'antwort' },
    
    // 기술 용어
    'technology': { 'ko': '기술', 'ja': '技術', 'zh': '技术', 'es': 'tecnología', 'fr': 'technologie', 'de': 'technologie' },
    'computer': { 'ko': '컴퓨터', 'ja': 'コンピュータ', 'zh': '电脑', 'es': 'computadora', 'fr': 'ordinateur', 'de': 'computer' },
    'system': { 'ko': '시스템', 'ja': 'システム', 'zh': '系统', 'es': 'sistema', 'fr': 'système', 'de': 'system' },
    'transcription': { 'ko': '전사', 'ja': '転写', 'zh': '转录', 'es': 'transcripción', 'fr': 'transcription', 'de': 'transkription' },
    'real-time': { 'ko': '실시간', 'ja': 'リアルタイム', 'zh': '实时', 'es': 'tiempo real', 'fr': 'temps réel', 'de': 'echtzeit' }
  }
  
  let translatedText = text.toLowerCase()
  
  // 단어별 번역
  for (const [englishWord, langTranslations] of Object.entries(translations)) {
    if (langTranslations[targetLang]) {
      const regex = new RegExp(`\\b${englishWord}\\b`, 'gi')
      translatedText = translatedText.replace(regex, langTranslations[targetLang])
    }
  }
  
  // 첫 글자 대문자로 변환
  translatedText = translatedText.charAt(0).toUpperCase() + translatedText.slice(1)
  
  const languageNames: { [key: string]: string } = {
    'ko': '한국어', 'ja': '日本語', 'zh': '中文', 'es': 'Español', 
    'fr': 'Français', 'de': 'Deutsch', 'it': 'Italiano', 
    'pt': 'Português', 'ru': 'Русский', 'ar': 'العربية'
  }
  
  // 번역이 거의 이루어지지 않았다면 언어 표시 추가
  if (translatedText.toLowerCase() === text.toLowerCase()) {
    const langName = languageNames[targetLang] || targetLang.toUpperCase()
    return `[${langName}] ${text}`
  }
  
  return translatedText
}

export async function POST(req: NextRequest) {
  try {
    const { text, targetLanguage, sourceLanguage = 'auto' } = await req.json()

    console.log('🌍 Translation API called:', {
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

    // 영어로 번역 요청인데 이미 영어인 경우 건너뛰기
    if (targetLanguage === 'en' && /^[a-zA-Z0-9\s.,!?'"()-]+$/.test(text)) {
      console.log('⏭️ Skipping translation: text is already in English')
      return NextResponse.json({ translatedText: text })
    }

    // 같은 언어로 번역 요청인 경우 건너뛰기
    if (sourceLanguage === targetLanguage && sourceLanguage !== 'auto') {
      console.log('⏭️ Skipping translation: source and target are the same')
      return NextResponse.json({ translatedText: text })
    }

    console.log('🚀 Starting multi-tier translation process...')

    // 1단계: DeepL API 시도 (최고 품질)
    console.log('1️⃣ Trying DeepL API...')
    const deeplResult = await translateWithDeepL(text, targetLanguage, sourceLanguage)
    if (deeplResult) {
      return NextResponse.json({ 
        translatedText: deeplResult,
        engine: 'DeepL',
        quality: 'premium'
      })
    }

    // 2단계: Google Translate API 시도 (무료 fallback)
    console.log('2️⃣ Trying Google Translate API...')
    const googleResult = await translateWithGoogle(text, targetLanguage)
    if (googleResult) {
      return NextResponse.json({ 
        translatedText: googleResult,
        engine: 'Google Translate',
        quality: 'good'
      })
    }

    // 3단계: 로컬 번역 (마지막 fallback)
    console.log('3️⃣ Using local translation...')
    const localResult = getLocalTranslation(text, targetLanguage)
    return NextResponse.json({ 
      translatedText: localResult,
      engine: 'Local Dictionary',
      quality: 'basic'
    })

  } catch (error) {
    console.error('❌ Translation API error:', error)
    return NextResponse.json(
      { error: 'Translation failed' },
      { status: 500 }
    )
  }
} 