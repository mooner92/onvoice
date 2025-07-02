import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { addTranslationJob } from "@/lib/translation-queue"
import { PRIORITY_LANGUAGES } from "@/lib/translation-cache"

// In-memory session storage for quick access
interface SessionData {
  fullTranscript: string
  lastUpdate: Date
}

const activeSessions = new Map<string, SessionData>()

export async function POST(req: NextRequest) {
  try {
    const { type, sessionId, transcript, isPartial } = await req.json()

    console.log(`🎯 STT Stream ${type}:`, {
      sessionId,
      hasTranscript: !!transcript,
      isPartial,
      timestamp: new Date().toLocaleTimeString()
    })

    switch (type) {
      case 'start':
        // Initialize session
        if (!activeSessions.has(sessionId)) {
          activeSessions.set(sessionId, {
            fullTranscript: '',
            lastUpdate: new Date()
          })
          console.log(`🚀 STT session ${sessionId} initialized`)
        }
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
            
            // 🚀 자동 번역 작업 시작 (백그라운드)
            console.log("🌍 Starting background translation jobs...")
            
            // 우선순위 언어들에 대해 번역 작업 추가
            const translationJobs = PRIORITY_LANGUAGES.map((language: string) => {
              if (language === 'en') return null // 영어는 건너뜀 (대부분 영어 → 영어)
              
              const jobId = addTranslationJob(
                transcript.trim(),
                language,
                sessionId,
                20 // 실시간 세션은 높은 우선순위
              )
              
              console.log(`📋 Translation job ${jobId} queued for ${language}`)
              return { language, jobId }
            }).filter(Boolean)
            
            console.log(`✅ ${translationJobs.length} translation jobs queued for priority languages`)
          }
        }

        return NextResponse.json({ 
          success: true,
          currentLength: session.fullTranscript.length,
          translationJobsStarted: !isPartial && transcript ? PRIORITY_LANGUAGES.length - 1 : 0
        })

      case 'end':
        // End session and clean up memory
        const ended = activeSessions.delete(sessionId)
        console.log(`🧹 Session ${sessionId} memory cleanup (${ended ? 'removed' : 'not found'})`)
        return NextResponse.json({ success: true, cleaned: ended })

      default:
        return NextResponse.json(
          { error: "Invalid type. Use 'start', 'transcript', or 'end'" },
          { status: 400 }
        )
    }

  } catch (error) {
    console.error("❌ STT Stream error:", error)
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