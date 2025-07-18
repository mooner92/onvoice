'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Mic, MicOff, Users, Settings, Volume2, VolumeX, AlertCircle, CheckCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { QRCodeDisplay } from '@/components/ui/qr-code'
import { RealtimeSTT } from '@/components/RealtimeSTT'
import type { Session } from '@/lib/types'
import { useSession, useUser } from '@clerk/nextjs'

interface TranscriptLine {
  id: string
  timestamp: string
  text: string
  confidence: number
  isPartial?: boolean
  isReviewing?: boolean // 검수 중 상태
  reviewedText?: string // 검수된 텍스트
  detectedLanguage?: string // 감지된 언어
}

export default function HostDashboard() {
  const { isLoaded, isSignedIn, user } = useUser()
  const { session: clerkSession } = useSession()
  const router = useRouter()
  const supabase = createClient(clerkSession?.getToken() ?? Promise.resolve(null))

  const [sessionTitle, setSessionTitle] = useState('')
  const [sessionDescription, setSessionDescription] = useState('')
  const [sessionCategory, setSessionCategory] = useState('general')
  const [primaryLanguage, setPrimaryLanguage] = useState('auto')
  const [isRecording, setIsRecording] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [transcript, setTranscript] = useState<TranscriptLine[]>([])
  const [currentPartialText, setCurrentPartialText] = useState('')
  const [isMuted, setIsMuted] = useState(false)
  const [participantCount, setParticipantCount] = useState(0)
  const [sessionDuration, setSessionDuration] = useState(0)
  const [isInitializing, setIsInitializing] = useState(true)
  const [hasActiveSession, setHasActiveSession] = useState(false)
  const [micPermission, setMicPermission] = useState<'granted' | 'denied' | 'prompt'>('prompt')
  const [sttError, setSTTError] = useState<string | null>(null)

  // Refs for cleanup
  const autoStopTimerRef = useRef<NodeJS.Timeout | null>(null)
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null)
  const lastTranscriptTimeRef = useRef<number>(Date.now())

  const sttLanguages = [
    { code: 'auto', name: 'Auto-detect (Recommended)' },
    { code: 'en-US', name: 'English' },
    { code: 'es-ES', name: 'Spanish' },
    { code: 'fr-FR', name: 'French' },
    { code: 'de-DE', name: 'German' },
    { code: 'it-IT', name: 'Italian' },
    { code: 'pt-PT', name: 'Portuguese' },
    { code: 'ru-RU', name: 'Russian' },
    { code: 'ja-JP', name: 'Japanese' },
    { code: 'ko-KR', name: 'Korean' },
    { code: 'zh-CN', name: 'Chinese' },
  ]

  const sessionCategories = [
    {
      code: 'general',
      name: 'General',
      icon: '📋',
      description: 'General content',
    },
    {
      code: 'sports',
      name: 'Sports',
      icon: '⚽',
      description: 'Sports-related content',
    },
    {
      code: 'economics',
      name: 'Economics',
      icon: '💰',
      description: 'Economics and finance-related content',
    },
    {
      code: 'technology',
      name: 'Technology',
      icon: '💻',
      description: 'Technology and IT-related content',
    },
    {
      code: 'education',
      name: 'Education',
      icon: '📚',
      description: 'Education and learning-related content',
    },
    {
      code: 'business',
      name: 'Business',
      icon: '🏢',
      description: 'Business and management-related content',
    },
    {
      code: 'medical',
      name: 'Medical',
      icon: '🏥',
      description: 'Medical and health-related content',
    },
    {
      code: 'legal',
      name: 'Legal',
      icon: '⚖️',
      description: 'Legal and law-related content',
    },
    {
      code: 'entertainment',
      name: 'Entertainment',
      icon: '🎬',
      description: 'Entertainment and culture-related content',
    },
    {
      code: 'science',
      name: 'Science',
      icon: '🔬',
      description: 'Science and research-related content',
    },
  ]

  // Check for existing active session on component mount
  useEffect(() => {
    const checkExistingSession = async () => {
      if (!user) return

      try {
        const { data: activeSessions, error } = await supabase
          .from('sessions')
          .select('*')
          .eq('host_id', user.id)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(1)

        if (error) throw error

        if (activeSessions && activeSessions.length > 0) {
          const activeSession = activeSessions[0]
          setSession(activeSession)
          setSessionId(activeSession.id)
          setSessionTitle(activeSession.title)
          setSessionDescription(activeSession.description || '')
          setSessionCategory(activeSession.category || 'general')
          setPrimaryLanguage(activeSession.primary_language)
          setHasActiveSession(true)
          setIsRecording(true)

          // Load existing transcripts
          await loadExistingTranscripts(activeSession.id)
        }
      } catch (error) {
        console.error('Error checking existing session:', error)
      } finally {
        setIsInitializing(false)
      }
    }

    checkExistingSession()
  }, [user, supabase])

  // Check microphone permission
  useEffect(() => {
    const checkMicPermission = async () => {
      try {
        const permission = await navigator.permissions.query({
          name: 'microphone' as PermissionName,
        })
        setMicPermission(permission.state as 'granted' | 'denied' | 'prompt')

        permission.onchange = () => {
          setMicPermission(permission.state as 'granted' | 'denied' | 'prompt')
        }
      } catch (error) {
        console.error('Error checking mic permission:', error)
      }
    }

    checkMicPermission()
  }, [])

  // Subscribe to participant count updates
  useEffect(() => {
    if (!sessionId) return

    const channel = supabase
      .channel(`session-${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'session_participants',
          filter: `session_id=eq.${sessionId}`,
        },
        async () => {
          await updateParticipantCount()
        },
      )
      .subscribe()

    // Initial count load
    updateParticipantCount()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [sessionId, supabase])

  // Subscribe to transcript updates (검수 완료된 결과)
  useEffect(() => {
    if (!sessionId) return

    const channel = supabase
      .channel(`transcripts-${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'transcripts',
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          const updatedTranscript = payload.new as {
            id: string
            original_text: string
            reviewed_text: string
            review_status: string
            detected_language: string
            timestamp: string
          }
          
          if (updatedTranscript.review_status === 'completed' && updatedTranscript.reviewed_text) {
            console.log('✅ Received reviewed transcript:', updatedTranscript.reviewed_text)
            
            // 임시 항목을 검수 완료된 항목으로 교체 (중복 방지)
            setTranscript((prev) => {
              // 이미 존재하는지 확인 (ID 또는 텍스트로)
              const existingIndex = prev.findIndex(line => 
                line.id === updatedTranscript.id || 
                line.text === updatedTranscript.original_text ||
                line.reviewedText === updatedTranscript.reviewed_text
              )
              
              if (existingIndex !== -1) {
                // 기존 항목 업데이트
                const updated = [...prev]
                updated[existingIndex] = {
                  ...updated[existingIndex],
                  id: updatedTranscript.id, // 실제 DB ID로 업데이트
                  text: updatedTranscript.reviewed_text, // 검수된 텍스트 사용
                  confidence: 0.95,
                  isReviewing: false,
                  reviewedText: updatedTranscript.reviewed_text,
                  detectedLanguage: updatedTranscript.detected_language,
                }
                return updated
              } else {
                // 새 항목 추가 (임시 항목 제거 후)
                const filtered = prev.filter(line => !line.id.startsWith('temp-'))
                return [...filtered, {
                  id: updatedTranscript.id,
                  timestamp: updatedTranscript.timestamp,
                  text: updatedTranscript.reviewed_text, // 검수된 텍스트 사용
                  confidence: 0.95,
                  isReviewing: false,
                  reviewedText: updatedTranscript.reviewed_text,
                  detectedLanguage: updatedTranscript.detected_language,
                }]
              }
            })
          }
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [sessionId, supabase])

  // Session duration timer
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null

    if (isRecording && session) {
      interval = setInterval(() => {
        const startTime = new Date(session.created_at).getTime()
        const now = new Date().getTime()
        const duration = Math.floor((now - startTime) / 1000)
        setSessionDuration(duration)

        // Auto-stop after 1 hour (3600 seconds)
        if (duration >= 3600) {
          console.log('Auto-stopping session after 1 hour')
          handleStopSession()
        }
      }, 1000)
    } else {
      setSessionDuration(0)
    }

    return () => {
      if (interval) clearInterval(interval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRecording, session])

  // Auto-stop timer for new sessions
  useEffect(() => {
    if (isRecording && sessionId) {
      // Set 1-hour auto-stop timer
      autoStopTimerRef.current = setTimeout(
        () => {
          console.log('Auto-stopping session after 1 hour (timer)')
          handleStopSession()
        },
        60 * 60 * 1000,
      ) // 1 hour

      // Start inactivity monitoring
      const startInactivityTimer = () => {
        if (inactivityTimerRef.current) {
          clearTimeout(inactivityTimerRef.current)
        }

        inactivityTimerRef.current = setTimeout(
          () => {
            console.log('Auto-stopping session after 30 minutes of inactivity')
            handleStopSession()
          },
          30 * 60 * 1000,
        ) // 30 minutes
      }

      // Initialize inactivity timer
      startInactivityTimer()
      lastTranscriptTimeRef.current = Date.now()
    }

    return () => {
      if (autoStopTimerRef.current) {
        clearTimeout(autoStopTimerRef.current)
        autoStopTimerRef.current = null
      }
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current)
        inactivityTimerRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRecording, sessionId])

  const updateParticipantCount = useCallback(async () => {
    if (!sessionId) return

    try {
      const { count, error } = await supabase
        .from('session_participants')
        .select('*', { count: 'exact', head: true })
        .eq('session_id', sessionId)
        .is('left_at', null)

      if (error) throw error
      setParticipantCount(count || 0)
    } catch (error) {
      console.error('Error updating participant count:', error)
    }
  }, [sessionId, supabase])

  const loadExistingTranscripts = useCallback(
    async (sessionId: string) => {
      try {
        const { data: transcripts, error } = await supabase
          .from('transcripts')
          .select('*')
          .eq('session_id', sessionId)
          .order('created_at', { ascending: true })

        if (error) throw error

        const formattedTranscripts: TranscriptLine[] = transcripts.map((t) => ({
          id: t.id,
          timestamp: new Date(t.created_at).toLocaleTimeString(),
          text: t.reviewed_text || t.original_text, // 검수된 텍스트가 있으면 사용, 없으면 원본
          confidence: 0.9,
          isReviewing: t.review_status === 'processing',
          reviewedText: t.reviewed_text,
          detectedLanguage: t.detected_language,
        }))

        setTranscript(formattedTranscripts)
      } catch (error) {
        console.error('Error loading existing transcripts:', error)
      }
    },
    [supabase],
  )

  // Handle real-time transcript updates
  const handleTranscriptUpdate = (text: string, isPartial: boolean) => {
    console.log('Transcript update:', { text, isPartial })

    if (isPartial) {
      // Update partial text display
      setCurrentPartialText(text)
    } else {
      // Add final transcript to list (원본 텍스트, 검수 중 상태)
      const newLine: TranscriptLine = {
        id: `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toLocaleTimeString(),
        text: text.trim(),
        confidence: 0.9,
        isReviewing: true, // 검수 중 상태
      }

      setTranscript((prev) => [...prev, newLine])
      setCurrentPartialText('') // Clear partial text

      // Reset inactivity timer when new transcript is received
      lastTranscriptTimeRef.current = Date.now()
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current)
        inactivityTimerRef.current = setTimeout(
          () => {
            console.log('Auto-stopping session after 30 minutes of inactivity')
            handleStopSession()
          },
          30 * 60 * 1000,
        ) // 30 minutes
      }
    }
  }

  const handleSTTError = (error: string) => {
    console.error('STT Error:', error)

    // 네트워크 연결 에러는 5분 제한으로 인한 정상적인 재시작이므로 사용자에게 표시하지 않음
    if (error.includes('Network connection lost') || error.includes('network')) {
      console.log('🌐 Network error detected - this is expected due to 5-minute timeout, ignoring...')
      return
    }

    // 다른 에러만 사용자에게 표시
    setSTTError(error)
  }

  const handleStartSession = async () => {
    if (!user) return

    setIsInitializing(true)
    setSTTError(null)

    try {
      // Create session via API
      const response = await fetch('/api/session/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: sessionTitle,
          description: sessionDescription,
          category: sessionCategory,
          hostId: user.id,
          hostName: user.fullName || user.primaryEmailAddress,
          primaryLanguage: primaryLanguage,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to create session')
      }

      const { session: newSession } = await response.json()

      setSession(newSession)
      setSessionId(newSession.id)
      setIsRecording(true)
      setHasActiveSession(true)
      setMicPermission('granted')
    } catch (error) {
      console.error('Error starting session:', error)
      setSTTError('Failed to start session')
    } finally {
      setIsInitializing(false)
    }
  }

  const handleStopSession = useCallback(async () => {
    if (!sessionId || !user || !isRecording) return

    console.log('Stopping session:', sessionId)

    try {
      // First, immediately set recording to false to stop STT
      setIsRecording(false)

      // Immediately call STT stream end API to persist transcript
      if (sessionId) {
        try {
          const sttEndResp = await fetch('/api/stt-stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'end',
              sessionId,
            }),
          })
          const sttEndData = await sttEndResp.json()
          console.log('STT stream end result:', sttEndData)
        } catch (sttErr) {
          console.error('Failed to end STT stream:', sttErr)
        }
      }

      // Clear auto-stop timer and inactivity timer
      if (autoStopTimerRef.current) {
        clearTimeout(autoStopTimerRef.current)
        autoStopTimerRef.current = null
      }
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current)
        inactivityTimerRef.current = null
      }

      // Wait a moment for RealtimeSTT to cleanup
      await new Promise((resolve) => setTimeout(resolve, 1000))

      // End session via API
      const response = await fetch(`/api/session/${sessionId}/end`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          hostId: user.id,
        }),
      })

      if (response.ok) {
        const { statistics } = await response.json()
        console.log('Session ended:', statistics)

        // 세션 종료 후 공개 요약 페이지로 리디렉션
        if (sessionId) {
          const summaryUrl = `${window.location.origin}/summary/${sessionId}`

          // 새 탭에서 공개 요약 페이지 열기
          window.open(summaryUrl, '_blank')

          // 현재 탭은 홈으로 이동
          setTimeout(() => {
            router.push('/')
          }, 1000)
        }
      }

      // Reset state
      setSessionId(null)
      setSession(null)
      setSessionDuration(0)
      setParticipantCount(0)
      setHasActiveSession(false)
      setTranscript([])
      setCurrentPartialText('')
      setSTTError(null)
    } catch (error) {
      console.error('Error stopping session:', error)
      // Still reset state even if API call fails
      setIsRecording(false)
      setSessionId(null)
      setSession(null)
      setHasActiveSession(false)
      setSTTError(null)
    }
  }, [sessionId, user, isRecording])

  const handleResumeSession = () => {
    if (sessionId) {
      router.push(`/session/${sessionId}`)
    }
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const getSessionUrl = () => {
    if (!sessionId) return ''

    return `${window.location.origin}/session/${sessionId}`
  }

  const getPublicSessionUrl = () => {
    if (!sessionId) return ''

    // Public access URL (no auth required)
    return `${window.location.origin}/s/${sessionId}`
  }

  if (!isLoaded) {
    return (
      <div className='flex flex-1 items-center justify-center bg-gray-50'>
        <Card className='aspect-square w-54'>
          <CardContent className='flex flex-col items-center gap-4 p-8'>
            <div className='h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600'></div>
            <p className='text-gray-600'>Loading...</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (isLoaded && !isSignedIn) return <div>Not Signed In...</div>

  if (isInitializing) {
    return (
      <div className='flex flex-1 items-center justify-center bg-gray-50'>
        <Card className='aspect-square w-54'>
          <CardContent className='flex flex-col items-center gap-4 p-8'>
            <div className='h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600'></div>
            <p className='text-gray-600'>Initializing session...</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className='container mx-auto px-4 py-8'>
      {/* Environment Info for Development */}
      {process.env.NODE_ENV === 'development' && (
        <Card className='mb-6 border-blue-200 bg-blue-50'>
          <CardContent className='p-4'>
            <div className='flex items-center space-x-2 text-blue-800'>
              <AlertCircle className='h-5 w-5' />
              <p className='font-medium'>Development Mode</p>
            </div>
            <div className='mt-1 space-y-1 text-sm text-blue-700'>
              <p>• Mobile access: QR code auto-detects network IP</p>
              <p>• STT: 🔄 Auto-configured (Whisper API)</p>
              <p>• Auth: Google login required for all users</p>
              <p>• Dev tip: Same account can be host + audience</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Microphone Permission Alert */}
      {micPermission === 'denied' && (
        <Card className='mb-6 border-red-200 bg-red-50'>
          <CardContent className='p-4'>
            <div className='flex items-center space-x-2 text-red-800'>
              <AlertCircle className='h-5 w-5' />
              <p className='font-medium'>Microphone access required</p>
            </div>
            <p className='mt-1 text-sm text-red-700'>
              Please enable microphone access in your browser settings to start a session.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Active Session Resume */}
      {hasActiveSession && !isRecording && (
        <Card className='mb-6 border-green-200 bg-green-50'>
          <CardContent className='p-4'>
            <div className='flex items-center justify-between'>
              <div className='flex items-center space-x-2 text-green-800'>
                <CheckCircle className='h-5 w-5' />
                <div>
                  <p className='font-medium'>Active session found</p>
                  <p className='text-sm text-green-700'>&quot;{session?.title}&quot;</p>
                </div>
              </div>
              <div className='flex space-x-2'>
                <Button onClick={handleResumeSession} variant='outline' size='sm'>
                  View Session
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className='grid gap-8 lg:grid-cols-3'>
        {/* Session Setup */}
        <div className='lg:col-span-2'>
          <Card>
            <CardHeader>
              <CardTitle className='flex items-center space-x-2'>
                <Settings className='h-5 w-5' />
                <span>Session Setup</span>
              </CardTitle>
              <CardDescription>
                Configure your lecture session. Attendees can join via QR code with or without authentication. Perfect
                for both local and online/remote sessions.
                <br />
                <span className='font-medium text-amber-600'>
                  ⏰ Sessions auto-stop after 1 hour or 30 minutes of inactivity to prevent unexpected charges.
                </span>
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-6'>
              <div className='space-y-2'>
                <Label htmlFor='title'>Session Title</Label>
                <Input
                  id='title'
                  placeholder='e.g., Introduction to Machine Learning'
                  value={sessionTitle}
                  onChange={(e) => setSessionTitle(e.target.value)}
                  disabled={isRecording}
                />
              </div>

              <div className='space-y-2'>
                <Label htmlFor='description'>Description (Optional)</Label>
                <Textarea
                  id='description'
                  placeholder='Brief description of the lecture content...'
                  value={sessionDescription}
                  onChange={(e) => setSessionDescription(e.target.value)}
                  disabled={isRecording}
                />
              </div>

              <div className='space-y-2'>
                <Label>Session Category</Label>
                <Select value={sessionCategory} onValueChange={setSessionCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {sessionCategories.map((category) => (
                      <SelectItem key={category.code} value={category.code}>
                        <div className='flex items-center space-x-2'>
                          <span>{category.icon}</span>
                          <span>{category.name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className='text-sm text-gray-500'>When you select a category, you will receive translations and summaries tailored to that field.</p>
              </div>

              <div className='space-y-2'>
                <Label>Primary Language (Optional)</Label>
                <Select value={primaryLanguage} onValueChange={setPrimaryLanguage}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {sttLanguages.map((lang) => (
                      <SelectItem key={lang.code} value={lang.code}>
                        {lang.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className='text-sm text-gray-500'>
                  Auto-detect provides the best accuracy. Specify only if needed for consistency.
                </p>
              </div>

              <div className='flex justify-center pt-4'>
                {!isRecording ? (
                  <Button
                    size='lg'
                    onClick={handleStartSession}
                    disabled={!sessionTitle.trim() || micPermission === 'denied'}
                    className='px-8'
                  >
                    <Mic className='mr-2 h-5 w-5' />
                    Start Session
                  </Button>
                ) : (
                  <Button size='lg' variant='destructive' onClick={handleStopSession} className='px-8'>
                    <MicOff className='mr-2 h-5 w-5' />
                    Stop Session
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Live Transcript */}
          {isRecording && (
            <Card className='mt-6'>
              <CardHeader>
                <CardTitle className='flex items-center space-x-2'>
                  <Volume2 className='h-5 w-5' />
                  <span>Live Transcript</span>
                  <Button variant='ghost' size='sm' onClick={() => setIsMuted(!isMuted)}>
                    {isMuted ? <VolumeX className='h-4 w-4' /> : <Volume2 className='h-4 w-4' />}
                  </Button>
                </CardTitle>

                {/* Real-time STT Status */}
                {sessionId && (
                  <div className='mt-2'>
                    <RealtimeSTT
                      sessionId={sessionId}
                      isRecording={isRecording}
                      onTranscriptUpdate={handleTranscriptUpdate}
                      onError={handleSTTError}
                      lang={primaryLanguage === 'auto' ? undefined : primaryLanguage}
                    />
                  </div>
                )}

                {/* Web Speech API Info */}
                {isRecording && (
                  <div className='mt-2 rounded-lg border border-blue-200 bg-blue-50 p-3'>
                    <div className='flex items-center space-x-2 text-blue-800'>
                      <div className='h-2 w-2 animate-pulse rounded-full bg-blue-500'></div>
                      <span className='text-sm font-medium'>Live Speech Recognition Active</span>
                    </div>
                    <p className='mt-1 text-xs text-blue-700'>
                      🔄 Automatically restarts every 4 minutes to prevent timeout
                    </p>
                  </div>
                )}

                {/* STT Error Display */}
                {sttError && (
                  <div className='mt-2 rounded-lg border border-red-200 bg-red-50 p-3'>
                    <div className='flex items-center space-x-2 text-red-800'>
                      <AlertCircle className='h-4 w-4' />
                      <span className='text-sm font-medium'>STT Error</span>
                    </div>
                    <p className='mt-1 text-sm text-red-700'>{sttError}</p>
                  </div>
                )}
              </CardHeader>
              <CardContent>
                <div className='max-h-64 space-y-2 overflow-y-auto'>
                  {/* Current partial text (real-time preview) */}
                  {currentPartialText && (
                    <div className='rounded-lg border border-blue-200 bg-blue-50 p-3'>
                      <div className='mb-1 flex items-center text-xs text-blue-600'>
                        <div className='mr-2 h-2 w-2 animate-pulse rounded-full bg-blue-500'></div>
                        Speaking... (live preview)
                      </div>
                      <div className='text-gray-700 italic'>{currentPartialText}</div>
                    </div>
                  )}

                  {/* Final transcripts */}
                  {transcript.map((line, index) => (
                    <div key={`${line.id}-${index}-${line.timestamp}`} className={`rounded-lg p-3 ${line.isReviewing ? 'bg-yellow-50 border border-yellow-200' : 'bg-gray-50'}`}>
                      <div className='mb-1 flex items-center justify-between text-xs text-gray-500'>
                        <span>{line.timestamp}</span>
                        {line.isReviewing && (
                          <span className='flex items-center text-yellow-600'>
                            <div className='mr-1 h-2 w-2 animate-pulse rounded-full bg-yellow-500'></div>
                            Reviewing with AI...
                          </span>
                        )}
                        {line.detectedLanguage && !line.isReviewing && (
                          <span className='text-blue-600'>
                            {line.detectedLanguage.toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div className={`${line.isReviewing ? 'text-yellow-800' : 'text-gray-900'}`}>
                        {line.reviewedText || line.text}
                      </div>
                      {line.reviewedText && line.reviewedText !== line.text && (
                        <div className='mt-2 text-xs text-gray-500'>
                          <span className='font-medium'>Original:</span> {line.text}
                        </div>
                      )}
                    </div>
                  ))}

                  {transcript.length === 0 && !currentPartialText && (
                    <div className='py-8 text-center text-gray-500'>
                      <div className='space-y-2'>
                        <Mic className='mx-auto h-8 w-8 text-gray-400' />
                        <p>Real-time transcription ready...</p>
                        <p className='text-xs'>Start speaking to see live transcript</p>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Session Status & QR Code */}
        <div className='space-y-6'>
          {/* Session Status */}
          <Card>
            <CardHeader>
              <CardTitle className='flex items-center space-x-2'>
                <Users className='h-5 w-5' />
                <span>Session Status</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!isRecording ? (
                <div className='py-8 text-center'>
                  <div className='mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100'>
                    <Mic className='h-8 w-8 text-gray-400' />
                  </div>
                  <p className='text-gray-500'>Session not started</p>
                </div>
              ) : (
                <div className='space-y-4'>
                  <div className='text-center'>
                    <div className='mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100'>
                      <div className='h-4 w-4 animate-pulse rounded-full bg-red-500'></div>
                    </div>
                    <p className='font-medium text-green-600'>Session Active</p>
                    <p className='text-sm text-gray-500'>ID: {sessionId}</p>
                  </div>

                  <div className='space-y-2'>
                    <div className='flex justify-between text-sm'>
                      <span className='text-gray-500'>Connected Users:</span>
                      <span className='font-medium'>{participantCount}</span>
                    </div>
                    <div className='flex justify-between text-sm'>
                      <span className='text-gray-500'>Duration:</span>
                      <span className={`font-medium ${sessionDuration >= 3540 ? 'text-red-600' : ''}`}>
                        {formatDuration(sessionDuration)} / 60:00
                      </span>
                    </div>
                    {sessionDuration >= 3540 && (
                      <div className='rounded bg-red-50 p-2 text-xs text-red-600'>
                        ⚠️ Session will auto-stop in {3600 - sessionDuration} seconds
                      </div>
                    )}
                    <div className='flex justify-between text-sm'>
                      <span className='text-gray-500'>Words Transcribed:</span>
                      <span className='font-medium'>
                        {transcript.reduce((total, line) => total + line.text.split(' ').length, 0)}
                      </span>
                    </div>
                    <div className='flex justify-between text-sm'>
                      <span className='text-gray-500'>Transcript Lines:</span>
                      <span className='font-medium'>{transcript.length}</span>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* QR Code */}
          {isRecording && sessionId && (
            <div className='space-y-4'>
              <QRCodeDisplay value={getPublicSessionUrl()} title='Scan to Join (No Auth Required)' size={200} />

              {/* Additional Options */}
              <Card>
                <CardContent className='p-4'>
                  <div className='space-y-3'>
                    <h4 className='font-medium text-gray-900'>Session Links</h4>

                    <div className='space-y-2 text-sm'>
                      <div>
                        <span className='text-gray-600'>Public Access:</span>
                        <br />
                        <code className='rounded bg-gray-100 px-2 py-1 text-xs'>{getPublicSessionUrl()}</code>
                      </div>

                      <div>
                        <span className='text-gray-600'>Auth Required:</span>
                        <br />
                        <code className='rounded bg-gray-100 px-2 py-1 text-xs'>{getSessionUrl()}</code>
                      </div>
                    </div>

                    <div className='text-xs text-gray-500'>
                      💡 Public link allows anyone to join without signing in. Perfect for online conferences and remote
                      audiences.
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
