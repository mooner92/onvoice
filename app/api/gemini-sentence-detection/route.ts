import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { text, language, sessionId } = await request.json()

    if (!text || !text.trim()) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 })
    }

    console.log('🔧 Gemini sentence detection called:', { text, language, sessionId })

    // Gemini API 키 확인
    const geminiApiKey = process.env.GEMINI_API_KEY
    if (!geminiApiKey) {
      console.error('❌ Gemini API key not found')
      return NextResponse.json({ error: 'Gemini API key not configured' }, { status: 500 })
    }

    // 언어별 프롬프트 설정
    const languagePrompts = {
      'en-US': 'Correct the grammar, punctuation, and sentence structure of this English text. Make it a complete, well-formed sentence. Only return the corrected text, nothing else:',
      'ko-KR': '이 한국어 텍스트의 문법, 문장 부호, 문장 구조를 교정하세요. 완전하고 올바른 문장으로 만드세요. 교정된 텍스트만 반환하세요:',
      'zh-CN': '请纠正这段中文文本的语法、标点符号和句子结构。使其成为完整、正确的句子。只返回纠正后的文本：',
      'ja-JP': 'この日本語テキストの文法、句読点、文の構造を修正してください。完全で正しい文にしてください。修正されたテキストのみを返してください：',
      'es-ES': 'Corrige la gramática, puntuación y estructura de esta frase en español. Hazla una oración completa y bien formada. Solo devuelve el texto corregido:',
      'fr-FR': 'Corrigez la grammaire, la ponctuation et la structure de cette phrase française. Rendez-la une phrase complète et bien formée. Ne retournez que le texte corrigé:',
      'de-DE': 'Korrigieren Sie die Grammatik, Interpunktion und Satzstruktur dieses deutschen Textes. Machen Sie daraus einen vollständigen, wohlgeformten Satz. Geben Sie nur den korrigierten Text zurück:',
      'it-IT': 'Correggi la grammatica, la punteggiatura e la struttura di questa frase italiana. Rendila una frase completa e ben formata. Restituisci solo il testo corretto:',
      'pt-BR': 'Corrija a gramática, pontuação e estrutura desta frase em português. Torne-a uma frase completa e bem formada. Retorne apenas o texto corrigido:',
      'ru-RU': 'Исправьте грамматику, пунктуацию и структуру этого русского предложения. Сделайте его полным и правильно сформированным предложением. Верните только исправленный текст:',
      'hi-IN': 'इस हिंदी पाठ की व्याकरण, विराम चिह्न और वाक्य संरचना को सुधारें। इसे एक पूर्ण, सही वाक्य बनाएं। केवल सुधारा गया पाठ वापस करें:',
      'ar-SA': 'صحح قواعد اللغة والترقيم وبنية الجملة لهذا النص العربي. اجعلها جملة كاملة ومكتملة. أعد النص المصحح فقط:'
    }

    const prompt = languagePrompts[language as keyof typeof languagePrompts] || languagePrompts['en-US']

    // Gemini API 호출
    const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `${prompt}\n\n"${text}"`
          }]
        }],
        generationConfig: {
          temperature: 0.1,
          topK: 1,
          topP: 1,
          maxOutputTokens: 1000,
        }
      })
    })

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text()
      console.error('❌ Gemini API error:', errorText)
      return NextResponse.json({ error: 'Gemini API request failed' }, { status: 500 })
    }

    const geminiResult = await geminiResponse.json()
    console.log('🔍 Gemini API response:', geminiResult)

    const correctedText = geminiResult.candidates?.[0]?.content?.parts?.[0]?.text?.trim()

    if (!correctedText) {
      console.error('❌ No corrected text in Gemini response')
      return NextResponse.json({ error: 'No corrected text received' }, { status: 500 })
    }

    console.log('✅ Grammar correction completed:', { original: text, corrected: correctedText })

    return NextResponse.json({
      correctedText,
      originalText: text,
      language,
      sessionId
    })

  } catch (error) {
    console.error('❌ Gemini sentence detection error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
} 