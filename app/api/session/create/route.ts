import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export async function POST(req: NextRequest) {
  try {
    const { title, description, hostId, hostName, primaryLanguage } = await req.json()

    if (!title || !hostId || !hostName || !primaryLanguage) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      )
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Create session
    const { data: session, error } = await supabase
      .from('sessions')
      .insert({
        title,
        description,
        host_id: hostId,
        host_name: hostName,
        primary_language: primaryLanguage,
        status: 'active',
        created_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json(
        { error: "Failed to create session" },
        { status: 500 }
      )
    }

    // Generate session URLs
    const baseUrl = req.headers.get('origin') || 'http://localhost:3001'
    const publicUrl = `${baseUrl}/s/${session.id}`
    const authUrl = `${baseUrl}/session/${session.id}`

    // Update session with URLs
    await supabase
      .from('sessions')
      .update({
        session_url: authUrl,
        qr_code_url: publicUrl
      })
      .eq('id', session.id)

    return NextResponse.json({
      session: {
        ...session,
        session_url: authUrl,
        qr_code_url: publicUrl,
        public_url: publicUrl
      }
    })

  } catch (error) {
    console.error('Session creation error:', error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
} 