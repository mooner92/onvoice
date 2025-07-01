"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Mic, MicOff, Users, Settings, Volume2, VolumeX, AlertCircle, CheckCircle } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useAuth } from "@/components/auth/AuthProvider"
import { createClient } from "@/lib/supabase"
import { QRCodeDisplay } from "@/components/ui/qr-code"
import { RealtimeSTT } from "@/components/RealtimeSTT"
import type { Session } from "@/lib/types"

interface TranscriptLine {
  id: string;
  timestamp: string;
  text: string;
  confidence: number;
  isPartial?: boolean;
}

export default function HostDashboard() {
  const { user } = useAuth()
  const router = useRouter()
  const supabase = createClient()
  
  const [sessionTitle, setSessionTitle] = useState("")
  const [sessionDescription, setSessionDescription] = useState("")
  const [primaryLanguage, setPrimaryLanguage] = useState("auto")
  const [isRecording, setIsRecording] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [transcript, setTranscript] = useState<TranscriptLine[]>([])
  const [currentPartialText, setCurrentPartialText] = useState("")
  const [isMuted, setIsMuted] = useState(false)
  const [participantCount, setParticipantCount] = useState(0)
  const [sessionDuration, setSessionDuration] = useState(0)
  const [isInitializing, setIsInitializing] = useState(true)
  const [hasActiveSession, setHasActiveSession] = useState(false)
  const [micPermission, setMicPermission] = useState<'granted' | 'denied' | 'prompt'>('prompt')
  const [sttError, setSTTError] = useState<string | null>(null)
  
  // Refs for cleanup
  const autoStopTimerRef = useRef<NodeJS.Timeout | null>(null)

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

  // Check if user is authenticated
  useEffect(() => {
    if (!user) {
      router.push('/')
    }
  }, [user, router])

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
          setSessionDescription(activeSession.description || "")
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
        const permission = await navigator.permissions.query({ name: 'microphone' as PermissionName })
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
          filter: `session_id=eq.${sessionId}`
        },
        async () => {
          await updateParticipantCount()
        }
      )
      .subscribe()

    // Initial count load
    updateParticipantCount()

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
        
        // Auto-stop after 5 minutes (300 seconds)
        if (duration >= 300) {
          console.log('Auto-stopping session after 5 minutes')
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
      // Set 5-minute auto-stop timer
      autoStopTimerRef.current = setTimeout(() => {
        console.log('Auto-stopping session after 5 minutes (timer)')
        handleStopSession()
      }, 5 * 60 * 1000) // 5 minutes
    }

    return () => {
      if (autoStopTimerRef.current) {
        clearTimeout(autoStopTimerRef.current)
        autoStopTimerRef.current = null
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

  const loadExistingTranscripts = useCallback(async (sessionId: string) => {
    try {
      const { data: transcripts, error } = await supabase
        .from('transcripts')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true })

      if (error) throw error

      const formattedTranscripts: TranscriptLine[] = transcripts.map(t => ({
        id: t.id,
        timestamp: new Date(t.created_at).toLocaleTimeString(),
        text: t.original_text,
        confidence: 0.9
      }))

      setTranscript(formattedTranscripts)
    } catch (error) {
      console.error('Error loading existing transcripts:', error)
    }
  }, [supabase])

  // Handle real-time transcript updates
  const handleTranscriptUpdate = (text: string, isPartial: boolean) => {
    console.log('Transcript update:', { text, isPartial })
    
    if (isPartial) {
      // Update partial text display
      setCurrentPartialText(text)
    } else {
      // Add final transcript to list
      const newLine: TranscriptLine = {
        id: Date.now().toString(),
        timestamp: new Date().toLocaleTimeString(),
        text: text.trim(),
        confidence: 0.9
      }
      
      setTranscript(prev => [...prev, newLine])
      setCurrentPartialText("") // Clear partial text
    }
  }

  const handleSTTError = (error: string) => {
    console.error('STT Error:', error)
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
          hostId: user.id,
          hostName: user.user_metadata?.full_name || user.email,
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
              sessionId
            })
          })
          const sttEndData = await sttEndResp.json()
          console.log('STT stream end result:', sttEndData)
        } catch (sttErr) {
          console.error('Failed to end STT stream:', sttErr)
        }
      }

      // Clear auto-stop timer
      if (autoStopTimerRef.current) {
        clearTimeout(autoStopTimerRef.current)
        autoStopTimerRef.current = null
      }

      // Wait a moment for RealtimeSTT to cleanup
      await new Promise(resolve => setTimeout(resolve, 1000))

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
      }

      // Reset state
      setSessionId(null)
      setSession(null)
      setSessionDuration(0)
      setParticipantCount(0)
      setHasActiveSession(false)
      setTranscript([])
      setCurrentPartialText("")
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
    if (!sessionId) return ""
    
    // For development: use local network IP instead of localhost for mobile access
    const isDevelopment = process.env.NODE_ENV === 'development'
    const baseUrl = isDevelopment && typeof window !== 'undefined' 
      ? window.location.hostname === 'localhost' 
        ? `http://172.16.3.235:${window.location.port || '3001'}`  // Dynamic port
        : window.location.origin
      : window.location.origin
    
    return `${baseUrl}/session/${sessionId}`
  }

  const getPublicSessionUrl = () => {
    if (!sessionId) return ""
    
    // For development: use local network IP instead of localhost for mobile access
    const isDevelopment = process.env.NODE_ENV === 'development'
    let baseUrl = window.location.origin
    
    if (isDevelopment && typeof window !== 'undefined' && window.location.hostname === 'localhost') {
      // Get current port
      const currentPort = window.location.port || '3000'
      // Use localhost for same-device access, will be replaced by actual network IP in QR display
      baseUrl = `http://localhost:${currentPort}`
    }
    
    // Public access URL (no auth required)
    return `${baseUrl}/s/${sessionId}`
  }

  if (!user) {
    return <div>Loading...</div>
  }

  if (isInitializing) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card>
          <CardContent className="p-8">
            <div className="flex flex-col items-center space-y-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="text-gray-600">Initializing session...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b bg-white">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center space-x-2">
              <Mic className="h-8 w-8 text-blue-600" />
              <span className="text-2xl font-bold text-gray-900">LiveTranscribe</span>
            </Link>
            <Badge variant="outline">Host Dashboard</Badge>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        {/* Environment Info for Development */}
        {process.env.NODE_ENV === 'development' && (
          <Card className="mb-6 border-blue-200 bg-blue-50">
            <CardContent className="p-4">
              <div className="flex items-center space-x-2 text-blue-800">
                <AlertCircle className="h-5 w-5" />
                <p className="font-medium">Development Mode</p>
              </div>
              <div className="text-blue-700 text-sm mt-1 space-y-1">
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
          <Card className="mb-6 border-red-200 bg-red-50">
            <CardContent className="p-4">
              <div className="flex items-center space-x-2 text-red-800">
                <AlertCircle className="h-5 w-5" />
                <p className="font-medium">Microphone access required</p>
              </div>
              <p className="text-red-700 text-sm mt-1">
                Please enable microphone access in your browser settings to start a session.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Active Session Resume */}
        {hasActiveSession && !isRecording && (
          <Card className="mb-6 border-green-200 bg-green-50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 text-green-800">
                  <CheckCircle className="h-5 w-5" />
                  <div>
                    <p className="font-medium">Active session found</p>
                    <p className="text-sm text-green-700">&quot;{session?.title}&quot;</p>
                  </div>
                </div>
                <div className="flex space-x-2">
                  <Button onClick={handleResumeSession} variant="outline" size="sm">
                    View Session
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Session Setup */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Settings className="h-5 w-5" />
                  <span>Session Setup</span>
                </CardTitle>
                <CardDescription>
                  Configure your lecture session. Attendees can join via QR code with or without authentication.
                  Perfect for both local and online/remote sessions.
                  <br />
                  <span className="text-amber-600 font-medium">⏰ Sessions auto-stop after 5 minutes to prevent unexpected charges.</span>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="title">Session Title</Label>
                  <Input
                    id="title"
                    placeholder="e.g., Introduction to Machine Learning"
                    value={sessionTitle}
                    onChange={(e) => setSessionTitle(e.target.value)}
                    disabled={isRecording}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description (Optional)</Label>
                  <Textarea
                    id="description"
                    placeholder="Brief description of the lecture content..."
                    value={sessionDescription}
                    onChange={(e) => setSessionDescription(e.target.value)}
                    disabled={isRecording}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Primary Language (Optional)</Label>
                  <Select value={primaryLanguage} onValueChange={setPrimaryLanguage}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {sttLanguages.map(lang => (
                        <SelectItem key={lang.code} value={lang.code}>{lang.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-gray-500">
                    Auto-detect provides the best accuracy. Specify only if needed for consistency.
                  </p>
                </div>

                <div className="flex justify-center pt-4">
                  {!isRecording ? (
                    <Button 
                      size="lg" 
                      onClick={handleStartSession} 
                      disabled={!sessionTitle.trim() || micPermission === 'denied'} 
                      className="px-8"
                    >
                      <Mic className="mr-2 h-5 w-5" />
                      Start Session
                    </Button>
                  ) : (
                    <Button size="lg" variant="destructive" onClick={handleStopSession} className="px-8">
                      <MicOff className="mr-2 h-5 w-5" />
                      Stop Session
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Live Transcript */}
            {isRecording && (
              <Card className="mt-6">
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Volume2 className="h-5 w-5" />
                    <span>Live Transcript</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsMuted(!isMuted)}
                    >
                      {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                    </Button>
                  </CardTitle>
                  
                  {/* Real-time STT Status */}
                  {sessionId && (
                    <div className="mt-2">
                      <RealtimeSTT
                        sessionId={sessionId}
                        isRecording={isRecording}
                        onTranscriptUpdate={handleTranscriptUpdate}
                        onError={handleSTTError}
                        lang={primaryLanguage === 'auto' ? undefined : primaryLanguage}
                      />
                    </div>
                  )}
                  
                  {/* STT Error Display */}
                  {sttError && (
                    <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                      <div className="flex items-center space-x-2 text-red-800">
                        <AlertCircle className="h-4 w-4" />
                        <span className="text-sm font-medium">STT Error</span>
                      </div>
                      <p className="text-red-700 text-sm mt-1">{sttError}</p>
                    </div>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="max-h-64 overflow-y-auto space-y-2">
                    {/* Current partial text (real-time preview) */}
                    {currentPartialText && (
                      <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <div className="text-xs text-blue-600 mb-1 flex items-center">
                          <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse mr-2"></div>
                          Speaking... (live preview)
                        </div>
                        <div className="text-gray-700 italic">{currentPartialText}</div>
                      </div>
                    )}
                    
                    {/* Final transcripts */}
                    {transcript.map((line) => (
                      <div key={line.id} className="p-3 bg-gray-50 rounded-lg">
                        <div className="text-xs text-gray-500 mb-1">{line.timestamp}</div>
                        <div className="text-gray-900">{line.text}</div>
                      </div>
                    ))}
                    
                    {transcript.length === 0 && !currentPartialText && (
                      <div className="text-center text-gray-500 py-8">
                        <div className="space-y-2">
                          <Mic className="h-8 w-8 mx-auto text-gray-400" />
                          <p>Real-time transcription ready...</p>
                          <p className="text-xs">Start speaking to see live transcript</p>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Session Status & QR Code */}
          <div className="space-y-6">
            {/* Session Status */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Users className="h-5 w-5" />
                  <span>Session Status</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!isRecording ? (
                  <div className="text-center py-8">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Mic className="h-8 w-8 text-gray-400" />
                    </div>
                    <p className="text-gray-500">Session not started</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="text-center">
                      <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <div className="w-4 h-4 bg-red-500 rounded-full animate-pulse"></div>
                      </div>
                      <p className="font-medium text-green-600">Session Active</p>
                      <p className="text-sm text-gray-500">ID: {sessionId}</p>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Connected Users:</span>
                        <span className="font-medium">{participantCount}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Duration:</span>
                        <span className={`font-medium ${sessionDuration >= 240 ? 'text-red-600' : ''}`}>
                          {formatDuration(sessionDuration)} / 5:00
                        </span>
                      </div>
                      {sessionDuration >= 240 && (
                        <div className="text-xs text-red-600 bg-red-50 p-2 rounded">
                          ⚠️ Session will auto-stop in {300 - sessionDuration} seconds
                        </div>
                      )}
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Words Transcribed:</span>
                        <span className="font-medium">
                          {transcript.reduce((total, line) => total + line.text.split(' ').length, 0)}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Transcript Lines:</span>
                        <span className="font-medium">{transcript.length}</span>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* QR Code */}
            {isRecording && sessionId && (
              <div className="space-y-4">
                <QRCodeDisplay
                  value={getPublicSessionUrl()}
                  title="Scan to Join (No Auth Required)"
                  size={200}
                />
                
                {/* Additional Options */}
              <Card>
                  <CardContent className="p-4">
                    <div className="space-y-3">
                      <h4 className="font-medium text-gray-900">Session Links</h4>
                      
                      <div className="space-y-2 text-sm">
                        <div>
                          <span className="text-gray-600">Public Access:</span>
                          <br />
                          <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                            {getPublicSessionUrl()}
                          </code>
                        </div>
                        
                        <div>
                          <span className="text-gray-600">Auth Required:</span>
                          <br />
                          <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                            {getSessionUrl()}
                          </code>
                        </div>
                      </div>
                      
                      <div className="text-xs text-gray-500">
                        💡 Public link allows anyone to join without signing in.
                        Perfect for online conferences and remote audiences.
                      </div>
                    </div>
                </CardContent>
              </Card>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
