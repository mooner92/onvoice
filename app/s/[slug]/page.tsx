"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { 
  Users, 
  Clock, 
  Globe, 
  Mic, 
  Settings,
  User,
  Loader2,
  AlertCircle,
  X
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
      return supportedLangs.includes(browserLang) ? browserLang : 'ko'
    }
    
    return 'ko' // Default fallback
  }

  const [selectedLanguage, setSelectedLanguage] = useState('ko')
  const [fontSize, setFontSize] = useState([18])
  const [darkMode, setDarkMode] = useState(false)
  const [, ] = useState(true)
  const [showTimestamps, setShowTimestamps] = useState(true)
  const [translationEnabled, setTranslationEnabled] = useState(false)
  const [isTranslating, setIsTranslating] = useState(false)
  const [transcript, setTranscript] = useState<TranscriptLine[]>([])
  const [showSettings, setShowSettings] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const [participantCount, setParticipantCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)

  const [hasJoined, setHasJoined] = useState(false)

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

  // Handle new transcript updates with smart translation
  const handleTranscriptUpdate = useCallback((newText: string, isPartial: boolean = false) => {
    const now = new Date()
    const timestamp = now.toLocaleTimeString()
    const newId = `${now.getTime()}-${Math.random()}`
    
    const newLine: TranscriptLine = {
      id: newId,
      timestamp,
      original: newText,
      translated: translationEnabled ? getMockTranslation(newText, selectedLanguage) : newText,
      speaker: session?.host_name || 'Speaker'
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
      // For final updates, add as new line and translate if needed
      setTranscript(prev => {
        // Remove any partial line and add the final line
        const withoutPartial = prev.filter(line => !line.id.includes('partial'))
        const finalTranscript = [...withoutPartial, newLine]
        
        // Trigger translation for the new line if translation is enabled
        if (translationEnabled && selectedLanguage !== 'en') {
          translateTextEfficient(newText, selectedLanguage, newId)
        }
        
        return finalTranscript
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [translationEnabled, selectedLanguage, session?.host_name])

  // Subscribe to real-time transcript updates
  useEffect(() => {
    if (!sessionId || !hasJoined) return

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
          console.log('New transcript received:', payload.new)
          const newTranscript = payload.new as any
          
          // Use the new efficient update function
          handleTranscriptUpdate(newTranscript.original_text, false)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [sessionId, hasJoined, supabase, handleTranscriptUpdate])

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
        return data.translatedText || data.translation || text
      } else {
        console.error('Translation failed:', response.status, response.statusText)
        // Return mock translation as fallback
        return getMockTranslation(text, targetLang)
      }
    } catch (error) {
      console.error('Translation error:', error)
      // Return mock translation as fallback
      return getMockTranslation(text, targetLang)
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

  // Debounced translation cache
  const translationCache = useRef<Map<string, string>>(new Map())
  const pendingTranslations = useRef<Set<string>>(new Set())

  // Efficient translation function that avoids duplicate API calls
  const translateTextEfficient = useCallback(async (text: string, targetLang: string, lineId: string): Promise<string> => {
    if (!translationEnabled || targetLang === 'en') return text
    
    const cacheKey = `${text}-${targetLang}`
    
    // Check cache first
    if (translationCache.current.has(cacheKey)) {
      return translationCache.current.get(cacheKey)!
    }
    
    // Avoid duplicate API calls for same text
    if (pendingTranslations.current.has(cacheKey)) {
      return getMockTranslation(text, targetLang)
    }
    
    pendingTranslations.current.add(cacheKey)
    
    try {
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
        const translation = data.translatedText || data.translation || text
        
        // Cache the result
        translationCache.current.set(cacheKey, translation)
        
        // Update the specific line in state
        setTranscript(prev => prev.map(line => 
          line.id === lineId 
            ? { ...line, translated: translation }
            : line
        ))
        
        return translation
      } else {
        console.error('Translation failed:', response.status, response.statusText)
        return getMockTranslation(text, targetLang)
      }
    } catch (error) {
      console.error('Translation error:', error)
      return getMockTranslation(text, targetLang)
    } finally {
      pendingTranslations.current.delete(cacheKey)
    }
  }, [translationEnabled, session?.primary_language])

  // Update translations when language changes
  useEffect(() => {
    if (!translationEnabled) {
      // Reset translations when disabled
      setTranscript(prev => prev.map(line => ({
        ...line,
        translated: line.original
      })))
      return
    }

    // Show mock translations immediately, then get real ones
    setTranscript(prev => prev.map(line => ({
      ...line,
      translated: getMockTranslation(line.original, selectedLanguage)
    })))
    
    // Get real translations asynchronously (batch processing)
    const translateBatch = async () => {
      for (const line of transcript) {
        await translateTextEfficient(line.original, selectedLanguage, line.id)
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }
    
    if (transcript.length > 0) {
      translateBatch()
    }
  }, [selectedLanguage, translationEnabled, translateTextEfficient])

  // Clear cache when translation is disabled
  useEffect(() => {
    if (!translationEnabled) {
      translationCache.current.clear()
      pendingTranslations.current.clear()
    }
  }, [translationEnabled])

  const selectedLang = languages.find((lang) => lang.code === selectedLanguage)

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
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setTranslationEnabled(!translationEnabled)}
                className="flex items-center space-x-2"
              >
                <Globe className="h-4 w-4" />
                <span>{translationEnabled ? 'Hide' : 'Show'} Translation</span>
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
          <div className="space-y-4">
            <div className="space-y-3">
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
                
                <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'} p-2 rounded ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
                  <div className="space-y-1">
                    <div>💡 <strong>Cost-efficient translation:</strong></div>
                    <div>• Translation only happens when you view the translated tab</div>
                    <div>• Your preferred language: <strong>{languages.find(l => l.code === selectedLanguage)?.name}</strong></div>
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
      <div className="flex flex-col lg:flex-row h-[calc(100vh-80px)]">
        {/* Main Content - Original Transcript */}
        <div className={`flex-1 transition-all duration-300 ${translationEnabled ? 'lg:mr-2 mb-2 lg:mb-0' : ''}`}>
          <div className="h-full p-4">
            <Card className={`h-full ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white'}`}>
              <CardHeader>
                <CardTitle className={`flex items-center space-x-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  <Mic className="h-5 w-5" />
                  <span>Original Transcript</span>
                  <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse"></div>
                  <span className={`text-sm font-normal ${darkMode ? 'text-gray-300' : 'text-gray-500'}`}>Live</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="h-[calc(100%-80px)]">
                <div className="space-y-4 h-full overflow-y-auto">
                  {transcript.length === 0 ? (
                    <div className={`text-center py-16 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      <div className={`mx-auto w-16 h-16 rounded-full ${darkMode ? 'bg-gray-800' : 'bg-gray-100'} flex items-center justify-center mb-6`}>
                        <Mic className="h-8 w-8 opacity-50" />
                      </div>
                      <h3 className={`text-lg font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                        Waiting for the speaker to start...
                      </h3>
                      <p className="text-sm">Live transcription will appear here</p>
                      <div className="mt-4 flex items-center justify-center space-x-2">
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                        <span className="text-xs">Session is active</span>
                      </div>
                    </div>
                  ) : (
                    transcript.map((line, index) => {
                      // Split text into sentences for better readability
                      const sentences = line.original.split(/([.!?]+)/).filter(Boolean)
                      const formattedSentences: string[] = []
                      
                      for (let i = 0; i < sentences.length; i += 2) {
                        const sentence = sentences[i]
                        const punctuation = sentences[i + 1] || ''
                        if (sentence.trim()) {
                          formattedSentences.push((sentence + punctuation).trim())
                        }
                      }
                      
                      const finalSentences = formattedSentences.length > 0 ? formattedSentences : [line.original]
                      
                      return (
                        <div 
                          key={line.id} 
                          className={`p-4 rounded-lg border shadow-sm ${darkMode ? 'border-blue-600 bg-gray-700' : 'border-blue-200 bg-white'}`}
                        >
                          {showTimestamps && (
                            <div className={`text-xs mb-3 pb-2 border-b ${darkMode ? 'border-blue-500 text-gray-400' : 'border-blue-100 text-gray-500'}`}>
                              <div className="flex items-center justify-between">
                                <span>
                                  <span className="font-medium">#{index + 1}</span>
                                  {' • '}
                                  <span>{line.timestamp}</span>
                                </span>
                                <span className={`px-2 py-1 rounded text-xs ${darkMode ? 'bg-blue-600 text-blue-100' : 'bg-blue-100 text-blue-600'}`}>
                                  {line.speaker}
                                </span>
                              </div>
                            </div>
                          )}
                          
                          <div className="space-y-3">
                            {finalSentences.map((sentence, sentenceIndex) => (
                              <div 
                                key={`${line.id}-sentence-${sentenceIndex}`}
                                className={`leading-relaxed p-3 rounded-md ${darkMode ? 'text-gray-100 bg-blue-800' : 'text-gray-900 bg-blue-50'}`}
                                style={{ fontSize: `${fontSize[0]}px` }}
                              >
                                {sentence}
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Translation Side Panel */}
        <div className={`transition-all duration-300 ease-in-out ${
          translationEnabled 
            ? 'lg:w-1/2 w-full opacity-100' 
            : 'w-0 opacity-0 overflow-hidden lg:block hidden'
        }`}>
          {translationEnabled && (
            <div className="h-full p-4 pl-2">
              <Card className={`h-full border-l-4 border-green-500 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white'}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className={`flex items-center space-x-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                      <Globe className="h-5 w-5 text-green-600" />
                      <span>Translation</span>
                      {selectedLang && (
                        <span className={`text-sm font-normal ${darkMode ? 'text-gray-300' : 'text-gray-500'}`}>
                          ({selectedLang.flag} {selectedLang.name})
                        </span>
                      )}
                      {isTranslating && (
                        <Loader2 className="h-3 w-3 animate-spin text-green-600" />
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
                    {transcript.length === 0 ? (
                      <div className={`text-center py-12 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        <Globe className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>No content to translate</p>
                      </div>
                    ) : (
                      transcript.map((line, index) => {
                        const translatedText = line.translated
                        
                        // Split translated text into sentences for better readability
                        const sentences = translatedText.split(/([.!?]+)/).filter(Boolean)
                        const formattedSentences: string[] = []
                        
                        for (let i = 0; i < sentences.length; i += 2) {
                          const sentence = sentences[i]
                          const punctuation = sentences[i + 1] || ''
                          if (sentence.trim()) {
                            formattedSentences.push((sentence + punctuation).trim())
                          }
                        }
                        
                        const finalSentences = formattedSentences.length > 0 ? formattedSentences : [translatedText]
                        
                        return (
                          <div 
                            key={`trans-${line.id}`} 
                            className={`p-4 rounded-lg border shadow-sm ${darkMode ? 'border-green-600 bg-gray-700' : 'border-green-200 bg-white'}`}
                          >
                            {showTimestamps && (
                              <div className={`text-xs mb-3 pb-2 border-b ${darkMode ? 'border-green-500 text-gray-400' : 'border-green-100 text-gray-500'}`}>
                                <div className="flex items-center justify-between">
                                  <span>
                                    <span className="font-medium">#{index + 1}</span>
                                    {' • '}
                                    <span>{line.timestamp}</span>
                                  </span>
                                  <span className={`px-2 py-1 rounded text-xs ${darkMode ? 'bg-green-600 text-green-100' : 'bg-green-100 text-green-600'}`}>
                                    {selectedLang?.name}
                                  </span>
                                </div>
                              </div>
                            )}
                            
                            <div className="space-y-3">
                              {finalSentences.map((sentence, sentenceIndex) => (
                                <div 
                                  key={`${line.id}-trans-sentence-${sentenceIndex}`}
                                  className={`leading-relaxed p-3 rounded-md ${darkMode ? 'text-gray-100 bg-green-800' : 'text-gray-900 bg-green-50'}`}
                                  style={{ fontSize: `${fontSize[0]}px` }}
                                >
                                  {sentence}
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      })
                    )}
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