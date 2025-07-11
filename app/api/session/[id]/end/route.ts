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

    // Save summary to sessions table
    const { data: updatedSession, error: saveError } = await supabase
      .from('sessions')
      .update({ summary: summary })
      .eq('id', sessionId)
      .select()
      .single()

    if (saveError) {
      console.error('Error saving summary:', saveError)
      console.error('Summary content:', summary)
      console.error('Session ID:', sessionId)
      return null
    }

    // Also save to session_summary_cache for translations
    try {
      const { error: cacheError } = await supabase
        .from('session_summary_cache')
        .upsert({
          session_id: sessionId,
          language_code: 'en',
          summary_text: summary
        })

      if (cacheError) {
        console.error('Error caching English summary:', cacheError)
        console.error('Cache error details:', {
          sessionId,
          summaryLength: summary.length,
          error: cacheError
        })
      } else {
        console.log(`✅ English summary cached for session ${sessionId}`)
      }
    } catch (cacheException) {
      console.error('Exception while caching English summary:', cacheException)
    }

    // 🆕 Generate translations for supported languages
    const supportedLanguages = ['ko', 'zh', 'hi']
    
    console.log(`🌍 Generating translations for summary...`)
    
    for (const lang of supportedLanguages) {
      try {
        const translationPrompt = `Translate the following English summary to ${lang === 'ko' ? 'Korean' : lang === 'zh' ? 'Chinese' : 'Hindi'}. Maintain the professional tone and technical accuracy. Keep the same HTML formatting:

${summary}`

        const translationResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${geminiApiKey}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: translationPrompt
              }]
            }],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 800,
            },
          }),
        })

        if (!translationResponse.ok) {
          console.error(`Gemini translation API error for ${lang}:`, translationResponse.status)
          continue
        }

        const translationData = await translationResponse.json()
        
        let translatedSummary = null
        if (translationData.candidates && translationData.candidates[0] && translationData.candidates[0].content) {
          const candidate = translationData.candidates[0]
          
          if (candidate.content.parts && candidate.content.parts[0] && candidate.content.parts[0].text) {
            translatedSummary = candidate.content.parts[0].text.trim()
          }
        }

        if (translatedSummary) {
          // Save to session_summary_cache
          const { error: cacheError } = await supabase
            .from('session_summary_cache')
            .upsert({
              session_id: sessionId,
              language_code: lang,
              summary_text: translatedSummary
            })

          if (cacheError) {
            console.error(`Error caching ${lang} summary translation:`, cacheError)
          } else {
            console.log(`✅ Cached ${lang} summary translation`)
          }
        }
      } catch (error) {
        console.error(`Error translating summary to ${lang}:`, error)
      }
    }

    console.log(`✅ Summary generated and saved for session ${sessionId}`)
    return updatedSession

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