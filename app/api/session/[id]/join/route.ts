import { NextRequest, NextResponse } from "next/server"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params
    const { userId, userName, role = 'audience' } = await req.json()

    if (!userId || !userName) {
      return NextResponse.json(
        { error: "User ID and name are required" },
        { status: 400 }
      )
    }

    // 백엔드 API 호출
    const backendResponse = await fetch(`http://localhost:3001/api/sessions/${sessionId}/join`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId,
        userName,
        role
      }),
    })

    if (!backendResponse.ok) {
      const errorData = await backendResponse.json().catch(() => ({ message: 'Unknown error' }))
      return NextResponse.json(
        { error: errorData.message || "Failed to join session" },
        { status: backendResponse.status }
      )
    }

    const backendData = await backendResponse.json()
    
    return NextResponse.json({
      success: true,
      data: backendData.data
    })

  } catch (error) {
    console.error('Session join error:', error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
} 