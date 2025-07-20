import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { prompt } = await request.json()

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 })
    }

    // Gemini API를 사용하여 문장 완성
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `${prompt}

중요: 완성된 문장만 반환하세요. 설명이나 추가 텍스트는 포함하지 마세요.`
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.3,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 100,
          },
        }),
      }
    )

    if (!geminiResponse.ok) {
      throw new Error(`Gemini API failed: ${geminiResponse.status}`)
    }

    const geminiData = await geminiResponse.json()
    
    if (!geminiData.candidates || !geminiData.candidates[0]) {
      throw new Error('Invalid Gemini response')
    }

    const completedText = geminiData.candidates[0].content.parts[0].text.trim()

    console.log(`🧠 Sentence completion: "${prompt}" → "${completedText}"`)

    return NextResponse.json({
      completedText,
      confidence: 0.9,
      engine: 'gemini-2.0-flash-exp'
    })

  } catch (error) {
    console.error('Sentence completion error:', error)
    return NextResponse.json(
      { error: 'Sentence completion failed' },
      { status: 500 }
    )
  }
} 