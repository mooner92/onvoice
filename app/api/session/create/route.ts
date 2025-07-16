import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { auth } from '@clerk/nextjs/server'

export async function POST(req: NextRequest) {
  try {
    const { title, description, category, hostId, hostName, primaryLanguage } = await req.json()

    if (!title || !hostId || !hostName || !primaryLanguage) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Verify user authentication with Clerk
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify that the requesting user matches the hostId
    if (userId !== hostId) {
      return NextResponse.json({ error: 'Forbidden: Cannot create session for another user' }, { status: 403 })
    }

    // Use safe server-side Supabase client
    const supabase = createServerSupabaseClient()

    // Create session
    const { data: session, error } = await supabase
      .from('sessions')
      .insert({
        title,
        description,
        category: category || 'general',
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
      return NextResponse.json({ error: 'Failed to create session' }, { status: 500 })
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
        qr_code_url: publicUrl,
      })
      .eq('id', session.id)

    return NextResponse.json({
      session: {
        ...session,
        session_url: authUrl,
        qr_code_url: publicUrl,
        public_url: publicUrl,
      },
    })
  } catch (error) {
    console.error('Session creation error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
