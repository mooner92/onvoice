export interface Session {
  id: string
  title: string
  description?: string
  host_id: string
  host_name: string
  primary_language: string
  status: 'active' | 'ended'
  created_at: string
  ended_at?: string
  qr_code_url?: string
  session_url?: string
}

export interface QRCodeData {
  sessionId: string
  sessionUrl: string
  title: string
  hostName: string
}

export interface STTResponse {
  transcript: string
  confidence: number
  duration?: number
  error?: string
}

export interface SessionParticipant {
  id: string
  session_id: string
  user_id: string
  user_name: string
  role: 'speaker' | 'audience'
  joined_at: string
  left_at?: string
}

export interface Transcript {
  id: string
  session_id: string
  timestamp: string
  original_text: string
  translated_text?: string
  target_language?: string
  speaker_id?: string
  created_at: string
  translation_cache_ids?: Record<string, string> // { "ko": "uuid1", "ja": "uuid2" }
}

export interface UserSession {
  id: string
  user_id: string
  session_id: string
  role: 'speaker' | 'audience'
  saved_at: string
  expires_at?: string
  is_premium: boolean
}

export interface UserProfile {
  id: string
  email: string
  name: string
  avatar_url?: string
  subscription_status: 'free' | 'premium'
  subscription_expires_at?: string
  created_at: string
}

// 새로운 번역 관련 타입들
export interface TranslationCache {
  id: string
  content_hash: string
  original_text: string
  target_language: string
  translated_text: string
  translation_engine: 'gpt' | 'google' | 'local' | 'mock' | 'gemini-live'
  quality_score: number
  usage_count: number
  created_at: string
  expires_at: string
}

export interface TranslationJob {
  id: string
  text: string
  targetLanguage: string
  sessionId?: string
  transcriptId?: string // 🆕 transcript 상태 업데이트를 위한 ID
  priority: number
  status: 'pending' | 'processing' | 'completed' | 'failed'
  createdAt: number
}

export interface TranslationResponse {
  translatedText: string
  engine: string
  fromCache?: boolean
  isProcessing?: boolean
  jobId?: string
  quality?: number
}

export interface TranscriptLine {
  id: string
  timestamp: string
  original: string
  translated: string
  speaker?: string
  isTranslating?: boolean
  translationQuality?: number
  translatedLanguage?: string // 번역된 언어 추적
} 