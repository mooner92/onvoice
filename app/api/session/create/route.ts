import { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest) {
  try {
    const { 
      title, 
      description, 
      category, 
      hostId, 
      hostName, 
      primaryLanguage,
      autoTranslate = true,
      languages = ['en', 'ko', 'zh', 'hi']
    } = await req.json()

    if (!title || !hostId || !hostName) {
      return NextResponse.json(
        { error: "Title, host ID, and host name are required" },
        { status: 400 }
      )
    }

    // 백엔드 API 호출
    const backendResponse = await fetch('http://localhost:3001/api/sessions/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title,
        description,
        hostId,
        hostName,
        primaryLanguage: primaryLanguage || 'en',
        category: category || 'general',
        autoTranslate,
        languages
      }),
    })

    if (!backendResponse.ok) {
      const errorData = await backendResponse.json().catch(() => ({ message: 'Unknown error' }))
      return NextResponse.json(
        { error: errorData.message || "Failed to create session" },
        { status: backendResponse.status }
      )
    }

    const backendData = await backendResponse.json()
    
    // 백엔드 응답 구조에 맞춰 변환
    const session = {
      id: backendData.data.sessionId,
      title,
      description,
      category: category || 'general',
      host_id: hostId,
      host_name: hostName,
      primary_language: primaryLanguage || 'en',
      status: 'active',
      created_at: new Date().toISOString(),
      websocket_url: backendData.data.websocketUrl,
      public_url: backendData.data.publicUrl,
      qr_code_data: backendData.data.qrCodeData
    }

    return NextResponse.json({ 
      session,
      websocketUrl: backendData.data.websocketUrl,
      publicUrl: backendData.data.publicUrl,
      qrCodeData: backendData.data.qrCodeData
    })

  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
} 