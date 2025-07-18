import { createClient } from '@/lib/supabase/client'

export interface Transcript {
  id: string
  original_text: string
  created_at: string
  session_id: string
  user_id: string | null
}

export async function loadSessionTranscripts(sessionId: string, token: Promise<string | null>) {
  const supabase = createClient(token)

  const { data: transcripts, error: transcriptError } = await supabase
    .from('transcripts')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })

  if (transcriptError) {
    console.error('Transcript loading error:', transcriptError)
    throw transcriptError
  }

  // 🆕 검수된 원문 텍스트로 업데이트
  const updatedTranscripts = await Promise.all(
    (transcripts || []).map(async (t) => {
      let originalText = t.original_text
      
      // translation_cache_ids가 있으면 검수된 텍스트 가져오기
      if (t.translation_cache_ids && t.translation_cache_ids.en) {
        try {
          const { data: reviewedCache } = await supabase
            .from('translation_cache')
            .select('original_text')
            .eq('id', t.translation_cache_ids.en)
            .maybeSingle()
          
          if (reviewedCache) {
            originalText = reviewedCache.original_text
            console.log(`✅ Loaded reviewed text: "${originalText.substring(0, 30)}..."`)
          }
        } catch (err) {
          console.error(`❌ Failed to load reviewed text for "${t.original_text.substring(0, 30)}..."`, err)
        }
      }
      
      return {
        ...t,
        original_text: originalText
      }
    })
  )

  console.log('📝 Transcript loading result:', {
    sessionId,
    transcripts: updatedTranscripts?.length || 0,
    sampleData: updatedTranscripts?.slice(0, 2),
  })

  return updatedTranscripts || []
}
