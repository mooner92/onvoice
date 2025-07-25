import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const requestStartTime = Date.now()
  
  try {
    console.log(`🎤 Whisper API request started`)
    
    const formDataStartTime = Date.now()
    const formData = await request.formData()
    const formDataTime = Date.now() - formDataStartTime
    
    const file = formData.get('file') as File
    const model = formData.get('model') as string || 'whisper-1'
    let language = formData.get('language') as string || 'en'
    // ISO-639-1 형식으로 변환 (en-US -> en)
    if (language && language.includes('-')) {
      language = language.split('-')[0]
    }
    const responseFormat = formData.get('response_format') as string || 'verbose_json'
    const prompt = formData.get('prompt') as string
    const temperature = formData.get('temperature') as string

    if (!file) {
      return NextResponse.json({ error: 'No audio file provided' }, { status: 400 })
    }

    console.log(`📦 FormData parsing: ${formDataTime}ms (File size: ${file.size} bytes)`)

    // OpenAI API 키 확인
    const openaiApiKey = process.env.OPENAI_API_KEY
    if (!openaiApiKey) {
      return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 })
    }

    // 파일을 OpenAI API 형식으로 변환
    const bufferStartTime = Date.now()
    const audioBuffer = await file.arrayBuffer()
    const bufferTime = Date.now() - bufferStartTime
    
    console.log(`💾 Audio buffer conversion: ${bufferTime}ms`)
    
    // OpenAI Whisper API 호출
    const openaiStartTime = Date.now()
    const openaiResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
      },
      body: (() => {
        const form = new FormData()
        // WAV 파일인 경우 그대로 사용, 다른 형식은 변환
        const audioBlob = file.type === 'audio/wav' 
          ? new Blob([audioBuffer], { type: 'audio/wav' })
          : new Blob([audioBuffer], { type: file.type })
        
        form.append('file', audioBlob, file.name.replace(/\.[^/.]+$/, '.wav'))
        form.append('model', model)
        form.append('language', language)
        form.append('response_format', responseFormat)
        if (prompt) form.append('prompt', prompt)
        if (temperature) form.append('temperature', temperature)
        return form
      })(),
    })

    if (!openaiResponse.ok) {
      const errorData = await openaiResponse.text()
      console.error('OpenAI API error:', errorData)
      return NextResponse.json(
        { error: `OpenAI API error: ${openaiResponse.status}` },
        { status: openaiResponse.status }
      )
    }

    const result = await openaiResponse.json()
    const openaiTime = Date.now() - openaiStartTime
    const totalTime = Date.now() - requestStartTime
    
    console.log(`✅ Whisper API success: ${openaiTime}ms (Total: ${totalTime}ms)`, {
      text: result.text?.substring(0, 50) + '...',
      duration: result.duration,
      language: result.language,
    })

    return NextResponse.json(result)
    
  } catch (error) {
    const errorTime = Date.now() - requestStartTime
    console.error(`❌ Whisper API error after ${errorTime}ms:`, error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 