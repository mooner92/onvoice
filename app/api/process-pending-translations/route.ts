import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { addTranslationJob } from '@/lib/translation-queue'

export async function POST() {
  try {
    console.log('🔄 Processing pending translations...')

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    // pending 상태인 번역들을 가져오기
    const { data: pendingTranscripts, error } = await supabase
      .from('transcripts')
      .select('*')
      .eq('translation_status', 'pending')
      .not('corrected_text', 'is', null)

    if (error) {
      console.error('Error fetching pending transcripts:', error)
      return NextResponse.json({ error: 'Failed to fetch pending transcripts' }, { status: 500 })
    }

    console.log(`Found ${pendingTranscripts?.length || 0} pending translations`)

    if (!pendingTranscripts || pendingTranscripts.length === 0) {
      return NextResponse.json({ message: 'No pending translations found', count: 0 })
    }

    let processedCount = 0

    // 각 pending 번역을 큐에 추가
    for (const transcript of pendingTranscripts) {
      if (transcript.corrected_text && transcript.id) {
        console.log(`Adding translation job for transcript ${transcript.id}`)
        addTranslationJob(
          transcript.corrected_text,
          'ko', // 한국어로 번역
          transcript.session_id,
          1, // 높은 우선순위
          transcript.id
        )
        processedCount++
      }
    }

    console.log(`✅ ${processedCount} pending translations added to queue`)

    return NextResponse.json({ 
      message: 'Pending translations processed successfully',
      count: processedCount
    })

  } catch (error) {
    console.error('Error processing pending translations:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
} 