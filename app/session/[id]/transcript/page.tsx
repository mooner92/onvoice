"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ArrowLeft, FileText, Languages, X, ChevronRight } from "lucide-react"
import { useParams, useRouter } from "next/navigation"
import { useAuth } from "@/components/auth/AuthProvider"
import { createClient } from "@/lib/supabase"
import Link from "next/link"

export default function SessionTranscriptPage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useAuth()
  const supabase = createClient()
  const sessionId = params.id as string

  const [transcript, setTranscript] = useState<any[]>([])
  const [session, setSession] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showTranslation, setShowTranslation] = useState(false)
  const [selectedLanguage, setSelectedLanguage] = useState("ko")
  const [translatedTexts, setTranslatedTexts] = useState<{[key: string]: string}>({})

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

  // Update translations when language changes
  useEffect(() => {
    if (showTranslation && transcript.length > 0) {
      const newTranslations: {[key: string]: string} = {}
      transcript.forEach(line => {
        newTranslations[line.id] = translateText(line.original_text, selectedLanguage)
      })
      setTranslatedTexts(newTranslations)
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
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b bg-white sticky top-0 z-40">
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
                <h1 className="text-lg font-semibold text-gray-900">
                  {session?.title}
                </h1>
                <p className="text-sm text-gray-600">
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
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-col lg:flex-row h-[calc(100vh-80px)]">
        {/* Main Content - Original Transcript */}
        <div className={`flex-1 transition-all duration-300 ${showTranslation ? 'lg:mr-2 mb-2 lg:mb-0' : ''}`}>
          <div className="h-full p-4">
            <Card className="h-full">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <FileText className="h-5 w-5" />
                  <span>Original Transcript</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="h-[calc(100%-80px)]">
                <div className="space-y-4 h-full overflow-y-auto">
                  {transcript.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                      <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No transcript available for this session</p>
                    </div>
                  ) : (
                    transcript.map((line, index) => (
                      <div 
                        key={line.id} 
                        className="p-4 rounded-lg border-l-4 border-blue-500 bg-blue-50"
                      >
                        <div className="text-xs mb-2 text-gray-500">
                          <span className="font-medium">#{index + 1}</span>
                          {' • '}
                          <span>{new Date(line.created_at).toLocaleTimeString()}</span>
                          {' • '}
                          <span>{session?.host_name}</span>
                        </div>
                        
                        <div className="leading-relaxed text-gray-900">
                          {line.original_text}
                        </div>
                      </div>
                    ))
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
              <Card className="h-full border-l-4 border-green-500">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center space-x-2">
                      <Languages className="h-5 w-5 text-green-600" />
                      <span>Translation</span>
                      {selectedLang && (
                        <span className="text-sm font-normal text-gray-500">
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
                      <div className="text-center py-12 text-gray-500">
                        <Languages className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>No content to translate</p>
                      </div>
                    ) : (
                      transcript.map((line, index) => (
                        <div 
                          key={`trans-${line.id}`} 
                          className="p-4 rounded-lg border-l-4 border-green-500 bg-green-50"
                        >
                          <div className="text-xs mb-2 text-gray-500">
                            <span className="font-medium">#{index + 1}</span>
                            {' • '}
                            <span>{new Date(line.created_at).toLocaleTimeString()}</span>
                          </div>
                          
                          <div className="leading-relaxed text-gray-900">
                            {translatedTexts[line.id] || translateText(line.original_text, selectedLanguage)}
                          </div>
                        </div>
                      ))
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
