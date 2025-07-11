import { createClient } from '@/lib/supabase'

export interface Transcript {
  id: string
  original_text: string
  created_at: string
  session_id: string
  user_id: string | null
}

export async function loadSessionTranscripts(sessionId: string) {
  const supabase = createClient()
  
  const { data: transcripts, error: transcriptError } = await supabase
    .from('transcripts')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })

  if (transcriptError) {
    console.error('Transcript loading error:', transcriptError)
    throw transcriptError
  }

  console.log('📝 Transcript loading result:', {
    sessionId,
    transcripts: transcripts?.length || 0,
    sampleData: transcripts?.slice(0, 2)
  })

  return transcripts || []
}