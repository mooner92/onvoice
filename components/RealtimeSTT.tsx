"use client"

import { useEffect, useRef, useState } from 'react'

interface RealtimeSTTProps {
  sessionId: string
  isRecording: boolean
  onTranscriptUpdate: (transcript: string, isPartial: boolean) => void
  onError: (error: string) => void
}

export function RealtimeSTT({ 
  sessionId, 
  isRecording, 
  onTranscriptUpdate, 
  onError 
}: RealtimeSTTProps) {
  const [deepgramSocket, setDeepgramSocket] = useState<WebSocket | null>(null)
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [isInitialized, setIsInitialized] = useState(false)
  const [isMockMode, setIsMockMode] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'failed'>('disconnected')
  const cleanupRef = useRef(false)
  const mockIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const initializationRef = useRef(false) // Prevent duplicate initialization
  const sessionInitializedRef = useRef<string | null>(null) // Track which session was initialized

  // Initialize session when component mounts and recording starts
  useEffect(() => {
    if (sessionId && isRecording && !isInitialized && !initializationRef.current) {
      // Check if this is a different session
      if (sessionInitializedRef.current !== sessionId) {
        console.log('Initializing RealtimeSTT for session:', sessionId)
        initializationRef.current = true
        sessionInitializedRef.current = sessionId
        setIsInitialized(true)
        initializeSession()
      }
    }
    
    // Cleanup when recording stops or session changes
    if ((!isRecording && isInitialized) || (sessionInitializedRef.current && sessionInitializedRef.current !== sessionId)) {
      console.log('Recording stopped or session changed, cleaning up RealtimeSTT')
      cleanup()
    }
    
    return () => {
      if (isInitialized) {
        cleanup()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, isRecording, isInitialized])

  const initializeSession = async () => {
    if (cleanupRef.current) {
      console.log('Cleanup in progress, skipping initialization')
      return
    }

    try {
      console.log('Starting STT session for:', sessionId)
      
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

      console.log('Session started successfully, setting up audio')
      
      // Setup audio connection
      await setupDeepgram()
      
    } catch (error) {
      console.error('Failed to initialize session:', error)
      onError('Failed to start real-time transcription')
    } finally {
      // Reset initialization flag after setup
      setTimeout(() => {
        initializationRef.current = false
      }, 1000)
    }
  }

  const setupDeepgram = async () => {
    if (cleanupRef.current) return

    try {
      setConnectionStatus('connecting')
      
      // Check if Deepgram API key is available
      const deepgramApiKey = process.env.NEXT_PUBLIC_DEEPGRAM_API_KEY
      
      console.log('🔍 CRITICAL DEBUG - Environment check:', {
        hasApiKey: !!deepgramApiKey,
        keyLength: deepgramApiKey?.length,
        keyPrefix: deepgramApiKey?.substring(0, 12),
        keySuffix: deepgramApiKey?.substring(-8),
        fullKey: deepgramApiKey, // Show full key in development for debugging
        allEnvVars: Object.keys(process.env).filter(key => key.includes('DEEPGRAM')),
        processEnv: process.env.NEXT_PUBLIC_DEEPGRAM_API_KEY,
        nodeEnv: process.env.NODE_ENV
      })
      
      // More lenient API key validation - Deepgram keys can vary in length
      if (!deepgramApiKey || deepgramApiKey === 'demo' || deepgramApiKey.trim().length < 10) {
        console.log('❌ Deepgram API key not properly configured, using mock mode')
        setConnectionStatus('failed')
        setIsMockMode(true)
        await setupMockSTT()
        return
      }

      console.log('✅ Deepgram API key looks valid, attempting connection...')
      console.log('🔗 But using OpenAI Whisper instead due to Deepgram Flexible plan limitations')

      // Get microphone stream first
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      })
      
      if (cleanupRef.current) {
        stream.getTracks().forEach(track => track.stop())
        return
      }
      
      streamRef.current = stream
      console.log('🎤 Microphone access granted')

      // Skip Deepgram WebSocket and use OpenAI Whisper directly
      console.log('🤖 Starting OpenAI Whisper STT (Deepgram Flexible plan limitation)')
      setConnectionStatus('connected')
      setIsMockMode(false)
      
      startOpenAIWhisperSTT(stream)
    } catch (error) {
      console.error('❌ Failed to setup Deepgram:', error)
      console.error('🔍 Error details:', {
        name: error instanceof Error ? error.name : 'Unknown',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      })
      if (!cleanupRef.current) {
        setConnectionStatus('failed')
        setIsMockMode(true)
        setupMockSTT()
      }
    }
  }

  const setupMockSTT = async () => {
    if (cleanupRef.current || mockIntervalRef.current) {
      console.log('Mock STT already running or cleanup in progress')
      return
    }
    
    try {
      console.log('🎭 Setting up Mock STT mode')
      
      // Get microphone stream for visual feedback (but don't actually use it for STT)
      try {
        if (!streamRef.current) {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
          
          if (cleanupRef.current) {
            stream.getTracks().forEach(track => track.stop())
            return
          }
          
          streamRef.current = stream
          console.log('🎤 Microphone access granted for mock mode')
        }
      } catch (micError) {
        console.warn('⚠️ Microphone access failed, using mock mode without mic:', micError)
        // Continue without microphone - mock mode doesn't actually need it
      }
      
      // Mock STT with realistic text - but only if user wants demo
      const shouldRunMockText = confirm('Deepgram STT failed to connect. Would you like to see a demo with sample text instead?')
      
      if (!shouldRunMockText) {
        console.log('User declined demo mode, staying in disconnected state')
        setIsMockMode(false)
        setConnectionStatus('failed')
        return
      }

      setIsMockMode(true)
      setConnectionStatus('connected')

      const mockTexts = [
        "Welcome to today's live lecture session",
        "We are using real-time transcription technology", 
        "This is a demonstration of the speech-to-text system",
        "The transcription appears as you speak",
        "Multiple languages are supported by the platform",
        "Participants can follow along in real-time",
        "Configure your Deepgram API key for production use",
        "This mock mode helps you test the interface"
      ]

      let textIndex = 0
      const mockInterval = setInterval(() => {
        if (cleanupRef.current || !isRecording) {
          clearInterval(mockInterval)
          mockIntervalRef.current = null
          return
        }

        const text = mockTexts[textIndex % mockTexts.length]
        
        // Simulate progressive typing for partial results
        const words = text.split(' ')
        let partialText = ''
        
        // Send partial updates word by word
        const wordInterval = setInterval(() => {
          if (cleanupRef.current || !isRecording) {
            clearInterval(wordInterval)
            return
          }
          
          if (partialText === '') {
            partialText = words[0] || ''
          } else if (partialText !== text) {
            const currentWords = partialText.split(' ').length
            if (currentWords < words.length) {
              partialText = words.slice(0, currentWords + 1).join(' ')
            }
          }
          
          // Send partial update
          if (partialText && partialText !== text) {
            onTranscriptUpdate(partialText, true)
          } else {
            // Send final update
            clearInterval(wordInterval)
            onTranscriptUpdate(text, false)
            
            // Send to API (only once per text)
            fetch('/api/stt-stream', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                type: 'transcript',
                sessionId,
                transcript: text,
                isPartial: false
              })
            }).catch(err => console.error('Failed to send mock transcript:', err))
          }
        }, 300) // Update every 300ms for realistic typing effect

        textIndex++
      }, 4000) // New sentence every 4 seconds
      
      mockIntervalRef.current = mockInterval
      console.log('🎭 Mock STT started successfully')

    } catch (error) {
      console.error('❌ Failed to setup mock STT:', error)
      if (!cleanupRef.current) {
        onError('Failed to initialize transcription system')
      }
    }
  }

  const getSupportedMimeType = (): string => {
    const mimeTypes = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/ogg;codecs=opus',
      'audio/wav'
    ]
    
    for (const mimeType of mimeTypes) {
      if (MediaRecorder.isTypeSupported(mimeType)) {
        console.log('Using MIME type:', mimeType)
        return mimeType
      }
    }
    
    console.warn('No supported MIME type found, using default')
    return 'audio/webm'
  }

  const processAudioWithOpenAI = async (audioBlob: Blob) => {
    if (cleanupRef.current) return
    
    try {
      console.log(`🎤 Processing audio with OpenAI: ${audioBlob.size} bytes`)
      
      const formData = new FormData()
      formData.append('audio', audioBlob, 'audio.webm')
      formData.append('sessionId', sessionId)
      
      const response = await fetch('/api/stt', {
        method: 'POST',
        body: formData
      })
      
      if (!response.ok) {
        throw new Error(`STT API error: ${response.status}`)
      }
      
      const result = await response.json()
      
      if (result.transcript && result.transcript.trim()) {
        console.log('📝 OpenAI transcript received:', result.transcript)
        
        // Update UI immediately
        onTranscriptUpdate(result.transcript, false)
        
        // Send to API for storage
        await fetch('/api/stt-stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'transcript',
            sessionId,
            transcript: result.transcript,
            isPartial: false
          })
        })
      } else {
        console.log('⚠️ Empty transcript from OpenAI')
      }
      
    } catch (error) {
      console.error('❌ Error processing audio with OpenAI:', error)
      // Don't throw error to avoid breaking the recording loop
    }
  }

  const startOpenAIWhisperSTT = (stream: MediaStream) => {
    console.log('🤖 Starting OpenAI Whisper STT...')
    
    setConnectionStatus('connected')
    setIsMockMode(false)
    
    try {
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: getSupportedMimeType()
      })
      
      setMediaRecorder(mediaRecorder)
      
      let audioChunks: Blob[] = []
      
      mediaRecorder.ondataavailable = async (event) => {
        if (cleanupRef.current) return
        
        if (event.data.size > 0) {
          audioChunks.push(event.data)
          console.log('🎵 Audio chunk collected:', event.data.size, 'bytes')
        }
      }
      
      mediaRecorder.onstop = async () => {
        if (cleanupRef.current || audioChunks.length === 0) {
          audioChunks = []
          return
        }
        
        const audioBlob = new Blob(audioChunks, { type: getSupportedMimeType() })
        audioChunks = []
        
        // Only process if audio is substantial enough
        if (audioBlob.size > 1000) { // At least 1KB
          console.log(`🎤 Processing audio blob: ${audioBlob.size} bytes`)
          await processAudioWithOpenAI(audioBlob)
        } else {
          console.log('⚠️ Skipping tiny audio chunk:', audioBlob.size, 'bytes')
        }
        
        // Continue recording if still active
        if (!cleanupRef.current && mediaRecorder && mediaRecorder.state === 'inactive') {
          try {
            mediaRecorder.start()
            setTimeout(() => {
              if (!cleanupRef.current && mediaRecorder && mediaRecorder.state === 'recording') {
                mediaRecorder.stop()
              }
            }, 3000) // 3 second chunks
          } catch (err) {
            console.error('Error restarting recording:', err)
          }
        }
      }
      
      mediaRecorder.onerror = (event) => {
        console.error('❌ MediaRecorder error:', event)
      }
      
      // Start recording
      mediaRecorder.start()
      console.log('🎤 OpenAI Whisper recording started')
      
      // Set up the 3-second interval
      setTimeout(() => {
        if (!cleanupRef.current && mediaRecorder && mediaRecorder.state === 'recording') {
          mediaRecorder.stop()
        }
      }, 3000)
      
    } catch (error) {
      console.error('❌ Error setting up OpenAI Whisper:', error)
      // Fallback to mock mode if OpenAI setup fails
      setConnectionStatus('failed')
      setIsMockMode(true)
      setupMockSTT()
    }
  }

  const cleanup = async () => {
    if (cleanupRef.current) {
      console.log('Cleanup already in progress')
      return
    }
    
    cleanupRef.current = true
    console.log('🧹 Starting RealtimeSTT cleanup for session:', sessionId)
    
    // Clear mock interval
    if (mockIntervalRef.current) {
      clearInterval(mockIntervalRef.current)
      mockIntervalRef.current = null
    }
    
    // Stop media recorder
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      try {
        mediaRecorder.stop()
      } catch (error) {
        console.error('Error stopping media recorder:', error)
      }
    }

    // Close WebSocket
    if (deepgramSocket && deepgramSocket.readyState === WebSocket.OPEN) {
      try {
        deepgramSocket.close(1000, 'Session ended') // Normal closure
      } catch (error) {
        console.error('Error closing WebSocket:', error)
      }
    }

    // Stop media stream
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach(track => track.stop())
        streamRef.current = null
      } catch (error) {
        console.error('Error stopping media stream:', error)
      }
    }

    // End session in API (only if session was initialized)
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
        } else {
          console.warn('⚠️ Session end returned:', response.status)
        }
      } catch (error) {
        console.error('❌ Failed to end session:', error)
      }
    }

    // Reset state
    setDeepgramSocket(null)
    setMediaRecorder(null)
    setIsInitialized(false)
    setIsMockMode(false)
    setConnectionStatus('disconnected')
    initializationRef.current = false
    sessionInitializedRef.current = null
    
    // Small delay before allowing new initialization
    setTimeout(() => {
      cleanupRef.current = false
    }, 500)
  }

  const getStatusDisplay = () => {
    switch (connectionStatus) {
      case 'connecting':
        return {
          color: 'text-yellow-600',
          bgColor: 'bg-yellow-500',
          text: '🔄 Connecting to STT...',
          showSpinner: true
        }
      case 'connected':
        return {
          color: 'text-green-600',
          bgColor: 'bg-green-500',
          text: isMockMode ? '🎭 Demo STT Active' : '🤖 OpenAI Whisper STT Active',
          showSpinner: false
        }
      case 'failed':
        return {
          color: 'text-orange-600',
          bgColor: 'bg-orange-500',
          text: '⚠️ STT Connection Failed',
          showSpinner: false
        }
      default:
        return {
          color: 'text-red-600',
          bgColor: 'bg-red-500',
          text: '❌ STT Disconnected',
          showSpinner: false
        }
    }
  }

  const statusDisplay = getStatusDisplay()

  return (
    <div className="flex items-center space-x-2 text-sm">
      <div className={`w-2 h-2 rounded-full ${statusDisplay.bgColor} ${statusDisplay.showSpinner ? 'animate-pulse' : ''}`} />
      <span className={statusDisplay.color}>
        {statusDisplay.text}
      </span>
      {isMockMode && (
        <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
          DEMO MODE
        </span>
      )}
      {connectionStatus === 'failed' && !isMockMode && (
        <span className="text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded">
          Check Network
        </span>
      )}
      {process.env.NODE_ENV === 'development' && (
        <span className="text-xs text-gray-400">
          ({isInitialized ? 'Init' : 'NotInit'})
        </span>
      )}
    </div>
  )
} 