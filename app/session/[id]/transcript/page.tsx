"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Label } from "@/components/ui/label"
import { ArrowLeft, FileText, Languages, X, ChevronRight, Settings, Loader2 } from "lucide-react"
import { useParams, useRouter } from "next/navigation"
import { useAuth } from "@/components/auth/AuthProvider"
import { createClient } from "@/lib/supabase"
import { Session, Transcript } from "@/lib/types"
import Link from "next/link"

export default function SessionTranscriptPage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useAuth()
  const supabase = createClient()
  const sessionId = params.id as string

  const [transcript, setTranscript] = useState<Transcript[]>([])
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showTranslation, setShowTranslation] = useState(false)
  const [selectedLanguage, setSelectedLanguage] = useState("ko")
  const [translatedTexts, setTranslatedTexts] = useState<{[key: string]: string}>({})
  const [fontSize, setFontSize] = useState([18])
  const [darkMode, setDarkMode] = useState(false)
  const [showTimestamps, setShowTimestamps] = useState(true)
  const [showSettings, setShowSettings] = useState(false)
  const [isTranslating, setIsTranslating] = useState(false)

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

        // Load all transcripts for this session
        const { data: transcripts, error: transcriptError } = await supabase
          .from('transcripts')
          .select('*')
          .eq('session_id', sessionId)
          .order('created_at', { ascending: true })

        if (transcriptError) throw transcriptError
        setTranscript(transcripts || [])

      } catch (error) {
        console.error('Error loading session transcript:', error)
        setError(`Failed to load transcript: ${error instanceof Error ? error.message : 'Unknown error'}`)
      } finally {
        setLoading(false)
      }
    }

    loadSessionTranscript()
  }, [user, sessionId, supabase])

  // Mock translation function
  const translateText = (text: string, targetLang: string): string => {
    if (targetLang === 'en') return text
    
    const mockTranslations: { [key: string]: string } = {
      'ko': `[한국어] ${text}`,
      'ja': `[日本語] ${text}`,
      'zh': `[中文] ${text}`,
      'es': `[Español] ${text}`,
      'fr': `[Français] ${text}`,
      'de': `[Deutsch] ${text}`,
      'it': `[Italiano] ${text}`,
      'pt': `[Português] ${text}`,
      'ru': `[Русский] ${text}`,
      'ar': `[العربية] ${text}`,
      'hi': `[हिन्दी] ${text}`,
    }
    
    return mockTranslations[targetLang] || text
  }

  // Translation function using API
  const translateTextAPI = async (text: string, targetLang: string): Promise<string> => {
    if (targetLang === 'en') return text
    
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
          sourceLanguage: 'auto'
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

  // Mock translation for fallback
  const getMockTranslation = (text: string, targetLang: string): string => {
    const mockTranslations: { [key: string]: string } = {
      'ko': `[한국어] ${text}`,
      'ja': `[日本語] ${text}`,
      'zh': `[中文] ${text}`,
      'es': `[Español] ${text}`,
      'fr': `[Français] ${text}`,
      'de': `[Deutsch] ${text}`,
      'it': `[Italiano] ${text}`,
      'pt': `[Português] ${text}`,
      'ru': `[Русский] ${text}`,
      'ar': `[العربية] ${text}`,
      'hi': `[हिन्दी] ${text}`,
    }
    
    return mockTranslations[targetLang] || text
  }

  // Update translations when language changes
  useEffect(() => {
    if (showTranslation && transcript.length > 0) {
      const translateAll = async () => {
        const newTranslations: {[key: string]: string} = {}
        
        for (const line of transcript) {
          try {
            const translated = await translateTextAPI(line.original_text, selectedLanguage)
            newTranslations[line.id] = translated
          } catch (error) {
            console.error('Translation error for line:', line.id, error)
            newTranslations[line.id] = translateText(line.original_text, selectedLanguage)
          }
        }
        
        setTranslatedTexts(newTranslations)
      }
      
      translateAll()
    }
  }, [selectedLanguage, transcript, showTranslation])

  const selectedLang = languages.find(lang => lang.code === selectedLanguage)

  if (!user) {
    return <div>Loading...</div>
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card>
          <CardContent className="p-8">
            <div className="flex flex-col items-center space-y-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="text-gray-600">Loading transcript...</p>
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
              <FileText className="h-8 w-8 text-red-600" />
              <p className="text-gray-900 font-medium">Failed to Load Transcript</p>
              <p className="text-gray-600 text-sm text-center">{error}</p>
              <Button onClick={() => router.push('/my-sessions')} variant="outline">
                Back to My Sessions
              </Button>
            </div>
          </CardContent>
        </Card>
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
              <Button variant="ghost" size="sm" asChild>
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
                  Session Transcript
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
            <div className="grid md:grid-cols-3 gap-4">
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

              <div className="space-y-2">
                <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'} p-2 rounded ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
                  <div className="space-y-1">
                    <div>📝 <strong>Completed Session</strong></div>
                    <div>• {transcript.length} transcript lines</div>
                    <div>• Translation: {showTranslation ? 'Enabled' : 'Disabled'}</div>
                    {isTranslating && (
                      <div className="flex items-center space-x-1">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        <span>Translating...</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col lg:flex-row h-[calc(100vh-80px)]">
        {/* Main Content - Original Transcript */}
        <div className={`flex-1 transition-all duration-300 ${showTranslation ? 'lg:mr-2 mb-2 lg:mb-0' : ''}`}>
          <div className="h-full p-4">
            <Card className={`h-full ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white'}`}>
              <CardHeader>
                <CardTitle className={`flex items-center space-x-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  <FileText className="h-5 w-5" />
                  <span>Original Transcript</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="h-[calc(100%-80px)]">
                <div className="space-y-4 h-full overflow-y-auto">
                  {transcript.length === 0 ? (
                    <div className={`text-center py-12 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No transcript available for this session</p>
                    </div>
                  ) : (
                    transcript.map((line, index) => {
                      // Split text into sentences for better readability
                      const sentences = line.original_text.split(/([.!?]+)/).filter(Boolean)
                      const formattedSentences: string[] = []
                      
                      for (let i = 0; i < sentences.length; i += 2) {
                        const sentence = sentences[i]
                        const punctuation = sentences[i + 1] || ''
                        if (sentence.trim()) {
                          formattedSentences.push((sentence + punctuation).trim())
                        }
                      }
                      
                      const finalSentences = formattedSentences.length > 0 ? formattedSentences : [line.original_text]
                      
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
                                  <span>{new Date(line.created_at).toLocaleTimeString()}</span>
                                </span>
                                <span className={`px-2 py-1 rounded text-xs ${darkMode ? 'bg-blue-600 text-blue-100' : 'bg-blue-100 text-blue-600'}`}>
                                  {session?.host_name}
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
          showTranslation 
            ? 'lg:w-1/2 w-full opacity-100' 
            : 'w-0 opacity-0 overflow-hidden lg:block hidden'
        }`}>
          {showTranslation && (
            <div className="h-full p-4 pl-2">
              <Card className={`h-full border-l-4 border-green-500 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white'}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className={`flex items-center space-x-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                      <Languages className="h-5 w-5 text-green-600" />
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
                      onClick={() => setShowTranslation(false)}
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
                        <Languages className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>No content to translate</p>
                      </div>
                    ) : (
                      transcript.map((line, index) => {
                        const translatedText = translatedTexts[line.id] || translateText(line.original_text, selectedLanguage)
                        
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
                                      <span>{new Date(line.created_at).toLocaleTimeString()}</span>
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
