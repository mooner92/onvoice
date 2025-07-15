import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { generateSessionSummary } from "@/lib/summary-generator"

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

    // Use service role key for API routes
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Check if session exists
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

    // Generate summary
    const summaryData = await generateSessionSummary({ 
      sessionId, 
      force: true 
    })

    return NextResponse.json({
      summary: summaryData.summary,
      category: summaryData.category,
      transcriptCount: summaryData.transcriptCount
    })

  } catch (error) {
    console.error('Summary generation error:', error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

// GET method to retrieve existing summary
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const resolvedParams = await params
    const sessionId = resolvedParams.id
    const url = new URL(req.url)
    const lang = url.searchParams.get('lang') || 'en'

    if (!sessionId) {
      return NextResponse.json({ error: 'Missing session ID' }, { status: 400 })
    }

    // Use service role key for API routes
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
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    // Get translated summary from session_summary_cache
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
      fromCache: lang !== 'en',
    })
  } catch (error) {
    console.error('Summary retrieval error:', error)
    console.error('GET Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    })
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
