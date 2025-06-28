"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { 
  Users, 
  Clock, 
  Menu, 
  Globe, 
  Mic, 
  Settings,
  User,
  LogIn,
  Loader2,
  AlertCircle
} from "lucide-react"
import { useParams, useRouter } from "next/navigation"
import { useAuth } from "@/components/auth/AuthProvider"
import { LoginButton } from "@/components/auth/LoginButton"
import { createClient } from "@/lib/supabase"
import { Session, Transcript } from "@/lib/types"

interface TranscriptLine {
  id: string
  timestamp: string
  original: string
  translated: string
  speaker?: string
}

export default function PublicSessionPage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useAuth()
  const supabase = createClient()
  const slug = params.slug as string

  const [selectedLanguage, setSelectedLanguage] = useState("ko")
  const [fontSize, setFontSize] = useState([18])
  const [darkMode, setDarkMode] = useState(false)
  const [autoScroll, setAutoScroll] = useState(true)
  const [showTimestamps, setShowTimestamps] = useState(false)
  const [translationEnabled, setTranslationEnabled] = useState(false)
  const [isTranslating, setIsTranslating] = useState(false)
  const [transcript, setTranscript] = useState<TranscriptLine[]>([])
  const [activeTab, setActiveTab] = useState("original")
  const [showSettings, setShowSettings] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const [participantCount, setParticipantCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)

  const [hasJoined, setHasJoined] = useState(false)

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
            translated: getMockTranslation(t.original_text, selectedLanguage),
            speaker: sessionData.host_name
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
  }, [slug, supabase, selectedLanguage])

  // Join session as participant
  const joinSession = async () => {
    if (!sessionId || !user) return

    try {
      // Check if user is the host of this session
      const isHost = session?.host_id === user.id
      
      const participantData = {
        session_id: sessionId,
        user_id: user.id,
        user_name: user.user_metadata?.full_name || user.email || 'User',
        role: isHost ? 'host_viewing' as const : 'audience' as const,
        joined_at: new Date().toISOString()
      }

      await supabase
        .from('session_participants')
        .insert(participantData)

      setHasJoined(true)
    } catch (error) {
      console.error('Error joining session:', error)
    }
  }

  // Subscribe to real-time transcript updates
  useEffect(() => {
    if (!sessionId || !hasJoined) return

    const channel = supabase
      .channel(`public-transcript-${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'transcripts',
          filter: `session_id=eq.${sessionId}`
        },
        (payload) => {
          const newTranscript = payload.new as Transcript
          const translatedText = getMockTranslation(newTranscript.original_text, selectedLanguage)
          
          const newLine: TranscriptLine = {
            id: newTranscript.id,
            timestamp: newTranscript.timestamp,
            original: newTranscript.original_text,
            translated: translatedText,
            speaker: session?.host_name
          }

          setTranscript(prev => [...prev, newLine])
          
          // Asynchronously get real translation if enabled
          if (translationEnabled) {
            translateText(newTranscript.original_text, selectedLanguage).then(realTranslation => {
              setTranscript(prevTranscript => 
                prevTranscript.map(line => 
                  line.id === newTranscript.id 
                    ? { ...line, translated: realTranslation }
                    : line
                )
              )
            })
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [sessionId, selectedLanguage, session?.host_name, supabase, hasJoined])

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

  // Translation function using API
  const translateText = async (text: string, targetLang: string): Promise<string> => {
    if (!translationEnabled || targetLang === 'en') return text
    
    try {
      setIsTranslating(true)
      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          targetLanguage: targetLang,
          sourceLanguage: session?.primary_language || 'auto'
        }),
      })

      if (response.ok) {
        const data = await response.json()
        return data.translatedText
      } else {
        console.error('Translation failed')
        return text
      }
    } catch (error) {
      console.error('Translation error:', error)
      return text
    } finally {
      setIsTranslating(false)
    }
  }

  // Simple mock translation for immediate display
  const getMockTranslation = (text: string, targetLang: string): string => {
    if (!translationEnabled || targetLang === 'en') return text
    
    const mockTranslations: { [key: string]: string } = {
      'ko': `[한국어] ${text}`,
      'ja': `[日本語] ${text}`,
      'zh': `[中文] ${text}`,
      'es': `[Español] ${text}`,
      'fr': `[Français] ${text}`,
    }
    
    return mockTranslations[targetLang] || text
  }

  // Update translations when language changes
  useEffect(() => {
    setTranscript(prev => prev.map(line => ({
      ...line,
      translated: getMockTranslation(line.original, selectedLanguage)
    })))
    
    // Asynchronously get real translations if enabled
    if (translationEnabled) {
      transcript.forEach(line => {
        translateText(line.original, selectedLanguage).then(realTranslation => {
          setTranscript(prevTranscript => 
            prevTranscript.map(transcriptLine => 
              transcriptLine.id === line.id 
                ? { ...transcriptLine, translated: realTranslation }
                : transcriptLine
            )
          )
        })
      })
    }
  }, [selectedLanguage, translationEnabled])

  const selectedLang = languages.find((lang) => lang.code === selectedLanguage)

  const getTabContent = (type: 'original' | 'translated') => {
    return transcript.map((line) => (
      <div key={`${line.id}-${type}`} className={`p-3 mb-3 rounded-lg ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
        {showTimestamps && (
          <div className={`text-xs mb-2 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            {line.timestamp} {line.speaker && `• ${line.speaker}`}
          </div>
        )}
        <div 
          className={`leading-relaxed ${darkMode ? 'text-white' : 'text-gray-900'}`}
          style={{ fontSize: `${fontSize[0]}px` }}
        >
          {type === 'original' ? line.original : line.translated}
        </div>
      </div>
    ))
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

  // Require Google login - no guest access
  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="p-8">
            <div className="text-center space-y-6">
              <div>
                <Mic className="h-12 w-12 text-blue-600 mx-auto mb-4" />
                <h1 className="text-2xl font-bold text-gray-900">
                  {session?.title || 'Live Session'}
                </h1>
                <p className="text-gray-600 mt-2">
                  {session?.host_name ? `by ${session.host_name}` : 'Real-time transcription'}
                </p>
                <Badge className="mt-2 bg-green-100 text-green-800">
                  Live Session
                </Badge>
              </div>

              <div className="space-y-4">
                <div className="text-sm text-gray-600 bg-blue-50 p-3 rounded-lg">
                  <strong>Account Required</strong>
                  <br />
                  Sign in with Google to join this session and access your session history.
                </div>
                
                <LoginButton />
              </div>

              <div className="text-xs text-gray-400">
                Real-time transcription and translation
              </div>
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
                  Live Session
                </Badge>
              </div>

              <div className="space-y-4">
                <div className="text-sm text-gray-600">
                  Welcome, <strong>{user.user_metadata?.full_name || user.email}</strong>!
                </div>
                
                {session?.host_id === user.id && (
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
                  {session?.host_id === user.id ? 'View as Audience' : 'Join Session'}
                </Button>
              </div>

              <div className="text-xs text-gray-400">
                Real-time transcription and translation
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
              {user && (
                <div className="flex items-center space-x-1 text-xs text-gray-500">
                  <User className="h-3 w-3" />
                  <span>{user.user_metadata?.full_name || 'User'}</span>
                  {session?.host_id === user.id && (
                    <span className="text-blue-600 font-medium">👑</span>
                  )}
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
              <div className="flex items-center justify-between">
                <Label className={`text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Translation
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
                    Enable Translation
                  </Label>
                  {isTranslating && (
                    <Loader2 className="h-3 w-3 animate-spin text-blue-600" />
                  )}
                </div>
              </div>
              
              {translationEnabled && (
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
            </div>

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
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="p-4">
        {/* Language Display */}
        <div className="mb-4">
          <div className="flex items-center space-x-2 mb-2">
            <span className={`text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              Translation: {selectedLang?.flag} {selectedLang?.name}
            </span>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex space-x-1 mb-4 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setActiveTab("original")}
            className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
              activeTab === "original"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Original
          </button>
          <button
            onClick={() => setActiveTab("translated")}
            className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
              activeTab === "translated"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            {selectedLang?.flag} {selectedLang?.name}
          </button>
        </div>

        {/* Transcript Content */}
        <div className="space-y-2">
          {transcript.length === 0 ? (
            <div className={`text-center py-12 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              <Mic className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Waiting for the speaker to start...</p>
              <p className="text-sm mt-2">Live transcription will appear here</p>
            </div>
          ) : (
            getTabContent(activeTab as 'original' | 'translated')
          )}
        </div>
      </div>
    </div>
  )
} 