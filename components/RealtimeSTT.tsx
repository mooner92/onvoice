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

  // Initialize session when component mounts
  useEffect(() => {
    if (sessionId && isRecording) {
      initializeSession()
    }
    return () => {
      cleanup()
    }
  }, [sessionId, isRecording])

  const initializeSession = async () => {
    try {
      // Initialize session in API
      await fetch('/api/stt-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'start',
          sessionId
        })
      })

      // Setup Deepgram connection
      await setupDeepgram()
      
    } catch (error) {
      console.error('Failed to initialize session:', error)
      onError('Failed to start real-time transcription')
    }
  }

  const setupDeepgram = async () => {
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
      streamRef.current = stream

      // Create Deepgram WebSocket connection
      const wsUrl = `wss://api.deepgram.com/v1/listen?model=nova-2&language=auto&smart_format=true&interim_results=true&endpointing=300`
      
      const socket = new WebSocket(wsUrl, ['token', deepgramApiKey])
      
      socket.onopen = () => {
        console.log('Deepgram WebSocket connected')
        setIsConnected(true)
        startAudioStream(socket, stream)
      }

      socket.onmessage = async (event) => {
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
        onError('Real-time transcription connection failed')
      }

      setDeepgramSocket(socket)

    } catch (error) {
      console.error('Failed to setup Deepgram:', error)
      onError('Failed to access microphone or connect to transcription service')
    }
  }

  const setupMockSTT = async () => {
    try {
      // Get microphone stream for visual feedback
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
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
        if (!isRecording) {
          clearInterval(mockInterval)
          return
        }

        const text = mockTexts[textIndex % mockTexts.length]
        
        // Send partial text first
        onTranscriptUpdate(text.substring(0, text.length / 2), true)
        
        // Then send complete text after delay
        setTimeout(() => {
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
          })
        }, 1000)

        textIndex++
      }, 3000) // New text every 3 seconds

    } catch (error) {
      console.error('Failed to setup mock STT:', error)
      onError('Failed to access microphone')
    }
  }

  const startAudioStream = (socket: WebSocket, stream: MediaStream) => {
    const recorder = new MediaRecorder(stream, {
      mimeType: 'audio/webm;codecs=opus'
    })

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0 && socket.readyState === WebSocket.OPEN) {
        socket.send(event.data)
      }
    }

    recorder.start(100) // Send audio chunks every 100ms for real-time
    setMediaRecorder(recorder)
  }

  const cleanup = async () => {
    console.log('Cleaning up RealtimeSTT')
    
    // Stop media recorder
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop()
    }

    // Close WebSocket
    if (deepgramSocket && deepgramSocket.readyState === WebSocket.OPEN) {
      deepgramSocket.close()
    }

    // Stop media stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
    }

    // End session in API
    if (sessionId) {
      try {
        await fetch('/api/stt-stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'end',
            sessionId
          })
        })
      } catch (error) {
        console.error('Failed to end session:', error)
      }
    }

    // Reset state
    setDeepgramSocket(null)
    setMediaRecorder(null)
    setIsConnected(false)
  }

  // Cleanup when recording stops
  useEffect(() => {
    if (!isRecording && (deepgramSocket || mediaRecorder)) {
      cleanup()
    }
  }, [isRecording])

  return (
    <div className="flex items-center space-x-2 text-sm">
      <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
      <span className={isConnected ? 'text-green-600' : 'text-red-600'}>
        {isConnected ? 'Real-time STT Active' : 'STT Disconnected'}
      </span>
    </div>
  )
} 