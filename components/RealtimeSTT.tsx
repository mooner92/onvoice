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
  const cleanupRef = useRef(false)
  const mockIntervalRef = useRef<NodeJS.Timeout | null>(null)

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
      
      if (!deepgramApiKey || deepgramApiKey === 'demo') {
        console.log('Deepgram API key not configured, using mock mode')
        await setupMockSTT()
        return
      }

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

      // Create Deepgram WebSocket connection
      const wsUrl = `wss://api.deepgram.com/v1/listen?model=nova-2&language=auto&smart_format=true&interim_results=true&endpointing=300`
      
      const socket = new WebSocket(wsUrl, ['token', deepgramApiKey])
      
      socket.onopen = () => {
        if (cleanupRef.current) {
          socket.close()
          return
        }
        console.log('Deepgram WebSocket connected')
        setIsConnected(true)
        startAudioStream(socket, stream)
      }

      socket.onmessage = async (event) => {
        if (cleanupRef.current) return
        
        const data = JSON.parse(event.data)
        
        if (data.channel?.alternatives?.[0]?.transcript) {
          const transcript = data.channel.alternatives[0].transcript
          const isPartial = data.is_final === false
          
          console.log('Received transcript:', { transcript, isPartial })
          
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
        }
      }

      socket.onclose = () => {
        console.log('Deepgram WebSocket disconnected')
        setIsConnected(false)
      }

      socket.onerror = (error) => {
        console.error('Deepgram WebSocket error:', error)
        if (!cleanupRef.current) {
          onError('Real-time transcription connection failed')
        }
      }

      setDeepgramSocket(socket)

    } catch (error) {
      console.error('Failed to setup Deepgram:', error)
      if (!cleanupRef.current) {
        onError('Failed to access microphone or connect to transcription service')
      }
    }
  }

  const setupMockSTT = async () => {
    if (cleanupRef.current) return
    
    try {
      // Get microphone stream for visual feedback
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      
      if (cleanupRef.current) {
        stream.getTracks().forEach(track => track.stop())
        return
      }
      
      streamRef.current = stream
      setIsConnected(true)

      // Mock STT with realistic text
      const mockTexts = [
        "Welcome to today's lecture",
        "We will be covering important topics",
        "Please take notes as we progress",
        "This is a demonstration of real-time transcription",
        "The system is working correctly",
        "You can see the text appearing in real-time",
        "This would normally use Deepgram API",
        "Configure your API key for production use"
      ]

      let textIndex = 0
      const mockInterval = setInterval(() => {
        if (cleanupRef.current || !isRecording) {
          clearInterval(mockInterval)
          return
        }

        const text = mockTexts[textIndex % mockTexts.length]
        
        // Send partial text first
        onTranscriptUpdate(text.substring(0, text.length / 2), true)
        
        // Then send complete text after delay
        setTimeout(() => {
          if (cleanupRef.current || !isRecording) return
          
          onTranscriptUpdate(text, false)
          
          // Send to API
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
        }, 1000)

        textIndex++
      }, 3000) // New text every 3 seconds
      
      mockIntervalRef.current = mockInterval

    } catch (error) {
      console.error('Failed to setup mock STT:', error)
      if (!cleanupRef.current) {
        onError('Failed to access microphone')
      }
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
    
    // Small delay before allowing new initialization
    setTimeout(() => {
      cleanupRef.current = false
    }, 500)
  }

  return (
    <div className="flex items-center space-x-2 text-sm">
      <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
      <span className={isConnected ? 'text-green-600' : 'text-red-600'}>
        {isConnected ? 'Real-time STT Active' : 'STT Disconnected'}
      </span>
      {process.env.NODE_ENV === 'development' && (
        <span className="text-xs text-gray-400">
          ({isInitialized ? 'Init' : 'NotInit'})
        </span>
      )}
    </div>
  )
} 