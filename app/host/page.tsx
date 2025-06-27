"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Mic, MicOff, Users, Settings, QrCode, Copy, Check, Volume2, VolumeX } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useAuth } from "@/components/auth/AuthProvider"
import { createClient } from "@/lib/supabase"

interface TranscriptLine {
  id: string
  timestamp: string
  text: string
  confidence: number
}

export default function HostDashboard() {
  const { user } = useAuth()
  const router = useRouter()
  const supabase = createClient()
  
  const [sessionTitle, setSessionTitle] = useState("")
  const [sessionDescription, setSessionDescription] = useState("")
  const [primaryLanguage, setPrimaryLanguage] = useState("en")
  const [isRecording, setIsRecording] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [transcript, setTranscript] = useState<TranscriptLine[]>([])
  const [isMuted, setIsMuted] = useState(false)
  const [participantCount, setParticipantCount] = useState(0)
  const [sessionDuration, setSessionDuration] = useState(0)
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recognitionRef = useRef<any>(null)
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null)

  const languages = [
    { code: "en", name: "English" },
    { code: "es", name: "Spanish" },
    { code: "fr", name: "French" },
    { code: "de", name: "German" },
    { code: "it", name: "Italian" },
    { code: "pt", name: "Portuguese" },
    { code: "ru", name: "Russian" },
    { code: "ja", name: "Japanese" },
    { code: "ko", name: "Korean" },
    { code: "zh", name: "Chinese" },
  ]

  // Check if user is authenticated
  useEffect(() => {
    if (!user) {
      router.push('/')
    }
  }, [user, router])

  // Initialize speech recognition
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      recognitionRef.current = new SpeechRecognition()
      recognitionRef.current.continuous = true
      recognitionRef.current.interimResults = true
      recognitionRef.current.lang = primaryLanguage

      recognitionRef.current.onresult = (event: any) => {
        let finalTranscript = ''
        let interimTranscript = ''

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript
          if (event.results[i].isFinal) {
            finalTranscript += transcript
          } else {
            interimTranscript += transcript
          }
        }

        if (finalTranscript) {
          const newLine: TranscriptLine = {
            id: Date.now().toString(),
            timestamp: new Date().toLocaleTimeString(),
            text: finalTranscript,
            confidence: 0.9
          }
          setTranscript(prev => [...prev, newLine])
          
          // Save to database
          saveTranscriptToDatabase(newLine)
        }
      }

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error)
      }
    }
  }, [primaryLanguage])

  const saveTranscriptToDatabase = async (line: TranscriptLine) => {
    if (!sessionId) return

    try {
      const { error } = await supabase
        .from('transcripts')
        .insert({
          session_id: sessionId,
          timestamp: line.timestamp,
          original_text: line.text,
          created_at: new Date().toISOString()
        })

      if (error) {
        console.error('Error saving transcript:', error)
      }
    } catch (error) {
      console.error('Error saving transcript:', error)
    }
  }

  const handleStartSession = async () => {
    if (!user) return

    try {
      // Create session in database
      const { data: session, error } = await supabase
        .from('sessions')
        .insert({
          title: sessionTitle,
          description: sessionDescription,
          host_id: user.id,
          host_name: user.user_metadata?.full_name || user.email,
          primary_language: primaryLanguage,
          status: 'active',
          created_at: new Date().toISOString()
        })
        .select()
        .single()

      if (error) throw error

      const newSessionId = session.id
      setSessionId(newSessionId)
      setIsRecording(true)

      // Start speech recognition
      if (recognitionRef.current) {
        recognitionRef.current.start()
      }

      // Start duration timer
      durationIntervalRef.current = setInterval(() => {
        setSessionDuration(prev => prev + 1)
      }, 1000)

      // Start participant count simulation
      setInterval(() => {
        setParticipantCount(prev => Math.max(0, prev + Math.floor(Math.random() * 3) - 1))
      }, 5000)

    } catch (error) {
      console.error('Error starting session:', error)
    }
  }

  const handleStopSession = async () => {
    if (!sessionId) return

    try {
      // Stop speech recognition
      if (recognitionRef.current) {
        recognitionRef.current.stop()
      }

      // Stop duration timer
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current)
      }

      // Update session status in database
      await supabase
        .from('sessions')
        .update({
          status: 'ended',
          ended_at: new Date().toISOString()
        })
        .eq('id', sessionId)

      setIsRecording(false)
      setSessionId(null)
      setSessionDuration(0)
      setParticipantCount(0)
    } catch (error) {
      console.error('Error stopping session:', error)
    }
  }

  const copySessionUrl = () => {
    if (sessionId) {
      const url = `${window.location.origin}/session/${sessionId}`
      navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const joinAsAttendee = () => {
    if (sessionId) {
      router.push(`/session/${sessionId}`)
    }
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  if (!user) {
    return <div>Loading...</div>
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
                  Configure your lecture session. Attendees will select their own translation preferences.
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
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description (Optional)</Label>
                  <Textarea
                    id="description"
                    placeholder="Brief description of the lecture content..."
                    value={sessionDescription}
                    onChange={(e) => setSessionDescription(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Primary Language (Speech Language)</Label>
                  <Select value={primaryLanguage} onValueChange={setPrimaryLanguage}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {languages.map((lang) => (
                        <SelectItem key={lang.code} value={lang.code}>
                          {lang.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-gray-500">
                    Select the language you'll be speaking in. Attendees will choose their own translation languages.
                  </p>
                </div>

                <div className="flex justify-center pt-4">
                  {!isRecording ? (
                    <Button size="lg" onClick={handleStartSession} disabled={!sessionTitle.trim()} className="px-8">
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
                </CardHeader>
                <CardContent>
                  <div className="max-h-64 overflow-y-auto space-y-2">
                    {transcript.map((line) => (
                      <div key={line.id} className="p-3 bg-gray-50 rounded-lg">
                        <div className="text-xs text-gray-500 mb-1">{line.timestamp}</div>
                        <div className="text-gray-900">{line.text}</div>
                      </div>
                    ))}
                    {transcript.length === 0 && (
                      <div className="text-center text-gray-500 py-8">
                        Start speaking to see live transcript...
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
                        <span className="font-medium">{formatDuration(sessionDuration)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* QR Code */}
            {isRecording && sessionId && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <QrCode className="h-5 w-5" />
                    <span>Session Access</span>
                  </CardTitle>
                  <CardDescription>Display this QR code for attendees to join</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="bg-white p-4 rounded-lg border-2 border-dashed border-gray-300 text-center">
                    <div className="w-32 h-32 bg-gray-100 rounded-lg mx-auto mb-2 flex items-center justify-center">
                      <QrCode className="h-16 w-16 text-gray-400" />
                    </div>
                    <p className="text-sm text-gray-500">QR Code Placeholder</p>
                    <p className="text-xs text-gray-400 mt-1">Scan to join session</p>
                  </div>

                  <div className="space-y-2">
                    <Button onClick={copySessionUrl} className="w-full" variant="outline">
                      {copied ? (
                        <>
                          <Check className="mr-2 h-4 w-4" />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="mr-2 h-4 w-4" />
                          Copy Session URL
                        </>
                      )}
                    </Button>
                    <Button onClick={joinAsAttendee} className="w-full" variant="secondary">
                      Join as Attendee
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
