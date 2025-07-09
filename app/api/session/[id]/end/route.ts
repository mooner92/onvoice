import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

// 직접 요약 생성 함수 import
async function generateSessionSummary(sessionId: string) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Get all transcripts for the session
    const { data: transcripts, error: transcriptError } = await supabase
      .from('transcripts')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })

    if (transcriptError) {
      console.error('Error fetching transcripts:', transcriptError)
      return null
    }

    if (!transcripts || transcripts.length === 0) {
      console.log('No transcripts found for session:', sessionId)
      return null
    }

    // Combine all transcripts using original_text field
    const fullText = transcripts
      .map(t => t.original_text || t.text || '') // original_text 우선, 없으면 text
      .filter(text => text.trim().length > 0) // 빈 텍스트 제거
      .join(' ')
    
    console.log(`📝 Combined transcript length: ${fullText.length} characters from ${transcripts.length} transcripts`)
    
    if (fullText.trim().length === 0) {
      console.log('No valid transcript content found')
      return null
    }

    // Generate summary using Gemini
    const geminiApiKey = process.env.GEMINI_API_KEY
    if (!geminiApiKey) {
      console.error('Gemini API key not found')
      return null
    }

    const prompt = `Create a concise summary of this lecture/presentation transcript. Focus on the main points, key topics discussed, and important conclusions. Keep it under 200 words.

Transcript:
${fullText}`

    console.log(`📝 Generating summary with Gemini for ${fullText.length} characters`)

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${geminiApiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 400,
        },
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Gemini API error:', response.status, errorText)
      return null
    }

    const data = await response.json()
    console.log('📦 Gemini summary response:', JSON.stringify(data, null, 2))
    
    let summary = null
    if (data.candidates && data.candidates[0] && data.candidates[0].content) {
      const candidate = data.candidates[0]
      
      if (candidate.content.parts && candidate.content.parts[0] && candidate.content.parts[0].text) {
        summary = candidate.content.parts[0].text.trim()
        console.log(`✅ Gemini summary generated: ${summary.substring(0, 100)}...`)
      } else {
        console.error('❌ Gemini response missing content.parts:', candidate.content)
      }
    } else {
      console.error('❌ Invalid Gemini response structure:', data)
    }

    if (!summary) {
      console.error('No summary generated from Gemini')
      return null
    }

    // Save summary to database
    const { data: savedSummary, error: saveError } = await supabase
      .from('session_summaries')
      .upsert({
        session_id: sessionId,
        summary_en: summary,
        summary_ko: '', // Will be translated later
        summary_zh: '', // Will be translated later
        summary_hi: '', // Will be translated later
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single()

    if (saveError) {
      console.error('Error saving summary:', saveError)
      console.error('Summary content:', summary)
      console.error('Session ID:', sessionId)
      return null
    }

    console.log(`✅ Summary generated and saved for session ${sessionId}`)
    return savedSummary

  } catch (error) {
    console.error('Error in generateSessionSummary:', error)
    return null
  }
}

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

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // If hostId is provided, verify host ownership
    if (hostId) {
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
        const summaryData = await generateSessionSummary(sessionId)
        
        if (summaryData) {
          console.log(`✅ Summary generated: ${summaryData.summary_en?.substring(0, 50)}...`)
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