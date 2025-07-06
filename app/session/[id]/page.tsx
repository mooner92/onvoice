"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Label } from "@/components/ui/label"
import { Bookmark, Menu, Mic, Users, Clock } from "lucide-react"
import { useParams, useRouter } from "next/navigation"
import { useAuth } from "@/components/auth/AuthProvider"
import { createClient } from "@/lib/supabase"
import { Session, Transcript } from "@/lib/types"
import type { TranscriptLine, TranslationResponse } from "@/lib/types"
//import Chatbot from '@/components/Chatbot'
import ChatbotWidget from '@/components/ChatbotWidget'

export default function SessionPage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useAuth()
  const supabase = createClient()
  const sessionId = params.id as string

  const [selectedLanguage, setSelectedLanguage] = useState("ko")
  const [fontSize, setFontSize] = useState([18])
  const [darkMode, setDarkMode] = useState(false)
  const [autoScroll, setAutoScroll] = useState(true)
  const [showTimestamps, setShowTimestamps] = useState(false)
  const [transcript, setTranscript] = useState<TranscriptLine[]>([])
  const [showAppPrompt, setShowAppPrompt] = useState(false)
  const [activeTab, setActiveTab] = useState("original")
  const [showSettings, setShowSettings] = useState(false)
  const [isSaved, setIsSaved] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const [participantCount, setParticipantCount] = useState(0)

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
  ]

  // Check authentication
  useEffect(() => {
    if (!user) {
      router.push('/')
      return
    }
  }, [user, router])

  // Load session data
  useEffect(() => {
    const loadSession = async () => {
      try {
        const { data: sessionData, error } = await supabase
          .from('sessions')
          .select('*')
          .eq('id', sessionId)
          .single()

        if (error) throw error
        setSession(sessionData)

        // Join session as participant
        await supabase
          .from('session_participants')
          .insert({
            session_id: sessionId,
            user_id: user?.id,
            user_name: user?.user_metadata?.full_name || user?.email,
            role: 'audience',
            joined_at: new Date().toISOString()
          })

      } catch (error) {
        console.error('Error loading session:', error)
        router.push('/')
      }
    }

    if (user && sessionId) {
      loadSession()
    }
  }, [user, sessionId, supabase, router])

  // 개선된 번역 함수
  const translateText = useCallback(async (text: string, targetLang: string): Promise<string> => {
    try {
      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          targetLanguage: targetLang,
          sessionId: sessionId // 세션 ID 포함
        }),
      })

      if (!response.ok) {
        throw new Error('Translation failed')
      }

      const result: TranslationResponse = await response.json()
      return result.translatedText
    } catch (error) {
      console.error('Translation error:', error)
      return `[번역 실패] ${text}`
    }
  }, [sessionId])

  // Subscribe to real-time transcript updates
  useEffect(() => {
    if (!sessionId) return

    const channel = supabase
      .channel(`transcript-${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'transcripts',
          filter: `session_id=eq.${sessionId}`
        },
        async (payload) => {
          const newTranscript = payload.new as Transcript
          
          // 번역된 텍스트 가져오기 (개선된 캐싱 시스템 활용)
          const translatedText = await translateText(newTranscript.original_text, selectedLanguage)
          
          const newLine: TranscriptLine = {
            id: newTranscript.id,
            timestamp: newTranscript.timestamp,
            original: newTranscript.original_text,
            translated: translatedText,
            speaker: session?.host_name,
            isTranslating: false
          }

          setTranscript(prev => [...prev, newLine])
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [sessionId, selectedLanguage, session?.host_name, supabase, translateText])

  // Update participant count function
  const updateParticipantCount = useCallback(async () => {
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

  // Subscribe to participant count updates
  useEffect(() => {
    if (!sessionId) return

    const channel = supabase
      .channel(`participants-${sessionId}`)
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

    return () => {
      supabase.removeChannel(channel)
    }
  }, [sessionId, supabase, updateParticipantCount])

  // Update translations when language changes
  useEffect(() => {
    const updateTranslations = async () => {
      const updatedTranscript = await Promise.all(
        transcript.map(async (line) => ({
          ...line,
          translated: await translateText(line.original, selectedLanguage)
        }))
      )
      setTranscript(updatedTranscript)
    }

    if (transcript.length > 0) {
      updateTranslations()
    }
  }, [selectedLanguage, translateText])

  const selectedLang = languages.find((lang) => lang.code === selectedLanguage)

  const saveSession = async () => {
    if (!user || !sessionId) return

    try {
      await supabase
        .from('user_sessions')
        .insert({
          user_id: user.id,
          session_id: sessionId,
          role: 'audience',
          saved_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
          is_premium: false
        })

    setIsSaved(true)
    } catch (error) {
      console.error('Error saving session:', error)
    }
  }

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

  if (!user) {
    return <div>Loading...</div>
  }

  return (
    <div className={`min-h-screen ${darkMode ? 'dark bg-gray-900' : 'bg-gray-50'}`}>
      {/* Mobile Header */}
      <header className={`border-b ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white'} sticky top-0 z-40`}>
        <div className="px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className={`w-3 h-3 rounded-full ${darkMode ? 'bg-green-500' : 'bg-red-500'} animate-pulse`}></div>
              <div>
                <span className={`text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  {session?.title || `Session ${sessionId}`}
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
              <Button
                variant="ghost"
                size="sm"
                onClick={saveSession}
                className={isSaved ? 'text-blue-600' : ''}
              >
                <Bookmark className={`h-4 w-4 ${isSaved ? 'fill-current' : ''}`} />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setShowSettings(!showSettings)}>
                <Menu className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Settings Panel (Mobile Collapsible) */}
      {showSettings && (
        <div className={`border-b ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white'} p-4`}>
          <div className="space-y-4">
            {/* Language Selection */}
            <div className="space-y-2">
              <Label className={`text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                My Language
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
                  id="autoScroll"
                  checked={autoScroll}
                  onChange={(e) => setAutoScroll(e.target.checked)}
                  className="rounded"
                />
                <Label htmlFor="autoScroll" className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Auto Scroll
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

            {/* 번역 시스템 정보 */}
            <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'} p-2 rounded ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
              <div className="space-y-1">
                <div>🚀 <strong>Enhanced translation system active</strong></div>
                <div>• Smart caching for faster translations</div>
                <div>• Background processing for better performance</div>
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
              <p className="text-sm mt-2">The transcript will appear here in real-time</p>
                </div>
              ) : (
            getTabContent(activeTab as 'original' | 'translated')
          )}
                </div>
      </div>

      {/* App Installation Prompt */}
      {showAppPrompt && (
        <div className={`fixed bottom-0 left-0 right-0 p-4 ${darkMode ? 'bg-gray-800' : 'bg-white'} border-t ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
          <div className="text-center">
            <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'} mb-2`}>
              Get the full experience with our mobile app
            </p>
            <div className="flex space-x-2">
              <Button size="sm" className="flex-1">
                Download App
                </Button>
              <Button size="sm" variant="outline" onClick={() => setShowAppPrompt(false)}>
                Dismiss
                </Button>
              </div>
          </div>
        </div>
      )}

      {/* Chatbot for live session */}
      <ChatbotWidget transcript={transcript.map(line => line.original).join('\n')} sessionId={sessionId} />
    </div>
  )
}
