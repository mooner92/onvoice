import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

// Store active sessions in memory (in production, use Redis)
const activeSessions = new Map<string, {
  fullTranscript: string
  lastUpdate: Date
}>()

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { type, sessionId, transcript, isPartial } = body

    console.log('STT Stream API called:', {
      type,
      sessionId,
      transcriptLength: transcript?.length,
      isPartial,
      timestamp: new Date().toLocaleTimeString()
    })

    if (!sessionId) {
      return NextResponse.json(
        { error: "Session ID is required" },
        { status: 400 }
      )
    }

    switch (type) {
      case 'start':
        // Initialize session (allow re-initialization)
        if (activeSessions.has(sessionId)) {
          console.log(`Session ${sessionId} already exists, reinitializing`)
        }
        
        activeSessions.set(sessionId, {
          fullTranscript: '',
          lastUpdate: new Date()
        })
        console.log(`Session ${sessionId} started/reinitialized`)
        return NextResponse.json({ success: true })

      case 'transcript':
        // Update session transcript
        const session = activeSessions.get(sessionId)
        if (!session) {
          return NextResponse.json(
            { error: "Session not found" },
            { status: 404 }
          )
        }

        if (!isPartial && transcript) {
          // Only append final transcripts (not partial)
          session.fullTranscript += transcript + ' '
          session.lastUpdate = new Date()
          console.log(`Transcript updated for session ${sessionId}:`, transcript)
        }

        return NextResponse.json({ 
          success: true,
          currentLength: session.fullTranscript.length 
        })

      case 'end':
        // Save final transcript to database
        const finalSession = activeSessions.get(sessionId)
        if (!finalSession) {
          console.log(`Session ${sessionId} not found for ending (may have been already ended)`)
          return NextResponse.json({ 
            success: true, 
            message: 'Session already ended or not found',
            finalTranscript: '',
            sentenceCount: 0
          })
        }

        // Process and save to database
        const finalTranscript = finalSession.fullTranscript.trim()
        
        if (finalTranscript) {
          // Split into sentences and clean up
          const sentences = finalTranscript
            .split(/[.!?]+/)
            .map(s => s.trim())
            .filter(s => s.length > 0)
            .map(s => s.charAt(0).toUpperCase() + s.slice(1))
            .join('.\n') + '.'

          console.log(`Saving final transcript for session ${sessionId}:`, {
            originalLength: finalTranscript.length,
            sentenceCount: sentences.split('\n').length
          })

          // Save to Supabase
          const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
          )

          const { error: dbError } = await supabase
            .from("transcripts")
            .insert([
              {
                session_id: sessionId,
                timestamp: new Date().toLocaleTimeString(),
                original_text: sentences,
                created_at: new Date().toISOString(),
                is_final: true
              },
            ])

          if (dbError) {
            console.error("Database error:", dbError)
          }
        }

        // Clean up memory
        activeSessions.delete(sessionId)
        console.log(`Session ${sessionId} ended and cleaned up`)

        return NextResponse.json({ 
          success: true,
          finalTranscript,
          sentenceCount: finalTranscript ? finalTranscript.split('\n').length : 0
        })

      default:
        return NextResponse.json(
          { error: "Invalid type" },
          { status: 400 }
        )
    }

  } catch (error) {
    console.error("STT Stream API error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

// GET endpoint to retrieve current session transcript
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const sessionId = searchParams.get('sessionId')

    if (!sessionId) {
      return NextResponse.json(
        { error: "Session ID is required" },
        { status: 400 }
      )
    }

    const session = activeSessions.get(sessionId)
    if (!session) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      )
    }

    return NextResponse.json({
      transcript: session.fullTranscript,
      lastUpdate: session.lastUpdate
    })

  } catch (error) {
    console.error("STT Stream GET error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
} 