"use client"

import { useEffect, useRef, useState } from 'react'

interface GeminiLiveWebSocketProps {
  sessionId: string
  isRecording: boolean
  onTranscriptUpdate: (transcript: string, translations: Record<string, string>) => void
  onError: (error: string) => void
  targetLanguages?: string[]
}

export function GeminiLiveWebSocket({ 
  sessionId, 
  isRecording, 
  onTranscriptUpdate, 
  onError,
  targetLanguages = ['ko', 'zh', 'hi']
}: GeminiLiveWebSocketProps) {
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

  // Component cleanup
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      cleanup()
    }
  }, [])

  const cleanup = () => {
    console.log('🧹 Cleaning up Gemini Live...')
    isActiveRef.current = false
    setIsListening(false)
    setIsConnected(false)
    
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

  // Initialize Gemini Live session
  const initializeGeminiLive = async () => {
    try {
      console.log('🚀 Initializing Gemini Live session...')
      setStatus('Connecting to Gemini Live...')
      
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
      console.log('✅ Gemini Live session initialized:', result)
      setIsConnected(true)
      setStatus('Connected to Gemini Live')
      
      return true
      
    } catch (error) {
      console.error('❌ Failed to initialize Gemini Live:', error)
      onError('Failed to connect to Gemini Live')
      setStatus('Connection failed')
      return false
    }
  }

  // Setup real-time audio streaming with Gemini Live
  const setupGeminiLiveStreaming = async () => {
    try {
      console.log('🎤 Setting up Gemini Live real-time streaming...')
      
      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000,
          channelCount: 1
        }
      })

      console.log('✅ Microphone access granted')
      mediaStreamRef.current = stream
      
      // Create audio context for real-time processing
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 16000
      })

      const audioContext = audioContextRef.current
      
      if (audioContext.state === 'suspended') {
        await audioContext.resume()
      }

      const source = audioContext.createMediaStreamSource(stream)
      
      // Create analyser for audio level monitoring
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 256
      analyserRef.current = analyser
      
      source.connect(analyser)

      // Start audio level monitoring
      startAudioLevelMonitoring()

      // Create ScriptProcessorNode for REAL-TIME audio streaming to Gemini Live
      const processor = audioContext.createScriptProcessor(4096, 1, 1)
      processorRef.current = processor
      
      let audioBuffer: Float32Array[] = []
      let bufferLength = 0
      const maxBufferLength = 16000 * 2 // 2 seconds at 16kHz for real-time processing

      processor.onaudioprocess = async (event) => {
        if (!isActiveRef.current) return

        const inputBuffer = event.inputBuffer
        const inputData = inputBuffer.getChannelData(0)
        
        // Add to buffer
        audioBuffer.push(new Float32Array(inputData))
        bufferLength += inputData.length

        // Process when we have enough audio (2 seconds for faster response)
        if (bufferLength >= maxBufferLength) {
          await processAudioBuffer(audioBuffer, bufferLength)
          audioBuffer = []
          bufferLength = 0
        }
      }

      // Connect audio nodes
      source.connect(processor)
      processor.connect(audioContext.destination)

      console.log('✅ Gemini Live real-time streaming setup complete')
      setIsListening(true)
      setStatus('Streaming live to Gemini...')
      
      return true
      
    } catch (error) {
      console.error('❌ Failed to setup Gemini Live streaming:', error)
      onError(`Failed to access microphone: ${error}`)
      setStatus('Microphone error')
      return false
    }
  }

  // Process audio buffer and send to Gemini Live in real-time
  const processAudioBuffer = async (buffer: Float32Array[], length: number) => {
    try {
      console.log('🎵 Processing audio buffer for Gemini Live...', { length })

      // Combine buffer chunks
      const combinedBuffer = new Float32Array(length)
      let offset = 0
      
      for (const chunk of buffer) {
        combinedBuffer.set(chunk, offset)
        offset += chunk.length
      }

      // Convert to WAV format for Gemini Live
      const wavBuffer = floatArrayToWav(combinedBuffer, 16000)
      const base64Audio = arrayBufferToBase64(wavBuffer)

      console.log('📊 Sending audio to Gemini Live:', {
        bufferSize: combinedBuffer.length,
        wavSize: wavBuffer.byteLength,
        base64Length: base64Audio.length
      })

      // Send to Gemini Live API for IMMEDIATE processing
      const response = await fetch('/api/gemini-live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'audio',
          sessionId,
          audioData: base64Audio
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('❌ Gemini Live API error:', response.status, errorText)
        return
      }

      const result = await response.json()
      console.log('✅ Gemini Live response:', result)

      // IMMEDIATE transcript update - no polling needed!
      if (result.success && result.result) {
        const { original, translations } = result.result
        
        if (original?.text && original.text.trim().length > 0) {
          console.log('📝 LIVE transcript received:', original.text)
          // Update UI immediately - this is true real-time!
          onTranscriptUpdate(original.text, translations || {})
        }
      }

    } catch (error) {
      console.error('❌ Error processing audio buffer:', error)
    }
  }

  // Convert Float32Array to WAV
  const floatArrayToWav = (buffer: Float32Array, sampleRate: number): ArrayBuffer => {
    const length = buffer.length
    const arrayBuffer = new ArrayBuffer(44 + length * 2)
    const view = new DataView(arrayBuffer)

    // WAV header
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

    // Convert float samples to 16-bit PCM
    const offset = 44
    for (let i = 0; i < length; i++) {
      const sample = Math.max(-1, Math.min(1, buffer[i]))
      view.setInt16(offset + i * 2, sample * 0x7FFF, true)
    }

    return arrayBuffer
  }

  // Convert ArrayBuffer to Base64
  const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    return btoa(binary)
  }

  // Monitor audio levels
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
      
      requestAnimationFrame(updateAudioLevel)
    }
    
    updateAudioLevel()
  }

  // Handle recording state changes
  useEffect(() => {
    console.log('🔄 Gemini Live state change:', {
      isRecording,
      sessionId,
      currentSession: currentSessionRef.current,
      isActive: isActiveRef.current
    })

    if (isRecording && sessionId) {
      if (currentSessionRef.current !== sessionId) {
        currentSessionRef.current = sessionId
        
        console.log('🚀 Starting Gemini Live session:', sessionId)
        console.log('🔄 Setting isActive to true')
        isActiveRef.current = true
        
        const startLiveSession = async () => {
          const geminiConnected = await initializeGeminiLive()
          if (geminiConnected) {
            const audioSetup = await setupGeminiLiveStreaming()
            if (!audioSetup) {
              cleanup()
            } else {
              // Ensure isActiveRef is true after successful setup
              isActiveRef.current = true
              console.log('✅ Gemini Live session fully active!')
            }
          }
        }
        
        startLiveSession()
      }
    } else if (!isRecording) {
      console.log('🛑 Stopping Gemini Live session')
      isActiveRef.current = false
      currentSessionRef.current = null
      setStatus('Ready to start')
      cleanup()
      
      // End Gemini Live session
      if (sessionId) {
        fetch('/api/gemini-live', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'end',
            sessionId
          })
        }).catch(console.error)
      }
    }
  }, [isRecording, sessionId])

  return (
    <div className="gemini-live-websocket-status">
      {process.env.NODE_ENV === 'development' && (
        <div className="text-xs text-gray-500 mb-2 space-y-1">
          <div>🤖 Gemini Live API: {status}</div>
          <div>🔗 Connected: {isConnected ? 'Yes' : 'No'} | 🎤 Streaming: {isListening ? 'Yes' : 'No'}</div>
          <div>📋 Session: {sessionId?.substring(0, 8)}... | Active: {isActiveRef.current ? 'Yes' : 'No'}</div>
          <div>🔊 Audio Level: {audioLevel}% {audioLevel > 5 ? '🎵' : '🔇'}</div>
          <div className="text-yellow-600">🚀 REAL-TIME Gemini Live (no polling!)</div>
        </div>
      )}
    </div>
  )
} 