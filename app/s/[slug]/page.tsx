'use client'

import { useState, useEffect, useCallback, useRef, useId } from 'react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertCircle, Globe, Mic, Users, Clock, User, Settings, Loader2, X, CheckCircle, RefreshCw } from 'lucide-react'
import { useParams, useRouter } from 'next/navigation'
import { useSession, useUser } from '@clerk/nextjs'
import { createClient } from '@/lib/supabase/client'
import { useToast, ToastContainer } from '@/components/ui/toast'
import { Session } from '@/lib/types'
import type { TranscriptLine, TranslationResponse } from '@/lib/types'
import ChatbotWidget from '@/components/ChatbotWidget'

export default function PublicSessionPage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useUser()
  const { session: clerkSession } = useSession()
  const supabase = createClient(clerkSession?.getToken() ?? Promise.resolve(null))
  const slug = params.slug as string
  const { toasts, addToast, removeToast } = useToast()
  const componentId = useId()

  // Get user's preferred language from browser or profile
  const getUserPreferredLanguage = () => {
    // Try to get from user metadata first
    if (user?.unsafeMetadata?.preferred_language) {
      return user.unsafeMetadata.preferred_language as string
    }

    // Fallback to browser language (only on client side)
    if (typeof window !== 'undefined' && navigator.language) {
      const browserLang = navigator.language.split('-')[0]
      const supportedLangs = ['ko', 'zh', 'hi', 'en'] // 지원하는 3개 언어 + 영어
      return supportedLangs.includes(browserLang) ? browserLang : 'en' // 영어 기본값
    }

    return 'en' // Default fallback to English
  }

  // Simple i18n for UI text based on browser language
  const getBrowserLanguage = () => {
    if (typeof window === 'undefined') return 'en'
    const browserLang = navigator.language.split('-')[0]
    return ['ko', 'zh', 'hi'].includes(browserLang) ? browserLang : 'en' // 지원하는 3개 언어만
  }

  const t = (key: string) => {
    const lang = getBrowserLanguage()
    const translations: Record<string, Record<string, string>> = {
      en: {
        copySuccess: 'Text copied to clipboard',
        copyFail: 'Copy failed',
        noContent: 'No content to copy',
        translation: 'Translation',
        enableTranslation: 'Enable Translation',
        targetLanguage: 'Target Language',
        fontSize: 'Font Size',
        darkMode: 'Dark Mode',
        showTimestamps: 'Show Timestamps',
        textOnlyMode: 'Text Only Mode (Copy Friendly)',
        textCopy: 'Text Copy',
        copyOriginal: '📋 Copy Original',
        copyTranslation: '🌍 Copy Translation',
        textOnlyModeHint: '💡 Text Only Mode: Copy pure text without numbers and timestamps.',
        original: 'Original',
        waitingSpeaker: 'Waiting for the speaker to start...',
        noContentTranslate: 'No content to translate',
        liveTranscription: 'Live transcription will appear here',
        originalTranslated: 'Original transcript will be translated here',
        sessionActive: 'Session is active',
        joinSession: 'Join Session',
        viewAsAudience: 'View as Audience',
        realtimeTranscription: 'Real-time transcription and translation',
        liveSession: 'Live Session',
        translationFailed: 'Translation Failed',
        translating: 'Translating...',
        aiTranslating: 'AI Translating...',
        completed: 'Completed',
      },
      ko: {
        copySuccess: '텍스트가 복사되었습니다',
        copyFail: '복사 실패',
        noContent: '복사할 내용이 없습니다',
        translation: '번역',
        enableTranslation: '번역 사용',
        targetLanguage: '대상 언어',
        fontSize: '글자 크기',
        darkMode: '다크 모드',
        showTimestamps: '타임스탬프 표시',
        textOnlyMode: '텍스트만 보기 (복사 편의)',
        textCopy: '텍스트 복사',
        copyOriginal: '📋 원문 복사',
        copyTranslation: '🌍 번역문 복사',
        textOnlyModeHint: '💡 텍스트만 보기 모드: 번호와 타임스탬프 없이 순수 텍스트만 복사됩니다.',
        original: '원문',
        waitingSpeaker: '발표자가 말하기를 기다리고 있습니다...',
        noContentTranslate: '번역할 내용이 없습니다',
        liveTranscription: '실시간 전사가 여기에 표시됩니다',
        originalTranslated: '원문 트랜스크립트가 여기에 번역됩니다',
        sessionActive: '세션이 활성화되어 있습니다',
        joinSession: '세션 참가',
        viewAsAudience: '관객으로 보기',
        realtimeTranscription: '실시간 전사 및 번역',
        liveSession: '라이브 세션',
        translationFailed: '번역 실패',
        translating: '번역 중...',
        aiTranslating: 'AI 번역 중...',
        completed: '완료',
      },
      ja: {
        copySuccess: 'テキストがコピーされました',
        copyFail: 'コピーに失敗しました',
        noContent: 'コピーする内容がありません',
        translation: '翻訳',
        enableTranslation: '翻訳を有効にする',
        targetLanguage: '対象言語',
        fontSize: 'フォントサイズ',
        darkMode: 'ダークモード',
        showTimestamps: 'タイムスタンプを表示',
        textOnlyMode: 'テキストのみモード（コピー向け）',
        textCopy: 'テキストコピー',
        copyOriginal: '📋 原文をコピー',
        copyTranslation: '🌍 翻訳をコピー',
        textOnlyModeHint: '💡 テキストのみモード：番号とタイムスタンプなしで純粋なテキストのみをコピーします。',
        original: '原文',
        waitingSpeaker: '話者の開始を待っています...',
        noContentTranslate: '翻訳する内容がありません',
        liveTranscription: 'ライブ転写がここに表示されます',
        originalTranslated: '原文転写がここに翻訳されます',
        sessionActive: 'セッションがアクティブです',
        joinSession: 'セッションに参加',
        viewAsAudience: '視聴者として表示',
        realtimeTranscription: 'リアルタイム転写と翻訳',
        liveSession: 'ライブセッション',
        translationFailed: '翻訳に失敗しました',
        translating: '翻訳中...',
        aiTranslating: 'AI翻訳中...',
        completed: '完了',
      },
      es: {
        copySuccess: 'Texto copiado al portapapeles',
        copyFail: 'Error al copiar',
        noContent: 'No hay contenido para copiar',
        translation: 'Traducción',
        enableTranslation: 'Habilitar traducción',
        targetLanguage: 'Idioma destino',
        fontSize: 'Tamaño de fuente',
        darkMode: 'Modo oscuro',
        showTimestamps: 'Mostrar marcas de tiempo',
        textOnlyMode: 'Modo solo texto (fácil copia)',
        textCopy: 'Copiar texto',
        copyOriginal: '📋 Copiar original',
        copyTranslation: '🌍 Copiar traducción',
        textOnlyModeHint: '💡 Modo solo texto: Copia texto puro sin números ni marcas de tiempo.',
        original: 'Original',
        waitingSpeaker: 'Esperando que el orador comience...',
        noContentTranslate: 'No hay contenido para traducir',
        liveTranscription: 'La transcripción en vivo aparecerá aquí',
        originalTranslated: 'La transcripción original se traducirá aquí',
        sessionActive: 'La sesión está activa',
        joinSession: 'Unirse a la sesión',
        viewAsAudience: 'Ver como audiencia',
        realtimeTranscription: 'Transcripción y traducción en tiempo real',
        liveSession: 'Sesión en vivo',
        translationFailed: 'Error de traducción',
        translating: 'Traduciendo...',
        aiTranslating: 'IA traduciendo...',
        completed: 'Completado',
      },
      fr: {
        copySuccess: 'Texte copié dans le presse-papiers',
        copyFail: 'Échec de la copie',
        noContent: 'Aucun contenu à copier',
        translation: 'Traduction',
        enableTranslation: 'Activer la traduction',
        targetLanguage: 'Langue cible',
        fontSize: 'Taille de police',
        darkMode: 'Mode sombre',
        showTimestamps: 'Afficher les horodatages',
        textOnlyMode: 'Mode texte seul (copie facile)',
        textCopy: 'Copier le texte',
        copyOriginal: "📋 Copier l'original",
        copyTranslation: '🌍 Copier la traduction',
        textOnlyModeHint: '💡 Mode texte seul: Copie le texte pur sans numéros ni horodatages.',
        original: 'Original',
        waitingSpeaker: "En attente du début de l'orateur...",
        noContentTranslate: 'Aucun contenu à traduire',
        liveTranscription: 'La transcription en direct apparaîtra ici',
        originalTranslated: 'La transcription originale sera traduite ici',
        sessionActive: 'La session est active',
        joinSession: 'Rejoindre la session',
        viewAsAudience: "Voir en tant qu'audience",
        realtimeTranscription: 'Transcription et traduction en temps réel',
        liveSession: 'Session en direct',
        translationFailed: 'Échec de la traduction',
        translating: 'Traduction...',
        aiTranslating: 'IA en traduction...',
        completed: 'Terminé',
      },
      de: {
        copySuccess: 'Text in die Zwischenablage kopiert',
        copyFail: 'Kopieren fehlgeschlagen',
        noContent: 'Kein Inhalt zum Kopieren',
        translation: 'Übersetzung',
        enableTranslation: 'Übersetzung aktivieren',
        targetLanguage: 'Zielsprache',
        fontSize: 'Schriftgröße',
        darkMode: 'Dunkler Modus',
        showTimestamps: 'Zeitstempel anzeigen',
        textOnlyMode: 'Nur-Text-Modus (kopierfreundlich)',
        textCopy: 'Text kopieren',
        copyOriginal: '📋 Original kopieren',
        copyTranslation: '🌍 Übersetzung kopieren',
        textOnlyModeHint: '💡 Nur-Text-Modus: Kopiert reinen Text ohne Nummern und Zeitstempel.',
        original: 'Original',
        waitingSpeaker: 'Warten auf den Beginn des Sprechers...',
        noContentTranslate: 'Kein Inhalt zum Übersetzen',
        liveTranscription: 'Live-Transkription wird hier angezeigt',
        originalTranslated: 'Original-Transkript wird hier übersetzt',
        sessionActive: 'Sitzung ist aktiv',
        joinSession: 'Sitzung beitreten',
        viewAsAudience: 'Als Zuschauer anzeigen',
        realtimeTranscription: 'Echtzeit-Transkription und -Übersetzung',
        liveSession: 'Live-Sitzung',
        translationFailed: 'Übersetzung fehlgeschlagen',
        translating: 'Übersetzen...',
        aiTranslating: 'KI übersetzt...',
        completed: 'Abgeschlossen',
      },
      zh: {
        copySuccess: '文本已复制到剪贴板',
        copyFail: '复制失败',
        noContent: '没有内容可复制',
        translation: '翻译',
        enableTranslation: '启用翻译',
        targetLanguage: '目标语言',
        fontSize: '字体大小',
        darkMode: '深色模式',
        showTimestamps: '显示时间戳',
        textOnlyMode: '纯文本模式（便于复制）',
        textCopy: '复制文本',
        copyOriginal: '📋 复制原文',
        copyTranslation: '🌍 复制翻译',
        textOnlyModeHint: '💡 纯文本模式：复制不带编号和时间戳的纯文本。',
        original: '原文',
        waitingSpeaker: '等待发言者开始...',
        noContentTranslate: '没有内容可翻译',
        liveTranscription: '实时转录将在这里显示',
        originalTranslated: '原始转录将在这里翻译',
        sessionActive: '会话处于活动状态',
        joinSession: '加入会话',
        viewAsAudience: '以观众身份查看',
        realtimeTranscription: '实时转录和翻译',
        liveSession: '直播会话',
        translationFailed: '翻译失败',
        translating: '翻译中...',
        aiTranslating: 'AI翻译中...',
        completed: '已完成',
      },
    }

    return translations[lang]?.[key] || translations['en'][key] || key
  }

  const [translationEnabled, setTranslationEnabled] = useState(false)
  const [selectedLanguage, setSelectedLanguage] = useState(() => getUserPreferredLanguage() || 'en')
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
    completed: 0,
  })

  // 🆕 텍스트만 보기 상태
  const [textOnlyMode, setTextOnlyMode] = useState(false)

  // Set user preferred language on client side
  useEffect(() => {
    setSelectedLanguage(getUserPreferredLanguage())
  }, [user])

  // 🚀 모든 지원 언어 제공 (자동 번역 지원)
  const languages = [
    { code: "ko", name: "Korean", flag: "🇰🇷" },
    { code: "en", name: "English", flag: "🇺🇸" },
    { code: "zh", name: "Chinese", flag: "🇨🇳" },
    { code: "hi", name: "Hindi", flag: "🇮🇳" },
  ]

  // 번역 캐시 (클라이언트 사이드)
  const translationCache = useRef<Map<string, TranslationResponse>>(new Map())
  const pendingTranslations = useRef<Set<string>>(new Set())

  // 번역 캐시 관리
  const selectedLanguageRef = useRef(selectedLanguage)

  // selectedLanguage 변경 시 ref 업데이트
  useEffect(() => {
    selectedLanguageRef.current = selectedLanguage
  }, [selectedLanguage])

  // Supabase Realtime으로 번역 캐시 업데이트 구독
  useEffect(() => {
    if (!sessionId) return

    console.log('🔔 Setting up translation cache subscription...')

    const channel = supabase
      .channel(`translation-cache-${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'translation_cache',
        },
        (payload) => {
          const cache = payload.new as {
            original_text: string
            target_language: string
            translated_text: string
            quality_score: number
          }
          console.log('🎉 New translation cached:', {
            text: cache.original_text,
            language: cache.target_language,
            translated: cache.translated_text,
            currentLanguage: selectedLanguageRef.current,
          })

          // 현재 선택된 언어의 번역이면 UI 업데이트
          if (cache.target_language === selectedLanguageRef.current) {
            console.log('📝 Updating UI with cached translation')
            setTranscript((prev) => {
              const updated = prev.map((line) => {
                if (
                  line.original === cache.original_text &&
                  (line.isTranslating || line.translated.includes('[번역 중...]'))
                ) {
                  console.log(`✅ Updating line: "${line.original}" → "${cache.translated_text}"`)
                  return {
                    ...line,
                    translated: cache.translated_text,
                    translatedLanguage: cache.target_language,
                    isTranslating: false,
                    translationQuality: cache.quality_score,
                  }
                }
                return line
              })
              return updated
            })
          } else {
            console.log(
              `⏭️ Skipping update: language mismatch (${cache.target_language} !== ${selectedLanguageRef.current})`,
            )
          }
        },
      )
      .subscribe((status) => {
        console.log('🔔 Translation cache subscription status:', status)
        if (status === 'SUBSCRIBED') {
          console.log('✅ Successfully subscribed to translation cache updates')
        }
      })

    return () => {
      console.log('🧹 Cleaning up translation cache subscription')
      supabase.removeChannel(channel)
    }
  }, [sessionId, supabase]) // sessionId와 supabase만 필요, selectedLanguage는 이벤트 핸들러 내부에서 처리

  // Load session data using slug or session ID
  useEffect(() => {
    const loadSession = async () => {
      try {
        setLoading(true)
        setError(null)

        // First try to find by slug (assumed to be session ID for now)
        let sessionData

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
          const { data: slugSession } = await supabase
            .from('sessions')
            .select('*')
            .ilike('title', `%${slug}%`)
            .eq('status', 'active')
            .limit(1)
            .single()

          sessionData = slugSession
        }

        if (!sessionData) {
          console.error('Session not found:', { slug })
          setError(`Session not found (ID: ${slug}). The session may have ended or the link may be invalid.`)
          return
        }

        setSession(sessionData)
        setSessionId(sessionData.id)

        // Load existing transcripts - 번역이 완료된 것만 표시
        const { data: transcripts } = await supabase
          .from('transcripts')
          .select('*')
          .eq('session_id', sessionData.id)
          .order('created_at', { ascending: true })

        if (transcripts && transcripts.length > 0) {
          console.log(`📚 Loading ${transcripts.length} transcripts...`)

          // 초기 로딩 시에는 기존 transcript를 모두 지우고 새로 로드
          const formattedTranscripts: TranscriptLine[] = []

          for (const t of transcripts) {
            let translatedText = t.original_text

            // 번역이 활성화된 경우에만 번역 로드
            if (translationEnabled && selectedLanguage !== 'en') {
              try {
                // 캐시 테이블에서 직접 확인
                const { data: cache } = await supabase
                  .from('translation_cache')
                  .select('*')
                  .eq('original_text', t.original_text)
                  .eq('target_language', selectedLanguage)
                  .maybeSingle()

                if (cache) {
                  translatedText = cache.translated_text
                  console.log(`✅ Loaded cached translation for "${t.original_text.substring(0, 30)}..."`)
                } else {
                  translatedText = `[번역 중...] ${t.original_text}`
                  console.log(`⏳ Translation not yet cached for "${t.original_text.substring(0, 30)}..."`)
                }
              } catch (err) {
                console.error(`❌ Failed to load translation for "${t.original_text.substring(0, 30)}..."`, err)
                translatedText = t.original_text // 실패 시 원문 표시
              }
            }

            formattedTranscripts.push({
              id: t.id,
              timestamp: new Date(t.created_at).toLocaleTimeString(),
              original: t.original_text,
              translated: translatedText,
              translatedLanguage: selectedLanguage,
              speaker: sessionData.host_name,
              isTranslating: false,
            })
          }

          // 초기 로딩이므로 완전히 교체
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

  // Join session as participant or guest
  const joinSession = useCallback(async () => {
    if (!sessionId) return

    try {
      console.log('🚀 Joining session:', {
        sessionId,
        userId: user?.id || 'guest',
      })

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
        user_name: user.fullName || user.primaryEmailAddress?.emailAddress || 'User',
        role: isHost ? ('host_viewing' as const) : ('audience' as const),
        joined_at: new Date().toISOString(),
      }

      const { error } = await supabase.from('session_participants').insert(participantData)

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
  }, [sessionId, user, session?.host_id, supabase, t])

  // Auto-join session when session is loaded (for both logged-in and guest users)
  useEffect(() => {
    if (sessionId && session && !hasJoined) {
      console.log('🔄 Auto-joining session...')
      joinSession()
    }
  }, [sessionId, session, hasJoined, joinSession])

  // 🆕 실시간 transcript 구독 (번역 완료된 것만)
  useEffect(() => {
    if (!sessionId) return

    console.log('🔔 Setting up realtime subscription for completed transcripts...')

    // 모든 transcript 변경사항 구독 (클라이언트에서 필터링)
    const channel = supabase
      .channel(`transcripts-${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: '*', // INSERT, UPDATE, DELETE 모든 이벤트
          schema: 'public',
          table: 'transcripts',
          filter: `session_id=eq.${sessionId}`, // 세션 ID만 필터링
        },
        (payload) => {
          console.log('🔔 Realtime transcript update:', payload.eventType, payload.new)

          // UPDATE 이벤트만 처리 (INSERT는 폴링에서 처리)
          if (payload.eventType === 'UPDATE' && payload.new) {
            const updatedTranscript = payload.new as {
              original_text: string
              translation_status: string
              created_at: string
            }
            if (updatedTranscript.translation_status === 'completed') {
              console.log(`🔄 Transcript status updated to completed: "${updatedTranscript.original_text}"`)

              // 이미 있는 transcript 업데이트 (새로 추가하지 않음)
              setTranscript((prev) =>
                prev.map((line) => {
                  if (line.original === updatedTranscript.original_text) {
                    // 번역 상태를 완료로 업데이트
                    return {
                      ...line,
                      isTranslating: false,
                    }
                  }
                  return line
                }),
              )
            }
          }
        },
      )
      .subscribe((status) => {
        console.log('🔔 Realtime subscription status:', status)
      })

    // Cleanup
    return () => {
      console.log('🧹 Cleaning up realtime subscription')
      supabase.removeChannel(channel)
    }
  }, [sessionId, supabase]) // sessionId와 supabase만 필요

  // 🆕 언어 변경 시 transcript 재로드
  useEffect(() => {
    if (!translationEnabled || !sessionId || !session) return

    console.log(`🌍 Language changed to: ${selectedLanguage}`)

    // 언어 변경 시 transcript 재로드
    const reloadForNewLanguage = async () => {
      try {
        const { data: transcripts } = await supabase
          .from('transcripts')
          .select('*')
          .eq('session_id', sessionId)
          .order('created_at', { ascending: true })

        if (transcripts && transcripts.length > 0) {
          console.log(`🔄 Reloading ${transcripts.length} transcripts for ${selectedLanguage}`)

          const formattedTranscripts: TranscriptLine[] = []

          for (const t of transcripts) {
            let translatedText = t.original_text
            let isTranslating = false

            if (selectedLanguage !== 'en') {
              // 캐시 테이블에서 직접 확인
              try {
                const { data: cache } = await supabase
                  .from('translation_cache')
                  .select('*')
                  .eq('original_text', t.original_text)
                  .eq('target_language', selectedLanguage)
                  .maybeSingle()

                if (cache) {
                  translatedText = cache.translated_text
                  console.log(`✅ Found cached translation`)
                } else {
                  translatedText = `[번역 중...] ${t.original_text}`
                  isTranslating = true
                  console.log(`⏳ Translation not yet cached`)
                }
              } catch (error) {
                console.error(`Cache check failed:`, error)
                translatedText = t.original_text
              }
            }

            formattedTranscripts.push({
              id: t.id,
              timestamp: new Date(t.created_at).toLocaleTimeString(),
              original: t.original_text,
              translated: translatedText,
              translatedLanguage: selectedLanguage,
              speaker: session.host_name,
              isTranslating: isTranslating,
            })
          }

          setTranscript(formattedTranscripts)
        }
      } catch (error) {
        console.error('Error reloading transcripts:', error)
      }
    }

    reloadForNewLanguage()
  }, [selectedLanguage, translationEnabled, sessionId, session, supabase])

  // Handle new transcript updates (심플하게 개선)
  const handleTranscriptUpdate = useCallback(
    async (newText: string, isPartial: boolean = false) => {
      if (!newText || newText.trim().length === 0) {
        console.warn('⚠️ Skipping empty transcript update')
        return
      }

      const now = new Date()
      const timestamp = now.toLocaleTimeString()
      const newId = `${componentId}-${now.getTime()}-${transcript.length}`

      const newLine: TranscriptLine = {
        id: newId,
        timestamp,
        original: newText.trim(),
        translated: newText.trim(),
        translatedLanguage: selectedLanguage,
        speaker: session?.host_name || 'Speaker',
        isTranslating: false,
      }

      if (isPartial) {
        // Partial 업데이트는 UI에만 표시
        setTranscript((prev) => {
          const newTranscript = [...prev]
          if (newTranscript.length > 0 && newTranscript[newTranscript.length - 1].id.includes('partial')) {
            newTranscript[newTranscript.length - 1] = {
              ...newLine,
              id: `${newId}-partial`,
            }
          } else {
            newTranscript.push({ ...newLine, id: `${newId}-partial` })
          }
          return newTranscript
        })
      } else {
        // Final 업데이트
        setTranscript((prev) => {
          const withoutPartial = prev.filter((line) => !line.id.includes('partial'))
          return [...withoutPartial, newLine]
        })

        // 번역이 필요한 경우
        if (translationEnabled && selectedLanguage !== 'en') {
          // 번역 중 상태로 설정
          setTranscript((prev) =>
            prev.map((line) =>
              line.id === newId
                ? {
                    ...line,
                    translated: `[번역 중...] ${newText.trim()}`,
                    isTranslating: true,
                  }
                : line,
            ),
          )

          // 캐시 확인 (백그라운드에서 실행)
          setTimeout(async () => {
            try {
              const { data: cache } = await supabase
                .from('translation_cache')
                .select('*')
                .eq('original_text', newText.trim())
                .eq('target_language', selectedLanguage)
                .maybeSingle()

              if (cache) {
                console.log(`✅ Found cached translation for new transcript`)
                setTranscript((prev) =>
                  prev.map((line) =>
                    line.id === newId
                      ? {
                          ...line,
                          translated: cache.translated_text,
                          isTranslating: false,
                          translationQuality: cache.quality_score,
                        }
                      : line,
                  ),
                )
              }
              // 캐시에 없으면 Realtime 구독이 처리할 것임
            } catch (error) {
              console.error('Cache check error:', error)
            }
          }, 1000) // 1초 후 확인
        }
      }
    },
    [selectedLanguage, session, translationEnabled, supabase],
  )

  // Subscribe to real-time transcript updates
  useEffect(() => {
    if (!sessionId) return

    console.log('🔄 Setting up real-time transcript subscription:', {
      sessionId,
      hasJoined,
      timestamp: new Date().toLocaleTimeString(),
    })

    const channel = supabase
      .channel(`public:transcripts-${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'transcripts',
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          console.log('📨 New transcript received:', payload.new)
          const newTranscript = payload.new as { original_text: string }

          handleTranscriptUpdate(newTranscript.original_text, false)
        },
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
          filter: `session_id=eq.${sessionId}`,
        },
        () => {
          updateParticipantCount()
        },
      )
      .subscribe()

    updateParticipantCount()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [sessionId, supabase, updateParticipantCount])

  // 🆕 세션 상태 변경 감지 (세션 종료 시 공개 요약 페이지로 리디렉션)
  useEffect(() => {
    if (!sessionId) return

    console.log('🔔 Setting up session status subscription...')

    const channel = supabase
      .channel(`session-status-${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'sessions',
          filter: `id=eq.${sessionId}`,
        },
        (payload) => {
          console.log('🔔 Session status update:', payload.new)
          const updatedSession = payload.new as { status: string; id: string }

          if (updatedSession.status === 'ended') {
            console.log('🏁 Session ended, redirecting to summary page...')

            // 세션 종료 알림
            addToast({
              type: 'success',
              title: '세션이 종료되었습니다',
              duration: 3000,
            })

            // 2초 후 공개 요약 페이지로 리디렉션
            setTimeout(() => {
              const summaryUrl = `/summary/${sessionId}`
              window.location.href = summaryUrl
            }, 2000)
          }
        },
      )
      .subscribe((status) => {
        console.log('🔔 Session status subscription:', status)
      })

    return () => {
      console.log('🧹 Cleaning up session status subscription')
      supabase.removeChannel(channel)
    }
  }, [sessionId, supabase, addToast])

  // 언어 변경시 번역 처리 (완전 개선된 버전)
  useEffect(() => {
    if (!translationEnabled) {
      // 번역 비활성화시 원문으로 리셋
      setTranscript((prev) =>
        prev.map((line) => ({
          ...line,
          translated: line.original,
          translatedLanguage: 'en',
          isTranslating: false,
        })),
      )
      setTranslationStats({ cached: 0, processing: 0, completed: 0 })
      return
    }

    // 언어 변경 시에만 실행
    console.log(`🔄 Language changed to ${selectedLanguage}, updating translations...`)

    setTranscript((prev) => {
      if (prev.length === 0) return prev

      // 영어인 경우 즉시 passthrough
      if (selectedLanguage === 'en') {
        return prev.map((line) => ({
          ...line,
          translated: line.original && typeof line.original === 'string' ? line.original : '',
          translatedLanguage: 'en',
          isTranslating: false,
        }))
      }

      // 다른 언어인 경우 번역 중 상태로 설정
      return prev.map((line) => ({
        ...line,
        translated: `[번역 중...] ${line.original}`,
        translatedLanguage: selectedLanguage,
        isTranslating: true,
      }))
    })

    // 캐시에서 번역 확인
    if (selectedLanguage !== 'en') {
      setTimeout(async () => {
        const currentTranscripts = await new Promise<TranscriptLine[]>((resolve) => {
          setTranscript((prev) => {
            resolve([...prev])
            return prev
          })
        })

        for (const line of currentTranscripts) {
          if (!line || !line.original || typeof line.original !== 'string') continue

          try {
            const { data: cache } = await supabase
              .from('translation_cache')
              .select('*')
              .eq('original_text', line.original.trim())
              .eq('target_language', selectedLanguage)
              .maybeSingle()

            if (cache) {
              setTranscript((prev) =>
                prev.map((l) =>
                  l.id === line.id
                    ? {
                        ...l,
                        translated: cache.translated_text,
                        isTranslating: false,
                        translationQuality: cache.quality_score,
                      }
                    : l,
                ),
              )
            }
          } catch (error) {
            console.error('Cache check error:', error)
          }
        }
      }, 500)
    }
  }, [selectedLanguage, translationEnabled, supabase]) // transcript 제거

  // Clear cache when translation is disabled
  useEffect(() => {
    if (!translationEnabled) {
      translationCache.current.clear()
      pendingTranslations.current.clear()
    }
  }, [translationEnabled])

  const selectedLang = languages.find((lang) => lang.code === selectedLanguage)

  // 🆕 텍스트 복사 기능 (다국어화)
  const copyTextOnly = useCallback(
    async (type: 'original' | 'translation', event?: React.MouseEvent) => {
      // 이벤트 기본 동작 방지 (페이지 이동 방지)
      if (event) {
        event.preventDefault()
        event.stopPropagation()
      }

      if (transcript.length === 0) {
        addToast({
          type: 'warning',
          title: t('noContent'),
          duration: 1500,
        })
        return
      }

      const textContent = transcript
        .filter((line) => line && line.original && typeof line.original === 'string' && line.original.trim().length > 0)
        .map((line, index) => {
          const text = type === 'original' ? line.original : line.translated || line.original
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
          duration: 2000,
        })
      } catch (err) {
        console.error('❌ Failed to copy text:', err)

        // 다국어화된 실패 Toast
        addToast({
          type: 'error',
          title: t('copyFail'),
          duration: 3000,
        })
      }
    },
    [transcript, textOnlyMode, addToast, t],
  )

  // Render transcript content function
  const renderTranscriptContent = (type: 'original' | 'translation') => {
    if (transcript.length === 0) {
      return (
        <div className={`py-16 text-center ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
          <div
            className={`mx-auto h-16 w-16 rounded-full ${
              darkMode ? 'bg-gray-800' : 'bg-gray-100'
            } mb-6 flex items-center justify-center`}
          >
            {type === 'original' ? <Mic className='h-8 w-8 opacity-50' /> : <Globe className='h-8 w-8 opacity-50' />}
          </div>
          <h3 className={`mb-2 text-lg font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
            {type === 'original' ? t('waitingSpeaker') : t('noContentTranslate')}
          </h3>
          <p className='text-sm'>{type === 'original' ? t('liveTranscription') : t('originalTranslated')}</p>
          {type === 'original' && (
            <div className='mt-4 flex items-center justify-center space-x-2'>
              <div className='h-2 w-2 animate-pulse rounded-full bg-green-500'></div>
              <span className='text-xs'>{t('sessionActive')}</span>
            </div>
          )}
        </div>
      )
    }

    // 🆕 텍스트만 보기 모드
    if (textOnlyMode) {
      return (
        <div className='space-y-2'>
          {transcript
            .filter(
              (line) => line && line.original && typeof line.original === 'string' && line.original.trim().length > 0,
            )
            .map((line) => {
              const text = type === 'original' ? line.original : line.translated || line.original
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
      <div className='space-y-3'>
        {transcript
          .filter(
            (line) => line && line.original && typeof line.original === 'string' && line.original.trim().length > 0,
          )
          .map((line, idx) => {
            const text = type === 'original' ? line.original : line.translated || line.original

            return (
              <div key={`${type}-${line.original}-${line.translatedLanguage}-${idx}`} className='group'>
                {/* Timestamp */}
                {showTimestamps && (
                  <div
                    className={`mb-1 flex items-center space-x-2 text-xs ${
                      darkMode ? 'text-gray-400' : 'text-gray-500'
                    }`}
                  >
                    <span className='font-medium'>#{idx + 1}</span>
                    <span>•</span>
                    <span>{line.timestamp}</span>
                    <span>•</span>
                    <span>{type === 'original' ? line.speaker : selectedLang?.name}</span>
                    {type === 'translation' && line.isTranslating && (
                      <>
                        <span>•</span>
                        <RefreshCw className='h-3 w-3 animate-spin' />
                        <span>{t('translating')}</span>
                      </>
                    )}
                    {type === 'translation' &&
                      !line.isTranslating &&
                      line.translationQuality &&
                      line.translationQuality > 0.8 && (
                        <>
                          <span>•</span>
                          <CheckCircle className='h-3 w-3 text-green-600' />
                          <span>{t('completed')}</span>
                        </>
                      )}
                  </div>
                )}

                {/* Main Text */}
                <div
                  className={`mb-1 leading-relaxed ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}
                  style={{ fontSize: `${fontSize[0]}px` }}
                >
                  {text}
                </div>

                {/* Translation should ONLY show below original in mobile view - NOT on desktop */}
                {type === 'original' &&
                  translationEnabled &&
                  selectedLanguage !== 'en' &&
                  line.translated !== line.original && (
                    <div
                      className={`border-l-2 pl-4 leading-relaxed italic lg:hidden ${
                        darkMode ? 'border-gray-600 text-gray-300' : 'border-gray-300 text-gray-700'
                      }`}
                      style={{ fontSize: `${fontSize[0] - 1}px` }}
                    >
                      {line.isTranslating ? (
                        <span className='flex items-center space-x-2 text-gray-400'>
                          <RefreshCw className='h-3 w-3 animate-spin' />
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
      <div className='flex min-h-screen items-center justify-center bg-gray-50'>
        <Card>
          <CardContent className='p-8'>
            <div className='flex flex-col items-center space-y-4'>
              <Loader2 className='h-8 w-8 animate-spin text-blue-600' />
              <p className='text-gray-600'>Loading session...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (error) {
    return (
      <div className='flex min-h-screen items-center justify-center bg-gray-50'>
        <Card>
          <CardContent className='p-8'>
            <div className='flex flex-col items-center space-y-4'>
              <AlertCircle className='h-8 w-8 text-red-600' />
              <p className='font-medium text-gray-900'>Session Not Found</p>
              <p className='text-center text-sm text-gray-600'>{error}</p>
              <Button onClick={() => router.push('/')} variant='outline'>
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
      <div className='flex min-h-screen items-center justify-center bg-gray-50'>
        <Card className='w-full max-w-md'>
          <CardContent className='p-8'>
            <div className='space-y-6 text-center'>
              <div>
                <Mic className='mx-auto mb-4 h-12 w-12 text-blue-600' />
                <h1 className='text-2xl font-bold text-gray-900'>{session.title}</h1>
                <p className='mt-2 text-gray-600'>by {session.host_name}</p>
                <Badge className='mt-2 bg-green-100 text-green-800'>{t('liveSession')}</Badge>
              </div>

              <div className='space-y-4'>
                {user && (
                  <div className='text-sm text-gray-600'>
                    Welcome, <strong>{user.fullName || user.primaryEmailAddress?.emailAddress}</strong>!
                  </div>
                )}

                {user && session?.host_id === user.id && (
                  <div className='rounded-lg bg-blue-50 p-3 text-sm text-blue-600'>
                    <strong>👑 You are the host</strong>
                    <br />
                    Join as audience to see how your session appears to attendees.
                  </div>
                )}
              </div>

              <div className='space-y-3'>
                <Button onClick={joinSession} className='w-full'>
                  <Globe className='mr-2 h-4 w-4' />
                  {user && session?.host_id === user.id ? t('viewAsAudience') : t('joinSession')}
                </Button>
              </div>

              <div className='text-xs text-gray-400'>{t('realtimeTranscription')}</div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className={`min-h-screen ${darkMode ? 'dark bg-gray-900' : 'bg-gray-50'}`}>
      {/* Mobile Header */}
      <header className={`border-b ${darkMode ? 'border-gray-700 bg-gray-800' : 'bg-white'} sticky top-0 z-40`}>
        <div className='px-4 py-3'>
          <div className='flex items-center justify-between'>
            <div className='flex items-center space-x-3'>
              <div className='h-3 w-3 animate-pulse rounded-full bg-green-500'></div>
              <div>
                <span className={`text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  {session?.title || 'Live Session'}
                </span>
                <div className='flex items-center space-x-2 text-xs text-gray-500'>
                  <Users className='h-3 w-3' />
                  <span>{participantCount}</span>
                  <Clock className='h-3 w-3' />
                  <span>Live</span>
                </div>
              </div>
            </div>
            <div className='flex items-center space-x-2'>
              {user ? (
                <div className='flex items-center space-x-1 text-xs text-gray-500'>
                  <User className='h-3 w-3' />
                  <span>{user.fullName || 'User'}</span>
                  {session?.host_id === user.id && <span className='font-medium text-blue-600'>👑</span>}
                </div>
              ) : (
                <div className='flex items-center space-x-1 text-xs text-gray-500'>
                  <User className='h-3 w-3' />
                  <span>Guest</span>
                </div>
              )}
              <Button variant='ghost' size='sm' onClick={() => setShowSettings(!showSettings)}>
                <Settings className='h-4 w-4' />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Settings Panel */}
      {showSettings && (
        <div className={`border-b ${darkMode ? 'border-gray-700 bg-gray-800' : 'bg-white'} p-4`}>
          <div className='space-y-4'>
            <div className='space-y-3'>
              <div className='space-y-3'>
                <div className='flex items-center justify-between'>
                  <Label className={`text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    {t('translation')}
                  </Label>
                  <div className='flex items-center space-x-2'>
                    <input
                      type='checkbox'
                      id='translationEnabled'
                      checked={translationEnabled}
                      onChange={(e) => setTranslationEnabled(e.target.checked)}
                      className='rounded'
                    />
                    <Label
                      htmlFor='translationEnabled'
                      className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}
                    >
                      {t('enableTranslation')}
                    </Label>
                  </div>
                </div>

                <div
                  className={`text-xs ${
                    darkMode ? 'text-gray-400' : 'text-gray-500'
                  } rounded p-3 ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}
                >
                  <div className='space-y-2'>
                    <div>
                      🚀 <strong>Gemini 2.0-Powered Translation System:</strong>
                    </div>
                    <div className='grid grid-cols-2 gap-2 text-xs'>
                      <div>• Gemini 2.0 Flash for natural translation</div>
                      <div>• Smart caching reduces costs 90%+</div>
                      <div>• Instant placeholder responses</div>
                      <div>• Google Translate as fallback</div>
                    </div>
                    <div>
                      • Your language: <strong>{languages.find((l) => l.code === selectedLanguage)?.name}</strong>
                    </div>
                    {translationEnabled && (
                      <div className='mt-3 border-t border-gray-300 pt-2 dark:border-gray-600'>
                        <div className='grid grid-cols-3 gap-3 text-center'>
                          <div className='space-y-1'>
                            <div className='text-sm font-bold text-green-600'>{translationStats.cached}</div>
                            <div className='text-xs'>📋 Cached</div>
                            <div className='text-xs opacity-75'>Instant</div>
                          </div>
                          <div className='space-y-1'>
                            <div className='text-sm font-bold text-blue-600'>{translationStats.processing}</div>
                            <div className='text-xs'>⏳ Processing</div>
                            <div className='text-xs opacity-75'>AI Working</div>
                          </div>
                          <div className='space-y-1'>
                            <div className='text-sm font-bold text-purple-600'>{translationStats.completed}</div>
                            <div className='text-xs'>✅ Done</div>
                            <div className='text-xs opacity-75'>High Quality</div>
                          </div>
                        </div>
                        {translationStats.cached + translationStats.completed > 0 && (
                          <div className='mt-2 text-center'>
                            <div className='text-xs opacity-75'>
                              💰 Cost saved: ~
                              {Math.round(
                                (translationStats.cached /
                                  (translationStats.cached +
                                    translationStats.completed +
                                    translationStats.processing)) *
                                  100,
                              )}
                              %
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {translationEnabled && (
                  <div className='space-y-2'>
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
                            <div className='flex items-center space-x-2'>
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

            <div className='space-y-2'>
              <Label className={`text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                {t('fontSize')}: {fontSize[0]}px
              </Label>
              <Slider value={fontSize} onValueChange={setFontSize} max={32} min={12} step={2} className='w-full' />
            </div>

            <div className='space-y-2'>
              <div className='flex items-center space-x-2'>
                <input
                  type='checkbox'
                  id='darkMode'
                  checked={darkMode}
                  onChange={(e) => setDarkMode(e.target.checked)}
                  className='rounded'
                />
                <Label htmlFor='darkMode' className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  {t('darkMode')}
                </Label>
              </div>
              <div className='flex items-center space-x-2'>
                <input
                  type='checkbox'
                  id='showTimestamps'
                  checked={showTimestamps}
                  onChange={(e) => setShowTimestamps(e.target.checked)}
                  className='rounded'
                />
                <Label htmlFor='showTimestamps' className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  {t('showTimestamps')}
                </Label>
              </div>
              {/* 🆕 텍스트만 보기 옵션 */}
              <div className='flex items-center space-x-2'>
                <input
                  type='checkbox'
                  id='textOnlyMode'
                  checked={textOnlyMode}
                  onChange={(e) => setTextOnlyMode(e.target.checked)}
                  className='rounded'
                />
                <Label htmlFor='textOnlyMode' className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  {t('textOnlyMode')}
                </Label>
              </div>
            </div>

            {/* 🆕 복사 버튼들 */}
            {transcript.length > 0 && (
              <div className='space-y-2'>
                <Label className={`text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  {t('textCopy')}
                </Label>
                <div className='flex space-x-2'>
                  <Button variant='outline' size='sm' onClick={(e) => copyTextOnly('original', e)} className='flex-1'>
                    {t('copyOriginal')}
                  </Button>
                  {translationEnabled && (
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={(e) => copyTextOnly('translation', e)}
                      className='flex-1'
                    >
                      {t('copyTranslation')}
                    </Button>
                  )}
                </div>
                {textOnlyMode && (
                  <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{t('textOnlyModeHint')}</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className='flex h-[calc(100vh-80px)] flex-col'>
        {/* Mobile Tab Navigation - Show only on mobile */}
        <div className='border-b border-gray-200 bg-white lg:hidden dark:border-gray-700 dark:bg-gray-800'>
          <div className='flex'>
            <button
              onClick={() => setTranslationEnabled(false)}
              className={`flex-1 border-b-2 px-4 py-3 text-center text-sm font-medium transition-colors ${
                !translationEnabled
                  ? `border-blue-500 ${darkMode ? 'bg-blue-950/30 text-blue-400' : 'bg-blue-50 text-blue-600'}`
                  : `border-transparent ${
                      darkMode
                        ? 'text-gray-400 hover:bg-gray-700 hover:text-gray-300'
                        : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                    }`
              }`}
            >
              📝 {t('original')}
            </button>
            <button
              onClick={() => setTranslationEnabled(true)}
              className={`flex-1 border-b-2 px-4 py-3 text-center text-sm font-medium transition-colors ${
                translationEnabled
                  ? `border-green-500 ${darkMode ? 'bg-green-950/30 text-green-400' : 'bg-green-50 text-green-600'}`
                  : `border-transparent ${
                      darkMode
                        ? 'text-gray-400 hover:bg-gray-700 hover:text-gray-300'
                        : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                    }`
              }`}
            >
              🌍 {t('translation')}
              {selectedLang && <span className='ml-1 text-xs opacity-75'>{selectedLang.flag}</span>}
            </button>
          </div>
        </div>

        {/* Desktop Layout - Show only on desktop */}
        <div className='hidden flex-1 lg:flex lg:flex-row'>
          {/* Original Transcript - Desktop */}
          <div className={`flex-1 transition-all duration-300 ${translationEnabled ? 'lg:mr-2' : ''}`}>
            <div className='h-full p-4'>
              <Card className={`h-full ${darkMode ? 'border-gray-700 bg-gray-800' : 'bg-white'}`}>
                <CardHeader>
                  <CardTitle className={`flex items-center space-x-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                    <Mic className='h-5 w-5' />
                    <span>{t('original')} Transcript</span>
                    <div className='h-3 w-3 animate-pulse rounded-full bg-green-500'></div>
                    <span className={`text-sm font-normal ${darkMode ? 'text-gray-300' : 'text-gray-500'}`}>Live</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className='h-[calc(100%-80px)]'>
                  <div className='h-full space-y-4 overflow-y-auto'>{renderTranscriptContent('original')}</div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Translation Side Panel - Desktop */}
          {translationEnabled && (
            <div className='w-full lg:w-1/2'>
              <div className='h-full p-4 pl-2'>
                <Card
                  className={`h-full border-l-4 border-green-500 ${
                    darkMode ? 'border-gray-700 bg-gray-800' : 'bg-white'
                  }`}
                >
                  <CardHeader className='pb-3'>
                    <div className='flex items-center justify-between'>
                      <CardTitle className={`flex items-center space-x-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                        <Globe className='h-5 w-5 text-green-600' />
                        <span>{t('translation')}</span>
                        {selectedLang && (
                          <span className={`text-sm font-normal ${darkMode ? 'text-gray-300' : 'text-gray-500'}`}>
                            ({selectedLang.flag} {selectedLang.name})
                          </span>
                        )}
                      </CardTitle>
                      <Button variant='ghost' size='sm' onClick={() => setTranslationEnabled(false)}>
                        <X className='h-4 w-4' />
                      </Button>
                    </div>

                    {/* Language Selector */}
                    <div className='mt-3'>
                      <Select value={selectedLanguage} onValueChange={setSelectedLanguage}>
                        <SelectTrigger className='w-full'>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {languages.map((lang) => (
                            <SelectItem key={lang.code} value={lang.code}>
                              <div className='flex items-center space-x-2'>
                                <span>{lang.flag}</span>
                                <span>{lang.name}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </CardHeader>

                  <CardContent className='h-[calc(100%-140px)]'>
                    <div className='h-full space-y-4 overflow-y-auto'>{renderTranscriptContent('translation')}</div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </div>

        {/* Mobile Layout - Show only on mobile */}
        <div className='flex flex-1 flex-col lg:hidden'>
          <div className='flex-1 p-4'>
            <Card className={`h-full ${darkMode ? 'border-gray-700 bg-gray-800' : 'bg-white'}`}>
              <CardHeader className='pb-3'>
                <div className='flex items-center justify-between'>
                  <CardTitle className={`flex items-center space-x-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                    {translationEnabled ? (
                      <>
                        <Globe className='h-5 w-5 text-green-600' />
                        <span>Translation</span>
                        {selectedLang && (
                          <span className={`text-sm font-normal ${darkMode ? 'text-gray-300' : 'text-gray-500'}`}>
                            ({selectedLang.flag} {selectedLang.name})
                          </span>
                        )}
                      </>
                    ) : (
                      <>
                        <Mic className='h-5 w-5' />
                        <span>Original Transcript</span>
                        <div className='h-3 w-3 animate-pulse rounded-full bg-green-500'></div>
                        <span className={`text-sm font-normal ${darkMode ? 'text-gray-300' : 'text-gray-500'}`}>
                          Live
                        </span>
                      </>
                    )}
                  </CardTitle>
                </div>

                {/* Language Selector - Mobile (only show when translation is enabled) */}
                {translationEnabled && (
                  <div className='mt-3'>
                    <Select value={selectedLanguage} onValueChange={setSelectedLanguage}>
                      <SelectTrigger className='w-full'>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {languages.map((lang) => (
                          <SelectItem key={lang.code} value={lang.code}>
                            <div className='flex items-center space-x-2'>
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

              <CardContent className='h-[calc(100%-100px)] overflow-hidden'>
                <div className='h-full space-y-4 overflow-y-auto'>
                  {translationEnabled ? renderTranscriptContent('translation') : renderTranscriptContent('original')}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <ChatbotWidget transcript={transcript.map((line) => line.original).join('\n')} sessionId={sessionId || ''} />
    </div>
  )
}
