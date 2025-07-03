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

        // 텍스트 유효성 검증
        const cleanedTranscript = transcript?.trim()
        if (!cleanedTranscript || cleanedTranscript.length < 3) {
          console.log(`⚠️ Skipping empty or too short transcript: "${cleanedTranscript}"`)
          return NextResponse.json({ 
            success: true, 
            message: "Transcript too short, skipped"
          })
        }

        // 중복 방지: 같은 텍스트가 이미 처리되었는지 확인
        if (session.fullTranscript.includes(cleanedTranscript)) {
          console.log(`⚠️ Duplicate transcript detected, skipping: "${cleanedTranscript.substring(0, 30)}..."`);
          return NextResponse.json({ 
            success: true, 
            message: "Duplicate transcript, skipped"
          })
        }

        if (!isPartial && cleanedTranscript) {
          // Only append final transcripts (not partial)
          session.fullTranscript += cleanedTranscript + ' '
          session.lastUpdate = new Date()
          console.log(`📝 Final transcript added to session ${sessionId}:`, cleanedTranscript)

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
                original_text: cleanedTranscript,
                created_at: new Date().toISOString(),
                is_final: true,
                translation_status: 'pending' // 번역 대기 상태로 설정
              }
            ])
            .select()

          if (insertError) {
            console.error("❌ DB insert error:", insertError)
            return NextResponse.json(
              { error: "Database error" },
              { status: 500 }
            )
          }

          console.log("✅ Transcript saved (id):", data?.[0]?.id)
          const transcriptId = data?.[0]?.id
          
          // 🚀 우선순위 언어들에 대해 자동 번역 작업 시작
          console.log("🌍 Starting priority translation jobs...")
          
          // 먼저 번역 상태를 'processing'으로 업데이트
          await supabase
            .from("transcripts")
            .update({ translation_status: 'processing' })
            .eq('id', transcriptId)

          const translationJobs = []
          for (const language of PRIORITY_LANGUAGES) {
            if (language === 'en') continue // 영어는 건너뜀
            
            const jobId = addTranslationJob(
              cleanedTranscript,
              language,
              sessionId,
              25, // 실시간 세션 + 우선순위 언어 = 높은 우선순위
              transcriptId
            )
            
            translationJobs.push({ language, jobId })
            console.log(`📋 Translation job ${jobId} queued for ${language}`)
          }
          
          console.log(`✅ ${translationJobs.length} priority translation jobs queued`)

          return NextResponse.json({ 
            success: true,
            transcriptId: transcriptId,
            translationJobsStarted: translationJobs.length,
            priorityLanguages: PRIORITY_LANGUAGES.filter(lang => lang !== 'en')
          })
        }

        return NextResponse.json({ 
          success: true,
          message: isPartial ? "Partial transcript received" : "Final transcript processed"
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