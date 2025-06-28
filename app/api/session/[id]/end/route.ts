import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { hostId } = await req.json()
    const resolvedParams = await params
    const sessionId = resolvedParams.id

    if (!sessionId || !hostId) {
      return NextResponse.json(
        { error: "Missing session ID or host ID" },
        { status: 400 }
      )
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Verify host ownership
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('host_id', hostId)
      .single()

    if (sessionError || !session) {
      return NextResponse.json(
        { error: "Session not found or unauthorized" },
        { status: 404 }
      )
    }

    // End session
    const { error: updateError } = await supabase
      .from('sessions')
      .update({
        status: 'ended',
        ended_at: new Date().toISOString()
      })
      .eq('id', sessionId)

    if (updateError) {
      console.error('Error ending session:', updateError)
      return NextResponse.json(
        { error: "Failed to end session" },
        { status: 500 }
      )
    }

    // Get session statistics
    const { count: transcriptCount } = await supabase
      .from('transcripts')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', sessionId)

    const { count: participantCount } = await supabase
      .from('session_participants')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', sessionId)

    return NextResponse.json({
      message: "Session ended successfully",
      statistics: {
        transcript_count: transcriptCount || 0,
        participant_count: participantCount || 0,
        duration: session.created_at ? 
          Math.floor((new Date().getTime() - new Date(session.created_at).getTime()) / 1000) : 0
      }
    })

  } catch (error) {
    console.error('Session end error:', error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
} 