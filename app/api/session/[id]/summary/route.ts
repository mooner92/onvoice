import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const CATEGORY_PROMPTS = {
  general: "Summarize the following lecture content as a list of clear, concise bullet points. Focus on key ideas, facts, and conclusions.",
  sports: "Summarize the following sports-related content as bullet points. Highlight game results, player info, strategies, and key moments.",
  economics: "Summarize the following economics-related content as bullet points. Include market trends, economic indicators, investment info, and key analysis.",
  technology: "Summarize the following technology-related content as bullet points. Focus on technical concepts, innovations, and main takeaways.",
  education: "Summarize the following education-related content as bullet points. Highlight learning objectives, key concepts, and educational value.",
  business: "Summarize the following business-related content as bullet points. Focus on business strategies, market analysis, and management insights.",
  medical: "Summarize the following medical-related content as bullet points. Highlight medical info, treatment methods, and health management.",
  legal: "Summarize the following legal-related content as bullet points. Focus on legal issues, precedents, regulations, and main points.",
  entertainment: "Summarize the following entertainment-related content as bullet points. Highlight work analysis, cultural significance, and trends.",
  science: "Summarize the following science-related content as bullet points. Focus on scientific principles, research results, and key findings."
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params
    const sessionId = resolvedParams.id

    if (!sessionId) {
      return NextResponse.json(
        { error: "Missing session ID" },
        { status: 400 }
      )
    }

    // Parse force flag from request body
    let force = false
    try {
      const body = await req.json()
      force = !!body.force
    } catch {
      // ignore if no body or invalid JSON
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Get session info
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('*')
      .eq('id', sessionId)
      .single()

    if (sessionError || !session) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      )
    }

    // Check if summary already exists, unless force is true
    if (session.summary && !force) {
      return NextResponse.json({
        summary: session.summary,
        fromCache: true
      })
    }

    // Get all transcripts for this session
    const { data: transcripts, error: transcriptError } = await supabase
      .from('transcripts')
      .select('original_text, created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })

    if (transcriptError) {
      console.error('Error fetching transcripts:', transcriptError)
      return NextResponse.json(
        { error: "Failed to fetch transcripts" },
        { status: 500 }
      )
    }

    if (!transcripts || transcripts.length === 0) {
      return NextResponse.json(
        { error: "No transcripts found for this session" },
        { status: 404 }
      )
    }

    // Combine all transcripts
    const fullTranscript = transcripts
      .map(t => t.original_text)
      .join(' ')

    // Limit transcript length for API efficiency
    const maxLength = 8000 // GPT-4 can handle more, but we'll be conservative
    const truncatedTranscript = fullTranscript.length > maxLength 
      ? fullTranscript.substring(0, maxLength) + '...'
      : fullTranscript

    // Get category-specific prompt
    const categoryPrompt = CATEGORY_PROMPTS[session.category as keyof typeof CATEGORY_PROMPTS] || CATEGORY_PROMPTS.general

    // Generate English summary using GPT
    const summaryPrompt = `
**C – Context:**  
You are a large language model tasked with summarizing spoken content that has been transcribed using the WebSpeech API. The source may be lectures, discussions, or events with a few speakers and many listeners. These transcripts often contain transcription errors (e.g., "My Combinator" instead of "Y Combinator") that must be corrected using contextual understanding.

**O – Objective:**  
Your goal is to produce an accurate and concise summary by:  
1. Correcting transcription errors based on context.  
2. Following a specific HTML-based structure for clarity and usability.  
3. Including five relevant tags at the end.

**S – Style:**  
Concise, clear, and professional. Avoid repetition or filler.

**T – Tone:**  
Neutral, informative, and user-friendly.

**A – Audience:**  
Users who want a brief but accurate overview of the spoken content. Including, but not limited to, students, professionals, and event attendees.

**R – Response:**  
Use the following structure:

${categoryPrompt}
Here is the transcript which may contain transcription errors:
${truncatedTranscript}

Please follow these instructions:
1. Carefully analyze the transcript and fix any transcription errors using context clues.
2. Organize the summary into 2-4 key sections, each with a clear heading using HTML <b> tags (e.g., <b>Section Title</b>).
3. Under each heading, list 1-3 concise bullet points with the most important facts, insights, or conclusions.
4. Use <br/> for line breaks between sections and bullet points.
5. Be clear and detailed, grouping related information together.
6. Use professional, easy-to-understand language.
7. Do not exceed 500 characters total.
8. End the summary with 5 relevant tags in the following format:
<b>Important tags</b><br/>
- tag 1<br/>
- tag 2<br/>
- tag 3<br/>
- tag 4<br/>
- tag 5<br/>
9. Example format:

<b>1. Section Title</b><br/>
- Key point one<br/>
- Key point two<br/><br/>
<b>2. Next Section</b><br/>
- Key point one<br/>
- Key point two<br/><br/>
<b>Important tags</b><br/>
- topic<br/>
- keyword<br/>
- theme<br/>
- event<br/>
- takeaway<br/>
`

    console.log(`🤖 Generating English summary for session ${sessionId} (category: ${session.category})`)
    
    // Generate summary using Gemini
    const geminiApiKey = process.env.GEMINI_API_KEY
    if (!geminiApiKey) {
      console.error('Gemini API key not found')
      return NextResponse.json(
        { error: "Gemini API key not configured" },
        { status: 500 }
      )
    }

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${geminiApiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: summaryPrompt
          }]
        }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 800,
        },
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Gemini API error:', response.status, errorText)
      return NextResponse.json(
        { error: "Failed to generate summary with Gemini" },
        { status: 500 }
      )
    }

    const data = await response.json()
    
    let englishSummary = null
    if (data.candidates && data.candidates[0] && data.candidates[0].content) {
      const candidate = data.candidates[0]
      
      if (candidate.content.parts && candidate.content.parts[0] && candidate.content.parts[0].text) {
        englishSummary = candidate.content.parts[0].text.trim()
      } else {
        console.error('❌ Gemini response missing content.parts:', candidate.content)
      }
    } else {
      console.error('❌ Invalid Gemini response structure:', data)
    }

    if (!englishSummary) {
      return NextResponse.json(
        { error: "Failed to generate summary" },
        { status: 500 }
      )
    }

    // Save English summary to database
    const { error: updateError } = await supabase
      .from('sessions')
      .update({ summary: englishSummary })
      .eq('id', sessionId)

    if (updateError) {
      console.error('Error saving summary:', updateError)
      // Still return the summary even if saving fails
    }

    // 🆕 Generate translations for supported languages and save to session_summary_cache
    const supportedLanguages = ['ko', 'zh', 'hi']
    
    console.log(`🌍 Generating translations for summary...`)
    
    // Save English summary to cache first
    try {
      const { error: cacheError } = await supabase
        .from('session_summary_cache')
        .upsert({
          session_id: sessionId,
          language_code: 'en',
          summary_text: englishSummary
        })

      if (cacheError) {
        console.error('Error caching English summary:', cacheError)
      } else {
        console.log(`✅ English summary cached for session ${sessionId}`)
      }
    } catch (cacheException) {
      console.error('Exception while caching English summary:', cacheException)
    }

    for (const lang of supportedLanguages) {
      try {
        const translationPrompt = `Translate the following English summary to ${lang === 'ko' ? 'Korean' : lang === 'zh' ? 'Chinese' : 'Hindi'}. Maintain the professional tone and technical accuracy:

${englishSummary}`

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
          // 🆕 Save to session_summary_cache instead of translation_cache
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

    console.log(`✅ Summary generated for session ${sessionId} (${englishSummary.length} characters)`)

    return NextResponse.json({
      summary: englishSummary,
      category: session.category,
      transcriptCount: transcripts.length,
      fromCache: false
    })

  } catch (error) {
    console.error('Summary generation error:', error)
    console.error('Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      openaiKey: process.env.OPENAI_API_KEY ? 'Present' : 'Missing',
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ? 'Present' : 'Missing',
      supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'Present' : 'Missing'
    })
    return NextResponse.json(
      { 
        error: "Internal server error",
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

// GET method to retrieve existing summary
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params
    const sessionId = resolvedParams.id
    const url = new URL(req.url)
    const lang = url.searchParams.get('lang') || 'en'

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

    const { data: session, error } = await supabase
      .from('sessions')
      .select('summary, category, title')
      .eq('id', sessionId)
      .single()

    if (error || !session) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      )
    }

    // 🆕 Get translated summary from session_summary_cache
    let summary = session.summary
    if (lang !== 'en') {
      const { data: cachedSummary } = await supabase
        .from('session_summary_cache')
        .select('summary_text')
        .eq('session_id', sessionId)
        .eq('language_code', lang)
        .maybeSingle()

      if (cachedSummary) {
        summary = cachedSummary.summary_text
        console.log(`✅ Retrieved ${lang} summary from cache`)
      } else {
        console.log(`⚠️ No ${lang} summary found, using English`)
      }
    }

    return NextResponse.json({
      summary,
      category: session.category,
      title: session.title,
      hasSummary: !!session.summary,
      language: lang,
      fromCache: lang !== 'en'
    })

  } catch (error) {
    console.error('Summary retrieval error:', error)
    console.error('GET Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    })
    return NextResponse.json(
      { 
        error: "Internal server error",
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
} 