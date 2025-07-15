import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { generateSessionSummary } from "@/lib/summary-generator"
import { auth } from '@clerk/nextjs/server'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    let hostId: string | undefined
    
    // Try to parse JSON body, but it's optional
    try {
      const body = await req.json()
      hostId = body.hostId
    } catch {
      // Body might be empty or not JSON, which is okay
      console.log('No JSON body provided, proceeding without hostId')
    }
    
    const resolvedParams = await params
    const sessionId = resolvedParams.id

    if (!sessionId) {
      return NextResponse.json(
        { error: "Missing session ID" },
        { status: 400 }
      )
    }

    // Use service role key for API routes
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // If hostId is provided, verify host ownership
    if (hostId) {
      // Verify user authentication with Clerk
      const { userId: authenticatedUserId } = await auth()
      if (!authenticatedUserId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      // Verify that the requesting user matches the hostId
      if (authenticatedUserId !== hostId) {
        return NextResponse.json({ error: 'Forbidden: Cannot end session for another user' }, { status: 403 })
      }

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

    // Generate summary if there are transcripts
    let summaryGenerated = false
    if (transcriptCount && transcriptCount > 0) {
      try {
        console.log(`🤖 Generating summary for session ${sessionId} with ${transcriptCount} transcripts`)
        
        // Call summary generation function directly
        const summaryData = await generateSessionSummary({ sessionId })
        
        if (summaryData) {
          console.log(`✅ Summary generated: ${summaryData.summary?.substring(0, 50)}...`)
          summaryGenerated = true
        } else {
          console.error('Failed to generate summary')
        }
      } catch (summaryError) {
        console.error('Error generating summary:', summaryError)
      }
    }

    return NextResponse.json({
      message: "Session ended successfully",
      statistics: {
        transcript_count: transcriptCount || 0,
        participant_count: participantCount || 0,
        duration: 0,
        summary_generated: summaryGenerated
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
