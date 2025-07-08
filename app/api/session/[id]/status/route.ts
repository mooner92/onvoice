import { NextRequest, NextResponse } from "next/server"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params

    // 백엔드 API 호출
    const backendResponse = await fetch(`http://localhost:3001/api/sessions/${sessionId}/status`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (!backendResponse.ok) {
      const errorData = await backendResponse.json().catch(() => ({ message: 'Unknown error' }))
      return NextResponse.json(
        { error: errorData.message || "Failed to get session status" },
        { status: backendResponse.status }
      )
    }

    const backendData = await backendResponse.json()
    
    return NextResponse.json({
      success: true,
      data: backendData.data
    })

  } catch (error) {
    console.error('Session status error:', error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
} 