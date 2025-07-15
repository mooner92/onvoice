import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { performBatchTranslation, saveBatchTranslationsToCache } from "@/lib/translation-queue"
import { getTargetLanguages, detectLanguage } from "@/lib/translation-cache"

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

          const dbInsertStart = Date.now()
          console.log(`💾 Inserting transcript to DB: "${cleanedTranscript.substring(0, 50)}..."`)

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

          const dbInsertTime = Date.now() - dbInsertStart

          if (insertError) {
            console.error(`❌ DB insert error (${dbInsertTime}ms):`, insertError)
            return NextResponse.json(
              { error: "Database error" },
              { status: 500 }
            )
          }

          console.log(`✅ Transcript saved (id): ${data?.[0]?.id} - DB insert: ${dbInsertTime}ms`)
          const transcriptId = data?.[0]?.id
            
          // 🚀 즉시 번역 실행 (큐 시스템 제거)
          console.log("🌍 Starting immediate translation...")
            
          // 번역 상태를 'processing'으로 업데이트
          const statusUpdateStart = Date.now()
          await supabase
            .from("transcripts")
            .update({ translation_status: 'processing' })
            .eq('id', transcriptId)
          const statusUpdateTime = Date.now() - statusUpdateStart
          
          console.log(`🔄 Translation status updated to 'processing' (${statusUpdateTime}ms)`)

          // 🆕 입력 언어 감지 후 해당 언어를 제외한 나머지 3개 언어로 번역
          const inputLanguage = detectLanguage(cleanedTranscript)
          const targetLanguages = getTargetLanguages(inputLanguage)
          
          console.log(`🌍 Detected input language: ${inputLanguage}, translating to: [${targetLanguages.join(', ')}]`)
          
          try {
            // 즉시 배치 번역 실행
            const translationStart = Date.now()
            const batchResults = await performBatchTranslation(cleanedTranscript, targetLanguages)
            const translationTime = Date.now() - translationStart
            
            console.log(`🚀 Batch translation completed in ${translationTime}ms for ${Object.keys(batchResults).length} languages`)
            
            // 번역 결과를 캐시에 즉시 저장
            const cacheStart = Date.now()
            const cacheIds = await saveBatchTranslationsToCache(cleanedTranscript, batchResults)
            const cacheTime = Date.now() - cacheStart
            
            console.log(`💾 Translation cache saved in ${cacheTime}ms for ${Object.keys(cacheIds).length} languages`)
            
            // 번역 완료 상태로 업데이트
            await supabase
              .from("transcripts")
              .update({ translation_status: 'completed' })
              .eq('id', transcriptId)
              
            console.log(`✅ Immediate translation completed for "${cleanedTranscript.substring(0, 30)}..." (${Object.keys(batchResults).length} languages)`)
            
            return NextResponse.json({ 
              success: true,
              transcriptId: transcriptId,
              translationCompleted: true,
              translatedLanguages: Object.keys(batchResults),
              translationTime: translationTime,
              cacheTime: cacheTime,
              totalTime: Date.now() - dbInsertStart
            })
            
          } catch (translationError) {
            console.error('❌ Immediate translation failed:', translationError)
            
            // 번역 실패 시 상태를 pending으로 되돌림
            await supabase
              .from("transcripts")
              .update({ translation_status: 'pending' })
              .eq('id', transcriptId)
            
            // 번역 실패해도 transcript 저장은 성공으로 처리
            return NextResponse.json({ 
              success: true,
              transcriptId: transcriptId,
              translationCompleted: false,
              translationError: translationError instanceof Error ? translationError.message : 'Unknown error',
              note: 'Transcript saved but translation failed'
            })
          }
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