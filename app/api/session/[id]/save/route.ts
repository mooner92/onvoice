import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const resolvedParams = await params
    const sessionId = resolvedParams.id

    if (!sessionId) {
      return NextResponse.json({ error: 'Missing session ID' }, { status: 400 })
    }

    const body = await req.json()
    const { userId, role = 'audience' } = body

    if (!userId) {
      return NextResponse.json({ error: 'Missing user ID' }, { status: 400 })
    }

    const supabase = await createClient()

    console.log(`🔍 Checking session exists: ${sessionId}`)
    console.log(`🔍 Session ID type: ${typeof sessionId}`)
    console.log(`🔍 Session ID length: ${sessionId.length}`)

    // Check if session exists (use service role to bypass RLS)
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('*')
      .eq('id', sessionId)
      .single()

    console.log(`📊 Session query result:`, {
      session: session ? { id: session.id, title: session.title, status: session.status } : null,
      sessionError,
    })

    if (sessionError || !session) {
      console.error(`❌ Session not found: ${sessionId}`, sessionError)
      return NextResponse.json(
        {
          error: 'Session not found',
          sessionId,
          details: sessionError?.message,
        },
        { status: 404 },
      )
    }

    // Check if user already saved this session
    const { data: existingSession } = await supabase
      .from('user_sessions')
      .select('*')
      .eq('user_id', userId)
      .eq('session_id', sessionId)
      .single()

    if (existingSession) {
      return NextResponse.json({ message: 'Session already saved', sessionId }, { status: 200 })
    }

    // Calculate expiry date (14 days from now for free users)
    const expiryDate = new Date()
    expiryDate.setDate(expiryDate.getDate() + 14)

    // Save session for user
    const { error: saveError } = await supabase.from('user_sessions').insert({
      user_id: userId,
      session_id: sessionId,
      role: role,
      expires_at: expiryDate.toISOString(),
      is_premium: false, // Default to free
    })

    if (saveError) {
      console.error('Error saving session:', saveError)
      return NextResponse.json({ error: 'Failed to save session' }, { status: 500 })
    }

    return NextResponse.json({
      message: 'Session saved successfully',
      sessionId,
      expiresAt: expiryDate.toISOString(),
      daysRemaining: 14,
    })
  } catch (error) {
    console.error('Session save error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
