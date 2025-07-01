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
        console.log(`✅ Session ${sessionId} started/reinitialized`)
        return NextResponse.json({ success: true })

      case 'transcript':
        // Update session transcript
        const session = activeSessions.get(sessionId)
        if (!session) {
          console.error(`❌ Session ${sessionId} not found for transcript update`)
          return NextResponse.json(
            { error: "Session not found" },
            { status: 404 }
          )
        }

        if (!isPartial && transcript) {
          // Only append final transcripts (not partial)
          session.fullTranscript += transcript + ' '
          session.lastUpdate = new Date()
          console.log(`📝 Transcript added to session ${sessionId}:`, transcript)
          console.log(`📊 Current full transcript length:`, session.fullTranscript.length)

          // Save EACH final sentence immediately to Supabase
          const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
          )

          const { data, error: insertError } = await supabase
            .from("transcripts")
            .insert([
              {
                session_id: sessionId,
                timestamp: new Date().toLocaleTimeString(),
                original_text: transcript.trim(),
                created_at: new Date().toISOString(),
                is_final: true
              }
            ])
            .select()

          if (insertError) {
            console.error("❌ DB insert error (per sentence):", insertError)
          } else {
            console.log("✅ Sentence saved (id):", data?.[0]?.id)
          }
        }

        return NextResponse.json({ 
          success: true,
          currentLength: session.fullTranscript.length 
        })

      case 'end':
        // End session and clean up memory
        const ended = activeSessions.delete(sessionId)
        console.log(`🧹 Session ${sessionId} memory cleanup (${ended ? 'removed' : 'not found'})`)
        return NextResponse.json({ success: true, cleaned: ended })

      default:
        return NextResponse.json(
          { error: "Invalid type" },
          { status: 400 }
        )
    }

  } catch (error) {
    console.error("❌ STT Stream API error:", error)
    return NextResponse.json(
      { error: "Internal server error", details: error instanceof Error ? error.message : 'Unknown error' },
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
      lastUpdate: session.lastUpdate,
      length: session.fullTranscript.length
    })

  } catch (error) {
    console.error("STT Stream GET error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
} 