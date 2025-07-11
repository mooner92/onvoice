"use client"

import { useEffect, useRef, useState } from 'react'

interface GeminiLiveSTTProps {
  sessionId: string
  isRecording: boolean
  onTranscriptUpdate: (transcript: string, translations: Record<string, string>) => void
  onError: (error: string) => void
  targetLanguages?: string[]
}

export function GeminiLiveSTT({ 
  sessionId, 
  isRecording, 
  onTranscriptUpdate, 
  onError,
  targetLanguages = ['ko', 'zh', 'hi']
}: GeminiLiveSTTProps) {
  const [isListening, setIsListening] = useState(false)
  const [isSupported, setIsSupported] = useState(false)
  const [hasPermission, setHasPermission] = useState(false)
  const [status, setStatus] = useState('Initializing...')
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const currentSessionRef = useRef<string | null>(null)
  const isActiveRef = useRef(false)
  const mountedRef = useRef(true)
  const processingRef = useRef(false)

  // Track props changes for debugging
  useEffect(() => {
    console.log('🎯 GeminiLiveSTT Props Update:', {
      sessionId,
      isRecording,
      targetLanguages,
      timestamp: new Date().toLocaleTimeString()
    })
  }, [sessionId, isRecording, targetLanguages])

  // Cleanup function
  const cleanup = () => {
    console.log('🧹 Cleaning up Gemini Live STT...')
    isActiveRef.current = false
    setIsListening(false)
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop()
      } catch {
        // Silent cleanup
      }
    }
    
    mediaRecorderRef.current = null
    audioChunksRef.current = []
    processingRef.current = false
  }

  // Component cleanup on unmount
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      cleanup()
    }
  }, [])

  // Check browser support
  useEffect(() => {
    if (typeof window !== 'undefined' && 
        typeof navigator !== 'undefined' && 
        navigator.mediaDevices && 
        typeof navigator.mediaDevices.getUserMedia === 'function') {
      setIsSupported(true)
      setStatus('Ready to start')
      console.log('✅ Gemini Live STT supported')
    } else {
      setIsSupported(false)
      setStatus('Not supported')
      onError('Media recording not supported. Please use a modern browser.')
      console.log('❌ Gemini Live STT not supported')
    }
  }, [onError])

  // Request microphone permission
  const requestMicrophonePermission = async () => {
    try {
      console.log('🎤 Requesting microphone permission for Gemini Live...')
      
      // First check if we already have permission
      if ('permissions' in navigator) {
        const permission = await navigator.permissions.query({ name: 'microphone' as PermissionName })
        console.log('🔍 Current microphone permission:', permission.state)
        
        if (permission.state === 'denied') {
          setHasPermission(false)
          setStatus('Permission denied')
          onError('Microphone access denied. Please allow microphone access in your browser settings and refresh the page.')
          return false
        }
      }
      
      // Check available audio devices
      const devices = await navigator.mediaDevices.enumerateDevices()
      const audioInputs = devices.filter(device => device.kind === 'audioinput')
      console.log('🎤 Available audio inputs:', audioInputs.length, audioInputs.map(d => d.label || 'Unknown device'))
      
      if (audioInputs.length === 0) {
        setHasPermission(false)
        setStatus('No microphone')
        onError('No microphone devices found. Please connect a microphone.')
        return false
      }
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
          channelCount: 1
        }
      })
      
      console.log('✅ Microphone permission granted for Gemini Live:', {
        tracks: stream.getAudioTracks().length,
        settings: stream.getAudioTracks()[0]?.getSettings()
      })
      
      // Test that the stream is actually working
      const track = stream.getAudioTracks()[0]
      if (!track || track.readyState !== 'live') {
        console.error('❌ Audio track is not live:', track?.readyState)
        setHasPermission(false)
        setStatus('Microphone not working')
        onError('Microphone is not working properly. Please check your microphone.')
        return false
      }
      
      // Stop the stream immediately - we'll create a new one when recording
      stream.getTracks().forEach(track => {
        console.log('🛑 Stopping test track:', track.label)
        track.stop()
      })
      
      setHasPermission(true)
      setStatus('Permission granted')
      return true
      
    } catch (error) {
      console.error('❌ Microphone permission error:', error)
      setHasPermission(false)
      
      let errorMessage = 'Microphone permission denied.'
      let statusMessage = 'Permission denied'
      
      if (error instanceof Error) {
        console.error('❌ Error details:', {
          name: error.name,
          message: error.message,
          stack: error.stack
        })
        
        if (error.name === 'NotAllowedError') {
          errorMessage = 'Microphone access denied. Please allow microphone access in your browser settings and refresh the page.'
          statusMessage = 'Access denied'
        } else if (error.name === 'NotFoundError') {
          errorMessage = 'No microphone found. Please check your microphone connection.'
          statusMessage = 'No microphone'
        } else if (error.name === 'NotReadableError') {
          errorMessage = 'Microphone is being used by another application. Please close other apps using the microphone.'
          statusMessage = 'Microphone busy'
        } else if (error.name === 'AbortError') {
          errorMessage = 'Microphone access was aborted. Please try again.'
          statusMessage = 'Access aborted'
        } else {
          errorMessage = `Microphone error: ${error.message}`
          statusMessage = 'Error'
        }
      }
      
      setStatus(statusMessage)
      onError(errorMessage)
      return false
    }
  }

  // Start Gemini Live session
  const startGeminiLiveSession = async () => {
    try {
      console.log('🚀 Starting Gemini Live session...')
      
      const response = await fetch('/api/gemini-live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'start',
          sessionId,
          targetLanguages
        })
      })

      if (!response.ok) {
        throw new Error('Failed to start Gemini Live session')
      }

      const result = await response.json()
      console.log('✅ Gemini Live session started:', result)
      return true
      
    } catch (error) {
      console.error('❌ Failed to start Gemini Live session:', error)
      onError('Failed to initialize Gemini Live session')
      return false
    }
  }

  // Process audio with Gemini Live
  const processAudioWithGemini = async (audioBlob: Blob) => {
    if (processingRef.current) {
      console.log('⏳ Already processing audio, skipping...')
      return
    }

    // Check if session is still active
    if (!isActiveRef.current || !currentSessionRef.current) {
      console.log('⚠️ Session not active, skipping audio processing')
      return
    }

    // Check if audio blob has content
    if (!audioBlob || audioBlob.size === 0) {
      console.log('⚠️ Empty audio blob, skipping...')
      return
    }

    try {
      processingRef.current = true
      console.log('🎵 Processing audio with Gemini Live...', {
        size: audioBlob.size,
        type: audioBlob.type,
        sessionId: currentSessionRef.current
      })

      // Convert blob to base64
      const arrayBuffer = await audioBlob.arrayBuffer()
      const base64Audio = Buffer.from(arrayBuffer).toString('base64')

      // Log audio data info for debugging
      console.log('📊 Audio data:', {
        originalSize: audioBlob.size,
        base64Length: base64Audio.length,
        sessionId: currentSessionRef.current
      })

      // Double-check session is still active before API call
      if (!isActiveRef.current || !currentSessionRef.current) {
        console.log('⚠️ Session became inactive during processing, aborting')
        return
      }

      const response = await fetch('/api/gemini-live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'audio',
          sessionId: currentSessionRef.current,
          audioData: base64Audio
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        
        // Handle 404 errors gracefully (session ended)
        if (response.status === 404) {
          console.log('⚠️ Session not found (404) - likely ended, stopping processing')
          isActiveRef.current = false
          return
        }
        
        console.error('❌ Gemini API response error:', errorText)
        throw new Error(`Failed to process audio with Gemini: ${response.status}`)
      }

      const result = await response.json()
      console.log('✅ Gemini Live processing result:', result)

      // Check session is still active before updating UI
      if (!isActiveRef.current || !currentSessionRef.current) {
        console.log('⚠️ Session ended during processing, skipping UI update')
        return
      }

      if (result.success && result.result) {
        const { original, translations } = result.result
        
        if (original?.text && original.text.trim().length > 0) {
          console.log('📝 Valid transcript received:', original.text)
          // Update transcript with original and translations
          onTranscriptUpdate(original.text, translations || {})
        } else {
          console.log('⚠️ Empty or invalid transcript received')
        }
      } else {
        console.log('⚠️ No valid result from Gemini Live')
      }

    } catch (error) {
      // Don't show errors if session was intentionally stopped
      if (isActiveRef.current && currentSessionRef.current) {
        console.error('❌ Gemini Live processing error:', error)
        onError(`Failed to process audio with Gemini Live: ${error instanceof Error ? error.message : 'Unknown error'}`)
      } else {
        console.log('⚠️ Processing error after session ended (ignoring):', error)
      }
    } finally {
      processingRef.current = false
    }
  }

  // Start audio recording
  const startRecording = async () => {
    if (!mountedRef.current || !isSupported) {
      console.log('❌ Cannot start: component unmounted or not supported')
      return
    }

    if (!hasPermission) {
      const granted = await requestMicrophonePermission()
      if (!granted) return
    }

    try {
      console.log('🎤 Starting Gemini Live recording...')
      
      // Initialize Gemini Live session
      const sessionStarted = await startGeminiLiveSession()
      if (!sessionStarted) return

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
          channelCount: 1
        }
      })

      console.log('🎤 Audio stream obtained:', {
        tracks: stream.getAudioTracks().length,
        settings: stream.getAudioTracks()[0]?.getSettings()
      })

      // Create MediaRecorder with fallback MIME types
      let mimeType = 'audio/webm'
      if (!MediaRecorder.isTypeSupported('audio/webm')) {
        if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4'
        } else if (MediaRecorder.isTypeSupported('audio/wav')) {
          mimeType = 'audio/wav'
        } else {
          console.warn('⚠️ No supported audio MIME type found, using default')
          mimeType = ''
        }
      }

      console.log('🎵 Using MIME type:', mimeType)

      const mediaRecorder = new MediaRecorder(stream, 
        mimeType ? { mimeType } : undefined
      )

      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        console.log('📊 Audio data available:', {
          size: event.data.size,
          type: event.data.type
        })
        
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        } else {
          console.warn('⚠️ Received empty audio data')
        }
      }

      mediaRecorder.onstop = async () => {
        if (!mountedRef.current || !isActiveRef.current) return

        console.log('🔄 Processing recorded audio chunk...', {
          chunks: audioChunksRef.current.length,
          totalSize: audioChunksRef.current.reduce((sum, chunk) => sum + chunk.size, 0)
        })
        
        if (audioChunksRef.current.length === 0) {
          console.warn('⚠️ No audio chunks to process')
          // Still restart recording
          if (isActiveRef.current && currentSessionRef.current) {
            setTimeout(() => {
              if (mountedRef.current && isActiveRef.current) {
                startRecording()
              }
            }, 100)
          }
          return
        }

        const audioBlob = new Blob(audioChunksRef.current, { 
          type: mimeType || 'audio/webm' 
        })
        audioChunksRef.current = []

        console.log('🎵 Created audio blob:', {
          size: audioBlob.size,
          type: audioBlob.type
        })

        // Process with Gemini Live
        await processAudioWithGemini(audioBlob)

        // Restart recording if still active
        if (isActiveRef.current && currentSessionRef.current) {
          setTimeout(() => {
            if (mountedRef.current && isActiveRef.current) {
              startRecording()
            }
          }, 100)
        }
      }

      mediaRecorder.onstart = () => {
        if (!mountedRef.current) return
        console.log('🎤 Gemini Live recording started')
        setIsListening(true)
        setStatus('Listening with Gemini Live...')
      }

      mediaRecorder.onerror = (event) => {
        console.error('❌ MediaRecorder error:', event)
        setIsListening(false)
        
        // More detailed error handling
        const errorMessage = event instanceof ErrorEvent 
          ? `Recording error: ${event.message}` 
          : 'Recording error occurred'
        
        console.error('❌ Detailed error:', {
          event,
          state: mediaRecorderRef.current?.state,
          stream: stream.active
        })
        
        onError(errorMessage)
      }

      // Start recording in 5-second chunks for better performance
      mediaRecorder.start()
      
      // Stop and restart every 5 seconds for processing
      setTimeout(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.stop()
        }
      }, 5000) // Changed from 3000 to 5000ms

    } catch (error) {
      console.error('❌ Failed to start Gemini Live recording:', error)
      setStatus('Failed to start')
      onError('Failed to start recording')
    }
  }

  // Stop Gemini Live session
  const stopGeminiLiveSession = async () => {
    try {
      console.log('🛑 Stopping Gemini Live session...')
      
      const response = await fetch('/api/gemini-live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'end',
          sessionId
        })
      })

      if (response.ok) {
        console.log('✅ Gemini Live session stopped')
      }
      
    } catch (error) {
      console.error('❌ Failed to stop Gemini Live session:', error)
    }
  }

  // Handle recording state changes
  useEffect(() => {
    console.log('🔄 Gemini Live recording state changed:', { 
      isRecording, 
      sessionId, 
      currentSession: currentSessionRef.current,
      isActive: isActiveRef.current,
      mounted: mountedRef.current 
    })
    
    if (isRecording && sessionId) {
      // Starting new session
      if (currentSessionRef.current !== sessionId) {
        currentSessionRef.current = sessionId
        isActiveRef.current = true
        
        console.log('🚀 Initializing NEW Gemini Live session:', sessionId)
        
        if (mountedRef.current && isActiveRef.current) {
          startRecording()
        }
      } else {
        console.log('⚠️ Gemini Live session already active:', sessionId)
      }
      
    } else if (!isRecording) {
      // Stopping session
      console.log('🛑 isRecording is now FALSE - stopping Gemini Live')
      
      isActiveRef.current = false
      currentSessionRef.current = null
      setIsListening(false)
      setStatus('Ready to start')
      
      cleanup()
      stopGeminiLiveSession()
    }
  }, [isRecording, sessionId])

  // Return status component
  return (
    <div className="gemini-live-stt-status">
      {process.env.NODE_ENV === 'development' && (
        <div className="text-xs text-gray-500 mb-2 space-y-1">
          <div>🤖 Gemini Live STT: {status}</div>
          <div>🎤 Listening: {isListening ? 'Yes' : 'No'} | Processing: {processingRef.current ? 'Yes' : 'No'}</div>
          <div>📋 Session: {sessionId?.substring(0, 8)}... | Supported: {isSupported ? 'Yes' : 'No'} | Permission: {hasPermission ? 'Yes' : 'No'}</div>
        </div>
      )}
    </div>
  )
} 