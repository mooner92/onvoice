"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Label } from "@/components/ui/label"
import { ArrowLeft, FileText, Languages, ChevronRight, Settings, Loader2 } from "lucide-react"
import { useParams, useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { useToast, ToastContainer } from "@/components/ui/toast"
import { Session, Transcript } from "@/lib/types"
import type { TranslationResponse } from "@/lib/types"
import Link from "next/link"
import ChatbotWidget from '@/components/ChatbotWidget'
import { useSession, useUser } from "@clerk/nextjs"



export default function SessionTranscriptPage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useUser()
  const { session: clerkSession } = useSession();
  const supabase = createClient(clerkSession?.getToken() ?? Promise.resolve(null));
  const sessionId = params.id as string
  const { toasts, addToast, removeToast } = useToast()

  const [transcript, setTranscript] = useState<Transcript[]>([])
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showTranslation, setShowTranslation] = useState(false)
  const [selectedLanguage, setSelectedLanguage] = useState("ko")
  const [fontSize, setFontSize] = useState([18])
  const [darkMode, setDarkMode] = useState(false)
  const [showTimestamps, setShowTimestamps] = useState(true)
  const [showSettings, setShowSettings] = useState(false)
  
  // 번역 관련 상태
  const [translatedTexts, setTranslatedTexts] = useState<Record<string, string>>({})
  const [translatingIds, setTranslatingIds] = useState<Set<string>>(new Set())
  const translationCache = useRef<Map<string, string>>(new Map())

  // 🆕 텍스트만 보기 상태
  const [textOnlyMode, setTextOnlyMode] = useState(false)
  
  // 🆕 요약 관련 상태
  const [summary, setSummary] = useState<string | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryError, setSummaryError] = useState<string | null>(null)
  const [translatedSummary, setTranslatedSummary] = useState<string>('')
  const [summaryTranslating, setSummaryTranslating] = useState(false)

  // 🚀 사용량이 많은 3개 언어만 제공 (자동 번역 지원)
  const languages = [
    { code: "ko", name: "Korean", flag: "🇰🇷" },
    { code: "zh", name: "Chinese", flag: "🇨🇳" },
    { code: "hi", name: "Hindi", flag: "🇮🇳" },
    { code: "en", name: "English", flag: "🇺🇸" }, // 원문 표시용
  ]

  // Load session and transcript data
  useEffect(() => {
    const loadSessionTranscript = async () => {
      if (!user || !sessionId) return

      try {
        setLoading(true)
        setError(null)

        // Load session data
        const { data: sessionData, error: sessionError } = await supabase
          .from('sessions')
          .select('*')
          .eq('id', sessionId)
          .single()

        if (sessionError) throw sessionError
        setSession(sessionData)

        // Load all transcripts for this session (remove translation_status filter)
        const { data: transcripts, error: transcriptError } = await supabase
          .from('transcripts')
          .select('*')
          .eq('session_id', sessionId)
          .order('created_at', { ascending: true })

        if (transcriptError) throw transcriptError
        setTranscript(transcripts || [])

        // 🆕 세션이 종료된 경우 요약 로드
        if (sessionData.status === 'ended') {
          loadSessionSummary()
        }

      } catch (error) {
        console.error('Error loading session transcript:', error)
        setError(`Failed to load transcript: ${error instanceof Error ? error.message : 'Unknown error'}`)
      } finally {
        setLoading(false)
      }
    }

    loadSessionTranscript()
  }, [user, sessionId, supabase])

  // 🆕 요약 로드 함수
  const loadSessionSummary = useCallback(async () => {
    if (!sessionId) return

    try {
      setSummaryLoading(true)
      setSummaryError(null)

      const response = await fetch(`/api/session/${sessionId}/summary`)
      
      if (response.ok) {
        const data = await response.json()
        setSummary(data.summary)
        
        // 요약 로드 후 즉시 번역 실행
        if (data.summary && showTranslation && selectedLanguage !== 'en') {
          await translateSummary(data.summary, selectedLanguage)
        } else if (data.summary) {
          setTranslatedSummary(data.summary)
        }
      } else if (response.status === 404) {
        // 요약이 없는 경우 - 생성 시도
        await generateSummary()
      } else {
        throw new Error(`Failed to load summary: ${response.status}`)
      }
    } catch (error) {
      console.error('Error loading summary:', error)
      setSummaryError('요약을 불러오는데 실패했습니다.')
    } finally {
      setSummaryLoading(false)
    }
  }, [sessionId])

  // 🆕 요약 생성 함수
  const generateSummary = useCallback(async (force = false) => {
    if (!sessionId) return

    try {
      setSummaryLoading(true)
      setSummaryError(null)

      const response = await fetch(`/api/session/${sessionId}/summary`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(force ? { force: true } : {}),
      })

      if (response.ok) {
        const data = await response.json()
        setSummary(data.summary)
        
        // 요약 생성 후 즉시 번역 실행
        if (data.summary && showTranslation && selectedLanguage !== 'en') {
          await translateSummary(data.summary, selectedLanguage)
        } else if (data.summary) {
          setTranslatedSummary(data.summary)
        }
        
        addToast({
          type: 'success',
          title: '요약 생성 완료!',
          message: '세션 내용이 성공적으로 요약되었습니다.',
          duration: 3000
        })
      } else {
        throw new Error(`Failed to generate summary: ${response.status}`)
      }
    } catch (error) {
      console.error('Error generating summary:', error)
      setSummaryError('요약을 생성하는데 실패했습니다.')
      
      addToast({
        type: 'error',
        title: '요약 생성 실패',
        message: '요약을 생성하는데 실패했습니다. 다시 시도해주세요.',
        duration: 5000
      })
    } finally {
      setSummaryLoading(false)
    }
  }, [sessionId, addToast])

  // 🆕 요약 번역 함수 (새로운 캐시 시스템 사용)
  const translateSummary = useCallback(async (summaryText: string, targetLang: string) => {
    if (!summaryText || targetLang === 'en') {
      setTranslatedSummary(summaryText)
      return
    }

    setSummaryTranslating(true)
    
    try {
      // session_summary_cache에서 번역된 요약 찾기
      const { data: cachedSummary, error } = await supabase
        .from('session_summary_cache')
        .select('summary_text')
        .eq('session_id', sessionId)
        .eq('language_code', targetLang)
        .maybeSingle()

      if (error) {
        console.error('Error loading summary translation:', error)
        setTranslatedSummary(summaryText) // 실패 시 영어 원문 표시
      } else if (cachedSummary) {
        setTranslatedSummary(cachedSummary.summary_text)
        console.log(`✅ Loaded ${targetLang} summary translation from cache`)
      } else {
        console.log(`⚠️ No ${targetLang} summary translation found, using original`)
        setTranslatedSummary(summaryText)
      }
    } catch (error) {
      console.error('Error loading summary translation:', error)
      setTranslatedSummary(summaryText)
    } finally {
      setSummaryTranslating(false)
    }
  }, [supabase, sessionId])

  // 🆕 실시간 transcript 구독 (번역 완료된 것만)
  useEffect(() => {
    if (!sessionId) return

    console.log('🔔 Setting up realtime subscription for transcript page...')
    
    const channel = supabase
      .channel(`transcripts-page-${sessionId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'transcripts',
        filter: `session_id=eq.${sessionId}`
      }, (payload) => {
        console.log('🔔 Transcript page realtime update:', payload.eventType, payload.new)
        
        if (payload.eventType === 'INSERT' && payload.new) {
          const newTranscript = payload.new as Transcript & { translation_status?: string }
          
          // 번역이 완료된 것만 처리
          if (newTranscript.translation_status !== 'completed') {
            console.log(`⏳ Skipping transcript (status: ${newTranscript.translation_status})`)
            return
          }
          
          console.log(`✨ Adding new completed transcript to page`)
          
          setTranscript(prev => {
            // 중복 방지
            if (prev.some(t => t.id === newTranscript.id)) {
              return prev
            }
            return [...prev, newTranscript].sort((a, b) => 
              new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            )
          })
        }
        
        if (payload.eventType === 'UPDATE' && payload.new) {
                      const updatedTranscript = payload.new as {
              id: string
              created_at: string
              original_text: string
              session_id: string
              user_id: string | null
              translation_status?: string
            }
          if (updatedTranscript.translation_status === 'completed') {
            console.log(`🔄 Transcript status updated to completed`)
            
            // 이미 로드된 transcript에 대해서만 상태 업데이트
            setTranscript(prev => prev.map(t => {
              if (t.id === updatedTranscript.id) {
                // translation_status만 업데이트 (타입 안전)
                return {
                  ...t,
                  // 추가 필드가 필요하면 여기에 추가
                }
              }
              return t
            }))
          }
        }
      })
      .subscribe((status) => {
        console.log('🔔 Transcript page subscription status:', status)
      })

    return () => {
      console.log('🧹 Cleaning up transcript page subscription')
      supabase.removeChannel(channel)
    }
  }, [sessionId, supabase])

  // 🆕 요약 번역 실행 (요약 로드 시 또는 언어 변경 시)
  useEffect(() => {
    if (summary && showTranslation) {
      translateSummary(summary, selectedLanguage)
    } else if (summary) {
      setTranslatedSummary(summary) // 번역 비활성화 시 원문 표시
    }
  }, [summary, selectedLanguage, showTranslation, translateSummary])

  // 번역 함수
  const translateText = useCallback(async (text: string, targetLang: string): Promise<string> => {
    const cacheKey = `${text}:${targetLang}`
    
    // 캐시 확인
    if (translationCache.current.has(cacheKey)) {
      return translationCache.current.get(cacheKey)!
    }
    
    try {
      console.log(`🌍 Translating: "${text.substring(0, 30)}..." → ${targetLang}`)
      
      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          targetLanguage: targetLang,
          sessionId: sessionId
        }),
      })

      if (!response.ok) {
        throw new Error(`Translation failed: ${response.status}`)
      }

      const result: TranslationResponse = await response.json()
      let translatedText = result.translatedText
      
      // Mock 번역인 경우 실제 번역 기다리기
      if (result.isProcessing && result.engine === 'mock') {
        console.log(`⏳ Waiting for real translation...`)
        
        // 몇 번 재시도해서 실제 번역 가져오기
        for (let i = 0; i < 5; i++) {
          await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)))
          
          try {
            const statusResponse = await fetch(`/api/translate?text=${encodeURIComponent(text)}&targetLanguage=${targetLang}`)
            if (statusResponse.ok) {
              const statusResult = await statusResponse.json()
              if (statusResult.completed) {
                translatedText = statusResult.translatedText
                console.log(`✅ Real translation received: ${statusResult.engine}`)
                break
              }
            }
          } catch (error) {
            console.warn('Translation status check failed:', error)
          }
        }
      }
      
      // 캐시에 저장
      translationCache.current.set(cacheKey, translatedText)
      return translatedText
      
    } catch (error) {
      console.error('Translation error:', error)
      return `[번역 실패] ${text}`
    }
  }, [sessionId])

  // 번역 활성화/언어 변경시 번역 수행
  useEffect(() => {
    if (!showTranslation) {
      setTranslatedTexts({})
      setTranslatingIds(new Set())
      return
    }

    const translateAllTexts = async () => {
      console.log(`🔄 Starting batch translation for ${transcript.length} items`)
      setTranslatingIds(new Set(transcript.map(t => t.id)))
      
      const newTranslatedTexts: Record<string, string> = {}
      
      // 병렬로 번역 (최대 3개씩)
      for (let i = 0; i < transcript.length; i += 3) {
        const batch = transcript.slice(i, i + 3)
        
        await Promise.all(batch.map(async (item) => {
          try {
            const translated = await translateText(item.original_text, selectedLanguage)
            newTranslatedTexts[item.id] = translated
            
            // 개별 완료시마다 UI 업데이트
            setTranslatedTexts(prev => ({ ...prev, [item.id]: translated }))
            setTranslatingIds(prev => {
              const newSet = new Set(prev)
              newSet.delete(item.id)
              return newSet
            })
          } catch (error) {
            console.error(`Translation failed for ${item.id}:`, error)
            setTranslatingIds(prev => {
              const newSet = new Set(prev)
              newSet.delete(item.id)
              return newSet
            })
          }
        }))
        
        // 배치 간 짧은 딜레이
        if (i + 3 < transcript.length) {
          await new Promise(resolve => setTimeout(resolve, 200))
        }
      }
      
      console.log(`✅ Batch translation completed`)
    }

    if (transcript.length > 0) {
      translateAllTexts()
    }
  }, [showTranslation, selectedLanguage, transcript, translateText])

  const selectedLang = languages.find((lang) => lang.code === selectedLanguage)

  // 🆕 텍스트 복사 기능 (Toast 알림 적용)
  const copyTextOnly = useCallback(async (type: 'original' | 'translation', event?: React.MouseEvent) => {
    // 이벤트 기본 동작 방지 (페이지 이동 방지)
    if (event) {
      event.preventDefault()
      event.stopPropagation()
    }
    
    if (transcript.length === 0) {
      addToast({
        type: 'warning',
        title: '복사할 내용이 없습니다',
        message: '트랜스크립트가 아직 없습니다.',
        duration: 2000
      })
      return
    }
    
    const textContent = transcript
      .map((line, index) => {
        const text = type === 'original' ? line.original_text : (translatedTexts[line.id] || line.original_text)
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
      
      // 성공 Toast 알림
      addToast({
        type: 'success',
        title: '복사 완료!',
        message: `${type === 'original' ? '원문' : '번역문'} ${transcript.length}개 항목이 클립보드에 복사되었습니다.`,
        duration: 3000
      })
      
    } catch (err) {
      console.error('❌ Failed to copy text:', err)
      
      // 실패 Toast 알림
      addToast({
        type: 'error',
        title: '복사 실패',
        message: '클립보드 접근이 실패했습니다. 브라우저 설정을 확인해주세요.',
        duration: 5000
      })
    }
  }, [transcript, translatedTexts, textOnlyMode, addToast])

  if (!user) {
    return <div>Loading...</div>
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <p className="text-gray-600">Loading transcript...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <FileText className="h-8 w-8 text-red-600" />
          <p className="text-gray-900 font-medium">Failed to Load Transcript</p>
          <p className="text-gray-600 text-sm text-center">{error}</p>
          <Button onClick={() => router.push('/my-sessions')} variant="outline">
            Back to My Sessions
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className={`min-h-screen ${darkMode ? 'dark bg-gray-900' : 'bg-gray-50'}`}>
      {/* Header */}
      <header className={`border-b sticky top-0 z-40 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white'}`}>
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Button variant="ghost" size="sm" asChild className="pl-0 pr-2 -ml-2">
                <Link href="/my-sessions">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Link>
              </Button>
              <div>
                <h1 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  {session?.title}
                </h1>
                <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                  Session Transcript • {transcript.length} lines
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setShowTranslation(!showTranslation)}
                className="flex items-center space-x-2"
              >
                <Languages className="h-4 w-4" />
                <span>{showTranslation ? 'Hide' : 'Show'} Translation</span>
                <ChevronRight className={`h-4 w-4 transition-transform ${showTranslation ? 'rotate-90' : ''}`} />
              </Button>
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
          <div className="container mx-auto">
            <div className="grid md:grid-cols-4 gap-4">
              {/* Translation Settings */}
              {showTranslation && (
                <div className="space-y-2">
                  <Label className={`text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Target Language
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

              {/* Font Size */}
              <div className="space-y-2">
                <Label className={`text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Font Size: {fontSize[0]}px
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

              {/* Display Options */}
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
                    Dark Mode
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
                    Show Timestamps
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
                    텍스트만 보기 (복사 편의)
                  </Label>
                </div>
              </div>

              {/* 🆕 복사 버튼들 */}
              {transcript.length > 0 && (
                <div className="space-y-2">
                  <Label className={`text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    텍스트 복사
                  </Label>
                  <div className="flex space-x-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={(e) => copyTextOnly('original', e)}
                      className="flex-1"
                    >
                      📋 원문 복사
                    </Button>
                    {showTranslation && (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={(e) => copyTextOnly('translation', e)}
                        className="flex-1"
                      >
                        🌍 번역문 복사
                      </Button>
                    )}
                  </div>
                  {textOnlyMode && (
                    <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      💡 텍스트만 보기 모드: 번호와 타임스탬프 없이 순수 텍스트만 복사됩니다.
                    </p>
                  )}
                </div>
              )}

              {/* Status */}
              <div className="space-y-2">
                <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'} p-3 rounded ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
                  <div className="space-y-1">
                    <div>📝 <strong>Completed Session</strong></div>
                    <div>• {transcript.length} transcript lines</div>
                    {showTranslation && (
                      <>
                        <div>• Target: {selectedLang?.flag} {selectedLang?.name}</div>
                        <div>• Translating: {translatingIds.size} remaining</div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="container mx-auto px-4 py-6">
        <div className="max-w-4xl mx-auto">
          {/* 🆕 Summary Section */}
          {session?.status === 'ended' && (
            <div className={`mb-8 p-6 rounded-lg border-2 border-dashed ${
              darkMode 
                ? 'bg-gray-800 border-gray-600' 
                : 'bg-blue-50 border-blue-200'
            }`}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className={`p-2 rounded-full ${
                    darkMode ? 'bg-blue-900 text-blue-300' : 'bg-blue-100 text-blue-600'
                  }`}>
                    <FileText className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className={`text-xl font-semibold ${
                      darkMode ? 'text-white' : 'text-gray-900'
                    }`}>
                      Session Summary
                    </h2>
                    <p className={`text-sm ${
                      darkMode ? 'text-gray-400' : 'text-gray-600'
                    }`}>
                      {session.category && (
                        <span className="inline-flex items-center space-x-1">
                          <span>
                            {session.category === 'sports' && '⚽'}
                            {session.category === 'economics' && '💰'}
                            {session.category === 'technology' && '💻'}
                            {session.category === 'education' && '📚'}
                            {session.category === 'business' && '🏢'}
                            {session.category === 'medical' && '🏥'}
                            {session.category === 'legal' && '⚖️'}
                            {session.category === 'entertainment' && '🎬'}
                            {session.category === 'science' && '🔬'}
                            {session.category === 'general' && '📋'}
                          </span>
                          <span className="capitalize">{session.category}</span>
                          <span>•</span>
                        </span>
                      )}
                      <span>AI-generated summary based on {transcript.length} transcript lines</span>
                    </p>
                  </div>
                </div>
                
                {/* Generate Summary Button */}
                {!summary && !summaryLoading && (
                  <Button
                    onClick={() => generateSummary()}
                    variant="outline"
                    size="sm"
                    className="flex items-center space-x-2"
                  >
                    <span>🤖</span>
                    <span>Generate Summary</span>
                  </Button>
                )}
              </div>

              {/* Summary Content */}
              <div className={`rounded-lg p-4 ${
                darkMode ? 'bg-gray-700' : 'bg-white'
              }`}>
                {summaryLoading && (
                  <div className="flex items-center space-x-3 text-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                    <div>
                      <p className={`font-medium ${
                        darkMode ? 'text-white' : 'text-gray-900'
                      }`}>
                        AI 요약 생성 중...
                      </p>
                      <p className={`text-sm ${
                        darkMode ? 'text-gray-400' : 'text-gray-600'
                      }`}>
                        전체 transcript를 분석하여 {session.category} 분야에 맞는 요약을 생성하고 있습니다.
                      </p>
                    </div>
                  </div>
                )}

                {summaryError && (
                  <div className="text-center py-8">
                    <div className="text-red-500 mb-2">⚠️ 요약 생성 실패</div>
                    <p className={`text-sm mb-4 ${
                      darkMode ? 'text-gray-400' : 'text-gray-600'
                    }`}>
                      {summaryError}
                    </p>
                    <Button
                      onClick={() => generateSummary()}
                      variant="outline"
                      size="sm"
                    >
                      다시 시도
                    </Button>
                  </div>
                )}

                {summary && (
                  <div className="space-y-4">
                    {summaryTranslating && (
                      <div className="flex items-center space-x-2 mb-2">
                        <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                        <span className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          Translating summary to {selectedLang?.name}...
                        </span>
                      </div>
                    )}
                    <div 
                      className={`leading-relaxed ${
                        darkMode ? 'text-gray-100' : 'text-gray-800'
                      }`}
                      style={{ fontSize: `${fontSize[0]}px` }}
                    >
                      {showTranslation && selectedLanguage !== 'en' 
                        ? <span dangerouslySetInnerHTML={{ __html: translatedSummary || summary }} />
                        : <span dangerouslySetInnerHTML={{ __html: summary }} />
                      }
                    </div>
                    
                    {/* Summary Actions */}
                    <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-600">
                      <div className={`text-xs ${
                        darkMode ? 'text-gray-400' : 'text-gray-500'
                      }`}>
                        Generated by GPT-4 • {
                          showTranslation && selectedLanguage !== 'en' 
                            ? (translatedSummary || summary).length
                            : summary.length
                        } characters
                        {showTranslation && selectedLanguage !== 'en' && translatedSummary && (
                          <span> • Translated to {selectedLang?.name}</span>
                        )}
                      </div>
                      <div className="flex space-x-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const summaryToCopy = showTranslation && selectedLanguage !== 'en' 
                              ? (translatedSummary || summary)
                              : summary
                            navigator.clipboard.writeText(summaryToCopy)
                            addToast({
                              type: 'success',
                              title: '요약 복사 완료!',
                              message: `${showTranslation && selectedLanguage !== 'en' ? '번역된 ' : ''}요약이 클립보드에 복사되었습니다.`,
                              duration: 2000
                            })
                          }}
                        >
                          📋 Copy Summary
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSummary(null)
                            generateSummary(true)
                          }}
                        >
                          🔄 Regenerate
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {!summary && !summaryLoading && !summaryError && (
                  <div className="text-center py-8">
                    <div className={`text-6xl mb-4 ${
                      darkMode ? 'text-gray-600' : 'text-gray-300'
                    }`}>
                      📄
                    </div>
                    <p className={`font-medium mb-2 ${
                      darkMode ? 'text-gray-300' : 'text-gray-700'
                    }`}>
                      No summary available yet
                    </p>
                    <p className={`text-sm ${
                      darkMode ? 'text-gray-400' : 'text-gray-600'
                    }`}>
                      Click &quot;Generate Summary&quot; to create an AI-powered summary of this session.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {transcript.length === 0 ? (
            <div className={`text-center py-12 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No transcript available for this session</p>
            </div>
          ) : textOnlyMode ? (
            /* 🆕 텍스트만 보기 모드 */
            <div className="space-y-2">
              {transcript.map((line) => (
                <div key={`text-only-${line.id}`}>
                  {/* Original Text */}
                  <div 
                    className={`leading-relaxed ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}
                    style={{ fontSize: `${fontSize[0]}px` }}
                  >
                    {line.original_text}
                  </div>
                  
                  {/* Translation if available */}
                  {showTranslation && translatedTexts[line.id] && (
                    <div 
                      className={`leading-relaxed italic pl-4 border-l-2 ${
                        darkMode 
                          ? 'text-gray-300 border-gray-600' 
                          : 'text-gray-700 border-gray-300'
                      }`}
                      style={{ fontSize: `${fontSize[0] - 1}px` }}
                    >
                      {translatedTexts[line.id]}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            /* 기존 스타일 모드 */
            <div className="space-y-3">
              {transcript.map((line, index) => (
                <div key={line.id} className="group">
                  {/* Timestamp */}
                  {showTimestamps && (
                    <div className={`text-xs mb-1 flex items-center space-x-2 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      <span className="font-medium">#{index + 1}</span>
                      <span>•</span>
                      <span>{new Date(line.created_at).toLocaleTimeString()}</span>
                      <span>•</span>
                      <span>{session?.host_name}</span>
                      {showTranslation && translatingIds.has(line.id) && (
                        <>
                          <span>•</span>
                          <Loader2 className="h-3 w-3 animate-spin" />
                          <span>번역 중...</span>
                        </>
                      )}
                    </div>
                  )}
                  
                  {/* Original Text */}
                  <div 
                    className={`leading-relaxed mb-1 ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}
                    style={{ fontSize: `${fontSize[0]}px` }}
                  >
                    {line.original_text}
                  </div>
                  
                  {/* Translation */}
                  {showTranslation && (
                    <div 
                      className={`leading-relaxed italic pl-4 border-l-2 ${
                        darkMode 
                          ? 'text-gray-300 border-gray-600' 
                          : 'text-gray-700 border-gray-300'
                      }`}
                      style={{ fontSize: `${fontSize[0] - 1}px` }}
                    >
                      {translatingIds.has(line.id) ? (
                        <span className="text-gray-400">[AI 번역 중...]</span>
                      ) : (
                        translatedTexts[line.id] || `[${selectedLang?.name}] ${line.original_text}`
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      
      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <ChatbotWidget transcript={transcript.map(line => line.original_text).join('\n')} sessionId={sessionId} />
    </div>
  )
}

