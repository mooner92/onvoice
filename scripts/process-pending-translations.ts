import { createClient } from '@supabase/supabase-js'
import { addTranslationJob } from '../lib/translation-queue'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function processPendingTranslations() {
  console.log('🔄 Processing pending translations...')

  // pending 상태인 번역들을 가져오기
  const { data: pendingTranscripts, error } = await supabase
    .from('transcripts')
    .select('*')
    .eq('translation_status', 'pending')
    .not('corrected_text', 'is', null)

  if (error) {
    console.error('Error fetching pending transcripts:', error)
    return
  }

  console.log(`Found ${pendingTranscripts?.length || 0} pending translations`)

  if (!pendingTranscripts || pendingTranscripts.length === 0) {
    console.log('No pending translations found')
    return
  }

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
    }
  }

  console.log('✅ All pending translations added to queue')
}

// 스크립트 실행
if (require.main === module) {
  processPendingTranslations()
    .then(() => {
      console.log('Script completed')
      process.exit(0)
    })
    .catch((error) => {
      console.error('Script failed:', error)
      process.exit(1)
    })
}

export { processPendingTranslations } 