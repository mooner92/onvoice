"use client"

import { useEffect, useRef, useState } from 'react'
import { Mic, MicOff, Volume2, VolumeX } from 'lucide-react'

interface SpeechToTextProps {
  sessionId: string
  isRecording: boolean
  onTranscriptUpdate: (transcript: string, isPartial: boolean) => void
  onError: (error: string) => void
}

// Extend Window interface for Speech Recognition
declare global {
  interface Window {
    SpeechRecognition: any
    webkitSpeechRecognition: any
  }
}

export function SpeechToText({ 
  sessionId, 
  isRecording, 
  onTranscriptUpdate, 
  onError 
}: SpeechToTextProps) {
  const [isSupported, setIsSupported] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState("")
  const [interimTranscript, setInterimTranscript] = useState("")
  const [isInitialized, setIsInitialized] = useState(false)
  const [language, setLanguage] = useState('en-US')
  const [confidence, setConfidence] = useState(0)
  
  const recognitionRef = useRef<any>(null)
  const cleanupRef = useRef(false)
  const sessionInitializedRef = useRef<string | null>(null)
  const accumulatedTranscriptRef = useRef("")

  // Initialize Speech Recognition
  useEffect(() => {
    // Check if Speech Recognition is supported
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    
    if (!SpeechRecognition) {
      console.log('❌ Speech Recognition not supported in this browser')
      setIsSupported(false)
      onError('Speech Recognition is not supported in this browser. Please use Chrome, Edge, or Safari.')
      return
    }

    console.log('✅ Speech Recognition supported!')
    setIsSupported(true)

    // Initialize Speech Recognition
    const recognition = new SpeechRecognition()
    
    // Enhanced configuration for best accuracy
    recognition.continuous = true              // Keep listening continuously
    recognition.interimResults = true          // Get partial results in real-time
    recognition.maxAlternatives = 1            // Get only the best result
    recognition.lang = language                // Set language
    
    // Advanced settings for better accuracy (Chrome specific)
    if ('webkitSpeechRecognition' in window) {
      recognition.webkitPrefixFree = false     // More accurate processing
    }

    console.log('🎤 Speech Recognition configured:', {
      continuous: recognition.continuous,
      interimResults: recognition.interimResults,
      language: recognition.lang,
      maxAlternatives: recognition.maxAlternatives
    })

    recognitionRef.current = recognition
    
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop()
        } catch (err) {
          console.log('Error stopping recognition during cleanup:', err)
        }
      }
    }
  }, [language, onError])

  // Setup event handlers
  useEffect(() => {
    if (!recognitionRef.current || !isSupported) return

    const recognition = recognitionRef.current

    recognition.onstart = () => {
      console.log('🎤 Speech recognition started')
      setIsListening(true)
    }

    recognition.onend = () => {
      console.log('🛑 Speech recognition ended')
      setIsListening(false)
      
      // Restart if we're still supposed to be recording
      if (isRecording && !cleanupRef.current) {
        console.log('🔄 Restarting speech recognition...')
        setTimeout(() => {
          if (isRecording && !cleanupRef.current) {
            try {
              recognition.start()
            } catch (err) {
              console.log('Error restarting recognition:', err)
            }
          }
        }, 100)
      }
    }

    recognition.onerror = (event: any) => {
      console.error('❌ Speech recognition error:', event.error)
      setIsListening(false)
      
      let errorMessage = 'Speech recognition error: '
      switch (event.error) {
        case 'no-speech':
          errorMessage += 'No speech detected. Please try speaking louder.'
          break
        case 'audio-capture':
          errorMessage += 'Microphone access denied or unavailable.'
          break
        case 'not-allowed':
          errorMessage += 'Microphone permission denied. Please allow microphone access.'
          break
        case 'network':
          errorMessage += 'Network error. Please check your internet connection.'
          break
        case 'language-not-supported':
          errorMessage += `Language ${language} is not supported.`
          break
        default:
          errorMessage += event.error
      }
      
      onError(errorMessage)
    }

    recognition.onresult = async (event: any) => {
      let finalTranscript = ''
      let interimText = ''
      let latestConfidence = 0

      // Process all results
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i]
        const text = result[0].transcript
        latestConfidence = result[0].confidence || 0.9

        if (result.isFinal) {
          finalTranscript += text + ' '
        } else {
          interimText += text
        }
      }

      // Update states
      setConfidence(latestConfidence)
      
      if (interimText) {
        setInterimTranscript(interimText)
        onTranscriptUpdate(interimText, true) // Send partial update
      }

      if (finalTranscript.trim()) {
        const cleanFinal = finalTranscript.trim()
        console.log('📝 Final transcript:', cleanFinal, `(confidence: ${(latestConfidence * 100).toFixed(1)}%)`)
        
        // Add to accumulated transcript
        accumulatedTranscriptRef.current += cleanFinal + ' '
        setTranscript(accumulatedTranscriptRef.current.trim())
        setInterimTranscript('')
        
        // Send final update
        onTranscriptUpdate(cleanFinal, false)
        
        // Save to database via API
        try {
          await fetch('/api/stt-stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'transcript',
              sessionId,
              transcript: cleanFinal,
              isPartial: false
            })
          })
        } catch (err) {
          console.error('Failed to save transcript:', err)
        }
      }
    }

    return () => {
      // Remove event listeners
      recognition.onstart = null
      recognition.onend = null
      recognition.onerror = null
      recognition.onresult = null
    }
  }, [sessionId, isRecording, language, isSupported, onTranscriptUpdate, onError])

  // Handle recording state changes
  useEffect(() => {
    if (!isSupported || !recognitionRef.current) return

    if (sessionId && isRecording && !isInitialized) {
      // Start new session
      if (sessionInitializedRef.current !== sessionId) {
        console.log('🚀 Initializing Web Speech STT for session:', sessionId)
        sessionInitializedRef.current = sessionId
        setIsInitialized(true)
        initializeSession()
      }
    } else if (!isRecording && isInitialized) {
      // Stop session
      console.log('🛑 Stopping Web Speech STT')
      cleanup()
    }

    return () => {
      if (isInitialized) {
        cleanup()
      }
    }
  }, [sessionId, isRecording, isSupported])

  const initializeSession = async () => {
    if (cleanupRef.current) return

    try {
      console.log('🎯 Starting Web Speech STT session for:', sessionId)
      
      // Initialize session in API
      const response = await fetch('/api/stt-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'start',
          sessionId
        })
      })

      if (!response.ok) {
        throw new Error(`Failed to start session: ${response.status}`)
      }

      console.log('✅ Session started successfully')
      
      // Reset accumulated transcript for new session
      accumulatedTranscriptRef.current = ""
      setTranscript("")
      setInterimTranscript("")
      
      // Start speech recognition
      startListening()
      
    } catch (error) {
      console.error('❌ Failed to initialize session:', error)
      onError('Failed to start speech recognition session')
    }
  }

  const startListening = () => {
    if (!recognitionRef.current || isListening || cleanupRef.current) return

    try {
      console.log('🎤 Starting speech recognition...')
      recognitionRef.current.start()
    } catch (err) {
      console.error('Error starting speech recognition:', err)
      onError('Failed to start speech recognition')
    }
  }

  const stopListening = () => {
    if (!recognitionRef.current || !isListening) return

    try {
      console.log('🛑 Stopping speech recognition...')
      recognitionRef.current.stop()
    } catch (err) {
      console.error('Error stopping speech recognition:', err)
    }
  }

  const cleanup = async () => {
    if (cleanupRef.current) return
    
    cleanupRef.current = true
    console.log('🧹 Starting Web Speech STT cleanup for session:', sessionId)
    
    // Stop recognition
    stopListening()

    // End session in API
    if (sessionId && isInitialized && sessionInitializedRef.current === sessionId) {
      try {
        const response = await fetch('/api/stt-stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'end',
            sessionId
          })
        })
        
        if (response.ok) {
          console.log('✅ Session ended successfully')
        }
      } catch (error) {
        console.error('❌ Failed to end session:', error)
      }
    }

    // Reset state
    setIsInitialized(false)
    setIsListening(false)
    setTranscript("")
    setInterimTranscript("")
    setConfidence(0)
    accumulatedTranscriptRef.current = ""
    sessionInitializedRef.current = null
    
    // Small delay before allowing new initialization
    setTimeout(() => {
      cleanupRef.current = false
    }, 500)
  }

  const clearTranscript = () => {
    setTranscript("")
    setInterimTranscript("")
    accumulatedTranscriptRef.current = ""
    console.log('🧹 Transcript cleared')
  }

  const getStatusDisplay = () => {
    if (!isSupported) {
      return {
        color: 'text-red-600',
        bgColor: 'bg-red-500',
        text: '❌ Speech Recognition Not Supported',
        showSpinner: false
      }
    }

    if (isListening) {
      return {
        color: 'text-green-600',
        bgColor: 'bg-green-500',
        text: '🎤 Listening (Web Speech API)',
        showSpinner: true
      }
    }

    if (isInitialized) {
      return {
        color: 'text-yellow-600',
        bgColor: 'bg-yellow-500',
        text: '⏸️ Ready (Web Speech API)',
        showSpinner: false
      }
    }

    return {
      color: 'text-gray-600',
      bgColor: 'bg-gray-500',
      text: '⭕ Web Speech STT Disconnected',
      showSpinner: false
    }
  }

  const statusDisplay = getStatusDisplay()

  return (
    <div className="space-y-4">
      {/* Status Display */}
      <div className="flex items-center space-x-2 text-sm">
        <div className={`w-2 h-2 rounded-full ${statusDisplay.bgColor} ${statusDisplay.showSpinner ? 'animate-pulse' : ''}`} />
        <span className={statusDisplay.color}>
          {statusDisplay.text}
        </span>
        {isListening && confidence > 0 && (
          <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
            {(confidence * 100).toFixed(0)}% confidence
          </span>
        )}
        <span className="text-xs text-gray-400">
          FREE
        </span>
      </div>

      {/* Language Selector */}
      {isSupported && (
        <div className="flex items-center space-x-2">
          <label className="text-sm text-gray-600">Language:</label>
          <select 
            value={language} 
            onChange={(e) => setLanguage(e.target.value)}
            className="text-xs border rounded px-2 py-1"
            disabled={isListening}
          >
            <option value="en-US">English (US)</option>
            <option value="en-GB">English (UK)</option>
            <option value="ko-KR">한국어</option>
            <option value="ja-JP">日本語</option>
            <option value="zh-CN">中文 (简体)</option>
            <option value="zh-TW">中文 (繁體)</option>
            <option value="es-ES">Español</option>
            <option value="fr-FR">Français</option>
            <option value="de-DE">Deutsch</option>
            <option value="it-IT">Italiano</option>
            <option value="pt-BR">Português</option>
            <option value="ru-RU">Русский</option>
            <option value="ar-SA">العربية</option>
            <option value="hi-IN">हिन्दी</option>
          </select>
        </div>
      )}

      {/* Transcript Display */}
      {(transcript || interimTranscript) && (
        <div className="mt-4 p-4 bg-gray-50 border rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-gray-700">Live Transcript</h4>
            <button 
              onClick={clearTranscript}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Clear
            </button>
          </div>
          <div className="text-sm">
            {transcript && (
              <span className="text-gray-900">{transcript}</span>
            )}
            {interimTranscript && (
              <span className="text-gray-500 italic">{interimTranscript}</span>
            )}
          </div>
        </div>
      )}

      {/* Browser Compatibility Info */}
      {!isSupported && (
        <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <h4 className="text-sm font-medium text-yellow-800 mb-2">Browser Compatibility</h4>
          <p className="text-xs text-yellow-700">
            Web Speech API is supported in:
          </p>
          <ul className="text-xs text-yellow-700 mt-1 ml-4 list-disc">
            <li>Chrome (recommended)</li>
            <li>Edge</li>
            <li>Safari (limited support)</li>
          </ul>
        </div>
      )}

      {/* Cost Comparison */}
      <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
        <h4 className="text-sm font-medium text-green-800 mb-2">💰 Cost Comparison</h4>
        <div className="text-xs text-green-700 space-y-1">
          <div className="flex justify-between">
            <span>Web Speech API:</span>
            <span className="font-medium">FREE ✅</span>
          </div>
          <div className="flex justify-between">
            <span>OpenAI Whisper:</span>
            <span>$0.006/minute 💰</span>
          </div>
          <div className="text-xs text-green-600 mt-2">
            💡 Estimated savings: $0.36/hour of transcription
          </div>
        </div>
      </div>
    </div>
  )
} 