"use client"

import { useEffect, useRef, useState } from 'react'

interface RealGeminiLiveProps {
  sessionId: string
  isRecording: boolean
  onTranscriptUpdate: (transcript: string, translations: Record<string, string>) => void
  onError: (error: string) => void
  targetLanguages?: string[]
}

export function RealGeminiLive({ 
  sessionId, 
  isRecording, 
  onTranscriptUpdate, 
  onError,
  targetLanguages = ['ko', 'zh', 'hi']
}: RealGeminiLiveProps) {
  const [isConnected, setIsConnected] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [status, setStatus] = useState('Initializing...')
  const [audioLevel, setAudioLevel] = useState(0)
  
  const audioContextRef = useRef<AudioContext | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const currentSessionRef = useRef<string | null>(null)
  const isActiveRef = useRef(false)
  const mountedRef = useRef(true)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const wsRef = useRef<WebSocket | null>(null)

  // Component cleanup
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      cleanup()
    }
  }, [])

  const cleanup = () => {
    console.log('🧹 Cleaning up Real Gemini Live...')
    isActiveRef.current = false
    setIsListening(false)
    setIsConnected(false)
    
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    
    if (processorRef.current) {
      processorRef.current.disconnect()
      processorRef.current = null
    }
    
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
    
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop())
      mediaStreamRef.current = null
    }
  }

  // Initialize Real Gemini Live connection
  const initializeRealGeminiLive = async () => {
    try {
      console.log('🚀 Initializing Real Gemini Live connection...')
      console.log('📋 Using session ID:', sessionId)
      console.log('📋 Current session ref:', currentSessionRef.current)
      setStatus('Connecting to Real Gemini Live...')
      
      // Actually create a session with Gemini Live API
      const response = await fetch('/api/gemini-live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'start',
          sessionId: currentSessionRef.current, // Use currentSessionRef instead of sessionId
          targetLanguages
        })
      })

      if (!response.ok) {
        throw new Error('Failed to start Gemini Live session')
      }

      const result = await response.json()
      console.log('✅ Gemini Live session started:', result)
      console.log('📋 Session confirmed:', currentSessionRef.current)
      
      setIsConnected(true)
      setStatus('Connected to Real Gemini Live')
      
      return true
      
    } catch (error) {
      console.error('❌ Failed to initialize Real Gemini Live:', error)
      onError('Failed to connect to Real Gemini Live')
      setStatus('Connection failed')
      return false
    }
  }

  // Setup real-time audio streaming
  const setupRealTimeAudioStreaming = async () => {
    try {
      console.log('🎤 Setting up REAL-TIME audio streaming...')
      
      // Get microphone access with optimal settings for real-time
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000,
          channelCount: 1
        }
      })

      console.log('✅ Microphone access granted for real-time')
      mediaStreamRef.current = stream
      
      // Create audio context optimized for real-time
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 16000,
        latencyHint: 'interactive' // Prioritize low latency
      })

      const audioContext = audioContextRef.current
      
      if (audioContext.state === 'suspended') {
        await audioContext.resume()
      }

      const source = audioContext.createMediaStreamSource(stream)
      
      // Create analyser for audio level monitoring
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.1 // Faster response
      analyserRef.current = analyser
      
      source.connect(analyser)

      // Start audio level monitoring
      startAudioLevelMonitoring()

      // Create ScriptProcessorNode for REAL-TIME audio processing
      // Use smaller buffer for lower latency
      const processor = audioContext.createScriptProcessor(1024, 1, 1) // 1024 samples = ~64ms at 16kHz
      processorRef.current = processor
      
      let audioBuffer: Float32Array[] = []
      let bufferLength = 0
      const maxBufferLength = 16000 * 1.5 // 1.5 seconds buffer for cost optimization (was 0.5s)

      processor.onaudioprocess = async (event) => {
        if (!isActiveRef.current) return

        const inputBuffer = event.inputBuffer
        const inputData = inputBuffer.getChannelData(0)
        
        // Add to buffer
        audioBuffer.push(new Float32Array(inputData))
        bufferLength += inputData.length

        // Process when we have 1.5s of audio for cost-optimized real-time response
        if (bufferLength >= maxBufferLength) {
          // Ensure we have a valid session before processing
          if (currentSessionRef.current && isActiveRef.current) {
            console.log('🎵 Processing audio with session:', currentSessionRef.current?.substring(0, 8))
            await processAudioBufferRealTime(audioBuffer, bufferLength)
          } else {
            console.log('⚠️ No valid session for audio processing, skipping', {
              hasSession: !!currentSessionRef.current,
              isActive: isActiveRef.current
            })
          }
          audioBuffer = []
          bufferLength = 0
        }
      }

      // Connect audio nodes
      source.connect(processor)
      processor.connect(audioContext.destination)

      console.log('✅ Real-time audio streaming setup complete')
      setIsListening(true)
      setStatus('🔴 LIVE - Real-time streaming to Gemini')
      
      return true
      
    } catch (error) {
      console.error('❌ Failed to setup real-time audio streaming:', error)
      onError(`Failed to access microphone: ${error}`)
      setStatus('Microphone error')
      return false
    }
  }

  // Audio quality and speech detection
  const audioQualityRef = useRef({ 
    consecutiveSilence: 0,
    speechDetected: false,
    lastValidSpeech: 0
  })

  // Process audio buffer in real-time with intelligent filtering
  const processAudioBufferRealTime = async (buffer: Float32Array[], length: number) => {
    try {
      // Check if session is still active - simplified check
      if (!isActiveRef.current || !currentSessionRef.current) {
        console.log('⚠️ Session not active or no session ID, skipping audio processing', {
          isActive: isActiveRef.current,
          hasSessionId: !!currentSessionRef.current,
          sessionId: currentSessionRef.current?.substring(0, 8)
        })
        return
      }

      // Combine buffer chunks
      const combinedBuffer = new Float32Array(length)
      let offset = 0
      
      for (const chunk of buffer) {
        combinedBuffer.set(chunk, offset)
        offset += chunk.length
      }

      // 🔍 Audio Quality Analysis
      const audioQuality = analyzeAudioQuality(combinedBuffer)
      
      // Skip if audio quality is too low
      if (!audioQuality.hasSpeech) {
        console.log('🔇 No speech detected, skipping API call')
        audioQualityRef.current.consecutiveSilence++
        return
      }

      // Reset silence counter if speech detected
      audioQualityRef.current.consecutiveSilence = 0
      audioQualityRef.current.speechDetected = true
      audioQualityRef.current.lastValidSpeech = Date.now()

      console.log('🎵 Processing audio buffer REAL-TIME...', { 
        length, 
        sessionId: currentSessionRef.current?.substring(0, 8),
        isActive: isActiveRef.current,
        audioQuality: audioQuality.confidence
      })

      // Convert to WAV format optimized for Gemini Live
      const wavBuffer = floatArrayToWav(combinedBuffer, 16000)
      const base64Audio = arrayBufferToBase64(wavBuffer)

      console.log('📊 Sending REAL-TIME audio to Gemini:', {
        bufferSize: combinedBuffer.length,
        wavSize: wavBuffer.byteLength,
        latency: '~500ms',
        sessionId: currentSessionRef.current?.substring(0, 8),
        confidence: audioQuality.confidence
      })

      // Double-check session is still active before API call
      if (!isActiveRef.current || !currentSessionRef.current) {
        console.log('⚠️ Session became inactive during processing, aborting')
        return
      }

      // Send to Gemini Live API for IMMEDIATE processing
      const response = await fetch('/api/gemini-live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'audio',
          sessionId: currentSessionRef.current,
          audioData: base64Audio,
          realtime: true,
          audioQuality: audioQuality // Send quality info
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        
        // Handle 404 errors gracefully (session ended)
        if (response.status === 404) {
          console.log('⚠️ Session not found (404) - reinitializing session')
          setIsConnected(false)
          
          // Try to reinitialize the session
          const reconnected = await initializeRealGeminiLive()
          if (!reconnected) {
            isActiveRef.current = false
            onError('Session lost and failed to reconnect')
          }
          return
        }
        
        console.error('❌ Real-time Gemini API error:', response.status, errorText)
        return
      }

      const result = await response.json()
      console.log('✅ Real-time Gemini response:', result)

      // 🔍 Result Quality Check
      if (result.success && result.result) {
        const { transcriptionText, translations, confidence } = result.result
        
        // Only save high-quality transcriptions
        if (transcriptionText && 
            transcriptionText.trim().length > 2 && 
            !isLowQualityText(transcriptionText) &&
            (confidence || 0.7) > 0.6) {
          
          console.log('📝 HIGH-QUALITY transcript received:', transcriptionText)
          // Update UI immediately - this is true real-time!
          onTranscriptUpdate(transcriptionText, translations || {})
        } else {
          console.log('⚠️ Low quality transcript filtered out:', transcriptionText)
        }
      }

    } catch (error) {
      // Don't show errors if session was intentionally stopped
      if (isActiveRef.current && currentSessionRef.current) {
        console.error('❌ Error processing real-time audio buffer:', error)
        onError(`Failed to process real-time audio: ${error instanceof Error ? error.message : 'Unknown error'}`)
      } else {
        console.log('⚠️ Processing error after session ended (ignoring):', error)
      }
    }
  }

  // Analyze audio quality to determine if it contains speech
  const analyzeAudioQuality = (buffer: Float32Array) => {
    // Calculate RMS (Root Mean Square) for volume
    let rms = 0
    for (let i = 0; i < buffer.length; i++) {
      rms += buffer[i] * buffer[i]
    }
    rms = Math.sqrt(rms / buffer.length)

    // Calculate zero crossing rate (indicates speech vs noise)
    let zeroCrossings = 0
    for (let i = 1; i < buffer.length; i++) {
      if ((buffer[i-1] >= 0) !== (buffer[i] >= 0)) {
        zeroCrossings++
      }
    }
    const zcr = zeroCrossings / buffer.length

    // Speech detection heuristics
    const volumeThreshold = 0.01 // Minimum volume
    const zcrMin = 0.01 // Minimum ZCR for speech
    const zcrMax = 0.3  // Maximum ZCR for speech

    const hasVolume = rms > volumeThreshold
    const hasValidZCR = zcr > zcrMin && zcr < zcrMax
    const hasSpeech = hasVolume && hasValidZCR

    const confidence = hasSpeech ? Math.min(rms * 10, 1.0) : 0

    return {
      hasSpeech,
      confidence,
      rms,
      zcr
    }
  }

  // Check if text is low quality (noise, gibberish, etc.)
  const isLowQualityText = (text: string): boolean => {
    const cleaned = text.trim().toLowerCase()
    
    // Filter out common noise patterns
    const noisePatterns = [
      /^[^\w\s]*$/, // Only special characters
      /^(.)\1{5,}$/, // Repeated characters (aaaaaa)
      /^(um|uh|ah|mm|hmm)\.?$/i, // Filler words only
      /transcribe|translate|immediately|be concise|fast/i, // Our prompt text
      /^[\s\.,!?]*$/, // Only whitespace and punctuation
    ]

    // Check against noise patterns
    for (const pattern of noisePatterns) {
      if (pattern.test(cleaned)) {
        return true
      }
    }

    // Too short or too repetitive
    if (cleaned.length < 3) return true
    
    // Check for excessive repetition
    const words = cleaned.split(/\s+/)
    if (words.length > 3) {
      const uniqueWords = new Set(words)
      if (uniqueWords.size / words.length < 0.5) {
        return true // More than 50% repeated words
      }
    }

    return false
  }

  // Convert Float32Array to WAV (optimized for real-time)
  const floatArrayToWav = (buffer: Float32Array, sampleRate: number): ArrayBuffer => {
    const length = buffer.length
    const arrayBuffer = new ArrayBuffer(44 + length * 2)
    const view = new DataView(arrayBuffer)

    // WAV header (optimized)
    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i))
      }
    }

    writeString(0, 'RIFF')
    view.setUint32(4, 36 + length * 2, true)
    writeString(8, 'WAVE')
    writeString(12, 'fmt ')
    view.setUint32(16, 16, true)
    view.setUint16(20, 1, true)
    view.setUint16(22, 1, true)
    view.setUint32(24, sampleRate, true)
    view.setUint32(28, sampleRate * 2, true)
    view.setUint16(32, 2, true)
    view.setUint16(34, 16, true)
    writeString(36, 'data')
    view.setUint32(40, length * 2, true)

    // Convert float samples to 16-bit PCM (optimized)
    const offset = 44
    for (let i = 0; i < length; i++) {
      const sample = Math.max(-1, Math.min(1, buffer[i]))
      view.setInt16(offset + i * 2, sample * 0x7FFF, true)
    }

    return arrayBuffer
  }

  // Convert ArrayBuffer to Base64 (optimized)
  const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    return btoa(binary)
  }

  // Monitor audio levels with high frequency for real-time feedback
  const startAudioLevelMonitoring = () => {
    const analyser = analyserRef.current
    if (!analyser) return

    const dataArray = new Uint8Array(analyser.frequencyBinCount)
    const timeDataArray = new Uint8Array(analyser.fftSize)
    
    const updateAudioLevel = () => {
      if (!isActiveRef.current) return

      analyser.getByteFrequencyData(dataArray)
      analyser.getByteTimeDomainData(timeDataArray)
      
      // Calculate RMS for accurate level detection
      let rms = 0
      for (let i = 0; i < timeDataArray.length; i++) {
        const sample = (timeDataArray[i] - 128) / 128
        rms += sample * sample
      }
      rms = Math.sqrt(rms / timeDataArray.length)
      
      const level = Math.round(rms * 100)
      setAudioLevel(level)
      
      // Use high frequency updates for real-time feel
      requestAnimationFrame(updateAudioLevel)
    }
    
    updateAudioLevel()
  }

  // Handle recording state changes
  useEffect(() => {
    console.log('🔄 Real Gemini Live state change:', {
      isRecording,
      sessionId,
      currentSession: currentSessionRef.current,
      isActive: isActiveRef.current
    })

    if (isRecording && sessionId) {
      // Always update the current session reference
      console.log('🔄 Updating session reference:', {
        from: currentSessionRef.current,
        to: sessionId
      })
      currentSessionRef.current = sessionId
      
      if (!isActiveRef.current) {
        console.log('🚀 Starting Real Gemini Live session:', sessionId)
        console.log('🔄 Setting isActive to true')
        isActiveRef.current = true
        
        const startRealLiveSession = async () => {
          console.log('🔄 Starting Real Gemini Live session sequence...')
          
          // Step 1: Initialize Gemini Live session
          const geminiConnected = await initializeRealGeminiLive()
          if (!geminiConnected) {
            console.error('❌ Failed to connect to Gemini Live')
            cleanup()
            return
          }
          
          // Ensure connected state is set
          setIsConnected(true)
          console.log('✅ Session connected, isConnected set to true')
          
          // Step 2: Setup audio streaming (only after session is established)
          console.log('🎤 Setting up audio streaming after session establishment...')
          const audioSetup = await setupRealTimeAudioStreaming()
          if (!audioSetup) {
            console.error('❌ Failed to setup audio streaming')
            cleanup()
            return
          }
          
          // Step 3: Ensure everything is active
          isActiveRef.current = true
          setIsConnected(true) // Ensure this is set again
          console.log('✅ Real Gemini Live session fully active!')
          console.log('📊 Session state:', {
            sessionId: currentSessionRef.current,
            isActive: isActiveRef.current,
            isConnected: true, // This should be true now
            isListening: isListening
          })
        }
        
        startRealLiveSession()
      } else {
        console.log('⚠️ Session already active, just updating session ID')
      }
    } else if (!isRecording) {
      console.log('🛑 Stopping Real Gemini Live session')
      isActiveRef.current = false
      currentSessionRef.current = null
      setStatus('Ready to start')
      cleanup()
      
      // End Real Gemini Live session
      if (currentSessionRef.current) {
        console.log('🛑 Ending session:', currentSessionRef.current)
        fetch('/api/gemini-live', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'end',
            sessionId: currentSessionRef.current
          })
        }).catch(console.error)
      }
    }
  }, [isRecording, sessionId])

  return (
    <div className="real-gemini-live-status">
      {process.env.NODE_ENV === 'development' && (
        <div className="text-xs text-gray-500 mb-2 space-y-1">
          <div>🤖 Real Gemini Live API: {status}</div>
          <div>🔗 Connected: {isConnected ? 'Yes' : 'No'} | 🎤 Streaming: {isListening ? 'Yes' : 'No'}</div>
          <div>📋 Session: {sessionId?.substring(0, 8)}... | Active: {isActiveRef.current ? 'Yes' : 'No'}</div>
          <div>🔊 Audio Level: {audioLevel}% {audioLevel > 5 ? '🎵' : '🔇'}</div>
          <div>🔄 Current Session: {currentSessionRef.current?.substring(0, 8) || 'None'}</div>
          <div className="text-blue-600">💰 COST-OPTIMIZED (~1.5s intervals, smart filtering)</div>
          <div className="text-green-600">🎯 HIGH-QUALITY filtering enabled</div>
          {isActiveRef.current && currentSessionRef.current && (
            <div className="text-green-600">✅ Ready for audio processing</div>
          )}
          {(!isActiveRef.current || !currentSessionRef.current) && (
            <div className="text-yellow-600">⚠️ Session not ready for audio processing</div>
          )}
        </div>
      )}
    </div>
  )
} 