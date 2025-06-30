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
  const [isConnected, setIsConnected] = useState(false)
  const [isInitialized, setIsInitialized] = useState(false)
  const [isMockMode, setIsMockMode] = useState(false)
  const cleanupRef = useRef(false)
  const mockIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const isSetupRef = useRef(false) // Prevent duplicate setup

  // Initialize session when component mounts and recording starts
  useEffect(() => {
    if (sessionId && isRecording && !isInitialized) {
      console.log('Initializing RealtimeSTT for session:', sessionId)
      setIsInitialized(true)
      initializeSession()
    }
    
    // Cleanup when recording stops
    if (!isRecording && isInitialized) {
      console.log('Recording stopped, cleaning up RealtimeSTT')
      cleanup()
    }
    
    return () => {
      if (isInitialized) {
        cleanup()
      }
    }
  }, [sessionId, isRecording, isInitialized])

  const initializeSession = async () => {
    if (cleanupRef.current) {
      console.log('Cleanup in progress, skipping initialization')
      return
    }

    try {
      console.log('Starting STT session for:', sessionId)
      
      // Debug environment variables
      console.log('All environment variables check:', {
        NODE_ENV: process.env.NODE_ENV,
        NEXT_PUBLIC_DEEPGRAM_API_KEY: process.env.NEXT_PUBLIC_DEEPGRAM_API_KEY,
        hasDeepgramKey: !!process.env.NEXT_PUBLIC_DEEPGRAM_API_KEY,
        keyLength: process.env.NEXT_PUBLIC_DEEPGRAM_API_KEY?.length,
        allEnvKeys: Object.keys(process.env).filter(key => key.includes('DEEPGRAM'))
      })
      
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
    }
  }

  const setupDeepgram = async () => {
    if (cleanupRef.current) return

    try {
      // Check if Deepgram API key is available
      const deepgramApiKey = process.env.NEXT_PUBLIC_DEEPGRAM_API_KEY
      
      console.log('Environment check:', {
        hasApiKey: !!deepgramApiKey,
        keyLength: deepgramApiKey?.length,
        keyPrefix: deepgramApiKey?.substring(0, 8)
      })
      
      if (!deepgramApiKey || deepgramApiKey === 'demo') {
        console.log('Deepgram API key not configured, using mock mode')
        setIsMockMode(true)
        await setupMockSTT()
        return
      }

      console.log('Attempting to connect to Deepgram with API key:', deepgramApiKey.substring(0, 8) + '...')

      // Get microphone stream
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

      // Create Deepgram WebSocket connection with token in URL (browser compatible)
      const wsUrl = `wss://api.deepgram.com/v1/listen?` + new URLSearchParams({
        model: 'nova-2',
        language: 'auto',
        smart_format: 'true',
        interim_results: 'true',
        endpointing: '300',
        encoding: 'webm',
        sample_rate: '16000',
        channels: '1',
        token: deepgramApiKey
      }).toString()
      
      console.log('Connecting to Deepgram WebSocket')
      
      const socket = new WebSocket(wsUrl)
      
      // Set a timeout for connection
      const connectionTimeout = setTimeout(() => {
        if (socket.readyState === WebSocket.CONNECTING) {
          console.log('Deepgram connection timeout, falling back to mock mode')
          socket.close()
          setIsMockMode(true)
          setupMockSTT()
        }
      }, 10000) // 10 second timeout

      socket.onopen = () => {
        clearTimeout(connectionTimeout)
        
        if (cleanupRef.current) {
          socket.close()
          return
        }
        console.log('Deepgram WebSocket connected successfully')
        setIsConnected(true)
        startAudioStream(socket, stream)
      }

      socket.onmessage = async (event) => {
        if (cleanupRef.current) return
        
        try {
          const data = JSON.parse(event.data)
          console.log('Deepgram message:', data)
          
          // Handle different message types
          if (data.type === 'Results' && data.channel?.alternatives?.[0]?.transcript) {
            const transcript = data.channel.alternatives[0].transcript
            const isPartial = !data.is_final
            
            console.log('Received transcript:', { transcript, isPartial, isFinal: data.is_final })
            
            // Update UI immediately
            onTranscriptUpdate(transcript, isPartial)
            
            // Send to API for accumulation (only final transcripts)
            if (!isPartial) {
              await fetch('/api/stt-stream', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  type: 'transcript',
                  sessionId,
                  transcript,
                  isPartial
                })
              })
            }
          } else if (data.type === 'error') {
            console.error('Deepgram error:', data)
            throw new Error(`Deepgram error: ${data.description || 'Unknown error'}`)
          }
        } catch (parseError) {
          console.error('Error parsing Deepgram message:', parseError)
          console.log('Raw message:', event.data)
        }
      }

      socket.onclose = (event) => {
        clearTimeout(connectionTimeout)
        console.log('Deepgram WebSocket disconnected:', { 
          code: event.code, 
          reason: event.reason,
          wasClean: event.wasClean 
        })
        setIsConnected(false)
        
        // If connection failed and we're not in cleanup, try mock mode
        if (!cleanupRef.current && event.code !== 1000) { // 1000 = normal closure
          console.log('Deepgram connection failed (code:', event.code, '), switching to mock mode')
          setIsMockMode(true)
          setupMockSTT()
        }
      }

      socket.onerror = (error) => {
        clearTimeout(connectionTimeout)
        console.log('Deepgram WebSocket failed, switching to Mock STT')
        // Don't log the actual error to avoid console spam
        
        if (!cleanupRef.current) {
          // Close the failed socket
          try {
            if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
              socket.close()
            }
          } catch (closeError) {
            // Ignore close errors
          }
          
          // Fall back to mock mode instead of showing error
          console.log('Starting mock STT due to Deepgram connection failure')
          setIsMockMode(true)
          setupMockSTT()
        }
      }

      setDeepgramSocket(socket)

    } catch (error) {
      console.error('Failed to setup Deepgram, falling back to mock mode:', error)
      if (!cleanupRef.current) {
        setIsMockMode(true)
        setupMockSTT()
      }
    }
  }

  const setupMockSTT = async () => {
    if (cleanupRef.current || isSetupRef.current) {
      console.log('Mock STT already setup or cleanup in progress')
      return
    }
    
    isSetupRef.current = true
    
    try {
      console.log('Setting up Mock STT mode')
      
      // Get microphone stream for visual feedback (but don't actually use it for STT)
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        
        if (cleanupRef.current) {
          stream.getTracks().forEach(track => track.stop())
          return
        }
        
        streamRef.current = stream
        console.log('Microphone access granted for mock mode')
      } catch (micError) {
        console.warn('Microphone access failed, using mock mode without mic:', micError)
        // Continue without microphone - mock mode doesn't actually need it
      }
      
      setIsConnected(true)

      // Mock STT with realistic text
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
      console.log('Mock STT started successfully')

    } catch (error) {
      console.error('Failed to setup mock STT:', error)
      if (!cleanupRef.current) {
        onError('Failed to initialize transcription system')
      }
    } finally {
      // Reset the setup flag after a delay to allow re-setup if needed
      setTimeout(() => {
        isSetupRef.current = false
      }, 1000)
    }
  }

  const startAudioStream = (socket: WebSocket, stream: MediaStream) => {
    if (cleanupRef.current) return
    
    const recorder = new MediaRecorder(stream, {
      mimeType: 'audio/webm;codecs=opus'
    })

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0 && socket.readyState === WebSocket.OPEN && !cleanupRef.current) {
        socket.send(event.data)
      }
    }

    recorder.start(100) // Send audio chunks every 100ms for real-time
    setMediaRecorder(recorder)
  }

  const cleanup = async () => {
    if (cleanupRef.current) {
      console.log('Cleanup already in progress')
      return
    }
    
    cleanupRef.current = true
    console.log('Starting RealtimeSTT cleanup for session:', sessionId)
    
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
        deepgramSocket.close()
      } catch (error) {
        console.error('Error closing WebSocket:', error)
      }
    }

    // Stop media stream
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach(track => track.stop())
      } catch (error) {
        console.error('Error stopping media stream:', error)
      }
    }

    // End session in API (only if session was initialized)
    if (sessionId && isInitialized) {
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
          console.log('Session ended successfully')
        } else {
          console.warn('Session end returned:', response.status)
        }
      } catch (error) {
        console.error('Failed to end session:', error)
      }
    }

    // Reset state
    setDeepgramSocket(null)
    setMediaRecorder(null)
    setIsConnected(false)
    setIsInitialized(false)
    setIsMockMode(false)
    isSetupRef.current = false
    
    // Small delay before allowing new initialization
    setTimeout(() => {
      cleanupRef.current = false
    }, 500)
  }

  return (
    <div className="flex items-center space-x-2 text-sm">
      <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
      <span className={isConnected ? 'text-green-600' : 'text-red-600'}>
        {isConnected 
          ? (isMockMode ? 'Demo STT Active' : 'Real-time STT Active') 
          : 'STT Disconnected'
        }
      </span>
      {isMockMode && (
        <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
          DEMO MODE
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