import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import OpenAI from "openai"

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

const CATEGORY_PROMPTS = {
  general: "Summarize the following lecture content in 300-500 characters. Include key points and main content.",
  sports: "Summarize the following sports-related content in 300-500 characters. Focus on game results, player information, strategic analysis, and sports-specific content.",
  economics: "Summarize the following economics-related content in 300-500 characters. Include market trends, economic indicators, investment information, and economic terminology and analysis.",
  technology: "Summarize the following technology-related content in 300-500 characters. Focus on technical concepts, implementation methods, innovations, and technical content.",
  education: "Summarize the following education-related content in 300-500 characters. Focus on learning objectives, key concepts, educational methodologies, and educational value.",
  business: "Summarize the following business-related content in 300-500 characters. Focus on business strategies, market analysis, management insights from a business perspective.",
  medical: "Summarize the following medical-related content in 300-500 characters. Focus on medical information, treatment methods, health management, and medical expertise.",
  legal: "Summarize the following legal-related content in 300-500 characters. Focus on legal issues, precedents, regulations, and legal expertise.",
  entertainment: "Summarize the following entertainment-related content in 300-500 characters. Focus on work analysis, cultural significance, trends from an entertainment perspective.",
  science: "Summarize the following science-related content in 300-500 characters. Focus on scientific principles, research results, experimental methods, and scientific expertise."
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

    // Check if summary already exists
    if (session.summary) {
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
    const summaryPrompt = `${categoryPrompt}

Here is the lecture content:

${truncatedTranscript}

Please consider the following when summarizing:
1. Write in 300-500 characters
2. Include key content and main points
3. Apply professional perspective suitable for the category (${session.category})
4. Use clear and easy-to-understand writing style`

    console.log(`🤖 Generating English summary for session ${sessionId} (category: ${session.category})`)
    
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a professional lecture summary expert. Provide professional and accurate summaries suitable for the given category."
        },
        {
          role: "user",
          content: summaryPrompt
        }
      ],
      max_tokens: 800,
      temperature: 0.3,
    })

    const englishSummary = completion.choices[0]?.message?.content?.trim()

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
    await supabase
      .from('session_summary_cache')
      .upsert({
        session_id: sessionId,
        language_code: 'en',
        summary_text: englishSummary
      })

    for (const lang of supportedLanguages) {
      try {
        const translationPrompt = `Translate the following English summary to ${lang === 'ko' ? 'Korean' : lang === 'zh' ? 'Chinese' : 'Hindi'}. Maintain the professional tone and technical accuracy:

${englishSummary}`

        const translationCompletion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: `You are a professional translator. Translate accurately while maintaining the original meaning and professional tone.`
            },
            {
              role: "user",
              content: translationPrompt
            }
          ],
          max_tokens: 800,
          temperature: 0.1,
        })

        const translatedSummary = translationCompletion.choices[0]?.message?.content?.trim()

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