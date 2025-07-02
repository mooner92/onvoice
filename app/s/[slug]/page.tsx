"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { 
  AlertCircle, 
  Globe, 
  Mic, 
  Users, 
  Clock, 
  User, 
  Settings,
  Loader2,
  X,
  CheckCircle,
  RefreshCw
} from "lucide-react"
import { useParams, useRouter } from "next/navigation"
import { useAuth } from "@/components/auth/AuthProvider"
import { createClient } from "@/lib/supabase"
import { useToast, ToastContainer } from "@/components/ui/toast"
import { Session } from "@/lib/types"
import type { TranscriptLine, TranslationResponse } from "@/lib/types"

export default function PublicSessionPage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useAuth()
  const supabase = createClient()
  const slug = params.slug as string
  const { toasts, addToast, removeToast } = useToast()

  // Get user's preferred language from browser or profile
  const getUserPreferredLanguage = () => {
    // Try to get from user metadata first
    if (user?.user_metadata?.preferred_language) {
      return user.user_metadata.preferred_language
    }
    
    // Fallback to browser language (only on client side)
    if (typeof window !== 'undefined' && navigator.language) {
      const browserLang = navigator.language.split('-')[0]
      const supportedLangs = ['ko', 'ja', 'zh', 'hi', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ar', 'en']
      return supportedLangs.includes(browserLang) ? browserLang : 'en' // Changed default to English
    }
    
    return 'en' // Default fallback to English for global usage
  }

  // Simple i18n for UI text based on browser language
  const getBrowserLanguage = () => {
    if (typeof window === 'undefined') return 'en'
    const browserLang = navigator.language.split('-')[0]
    return ['ko', 'ja', 'zh', 'es', 'fr', 'de'].includes(browserLang) ? browserLang : 'en'
  }

  const t = (key: string) => {
    const lang = getBrowserLanguage()
    const translations: Record<string, Record<string, string>> = {
      en: {
        'copySuccess': 'Text copied to clipboard',
        'copyFail': 'Copy failed',
        'noContent': 'No content to copy',
        'translation': 'Translation',
        'enableTranslation': 'Enable Translation',
        'targetLanguage': 'Target Language',
        'fontSize': 'Font Size',
        'darkMode': 'Dark Mode',
        'showTimestamps': 'Show Timestamps',
        'textOnlyMode': 'Text Only Mode (Copy Friendly)',
        'textCopy': 'Text Copy',
        'copyOriginal': '📋 Copy Original',
        'copyTranslation': '🌍 Copy Translation',
        'textOnlyModeHint': '💡 Text Only Mode: Copy pure text without numbers and timestamps.',
        'original': 'Original',
        'waitingSpeaker': 'Waiting for the speaker to start...',
        'noContentTranslate': 'No content to translate',
        'liveTranscription': 'Live transcription will appear here',
        'originalTranslated': 'Original transcript will be translated here',
        'sessionActive': 'Session is active',
        'joinSession': 'Join Session',
        'viewAsAudience': 'View as Audience',
        'realtimeTranscription': 'Real-time transcription and translation',
                 'liveSession': 'Live Session',
         'translationFailed': 'Translation Failed',
         'translating': 'Translating...',
         'aiTranslating': 'AI Translating...',
         'completed': 'Completed'
      },
      ko: {
        'copySuccess': '텍스트가 복사되었습니다',
        'copyFail': '복사 실패',
        'noContent': '복사할 내용이 없습니다',
        'translation': '번역',
        'enableTranslation': '번역 사용',
        'targetLanguage': '대상 언어',
        'fontSize': '글자 크기',
        'darkMode': '다크 모드',
        'showTimestamps': '타임스탬프 표시',
        'textOnlyMode': '텍스트만 보기 (복사 편의)',
        'textCopy': '텍스트 복사',
        'copyOriginal': '📋 원문 복사',
        'copyTranslation': '🌍 번역문 복사',
        'textOnlyModeHint': '💡 텍스트만 보기 모드: 번호와 타임스탬프 없이 순수 텍스트만 복사됩니다.',
        'original': '원문',
        'waitingSpeaker': '발표자가 말하기를 기다리고 있습니다...',
        'noContentTranslate': '번역할 내용이 없습니다',
        'liveTranscription': '실시간 전사가 여기에 표시됩니다',
        'originalTranslated': '원문 트랜스크립트가 여기에 번역됩니다',
        'sessionActive': '세션이 활성화되어 있습니다',
        'joinSession': '세션 참가',
        'viewAsAudience': '관객으로 보기',
        'realtimeTranscription': '실시간 전사 및 번역',
                 'liveSession': '라이브 세션',
         'translationFailed': '번역 실패',
         'translating': '번역 중...',
         'aiTranslating': 'AI 번역 중...',
         'completed': '완료'
      },
      ja: {
        'copySuccess': 'テキストがコピーされました',
        'copyFail': 'コピーに失敗しました',
        'noContent': 'コピーする内容がありません',
        'translation': '翻訳',
        'enableTranslation': '翻訳を有効にする',
        'targetLanguage': '対象言語',
        'fontSize': 'フォントサイズ',
        'darkMode': 'ダークモード',
        'showTimestamps': 'タイムスタンプを表示',
        'textOnlyMode': 'テキストのみモード（コピー向け）',
        'textCopy': 'テキストコピー',
        'copyOriginal': '📋 原文をコピー',
        'copyTranslation': '🌍 翻訳をコピー',
        'textOnlyModeHint': '💡 テキストのみモード：番号とタイムスタンプなしで純粋なテキストのみをコピーします。',
        'original': '原文',
        'waitingSpeaker': '話者の開始を待っています...',
        'noContentTranslate': '翻訳する内容がありません',
        'liveTranscription': 'ライブ転写がここに表示されます',
        'originalTranslated': '原文転写がここに翻訳されます',
        'sessionActive': 'セッションがアクティブです',
        'joinSession': 'セッションに参加',
        'viewAsAudience': '視聴者として表示',
        'realtimeTranscription': 'リアルタイム転写と翻訳',
                 'liveSession': 'ライブセッション',
         'translationFailed': '翻訳に失敗しました',
         'translating': '翻訳中...',
         'aiTranslating': 'AI翻訳中...',
         'completed': '完了'
      },
      es: {
        'copySuccess': 'Texto copiado al portapapeles',
        'copyFail': 'Error al copiar',
        'noContent': 'No hay contenido para copiar',
        'translation': 'Traducción',
        'enableTranslation': 'Habilitar traducción',
        'targetLanguage': 'Idioma destino',
        'fontSize': 'Tamaño de fuente',
        'darkMode': 'Modo oscuro',
        'showTimestamps': 'Mostrar marcas de tiempo',
        'textOnlyMode': 'Modo solo texto (fácil copia)',
        'textCopy': 'Copiar texto',
        'copyOriginal': '📋 Copiar original',
        'copyTranslation': '🌍 Copiar traducción',
        'textOnlyModeHint': '💡 Modo solo texto: Copia texto puro sin números ni marcas de tiempo.',
        'original': 'Original',
        'waitingSpeaker': 'Esperando que el orador comience...',
        'noContentTranslate': 'No hay contenido para traducir',
        'liveTranscription': 'La transcripción en vivo aparecerá aquí',
        'originalTranslated': 'La transcripción original se traducirá aquí',
        'sessionActive': 'La sesión está activa',
        'joinSession': 'Unirse a la sesión',
        'viewAsAudience': 'Ver como audiencia',
        'realtimeTranscription': 'Transcripción y traducción en tiempo real',
                 'liveSession': 'Sesión en vivo',
         'translationFailed': 'Error de traducción',
         'translating': 'Traduciendo...',
         'aiTranslating': 'IA traduciendo...',
         'completed': 'Completado'
       },
       fr: {
        'copySuccess': 'Texte copié dans le presse-papiers',
        'copyFail': 'Échec de la copie',
        'noContent': 'Aucun contenu à copier',
        'translation': 'Traduction',
        'enableTranslation': 'Activer la traduction',
        'targetLanguage': 'Langue cible',
        'fontSize': 'Taille de police',
        'darkMode': 'Mode sombre',
        'showTimestamps': 'Afficher les horodatages',
        'textOnlyMode': 'Mode texte seul (copie facile)',
        'textCopy': 'Copier le texte',
        'copyOriginal': '📋 Copier l\'original',
        'copyTranslation': '🌍 Copier la traduction',
        'textOnlyModeHint': '💡 Mode texte seul: Copie le texte pur sans numéros ni horodatages.',
        'original': 'Original',
        'waitingSpeaker': 'En attente du début de l\'orateur...',
        'noContentTranslate': 'Aucun contenu à traduire',
        'liveTranscription': 'La transcription en direct apparaîtra ici',
        'originalTranslated': 'La transcription originale sera traduite ici',
        'sessionActive': 'La session est active',
        'joinSession': 'Rejoindre la session',
        'viewAsAudience': 'Voir en tant qu\'audience',
        'realtimeTranscription': 'Transcription et traduction en temps réel',
                 'liveSession': 'Session en direct',
         'translationFailed': 'Échec de la traduction',
         'translating': 'Traduction...',
         'aiTranslating': 'IA en traduction...',
         'completed': 'Terminé'
       },
       de: {
        'copySuccess': 'Text in die Zwischenablage kopiert',
        'copyFail': 'Kopieren fehlgeschlagen',
        'noContent': 'Kein Inhalt zum Kopieren',
        'translation': 'Übersetzung',
        'enableTranslation': 'Übersetzung aktivieren',
        'targetLanguage': 'Zielsprache',
        'fontSize': 'Schriftgröße',
        'darkMode': 'Dunkler Modus',
        'showTimestamps': 'Zeitstempel anzeigen',
        'textOnlyMode': 'Nur-Text-Modus (kopierfreundlich)',
        'textCopy': 'Text kopieren',
        'copyOriginal': '📋 Original kopieren',
        'copyTranslation': '🌍 Übersetzung kopieren',
        'textOnlyModeHint': '💡 Nur-Text-Modus: Kopiert reinen Text ohne Nummern und Zeitstempel.',
        'original': 'Original',
        'waitingSpeaker': 'Warten auf den Beginn des Sprechers...',
        'noContentTranslate': 'Kein Inhalt zum Übersetzen',
        'liveTranscription': 'Live-Transkription wird hier angezeigt',
        'originalTranslated': 'Original-Transkript wird hier übersetzt',
        'sessionActive': 'Sitzung ist aktiv',
        'joinSession': 'Sitzung beitreten',
        'viewAsAudience': 'Als Zuschauer anzeigen',
        'realtimeTranscription': 'Echtzeit-Transkription und -Übersetzung',
                 'liveSession': 'Live-Sitzung',
         'translationFailed': 'Übersetzung fehlgeschlagen',
         'translating': 'Übersetzen...',
         'aiTranslating': 'KI übersetzt...',
         'completed': 'Abgeschlossen'
       },
       zh: {
        'copySuccess': '文本已复制到剪贴板',
        'copyFail': '复制失败',
        'noContent': '没有内容可复制',
        'translation': '翻译',
        'enableTranslation': '启用翻译',
        'targetLanguage': '目标语言',
        'fontSize': '字体大小',
        'darkMode': '深色模式',
        'showTimestamps': '显示时间戳',
        'textOnlyMode': '纯文本模式（便于复制）',
        'textCopy': '复制文本',
        'copyOriginal': '📋 复制原文',
        'copyTranslation': '🌍 复制翻译',
        'textOnlyModeHint': '💡 纯文本模式：复制不带编号和时间戳的纯文本。',
        'original': '原文',
        'waitingSpeaker': '等待发言者开始...',
        'noContentTranslate': '没有内容可翻译',
        'liveTranscription': '实时转录将在这里显示',
        'originalTranslated': '原始转录将在这里翻译',
        'sessionActive': '会话处于活动状态',
        'joinSession': '加入会话',
        'viewAsAudience': '以观众身份查看',
        'realtimeTranscription': '实时转录和翻译',
                 'liveSession': '直播会话',
         'translationFailed': '翻译失败',
         'translating': '翻译中...',
         'aiTranslating': 'AI翻译中...',
         'completed': '已完成'
      }
    }
    
    return translations[lang]?.[key] || translations['en'][key] || key
  }

  const [translationEnabled, setTranslationEnabled] = useState(false)
  const [selectedLanguage, setSelectedLanguage] = useState(() => getUserPreferredLanguage())
  const [fontSize, setFontSize] = useState([18])
  const [darkMode, setDarkMode] = useState(false)
  const [showTimestamps, setShowTimestamps] = useState(true)
  const [showSettings, setShowSettings] = useState(false)
  const [participantCount, setParticipantCount] = useState(0)
  const [transcript, setTranscript] = useState<TranscriptLine[]>([])
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [hasJoined, setHasJoined] = useState(false)

  // 번역 관련 상태
  const [translationStats, setTranslationStats] = useState({
    cached: 0,
    processing: 0,
    completed: 0
  })

  // 🆕 텍스트만 보기 상태
  const [textOnlyMode, setTextOnlyMode] = useState(false)

  // Set user preferred language on client side
  useEffect(() => {
    setSelectedLanguage(getUserPreferredLanguage())
  }, [user])

  const languages = [
    { code: "ko", name: "Korean", flag: "🇰🇷" },
    { code: "ja", name: "Japanese", flag: "🇯🇵" },
    { code: "zh", name: "Chinese", flag: "🇨🇳" },
    { code: "hi", name: "Hindi", flag: "🇮🇳" },
    { code: "es", name: "Spanish", flag: "🇪🇸" },
    { code: "fr", name: "French", flag: "🇫🇷" },
    { code: "de", name: "German", flag: "🇩🇪" },
    { code: "it", name: "Italian", flag: "🇮🇹" },
    { code: "pt", name: "Portuguese", flag: "🇵🇹" },
    { code: "ru", name: "Russian", flag: "🇷🇺" },
    { code: "ar", name: "Arabic", flag: "🇸🇦" },
    { code: "en", name: "English", flag: "🇺🇸" },
  ]

  // 번역 캐시 (클라이언트 사이드)
  const translationCache = useRef<Map<string, TranslationResponse>>(new Map())
  const pendingTranslations = useRef<Set<string>>(new Set())

  // Load session data using slug or session ID
  useEffect(() => {
    const loadSession = async () => {
      try {
        setLoading(true)
        setError(null)

        // First try to find by slug (assumed to be session ID for now)
        let sessionData
        let sessionError

        // Try as session ID first
        const { data: directSession, error: directError } = await supabase
          .from('sessions')
          .select('*')
          .eq('id', slug)
          .eq('status', 'active')
          .single()

        if (directSession && !directError) {
          sessionData = directSession
        } else {
          // Try to find by custom slug or title match
          const { data: slugSession, error: slugError } = await supabase
            .from('sessions')
            .select('*')
            .ilike('title', `%${slug}%`)
            .eq('status', 'active')
            .limit(1)
            .single()

          sessionData = slugSession
          sessionError = slugError
        }

        if (!sessionData) {
          console.error('Session not found:', { slug, directError, sessionError })
          setError(`Session not found (ID: ${slug}). The session may have ended or the link may be invalid.`)
          return
        }

        setSession(sessionData)
        setSessionId(sessionData.id)

        // Load existing transcripts
        const { data: transcripts } = await supabase
          .from('transcripts')
          .select('*')
          .eq('session_id', sessionData.id)
          .order('created_at', { ascending: true })

        if (transcripts) {
          const formattedTranscripts: TranscriptLine[] = transcripts.map(t => ({
            id: t.id,
            timestamp: new Date(t.created_at).toLocaleTimeString(),
            original: t.original_text,
            translated: t.original_text, // 초기에는 원문으로 설정
            speaker: sessionData.host_name,
            isTranslating: false
          }))
          setTranscript(formattedTranscripts)
        }

      } catch (error) {
        console.error('Error loading session:', error)
        setError(`Failed to load session: ${error instanceof Error ? error.message : 'Unknown error'}`)
      } finally {
        setLoading(false)
      }
    }

    if (slug) {
      loadSession()
    }
  }, [slug, supabase])

  // 개선된 번역 함수
  const translateText = useCallback(async (text: string, targetLang: string): Promise<TranslationResponse> => {
    const cacheKey = `${text}:${targetLang}`
    
    // 1. 클라이언트 캐시 확인
    if (translationCache.current.has(cacheKey)) {
      const cached = translationCache.current.get(cacheKey)!
      console.log(`📋 Client cache hit for "${text.substring(0, 30)}..." → ${targetLang} (${cached.engine})`);
      return cached
    }
    
    // 2. 강화된 중복 요청 방지
    if (pendingTranslations.current.has(cacheKey)) {
      console.log(`🚫 BLOCKED duplicate request: "${text.substring(0, 30)}..." → ${targetLang}`);
      // 중복 요청은 즉시 원문 반환 (API 호출 방지)
      const duplicateResponse: TranslationResponse = {
        translatedText: text, // 원문 그대로 반환
        engine: 'duplicate-blocked',
        fromCache: true // 캐시로 처리한 것처럼 표시
      }
      return duplicateResponse
    }
    
    // 3. 영어 텍스트 자동 감지 및 passthrough
    if (targetLang === 'en' && /^[a-zA-Z0-9\s.,!?'"()-]+$/.test(text)) {
      console.log(`⏭️ English passthrough: "${text.substring(0, 30)}..."`)
      const passthrough: TranslationResponse = {
        translatedText: text,
        engine: 'passthrough',
        fromCache: true,
        quality: 1.0
      }
      translationCache.current.set(cacheKey, passthrough)
      return passthrough
    }
    
    try {
      pendingTranslations.current.add(cacheKey)
      
      console.log(`🌍 API CALL: "${text.substring(0, 30)}..." → ${targetLang} [Session: ${sessionId?.substring(0, 8)}...]`)
      
      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          targetLanguage: targetLang,
          sessionId: sessionId // 세션 ID 포함하여 우선순위 높임
        }),
      })

      if (!response.ok) {
        throw new Error(`Translation API failed: ${response.status}`)
      }

      const result: TranslationResponse = await response.json()
      
      // 캐시에 저장
      translationCache.current.set(cacheKey, result)
      
      console.log(`✅ Translation response: ${result.engine} (fromCache: ${result.fromCache}, isProcessing: ${result.isProcessing})`)
      
      // 백그라운드 번역이 진행 중인 경우 즉시 상태 확인 시작
      if (result.isProcessing && result.engine === 'mock') {
        console.log(`🚀 Starting background translation monitoring for "${text.substring(0, 30)}..." → ${targetLang}`)
        // 첫 번째 확인은 1초 후 (빠른 응답을 위해)
        setTimeout(() => {
          checkTranslationStatus(text, targetLang, cacheKey, 0)
        }, 1000)
      }
      
      return result
      
    } catch (error) {
      console.error('Translation error:', error)
      const fallback: TranslationResponse = {
        translatedText: `[${t('translationFailed')}: ${error instanceof Error ? error.message : 'Unknown error'}]`,
        engine: 'error',
        fromCache: false
      }
      translationCache.current.set(cacheKey, fallback)
      return fallback
    } finally {
      pendingTranslations.current.delete(cacheKey)
    }
  }, [sessionId])

  // 번역 상태 확인 (백그라운드 번역 완료 체크) - 개선된 버전
  const checkTranslationStatus = useCallback(async (text: string, targetLang: string, cacheKey: string, retryCount: number = 0) => {
    try {
      console.log(`🔍 Checking translation status (retry ${retryCount}): "${text.substring(0, 30)}..." → ${targetLang}`)
      
      const response = await fetch(`/api/translate?text=${encodeURIComponent(text)}&targetLanguage=${targetLang}`)
      
      if (response.ok) {
        const result = await response.json()
        
        if (result.completed) {
          console.log(`🎉 Background translation completed: "${text.substring(0, 30)}..." → ${targetLang} (${result.engine})`)
          
          const updatedResult: TranslationResponse = {
            translatedText: result.translatedText,
            engine: result.engine,
            fromCache: true,
            quality: result.quality
          }
          
          // 캐시 업데이트 (키 통일)
          const unifiedCacheKey = `${text}:${targetLang}`
          translationCache.current.set(unifiedCacheKey, updatedResult)
          
          // UI 업데이트 - 현재 선택된 언어와 일치하는 경우만 업데이트
          setTranscript(prev => prev.map(line => {
            if (line.original === text && selectedLanguage === targetLang) {
              return {
                ...line,
                translated: result.translatedText,
                translatedLanguage: targetLang,
                isTranslating: false,
                translationQuality: result.quality
              }
            }
            return line
          }))
          
          // 통계 업데이트
          setTranslationStats(prev => ({
            ...prev,
            processing: Math.max(0, prev.processing - 1),
            completed: prev.completed + 1
          }))
          
          return true // 번역 완료
        } else {
          // 아직 진행 중인 경우, 최대 5번까지 재시도
          if (retryCount < 5) {
            const delay = Math.min(2000 * Math.pow(1.5, retryCount), 10000) // 지수적 백오프 (최대 10초)
            console.log(`⏳ Translation still in progress, retrying in ${delay}ms...`)
            setTimeout(() => {
              checkTranslationStatus(text, targetLang, cacheKey, retryCount + 1)
            }, delay)
          } else {
            console.log(`⚠️ Translation check timeout for "${text.substring(0, 30)}..." → ${targetLang}`)
            // 타임아웃된 경우 번역 중 상태 해제
            setTranscript(prev => prev.map(line => {
              if (line.original === text && selectedLanguage === targetLang) {
                return {
                  ...line,
                  isTranslating: false,
                  translated: `[${t('translationFailed')}] ${text}`,
                  translatedLanguage: targetLang
                }
              }
              return line
            }))
            
            setTranslationStats(prev => ({
              ...prev,
              processing: Math.max(0, prev.processing - 1)
            }))
          }
        }
      }
      return false
    } catch (error) {
      console.error('Translation status check failed:', error)
      return false
    }
  }, [selectedLanguage])

  // Join session as participant or guest
  const joinSession = useCallback(async () => {
    if (!sessionId) return

    try {
      console.log('🚀 Joining session:', { sessionId, userId: user?.id || 'guest' })
      
      // For non-logged in users, mark as joined immediately
      if (!user) {
        console.log('✅ Guest user viewing session')
        setHasJoined(true)
        return
      }
      
      // For logged in users, add to participants
      const isHost = session?.host_id === user.id
      
      const participantData = {
        session_id: sessionId,
        user_id: user.id,
        user_name: user.user_metadata?.full_name || user.email || 'User',
        role: isHost ? 'host_viewing' as const : 'audience' as const,
        joined_at: new Date().toISOString()
      }

      const { error } = await supabase
        .from('session_participants')
        .insert(participantData)

      if (error && !error.message.includes('duplicate')) {
        console.error('Error joining session:', error)
        throw error
      }

      console.log('✅ Successfully joined session')
      setHasJoined(true)
    } catch (error) {
      console.error('❌ Error joining session:', error)
      // Even if error, allow viewing
      setHasJoined(true)
    }
  }, [sessionId, user, session?.host_id, supabase])

  // Auto-join session when session is loaded (for both logged-in and guest users)
  useEffect(() => {
    if (sessionId && session && !hasJoined) {
      console.log('🔄 Auto-joining session...')
      joinSession()
    }
  }, [sessionId, session, hasJoined, joinSession])

  // Handle new transcript updates (번역 자동화 개선)
  const handleTranscriptUpdate = useCallback((newText: string, isPartial: boolean = false) => {
    const now = new Date()
    const timestamp = now.toLocaleTimeString()
    const newId = `${now.getTime()}-${Math.random()}`
    
    const newLine: TranscriptLine = {
      id: newId,
      timestamp,
      original: newText,
      translated: newText, // 초기에는 원문으로 설정
      translatedLanguage: selectedLanguage, // 현재 선택된 언어로 설정
      speaker: session?.host_name || 'Speaker',
      isTranslating: false
    }

    if (isPartial) {
      // For partial updates, replace the last line if it exists
      setTranscript(prev => {
        const newTranscript = [...prev]
        if (newTranscript.length > 0 && newTranscript[newTranscript.length - 1].id.includes('partial')) {
          newTranscript[newTranscript.length - 1] = { ...newLine, id: `${newId}-partial` }
        } else {
          newTranscript.push({ ...newLine, id: `${newId}-partial` })
        }
        return newTranscript
      })
    } else {
      // For final updates, add as new line
      setTranscript(prev => {
        // Remove any partial line and add the final line
        const withoutPartial = prev.filter(line => !line.id.includes('partial'))
        return [...withoutPartial, newLine]
      })
      
      // 번역이 활성화된 경우 즉시 번역 시작 (영어가 아닌 경우)
      if (translationEnabled && selectedLanguage !== 'en') {
        console.log(`🚀 Auto-translating new transcript: "${newText.substring(0, 30)}..." → ${selectedLanguage}`)
        
        // 트랜스크립트 추가 후 번역 함수 호출 (ref 방식으로 해결)
        const currentLang = selectedLanguage
        setTimeout(() => {
          // 직접 번역 API 호출하여 circular dependency 방지
          if (typeof translateText === 'function') {
            setTranscript(prev => prev.map(t => 
              t.id === newLine.id ? { ...t, isTranslating: true } : t
            ))
            
            translateText(newText, currentLang).then(result => {
              setTranscript(prev => prev.map(t => 
                t.id === newLine.id ? {
                  ...t, 
                  translated: result.translatedText,
                  translatedLanguage: currentLang,
                  isTranslating: false,
                  translationQuality: result.quality
                } : t
              ))
                        }).catch(error => {
              console.error('Auto-translation failed:', error)
              const failedMessage = `[${t('translationFailed')}] ${newText}`
              setTranscript(prev => prev.map(t => 
                t.id === newLine.id ? { 
                  ...t, 
                  isTranslating: false,
                  translated: failedMessage,
                  translatedLanguage: currentLang
                } : t
              ))
            })
          }
        }, 100)
      } else if (selectedLanguage === 'en') {
        // 영어인 경우 즉시 passthrough
        setTranscript(prev => prev.map(line => 
          line.id === newLine.id ? { 
            ...line, 
            translated: newText, 
            translatedLanguage: 'en',
            isTranslating: false
          } : line
        ))
      }
    }
  }, [translationEnabled, selectedLanguage, session?.host_name])

  // 특정 라인을 번역하는 함수 (완전 안정화된 버전)
  const translateTextForLine = useCallback(async (line: TranscriptLine, targetLang: string) => {
    // 이미 해당 언어로 번역된 경우 건너뛰기
    if (line.translatedLanguage === targetLang && line.translated !== line.original) {
      console.log(`⏭️ Line already translated to ${targetLang}: "${line.original.substring(0, 30)}..."`)
      return
    }
    
    // 번역 중인 경우 건너뛰기
    if (line.isTranslating) {
      console.log(`⏳ Line already being translated: "${line.original.substring(0, 30)}..."`)
      return
    }
    
    let isStillActive = true
    
    try {
      // 번역 중 상태로 설정
      setTranscript(prev => prev.map(t => 
        t.id === line.id ? { ...t, isTranslating: true } : t
      ))
      
      const result = await translateText(line.original, targetLang)
      
      if (!isStillActive) return
      
      // 번역 완료 후 상태 확실히 업데이트 (isTranslating 반드시 false로)
      setTranscript(prev => prev.map(t => 
        t.id === line.id ? {
          ...t, 
          translated: result.translatedText,
          translatedLanguage: targetLang,
          isTranslating: false, // 항상 false로 설정 (번역 중 상태 완전 해제)
          translationQuality: result.quality
        } : t
      ))
      
      // 통계 업데이트 - 간소화
      if (result.fromCache || result.engine === 'duplicate-blocked' || result.engine === 'passthrough') {
        setTranslationStats(prev => ({
          ...prev,
          cached: prev.cached + 1,
          processing: Math.max(0, prev.processing - 1)
        }))
      } else {
        setTranslationStats(prev => ({
          ...prev,
          completed: prev.completed + 1,
          processing: Math.max(0, prev.processing - 1)
        }))
      }
      
      console.log(`✅ Translation completed: "${line.original.substring(0, 30)}..." → ${targetLang} (${result.engine})`)
      
    } catch (error) {
      if (!isStillActive) return
      
      console.error('Translation failed for line:', error)
      
      // 오류 시에도 번역 중 상태 확실히 해제
      const failedMessage = `[${t('translationFailed')}] ${line.original}`
      setTranscript(prev => prev.map(t => 
        t.id === line.id ? { 
          ...t, 
          isTranslating: false,
          translated: failedMessage,
          translatedLanguage: targetLang
        } : t
      ))
      
      setTranslationStats(prev => ({ ...prev, processing: Math.max(0, prev.processing - 1) }))
    }
    
    return () => {
      isStillActive = false
    }
  }, [translateText])

  // Subscribe to real-time transcript updates
  useEffect(() => {
    if (!sessionId) return

    console.log('🔄 Setting up real-time transcript subscription:', {
      sessionId,
      hasJoined,
      timestamp: new Date().toLocaleTimeString()
    })

    const channel = supabase
      .channel(`public:transcripts-${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'transcripts',
          filter: `session_id=eq.${sessionId}`
        },
        (payload) => {
          console.log('📨 New transcript received:', payload.new)
          const newTranscript = payload.new as { original_text: string }
          
          handleTranscriptUpdate(newTranscript.original_text, false)
        }
      )
      .subscribe((status) => {
        console.log('📡 Real-time subscription status:', status)
      })

    return () => {
      console.log('🧹 Cleaning up real-time subscription')
      supabase.removeChannel(channel)
    }
  }, [sessionId, supabase, handleTranscriptUpdate])

  // Update participant count
  const updateParticipantCount = useCallback(async () => {
    if (!sessionId) return

    try {
      const { count } = await supabase
        .from('session_participants')
        .select('*', { count: 'exact', head: true })
        .eq('session_id', sessionId)
        .is('left_at', null)

      setParticipantCount(count || 0)
    } catch (error) {
      console.error('Error updating participant count:', error)
    }
  }, [sessionId, supabase])

  // Subscribe to participant updates
  useEffect(() => {
    if (!sessionId) return

    const channel = supabase
      .channel(`public-participants-${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'session_participants',
          filter: `session_id=eq.${sessionId}`
        },
        () => {
          updateParticipantCount()
        }
      )
      .subscribe()

    updateParticipantCount()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [sessionId, supabase, updateParticipantCount])

  // 언어 변경시 번역 처리 (완전 개선된 버전)
  useEffect(() => {
    if (!translationEnabled) {
      // 번역 비활성화시 원문으로 리셋
      setTranscript(prev => prev.map(line => ({
        ...line,
        translated: line.original,
        translatedLanguage: 'en',
        isTranslating: false
      })))
      setTranslationStats({ cached: 0, processing: 0, completed: 0 })
      return
    }

    if (transcript.length === 0) return
    
    console.log(`🔄 COMPLETE translation reset for ${transcript.length} transcripts to ${selectedLanguage}`)
    
    // 즉시 모든 번역 상태 초기화 (언어 변경 시 섞임 방지)
    setTranscript(prev => prev.map(line => ({
      ...line,
      translated: line.original, // 임시로 원문으로 설정
      translatedLanguage: selectedLanguage,
      isTranslating: false // 번역 중 상태 완전 해제
    })))
    
    setTranslationStats({ cached: 0, processing: 0, completed: 0 })
    
    let isActive = true
    
    // 모든 트랜스크립트를 해당 언어로 번역 (일관성 확보)
    const translateAllTranscripts = async () => {
      if (!isActive) return
      
      let cachedCount = 0
      let newTranslations = 0
      
      // 영어인 경우 즉시 passthrough
      if (selectedLanguage === 'en') {
        setTranscript(prev => prev.map(line => ({
          ...line,
          translated: line.original,
          translatedLanguage: 'en',
          isTranslating: false
        })))
        console.log(`✅ English passthrough for all ${transcript.length} transcripts`)
        return
      }
      
      // 모든 트랜스크립트 번역 (일관성 보장)
      for (const line of transcript) {
        if (!isActive) break
        
        // 캐시 확인
        const cacheKey = `${line.original}:${selectedLanguage}`
        const cachedResult = translationCache.current.get(cacheKey)
        
        if (cachedResult) {
          // 캐시된 번역 즉시 적용
          setTranscript(prev => prev.map(l => 
            l.id === line.id ? { 
              ...l, 
              translated: cachedResult.translatedText,
              translatedLanguage: selectedLanguage,
              isTranslating: false,
              translationQuality: cachedResult.quality
            } : l
          ))
          cachedCount++
          console.log(`📋 Applied cached: "${line.original.substring(0, 30)}..." → ${selectedLanguage}`)
        } else {
          // 새로운 번역이 필요한 경우만 API 호출
          console.log(`🔄 Queuing translation: "${line.original.substring(0, 30)}..." → ${selectedLanguage}`)
          translateTextForLine(line, selectedLanguage)
          newTranslations++
        }
      }
      
      console.log(`📊 Translation summary: ${cachedCount} cached, ${newTranslations} queued for API`)
      
      // 통계 업데이트
      setTranslationStats(prev => ({
        ...prev,
        cached: cachedCount,
        processing: newTranslations
      }))
    }
    
    // 짧은 딜레이 후 실행
    const timeoutId = setTimeout(() => {
      translateAllTranscripts()
    }, 200)
    
    return () => {
      isActive = false
      clearTimeout(timeoutId)
    }
  }, [selectedLanguage, translationEnabled, transcript.length]) // transcript.length 추가로 새 항목 감지

  // Clear cache when translation is disabled
  useEffect(() => {
    if (!translationEnabled) {
      translationCache.current.clear()
      pendingTranslations.current.clear()
    }
  }, [translationEnabled])

  const selectedLang = languages.find((lang) => lang.code === selectedLanguage)

  // 🆕 텍스트 복사 기능 (다국어화)
  const copyTextOnly = useCallback(async (type: 'original' | 'translation', event?: React.MouseEvent) => {
    // 이벤트 기본 동작 방지 (페이지 이동 방지)
    if (event) {
      event.preventDefault()
      event.stopPropagation()
    }
    
    if (transcript.length === 0) {
      addToast({
        type: 'warning',
        title: t('noContent'),
        duration: 1500
      })
      return
    }
    
    const textContent = transcript
      .map((line, index) => {
        const text = type === 'original' ? line.original : line.translated
        return textOnlyMode ? text : `${index + 1}. ${text}`
      })
      .join('\n\n')
    
    try {
      // 모던 브라우저 (HTTPS 환경)
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(textContent)
        console.log('✅ Text copied using modern clipboard API')
      } else {
        // 호환성 fallback (HTTP 환경 등)
        const textArea = document.createElement('textarea')
        textArea.value = textContent
        textArea.style.position = 'fixed'
        textArea.style.left = '-999999px'
        textArea.style.top = '-999999px'
        document.body.appendChild(textArea)
        textArea.focus()
        textArea.select()
        
        const successful = document.execCommand('copy')
        document.body.removeChild(textArea)
        
        if (!successful) {
          throw new Error('execCommand copy failed')
        }
        console.log('✅ Text copied using fallback method')
      }
      
      // 다국어화된 성공 Toast
      addToast({
        type: 'success',
        title: t('copySuccess'),
        duration: 2000
      })
      
    } catch (err) {
      console.error('❌ Failed to copy text:', err)
      
      // 다국어화된 실패 Toast
      addToast({
        type: 'error',
        title: t('copyFail'),
        duration: 3000
      })
    }
  }, [transcript, textOnlyMode, addToast])

  // Render transcript content function
  const renderTranscriptContent = (type: 'original' | 'translation') => {
    if (transcript.length === 0) {
      return (
        <div className={`text-center py-16 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
          <div className={`mx-auto w-16 h-16 rounded-full ${darkMode ? 'bg-gray-800' : 'bg-gray-100'} flex items-center justify-center mb-6`}>
            {type === 'original' ? (
              <Mic className="h-8 w-8 opacity-50" />
            ) : (
              <Globe className="h-8 w-8 opacity-50" />
            )}
          </div>
          <h3 className={`text-lg font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
            {type === 'original' ? t('waitingSpeaker') : t('noContentTranslate')}
          </h3>
          <p className="text-sm">
            {type === 'original' ? t('liveTranscription') : t('originalTranslated')}
          </p>
          {type === 'original' && (
            <div className="mt-4 flex items-center justify-center space-x-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-xs">{t('sessionActive')}</span>
            </div>
          )}
        </div>
      )
    }

    // 🆕 텍스트만 보기 모드
    if (textOnlyMode) {
      return (
        <div className="space-y-2">
          {transcript.map((line) => {
            const text = type === 'original' ? line.original : line.translated
            return (
              <div 
                key={`text-only-${type}-${line.id}`}
                className={`leading-relaxed ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}
                style={{ fontSize: `${fontSize[0]}px` }}
              >
                {text}
              </div>
            )
          })}
        </div>
      )
    }

    return (
      <div className="space-y-3">
        {transcript.map((line, index) => {
          const text = type === 'original' ? line.original : line.translated
          
          return (
            <div key={`${type}-${line.id}`} className="group">
              {/* Timestamp */}
              {showTimestamps && (
                <div className={`text-xs mb-1 flex items-center space-x-2 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  <span className="font-medium">#{index + 1}</span>
                  <span>•</span>
                  <span>{line.timestamp}</span>
                  <span>•</span>
                  <span>{type === 'original' ? line.speaker : selectedLang?.name}</span>
                  {type === 'translation' && line.isTranslating && (
                    <>
                      <span>•</span>
                      <RefreshCw className="h-3 w-3 animate-spin" />
                      <span>{t('translating')}</span>
                    </>
                  )}
                  {type === 'translation' && !line.isTranslating && line.translationQuality && line.translationQuality > 0.8 && (
                    <>
                      <span>•</span>
                      <CheckCircle className="h-3 w-3 text-green-600" />
                      <span>{t('completed')}</span>
                    </>
                  )}
                </div>
              )}
              
              {/* Main Text */}
              <div 
                className={`leading-relaxed mb-1 ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}
                style={{ fontSize: `${fontSize[0]}px` }}
              >
                {text}
              </div>
              
              {/* Translation should ONLY show below original in mobile view - NOT on desktop */}
              {type === 'original' && translationEnabled && selectedLanguage !== 'en' && 
               line.translated !== line.original && (
                <div 
                  className={`lg:hidden leading-relaxed italic pl-4 border-l-2 ${
                    darkMode 
                      ? 'text-gray-300 border-gray-600' 
                      : 'text-gray-700 border-gray-300'
                  }`}
                  style={{ fontSize: `${fontSize[0] - 1}px` }}
                >
                  {line.isTranslating ? (
                    <span className="text-gray-400 flex items-center space-x-2">
                      <RefreshCw className="h-3 w-3 animate-spin" />
                      <span>[{t('aiTranslating')}]</span>
                    </span>
                  ) : (
                    line.translated
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card>
          <CardContent className="p-8">
            <div className="flex flex-col items-center space-y-4">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              <p className="text-gray-600">Loading session...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card>
          <CardContent className="p-8">
            <div className="flex flex-col items-center space-y-4">
              <AlertCircle className="h-8 w-8 text-red-600" />
              <p className="text-gray-900 font-medium">Session Not Found</p>
              <p className="text-gray-600 text-sm text-center">{error}</p>
              <Button onClick={() => router.push('/')} variant="outline">
                Go Home
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!hasJoined && session) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="p-8">
            <div className="text-center space-y-6">
              <div>
                <Mic className="h-12 w-12 text-blue-600 mx-auto mb-4" />
                <h1 className="text-2xl font-bold text-gray-900">{session.title}</h1>
                <p className="text-gray-600 mt-2">by {session.host_name}</p>
                <Badge className="mt-2 bg-green-100 text-green-800">
                  {t('liveSession')}
                </Badge>
              </div>

              <div className="space-y-4">
                {user && (
                  <div className="text-sm text-gray-600">
                    Welcome, <strong>{user.user_metadata?.full_name || user.email}</strong>!
                  </div>
                )}
                
                {user && session?.host_id === user.id && (
                  <div className="text-sm text-blue-600 bg-blue-50 p-3 rounded-lg">
                    <strong>👑 You are the host</strong>
                    <br />
                    Join as audience to see how your session appears to attendees.
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <Button onClick={joinSession} className="w-full">
                  <Globe className="mr-2 h-4 w-4" />
                  {user && session?.host_id === user.id ? t('viewAsAudience') : t('joinSession')}
                </Button>
              </div>

              <div className="text-xs text-gray-400">
                {t('realtimeTranscription')}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className={`min-h-screen ${darkMode ? 'dark bg-gray-900' : 'bg-gray-50'}`}>
      {/* Mobile Header */}
      <header className={`border-b ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white'} sticky top-0 z-40`}>
        <div className="px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse"></div>
              <div>
                <span className={`text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  {session?.title || 'Live Session'}
                </span>
                <div className="flex items-center space-x-2 text-xs text-gray-500">
                  <Users className="h-3 w-3" />
                  <span>{participantCount}</span>
                  <Clock className="h-3 w-3" />
                  <span>Live</span>
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              {user ? (
                <div className="flex items-center space-x-1 text-xs text-gray-500">
                  <User className="h-3 w-3" />
                  <span>{user.user_metadata?.full_name || 'User'}</span>
                  {session?.host_id === user.id && (
                    <span className="text-blue-600 font-medium">👑</span>
                  )}
                </div>
              ) : (
                <div className="flex items-center space-x-1 text-xs text-gray-500">
                  <User className="h-3 w-3" />
                  <span>Guest</span>
                </div>
              )}
              <Button variant="ghost" size="sm" onClick={() => setShowSettings(!showSettings)}>
                <Settings className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Settings Panel */}
      {showSettings && (
        <div className={`border-b ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white'} p-4`}>
          <div className="space-y-4">
            <div className="space-y-3">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className={`text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    {t('translation')}
                  </Label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="translationEnabled"
                      checked={translationEnabled}
                      onChange={(e) => setTranslationEnabled(e.target.checked)}
                      className="rounded"
                    />
                    <Label htmlFor="translationEnabled" className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      {t('enableTranslation')}
                    </Label>
                  </div>
                </div>
                
                <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'} p-3 rounded ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
                  <div className="space-y-2">
                    <div>🚀 <strong>GPT-Powered Translation System:</strong></div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>• GPT-4o-mini for natural translation</div>
                      <div>• Smart caching reduces costs 90%+</div>
                      <div>• Instant placeholder responses</div>
                      <div>• Google Translate as fallback</div>
                    </div>
                    <div>• Your language: <strong>{languages.find(l => l.code === selectedLanguage)?.name}</strong></div>
                    {translationEnabled && (
                      <div className="mt-3 pt-2 border-t border-gray-300 dark:border-gray-600">
                        <div className="grid grid-cols-3 gap-3 text-center">
                          <div className="space-y-1">
                            <div className="font-bold text-green-600 text-sm">{translationStats.cached}</div>
                            <div className="text-xs">📋 Cached</div>
                            <div className="text-xs opacity-75">Instant</div>
                          </div>
                          <div className="space-y-1">
                            <div className="font-bold text-blue-600 text-sm">{translationStats.processing}</div>
                            <div className="text-xs">⏳ Processing</div>
                            <div className="text-xs opacity-75">AI Working</div>
                          </div>
                          <div className="space-y-1">
                            <div className="font-bold text-purple-600 text-sm">{translationStats.completed}</div>
                            <div className="text-xs">✅ Done</div>
                            <div className="text-xs opacity-75">High Quality</div>
                          </div>
                        </div>
                        {(translationStats.cached + translationStats.completed) > 0 && (
                          <div className="mt-2 text-center">
                            <div className="text-xs opacity-75">
                              💰 Cost saved: ~{Math.round((translationStats.cached / (translationStats.cached + translationStats.completed + translationStats.processing)) * 100)}%
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                
                {translationEnabled && (
                  <div className="space-y-2">
                    <Label className={`text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      {t('targetLanguage')}
                    </Label>
                    <Select value={selectedLanguage} onValueChange={setSelectedLanguage}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {languages.map((lang) => (
                          <SelectItem key={lang.code} value={lang.code}>
                            <div className="flex items-center space-x-2">
                              <span>{lang.flag}</span>
                              <span>{lang.name}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label className={`text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                {t('fontSize')}: {fontSize[0]}px
              </Label>
              <Slider
                value={fontSize}
                onValueChange={setFontSize}
                max={32}
                min={12}
                step={2}
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="darkMode"
                  checked={darkMode}
                  onChange={(e) => setDarkMode(e.target.checked)}
                  className="rounded"
                />
                <Label htmlFor="darkMode" className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  {t('darkMode')}
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="showTimestamps"
                  checked={showTimestamps}
                  onChange={(e) => setShowTimestamps(e.target.checked)}
                  className="rounded"
                />
                <Label htmlFor="showTimestamps" className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  {t('showTimestamps')}
                </Label>
              </div>
              {/* 🆕 텍스트만 보기 옵션 */}
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="textOnlyMode"
                  checked={textOnlyMode}
                  onChange={(e) => setTextOnlyMode(e.target.checked)}
                  className="rounded"
                />
                <Label htmlFor="textOnlyMode" className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  {t('textOnlyMode')}
                </Label>
              </div>
            </div>

            {/* 🆕 복사 버튼들 */}
            {transcript.length > 0 && (
              <div className="space-y-2">
                <Label className={`text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  {t('textCopy')}
                </Label>
                <div className="flex space-x-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={(e) => copyTextOnly('original', e)}
                    className="flex-1"
                  >
                    {t('copyOriginal')}
                  </Button>
                  {translationEnabled && (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={(e) => copyTextOnly('translation', e)}
                      className="flex-1"
                    >
                      {t('copyTranslation')}
                    </Button>
                  )}
                </div>
                {textOnlyMode && (
                  <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    {t('textOnlyModeHint')}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex flex-col h-[calc(100vh-80px)]">
        {/* Mobile Tab Navigation - Show only on mobile */}
        <div className="lg:hidden border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <div className="flex">
            <button
              onClick={() => setTranslationEnabled(false)}
              className={`flex-1 py-3 px-4 text-sm font-medium text-center border-b-2 transition-colors ${
                !translationEnabled
                  ? `border-blue-500 ${darkMode ? 'text-blue-400 bg-blue-950/30' : 'text-blue-600 bg-blue-50'}`
                  : `border-transparent ${darkMode ? 'text-gray-400 hover:text-gray-300 hover:bg-gray-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`
              }`}
            >
              📝 {t('original')}
            </button>
            <button
              onClick={() => setTranslationEnabled(true)}
              className={`flex-1 py-3 px-4 text-sm font-medium text-center border-b-2 transition-colors ${
                translationEnabled
                  ? `border-green-500 ${darkMode ? 'text-green-400 bg-green-950/30' : 'text-green-600 bg-green-50'}`
                  : `border-transparent ${darkMode ? 'text-gray-400 hover:text-gray-300 hover:bg-gray-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`
              }`}
            >
              🌍 {t('translation')}
              {selectedLang && (
                <span className="ml-1 text-xs opacity-75">
                  {selectedLang.flag}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Desktop Layout - Show only on desktop */}
        <div className="hidden lg:flex lg:flex-row flex-1">
          {/* Original Transcript - Desktop */}
          <div className={`flex-1 transition-all duration-300 ${translationEnabled ? 'lg:mr-2' : ''}`}>
            <div className="h-full p-4">
              <Card className={`h-full ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white'}`}>
                <CardHeader>
                  <CardTitle className={`flex items-center space-x-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                    <Mic className="h-5 w-5" />
                    <span>{t('original')} Transcript</span>
                    <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse"></div>
                    <span className={`text-sm font-normal ${darkMode ? 'text-gray-300' : 'text-gray-500'}`}>Live</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="h-[calc(100%-80px)]">
                  <div className="space-y-4 h-full overflow-y-auto">
                    {renderTranscriptContent('original')}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Translation Side Panel - Desktop */}
          {translationEnabled && (
            <div className="lg:w-1/2 w-full">
              <div className="h-full p-4 pl-2">
                <Card className={`h-full border-l-4 border-green-500 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white'}`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className={`flex items-center space-x-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                        <Globe className="h-5 w-5 text-green-600" />
                        <span>{t('translation')}</span>
                        {selectedLang && (
                          <span className={`text-sm font-normal ${darkMode ? 'text-gray-300' : 'text-gray-500'}`}>
                            ({selectedLang.flag} {selectedLang.name})
                          </span>
                        )}
                      </CardTitle>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => setTranslationEnabled(false)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    
                    {/* Language Selector */}
                    <div className="mt-3">
                      <Select value={selectedLanguage} onValueChange={setSelectedLanguage}>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {languages.map((lang) => (
                            <SelectItem key={lang.code} value={lang.code}>
                              <div className="flex items-center space-x-2">
                                <span>{lang.flag}</span>
                                <span>{lang.name}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </CardHeader>
                  
                  <CardContent className="h-[calc(100%-140px)]">
                    <div className="space-y-4 h-full overflow-y-auto">
                      {renderTranscriptContent('translation')}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </div>

        {/* Mobile Layout - Show only on mobile */}
        <div className="lg:hidden flex-1 flex flex-col">
          <div className="flex-1 p-4">
            <Card className={`h-full ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white'}`}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className={`flex items-center space-x-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                    {translationEnabled ? (
                      <>
                        <Globe className="h-5 w-5 text-green-600" />
                        <span>Translation</span>
                        {selectedLang && (
                          <span className={`text-sm font-normal ${darkMode ? 'text-gray-300' : 'text-gray-500'}`}>
                            ({selectedLang.flag} {selectedLang.name})
                          </span>
                        )}
                      </>
                    ) : (
                      <>
                        <Mic className="h-5 w-5" />
                        <span>Original Transcript</span>
                        <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse"></div>
                        <span className={`text-sm font-normal ${darkMode ? 'text-gray-300' : 'text-gray-500'}`}>Live</span>
                      </>
                    )}
                  </CardTitle>
                </div>
                
                {/* Language Selector - Mobile (only show when translation is enabled) */}
                {translationEnabled && (
                  <div className="mt-3">
                    <Select value={selectedLanguage} onValueChange={setSelectedLanguage}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {languages.map((lang) => (
                          <SelectItem key={lang.code} value={lang.code}>
                            <div className="flex items-center space-x-2">
                              <span>{lang.flag}</span>
                              <span>{lang.name}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </CardHeader>
              
              <CardContent className="h-[calc(100%-100px)] overflow-hidden">
                <div className="space-y-4 h-full overflow-y-auto">
                  {translationEnabled ? renderTranscriptContent('translation') : renderTranscriptContent('original')}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
      
      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  )
}
