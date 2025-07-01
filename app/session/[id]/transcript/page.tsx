"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Slider } from "@/components/ui/slider"
import { Label } from "@/components/ui/label"
import { ArrowLeft, FileText, Languages, ChevronRight, Settings } from "lucide-react"
import { useParams, useRouter } from "next/navigation"
import { useAuth } from "@/components/auth/AuthProvider"
import { createClient } from "@/lib/supabase"
import { Session, Transcript } from "@/lib/types"
import Link from "next/link"

// 다국어 번역 안내 가이드
const translateGuides: { [key: string]: string } = {
  ko: `<b>브라우저 번역 안내</b><br />Chrome/Edge: 주소창 우측 번역 아이콘 클릭 또는 페이지 우클릭 → \"번역\"<br />Safari: 주소창의 aA 버튼 클릭<br /><span class=\"text-xs text-gray-500\">(실제 번역은 브라우저에서 직접 수행합니다)</span>`,
  en: `<b>Browser Translation Guide</b><br />Chrome/Edge: Click the translate icon in the address bar or right-click → \"Translate\"<br />Safari: Click the aA button in the address bar<br /><span class=\"text-xs text-gray-500\">(Translation is performed by your browser)</span>`,
  ja: `<b>ブラウザ翻訳ガイド</b><br />Chrome/Edge: アドレスバーの翻訳アイコンをクリック、または右クリック→「翻訳」<br />Safari: アドレスバーのaAボタンをクリック<br /><span class=\"text-xs text-gray-500\">(翻訳はブラウザで行われます)</span>`,
  zh: `<b>浏览器翻译指南</b><br />Chrome/Edge：点击地址栏的翻译图标或右键→\"翻译\"<br />Safari：点击地址栏的aA按钮<br /><span class=\"text-xs text-gray-500\">（翻译由您的浏览器执行）</span>`,
  es: `<b>Guía de traducción del navegador</b><br />Chrome/Edge: Haz clic en el icono de traducción en la barra de direcciones o haz clic derecho → \"Traducir\"<br />Safari: Haz clic en el botón aA en la barra de direcciones<br /><span class=\"text-xs text-gray-500\">(La traducción la realiza tu navegador)</span>`,
  fr: `<b>Guide de traduction du navigateur</b><br />Chrome/Edge : Cliquez sur l\'icône de traduction dans la barre d\'adresse ou faites un clic droit → « Traduire »<br />Safari : Cliquez sur le bouton aA dans la barre d\'adresse<br /><span class=\"text-xs text-gray-500\">(La traduction est effectuée par votre navigateur)</span>`,
  de: `<b>Browser-Übersetzungsanleitung</b><br />Chrome/Edge: Klicken Sie auf das Übersetzungssymbol in der Adressleiste oder rechtsklicken Sie → \"Übersetzen\"<br />Safari: Klicken Sie auf die aA-Schaltfläche in der Adressleiste<br /><span class=\"text-xs text-gray-500\">(Die Übersetzung erfolgt durch Ihren Browser)</span>`,
  it: `<b>Guida alla traduzione del browser</b><br />Chrome/Edge: Fai clic sull\'icona di traduzione nella barra degli indirizzi o fai clic con il tasto destro → \"Traduci\"<br />Safari: Fai clic sul pulsante aA nella barra degli indirizzi<br /><span class=\"text-xs text-gray-500\">(La traduzione viene eseguita dal tuo browser)</span>`,
  pt: `<b>Guia de tradução do navegador</b><br />Chrome/Edge: Clique no ícone de tradução na barra de endereços ou clique com o botão direito → \"Traduzir\"<br />Safari: Clique no botão aA na barra de endereços<br /><span class=\"text-xs text-gray-500\">(A tradução é feita pelo seu navegador)</span>`,
  ru: `<b>Руководство по переводу в браузере</b><br />Chrome/Edge: Нажмите на значок перевода в адресной строке или щелкните правой кнопкой мыши → \"Перевести\"<br />Safari: Нажмите кнопку aA в адресной строке<br /><span class=\"text-xs text-gray-500\">(Перевод выполняется вашим браузером)</span>`,
  ar: `<b>دليل الترجمة في المتصفح</b><br />Chrome/Edge: انقر على أيقونة الترجمة في شريط العنوان أو انقر بزر الماوس الأيمن → \"ترجمة\"<br />Safari: انقر على زر aA في شريط العنوان<br /><span class=\"text-xs text-gray-500\">(يتم الترجمة بواسطة متصفحك)</span>`,
}

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
  const [fontSize, setFontSize] = useState([18])
  const [darkMode, setDarkMode] = useState(false)
  const [showTimestamps, setShowTimestamps] = useState(true)
  const [showSettings, setShowSettings] = useState(false)
  const [guideLang, setGuideLang] = useState('en')

  // 시스템/브라우저 언어 감지
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const browserLang = navigator.language || navigator.languages?.[0] || 'en'
      const langCode = browserLang.split('-')[0]
      const supportedLangs = ['ko', 'ja', 'zh', 'hi', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ar', 'en']
      setGuideLang(supportedLangs.includes(langCode) ? langCode : 'en')
    }
  }, [])

  // Remove unused languages array

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

  // 번역 안내 가이드만 띄우고, 번역 API 호출/자동 번역 트리거는 제거
  useEffect(() => {
    // 아무 동작도 하지 않음 (가이드만 표시)
  }, [showTranslation])

  // Remove selectedLang as it's not used anymore

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

        {/* Translation Panel */}
        {showTranslation && (
          <div className="flex-1 lg:ml-2 mt-2 lg:mt-0">
            <div className="h-full p-4">
              <Card className={`h-full ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white'}`}>
                <CardHeader>
                  <CardTitle className={`flex items-center justify-between ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                    <div className="flex items-center space-x-2">
                      <Languages className="h-5 w-5" />
                      <span>Translation</span>
                    </div>
                    <span className="text-sm font-normal">
                      Browser Translation
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="h-[calc(100%-80px)]">
                  {/* 번역 안내 가이드 */}
                  <div className="mb-4 p-4 rounded bg-blue-50 border border-blue-200 text-blue-900 text-sm" dangerouslySetInnerHTML={{ __html: translateGuides[guideLang] || translateGuides['en'] }} />
                  <div id="translation-content" lang="en" className="space-y-4 h-full overflow-y-auto">
                    {transcript.length === 0 ? (
                      <div className={`text-center py-12 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        <Languages className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>No content to translate</p>
                      </div>
                    ) : (
                      transcript.map((line, index) => {
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
                            className={`p-4 rounded-lg border shadow-sm ${darkMode ? 'border-green-600 bg-gray-700' : 'border-green-200 bg-white'}`}
                          >
                            {showTimestamps && (
                              <div className={`text-xs mb-3 pb-2 border-b ${darkMode ? 'border-green-500 text-gray-400' : 'border-green-100 text-green-500'}`}>
                                <div className="flex items-center justify-between">
                                  <span>
                                    <span className="font-medium">#{index + 1}</span>
                                    {' • '}
                                    <span>{new Date(line.created_at).toLocaleTimeString()}</span>
                                  </span>
                                  <span className={`px-2 py-1 rounded text-xs ${darkMode ? 'bg-green-600 text-green-100' : 'bg-green-100 text-green-600'}`}>Translation</span>
                                </div>
                              </div>
                            )}
                            <div className="space-y-3">
                              {finalSentences.map((sentence, sentenceIndex) => (
                                <div 
                                  key={`${line.id}-trans-${sentenceIndex}`}
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
          </div>
        )}
      </div>
    </div>
  )
}

