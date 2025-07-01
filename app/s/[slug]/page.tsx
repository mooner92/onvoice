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
  X
} from "lucide-react"
import { useParams, useRouter } from "next/navigation"
import { useAuth } from "@/components/auth/AuthProvider"
import { LoginButton } from "@/components/auth/LoginButton"
import { createClient } from "@/lib/supabase"
import { Session } from "@/lib/types"

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

  // Join session as participant (optional for logged-in users)
  const joinSession = async () => {
    if (!sessionId || !user) return

    try {
      // Check if already joined
      const { data: existing } = await supabase
        .from('session_participants')
        .select('id')
        .eq('session_id', sessionId)
        .eq('user_id', user.id)
        .single()

      if (existing) return // Already joined

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

      console.log('✅ User joined session as participant')
    } catch (error) {
      console.error('Error joining session:', error)
    }
  }

  // Removed handleTranscriptUpdate - now handled directly in subscription

  // Subscribe to real-time transcript updates (no login required)
  useEffect(() => {
    if (!sessionId) return

    console.log('🔔 Subscribing to real-time transcripts for session:', sessionId)

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
          console.log('📝 New transcript received:', payload.new)
          const newTranscript = payload.new as { original_text: string, created_at: string }
          
          // Add the new transcript to the UI
          const now = new Date(newTranscript.created_at)
          const timestamp = now.toLocaleTimeString()
          const newId = `${now.getTime()}-${Math.random()}`
          
          const newLine: TranscriptLine = {
            id: newId,
            timestamp,
            original: newTranscript.original_text,
            translated: translationEnabled ? getMockTranslation(newTranscript.original_text, selectedLanguage) : newTranscript.original_text,
            speaker: session?.host_name || 'Speaker'
          }
          
          setTranscript(prev => [...prev, newLine])
          
          // Trigger translation if enabled
          if (translationEnabled && selectedLanguage !== 'en') {
            translateLine(newLine, selectedLanguage)
          }
        }
      )
      .subscribe((status) => {
        console.log('📡 Subscription status:', status)
      })

    return () => {
      console.log('🔌 Unsubscribing from transcripts')
      supabase.removeChannel(channel)
    }
  }, [sessionId, supabase, translationEnabled, selectedLanguage, session?.host_name])

  // Auto-join session for logged-in users (optional enhancement)
  useEffect(() => {
    if (sessionId && user && session) {
      // Silently join to track participant count
      joinSession()
    }
  }, [sessionId, user, session])

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

  // Debounced translation cache
  const translationCache = useRef<Map<string, string>>(new Map())
  const pendingTranslations = useRef<Map<string, Promise<string>>>(new Map())

  // Translation with browser API fallback for instant translation
  const translateWithBrowserAPI = async (text: string, targetLang: string): Promise<string> => {
    // Try browser built-in translation first (Chrome/Edge)
    if ('translation' in navigator) {
      try {
        // @ts-expect-error - experimental API
        const translator = await navigator.translation.createTranslator({
          sourceLanguage: 'auto',
          targetLanguage: targetLang
        });
        
        const result = await translator.translate(text);
        return result;
      } catch {
        console.log('Browser translation not available, using API');
      }
    }
    
    // Fallback to our API
    return translateText(text, targetLang);
  };

  const translateText = async (text: string, targetLang: string): Promise<string> => {
    try {
      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          targetLanguage: targetLang,
        }),
      });

      if (!response.ok) {
        throw new Error('Translation failed');
      }

      const data = await response.json();
      return data.translatedText;
    } catch (error) {
      console.error('Translation error:', error);
      return `[Translation failed] ${text}`;
    }
  };

  // Faster translation with instant mock + real translation
  const translateLine = async (line: TranscriptLine, targetLang: string) => {
    const cacheKey = `${line.id}-${targetLang}`;
    
    // Check cache first
    if (translationCache.current.has(cacheKey)) {
      return translationCache.current.get(cacheKey);
    }
    
    // Check if already pending
    if (pendingTranslations.current.has(cacheKey)) {
      return pendingTranslations.current.get(cacheKey);
    }
    
    // Show instant mock translation
    const mockResult = getMockTranslation(line.original, targetLang);
    
    // Set mock in cache temporarily
    translationCache.current.set(cacheKey, mockResult);
    
    // Start real translation in background
    const translationPromise = translateWithBrowserAPI(line.original, targetLang)
      .then(result => {
        // Replace mock with real translation
        translationCache.current.set(cacheKey, result);
        setTranscript(prev => prev.map(t => 
          t.id === line.id ? { ...t, translated: result } : t
        ));
        return result;
      })
      .catch(error => {
        console.error('Translation failed:', error);
        const fallback = `[Translation Error] ${line.original}`;
        translationCache.current.set(cacheKey, fallback);
        return fallback;
      })
      .finally(() => {
        pendingTranslations.current.delete(cacheKey);
      });
    
    pendingTranslations.current.set(cacheKey, translationPromise);
    
    return mockResult;
  };

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
        await translateLine(line, selectedLanguage)
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }
    
    if (transcript.length > 0) {
      translateBatch()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLanguage, translationEnabled])

  // Clear cache when translation is disabled
  useEffect(() => {
    if (!translationEnabled) {
      translationCache.current.clear()
      pendingTranslations.current.clear()
    }
  }, [translationEnabled])

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

  const selectedLang = languages.find((lang) => lang.code === selectedLanguage)

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
            {type === 'original' ? 'Waiting for the speaker to start...' : 'No content to translate'}
          </h3>
          <p className="text-sm">
            {type === 'original' ? 'Live transcription will appear here' : 'Original transcript will be translated here'}
          </p>
          {type === 'original' && (
            <div className="mt-4 flex items-center justify-center space-x-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-xs">Session is active</span>
            </div>
          )}
        </div>
      )
    }

    return transcript.map((line, index) => {
      const text = type === 'original' ? line.original : line.translated
      
      // Split text into sentences for better readability
      const sentences = text.split(/([.!?]+)/).filter(Boolean)
      const formattedSentences: string[] = []
      
      for (let i = 0; i < sentences.length; i += 2) {
        const sentence = sentences[i]
        const punctuation = sentences[i + 1] || ''
        if (sentence.trim()) {
          formattedSentences.push((sentence + punctuation).trim())
        }
      }
      
      const finalSentences = formattedSentences.length > 0 ? formattedSentences : [text]
      
      return (
        <div 
          key={`${type}-${line.id}`} 
          className={`p-4 rounded-lg border shadow-sm ${
            type === 'original'
              ? (darkMode ? 'border-blue-600 bg-gray-700' : 'border-blue-200 bg-white')
              : (darkMode ? 'border-green-600 bg-gray-700' : 'border-green-200 bg-white')
          }`}
        >
          {showTimestamps && (
            <div className={`text-xs mb-3 pb-2 border-b ${
              type === 'original'
                ? (darkMode ? 'border-blue-500 text-gray-400' : 'border-blue-100 text-gray-500')
                : (darkMode ? 'border-green-500 text-gray-400' : 'border-green-100 text-gray-500')
            }`}>
              <div className="flex items-center justify-between">
                <span>
                  <span className="font-medium">#{index + 1}</span>
                  {' • '}
                  <span>{line.timestamp}</span>
                </span>
                <span className={`px-2 py-1 rounded text-xs ${
                  type === 'original'
                    ? (darkMode ? 'bg-blue-600 text-blue-100' : 'bg-blue-100 text-blue-600')
                    : (darkMode ? 'bg-green-600 text-green-100' : 'bg-green-100 text-green-600')
                }`}>
                  {type === 'original' ? line.speaker : selectedLang?.name}
                </span>
              </div>
            </div>
          )}
          
          <div className="space-y-3">
            {finalSentences.map((sentence, sentenceIndex) => (
              <div 
                key={`${line.id}-${type}-sentence-${sentenceIndex}`}
                className={`leading-relaxed p-3 rounded-md ${
                  type === 'original'
                    ? (darkMode ? 'text-gray-100 bg-blue-800' : 'text-gray-900 bg-blue-50')
                    : (darkMode ? 'text-gray-100 bg-green-800' : 'text-gray-900 bg-green-50')
                }`}
                style={{ fontSize: `${fontSize[0]}px` }}
              >
                {sentence}
              </div>
            ))}
          </div>
        </div>
      )
    })
  }

  // Show loading or error state
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

  if (error || !session) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card>
          <CardContent className="p-8">
            <div className="flex flex-col items-center space-y-4">
              <AlertCircle className="h-8 w-8 text-red-600" />
              <p className="text-gray-900 font-medium">Session Not Found</p>
              <p className="text-gray-600 text-sm text-center">{error || 'The session may have ended or the link may be invalid.'}</p>
              <Button onClick={() => router.push('/')} variant="outline">
                Go Home
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Show main content immediately (no login/join required)
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
              📝 Original
            </button>
            <button
              onClick={() => setTranslationEnabled(true)}
              className={`flex-1 py-3 px-4 text-sm font-medium text-center border-b-2 transition-colors ${
                translationEnabled
                  ? `border-green-500 ${darkMode ? 'text-green-400 bg-green-950/30' : 'text-green-600 bg-green-50'}`
                  : `border-transparent ${darkMode ? 'text-gray-400 hover:text-gray-300 hover:bg-gray-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`
              }`}
            >
              🌍 Translation
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
                    <span>Original Transcript</span>
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
                        <span>Translation</span>
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
    </div>
  )
} 