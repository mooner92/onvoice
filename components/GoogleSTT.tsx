'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

interface GoogleSTTProps {
  sessionId: string
  isRecording: boolean
  onTranscriptUpdate: (transcript: string, isPartial: boolean) => void
  onError: (error: string) => void
  lang?: string
}

const CHUNK_INTERVAL = 1000 // 1초마다 청크 생성
const MAX_CHUNK_DURATION = 30 // 최대 30초 청크
const SILENCE_THRESHOLD = 0.01 // 무음 감지 임계값
const SILENCE_DURATION = 2000 // 2초 무음 후 청크 처리

export function GoogleSTT({ sessionId, isRecording, onTranscriptUpdate, onError, lang = 'en-US' }: GoogleSTTProps) {
  const [hasPermission, setHasPermission] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [status, setStatus] = useState('Initializing...')

  // Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const silenceStartRef = useRef<number | null>(null)
  const isSpeakingRef = useRef(false)
  const lastSpeechTimeRef = useRef(0)
  const isStartingRef = useRef(false)

  // Request microphone permission
  const requestMicrophonePermission = useCallback(async (): Promise<boolean> => {
    try {
      console.log('🎤 Requesting microphone permission...')
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000,
          channelCount: 1,
        },
      })
      
      stream.getTracks().forEach(track => track.stop())
      setHasPermission(true)
      setStatus('Permission granted')
      console.log('✅ Microphone permission granted')
      return true
    } catch (error) {
      console.error('❌ Microphone permission denied:', error)
      setStatus('Permission denied')
      onError('Microphone permission denied')
      return false
    }
  }, [onError])

  // Cleanup function
  const cleanup = useCallback(() => {
    console.log('🧹 Cleaning up Google STT...')
    
    if (mediaRecorderRef.current) {
      if (mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop()
      }
      mediaRecorderRef.current = null
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }

    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }

    analyserRef.current = null
    audioChunksRef.current = []
    silenceStartRef.current = null
    isSpeakingRef.current = false
    lastSpeechTimeRef.current = 0
    setIsListening(false)
  }, [])

  // Calculate RMS for volume detection
  const calculateRMS = (dataArray: Uint8Array): number => {
    let sum = 0
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i] * dataArray[i]
    }
    return Math.sqrt(sum / dataArray.length) / 255
  }

  // Detect speech activity
  const detectSpeechActivity = useCallback(() => {
    if (!analyserRef.current || !isListening) return

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount)
    analyserRef.current.getByteFrequencyData(dataArray)
    
    const volume = calculateRMS(dataArray)
    const now = Date.now()

    if (volume > SILENCE_THRESHOLD) {
      isSpeakingRef.current = true
      lastSpeechTimeRef.current = now
      silenceStartRef.current = null
    } else if (isSpeakingRef.current) {
      if (!silenceStartRef.current) {
        silenceStartRef.current = now
      } else if (now - silenceStartRef.current > SILENCE_DURATION) {
        isSpeakingRef.current = false
        processAudioChunk()
      }
    }
  }, [isListening])

  // Start audio analysis
  const startAudioAnalysis = useCallback(() => {
    if (!analyserRef.current) return

    const analyzeAudio = () => {
      if (isListening) {
        detectSpeechActivity()
        requestAnimationFrame(analyzeAudio)
      }
    }
    analyzeAudio()
  }, [isListening, detectSpeechActivity])

  // Process audio chunk
  const processAudioChunk = useCallback(() => {
    if (audioChunksRef.current.length === 0) return

    const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
    audioChunksRef.current = []
    
    if (audioBlob.size > 0) {
      sendToGoogleSTT(audioBlob)
    }
  }, [])

  // Send audio to Google Speech-to-Text API
  const sendToGoogleSTT = useCallback(async (audioBlob: Blob) => {
    console.log('🚀 Sending audio chunk to Google Speech-to-Text API...')

    const formData = new FormData()
    formData.append('audio', audioBlob, 'audio.webm')
    formData.append('sessionId', sessionId)
    formData.append('language', lang)
    formData.append('enableGrammarCheck', 'true')
    formData.append('useGemini', 'true')

    try {
      const response = await fetch('/api/google-stt', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        throw new Error(`Google STT API error: ${response.status}`)
      }

      const result = await response.json()
      console.log('✅ Google STT API response:', result)

      if (result.transcript && result.transcript.trim()) {
        onTranscriptUpdate(result.transcript.trim(), false)
      }
    } catch (error) {
      console.error('❌ Google STT API error:', error)
      onError('Google Speech-to-Text failed')
    }
  }, [sessionId, lang, onTranscriptUpdate, onError])

  // Start recording
  const startRecording = useCallback(async () => {
    if (isStartingRef.current || isListening || mediaRecorderRef.current) {
      console.log('⚠️ Already recording or starting, skipping...')
      return
    }

    isStartingRef.current = true
    console.log('🚀 Starting Google STT recording...')

    try {
      // Get permission if needed
      if (!hasPermission) {
        const granted = await requestMicrophonePermission()
        if (!granted) {
          isStartingRef.current = false
          return
        }
      }

      // Get audio stream
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000,
          channelCount: 1,
        },
      })

      streamRef.current = stream

      // Setup audio context for VAD
      audioContextRef.current = new AudioContext({ sampleRate: 16000 })
      const source = audioContextRef.current.createMediaStreamSource(stream)

      // Setup analyser for volume detection
      analyserRef.current = audioContextRef.current.createAnalyser()
      analyserRef.current.fftSize = 2048
      analyserRef.current.smoothingTimeConstant = 0.8

      source.connect(analyserRef.current)

      // Start audio analysis
      startAudioAnalysis()

      // Setup MediaRecorder
      mediaRecorderRef.current = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
        audioBitsPerSecond: 16000,
      })

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
          
          // Check max chunk duration
          const totalDuration = audioChunksRef.current.reduce((total, chunk) => total + chunk.size, 0) / 16000 * 8
          if (totalDuration >= MAX_CHUNK_DURATION) {
            processAudioChunk()
          }
        }
      }

      mediaRecorderRef.current.start(CHUNK_INTERVAL)
      setIsListening(true)
      setStatus('Listening with Google STT...')

      console.log('✅ Google STT recording started')

    } catch (error) {
      console.error('❌ Failed to start Google STT recording:', error)
      setStatus('Failed to start')
      onError('Failed to start Google STT recording')
    } finally {
      isStartingRef.current = false
    }
  }, [hasPermission, isListening, requestMicrophonePermission, startAudioAnalysis, processAudioChunk, onError])

  // Stop recording
  const stopRecording = useCallback(() => {
    console.log('🛑 Stopping Google STT recording...')

    if (mediaRecorderRef.current && isListening) {
      mediaRecorderRef.current.stop()
    }

    // Process any remaining audio chunks
    if (audioChunksRef.current.length > 0) {
      processAudioChunk()
    }

    cleanup()
    setStatus('Ready to start')
  }, [isListening, processAudioChunk, cleanup])

  // Handle recording state changes
  useEffect(() => {
    if (isRecording && sessionId && !isListening && !isStartingRef.current) {
      startRecording()
    } else if (!isRecording && isListening) {
      stopRecording()
    }
  }, [isRecording, sessionId, isListening, startRecording, stopRecording])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup()
    }
  }, [cleanup])

  if (!hasPermission) {
    return (
      <div className='space-y-3'>
        <div className='flex items-center space-x-2 text-sm'>
          <div className='h-3 w-3 rounded-full bg-gray-500' />
          <span className='text-gray-600'>{status}</span>
          <span className='rounded bg-green-100 px-2 py-1 text-xs font-medium text-green-700'>Google STT</span>
        </div>

        <button
          onClick={requestMicrophonePermission}
          className='w-full rounded-lg bg-green-100 px-3 py-2 text-sm text-green-800 hover:bg-green-200'
        >
          🎤 Grant Microphone Permission for Google STT
        </button>
      </div>
    )
  }

  return (
    <div className='space-y-3'>
      <div className='flex items-center space-x-2 text-sm'>
        <div
          className={`h-3 w-3 rounded-full ${
            isListening ? 'animate-pulse bg-green-500' : 'bg-yellow-500'
          }`}
        />
        <span
          className={isListening ? 'font-medium text-green-600' : 'text-yellow-600'}
        >
          {isListening ? '🎤 Listening with Google STT' : status}
        </span>
        <span className='rounded bg-green-100 px-2 py-1 text-xs font-medium text-green-700'>Google STT</span>
      </div>

      {isListening && (
        <div className='rounded-lg border border-green-200 bg-green-50 p-3'>
          <div className='flex items-center space-x-2 text-green-800'>
            <div className='h-2 w-2 animate-pulse rounded-full bg-green-500'></div>
            <span className='text-sm font-medium'>Google STT Active</span>
          </div>
          <p className='mt-1 text-xs text-green-700'>
            🔇 Noise filtering enabled • 🎯 Smart chunking • 🌍 High accuracy
          </p>
        </div>
      )}
    </div>
  )
} 