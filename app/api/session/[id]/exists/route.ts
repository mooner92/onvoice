import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params
    
    // 백엔드 API로 세션 존재 확인
    const backendResponse = await fetch(`http://localhost:3001/api/session/${sessionId}/exists`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })
    
    const backendData = await backendResponse.json()
    
    if (!backendResponse.ok) {
      return NextResponse.json({
        exists: false,
        active: false,
        message: backendData.message || 'Session not found',
        error: backendData.error
      }, { status: backendResponse.status })
    }
    
    return NextResponse.json({
      exists: true,
      active: backendData.active,
      data: backendData.data,
      message: backendData.message || 'Session found'
    })
    
  } catch (error) {
    console.error('Session exists check error:', error)
    return NextResponse.json({
      exists: false,
      active: false,
      message: 'Unable to check session status',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 