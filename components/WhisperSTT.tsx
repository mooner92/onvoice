'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

interface WhisperSTTProps {
  sessionId: string
  isRecording: boolean
  onTranscriptUpdate: (transcript: string, isPartial: boolean) => void
  onError: (error: string) => void
  lang?: string
}

// 🎯 Audio Buffer 기반 스마트 청킹 설정
const CHUNK_INTERVAL = 2000 // 2초마다 청크 생성 (더 안정적인 청킹)
const MAX_CHUNK_DURATION = 8000 // 최대 8초 청크 (문장 완성도 향상)
const SILENCE_THRESHOLD = 0.015 // 무음 감지 임계값 (조정 가능)
const SILENCE_DURATION = 1500 // 1.5초 무음 후 청크 처리 (문장 끝 감지)
// const MIN_SPEECH_DURATION = 500 // 최소 0.5초 음성 (노이즈 필터링)
const OVERLAP_DURATION = 1000 // 1초 오버랩 (문장 연결)
const BUFFER_MAX_SIZE = 12000 // 12초 버퍼 최대 크기

export function WhisperSTT({ sessionId, isRecording, onTranscriptUpdate, onError, lang = 'en-US' }: WhisperSTTProps) {
  const [hasPermission, setHasPermission] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [status, setStatus] = useState('Initializing...')

  // 🎵 Audio Buffer 관련 상태
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const audioBufferRef = useRef<Blob[]>([]) // 🆕 Audio Buffer
  const processedTranscriptsRef = useRef<string[]>([]) // 🆕 처리된 트랜스크립트
  const silenceStartRef = useRef<number | null>(null)
  const isSpeakingRef = useRef(false)
  const lastSpeechTimeRef = useRef(0)
  const isStartingRef = useRef(false)
  const isProcessingRef = useRef(false)
  const bufferStartTimeRef = useRef(0) // 🆕 버퍼 시작 시간

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
    console.log('🧹 Cleaning up Whisper STT...')
    
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
    audioBufferRef.current = [] // 🆕 Audio Buffer 정리
    processedTranscriptsRef.current = [] // 🆕 처리된 트랜스크립트 정리
    bufferStartTimeRef.current = 0 // 🆕 버퍼 시작 시간 정리
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

  // 🎯 스마트 청킹: 문맥 기반 청크 분할
  const shouldProcessBuffer = useCallback((currentTime: number): boolean => {
    const bufferDuration = currentTime - bufferStartTimeRef.current
    const timeSinceLastSpeech = currentTime - lastSpeechTimeRef.current
    
    // 1. 침묵 감지 (문장 끝)
    if (timeSinceLastSpeech > SILENCE_DURATION && isSpeakingRef.current) {
      console.log('🔇 Silence detected - processing buffer')
      return true
    }
    
    // 2. 버퍼 크기 제한
    if (bufferDuration > BUFFER_MAX_SIZE) {
      console.log('📦 Buffer full - processing buffer')
      return true
    }
    
    // 3. 정기적 처리 (긴 문장 대비)
    if (bufferDuration > MAX_CHUNK_DURATION && audioBufferRef.current.length > 0) {
      console.log('⏰ Regular processing - processing buffer')
      return true
    }
    
    return false
  }, [])

  // 🎵 Audio Buffer 처리
  const processAudioBuffer = useCallback(() => {
    if (audioBufferRef.current.length === 0) return

    // Use the MIME type from MediaRecorder
    const mimeType = mediaRecorderRef.current?.mimeType || 'audio/webm'
    const audioBlob = new Blob(audioBufferRef.current, { type: mimeType })
    
    console.log(`🎵 Processing audio buffer: ${audioBufferRef.current.length} chunks, ${audioBlob.size} bytes`)
    
    if (audioBlob.size > 0) {
      sendToWhisper(audioBlob)
    }
    
    // 오버랩을 위해 마지막 청크 유지
    if (audioBufferRef.current.length > 1) {
      audioBufferRef.current = audioBufferRef.current.slice(-1)
      bufferStartTimeRef.current = Date.now() - OVERLAP_DURATION
    } else {
      audioBufferRef.current = []
      bufferStartTimeRef.current = 0
    }
  }, [])

  // 🎯 스마트 청킹 (기존 processAudioChunk 대체)
  const processAudioChunk = useCallback(() => {
    if (audioChunksRef.current.length === 0) return

    // 청크를 버퍼에 추가
    audioBufferRef.current.push(...audioChunksRef.current)
    audioChunksRef.current = []
    
    // 버퍼 시작 시간 설정
    if (bufferStartTimeRef.current === 0) {
      bufferStartTimeRef.current = Date.now()
    }
    
    // 스마트 청킹 조건 확인
    if (shouldProcessBuffer(Date.now())) {
      processAudioBuffer()
    }
  }, [shouldProcessBuffer, processAudioBuffer])

  // Send audio to Whisper API
  const sendToWhisper = useCallback(async (audioBlob: Blob) => {
    console.log('🚀 Sending audio chunk to Whisper API...')

    // 중복 전송 방지를 위한 디바운싱
    if (isProcessingRef.current) {
      console.log('⚠️ Skipping chunk - already processing')
      return
    }
    
    isProcessingRef.current = true

    const formData = new FormData()
    // Use the actual MIME type from the blob
    const fileExtension = audioBlob.type.includes('webm') ? 'webm' : 
                         audioBlob.type.includes('mp4') ? 'm4a' : 
                         audioBlob.type.includes('wav') ? 'wav' : 'webm'
    formData.append('audio', audioBlob, `audio.${fileExtension}`)
    formData.append('sessionId', sessionId)
    formData.append('model', 'whisper-1')
    formData.append('language', lang)
    formData.append('response_format', 'verbose_json')
    formData.append('temperature', '0')
    formData.append('prompt', 'This is a lecture or presentation. Focus on clear speech and ignore background noise.')
    formData.append('enableGrammarCheck', 'true')
    formData.append('useGemini', 'true')

    try {
      const response = await fetch('/api/stt', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        throw new Error(`Whisper API error: ${response.status}`)
      }

      const result = await response.json()
      console.log('✅ Whisper API response:', result)

      if (result.transcript && result.transcript.trim()) {
        const processedText = await processTranscriptWithContext(result.transcript.trim())
        processedTranscriptsRef.current.push(processedText)
        
        // 전체 트랜스크립트 조합
        const fullTranscript = processedTranscriptsRef.current.join(' ')
        onTranscriptUpdate(fullTranscript, false)
        
        console.log(`✅ Processed transcript: "${processedText}"`)
        console.log(`📝 Full transcript: "${fullTranscript}"`)
      }
    } catch (error) {
      console.error('❌ Whisper API error:', error)
      onError('Whisper transcription failed')
    } finally {
      isProcessingRef.current = false
    }
  }, [sessionId, lang, onTranscriptUpdate, onError])

  // 🧠 문맥 기반 후처리
  const processTranscriptWithContext = useCallback(async (transcript: string): Promise<string> => {
    const currentText = transcript.trim()
    
    // 이전 문맥과 결합하여 문장 완성도 향상
    const previousTranscripts = processedTranscriptsRef.current.slice(-3) // 최근 3개 문장만 참조
    const context = previousTranscripts.join(' ')
    
    if (context && !isCompleteSentence(currentText)) {
      // Gemini를 사용하여 문맥 기반 문장 완성
      try {
        const prompt = `다음은 음성 인식 결과입니다. 문맥을 고려하여 자연스럽게 문장을 완성해주세요:

이전 문맥: "${context}"
현재 인식: "${currentText}"

완성된 문장만 반환해주세요.`

        const response = await fetch('/api/complete-sentence', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt })
        })
        
        if (response.ok) {
          const result = await response.json()
          return result.completedText || currentText
        }
      } catch (error) {
        console.error('Sentence completion failed:', error)
      }
    }
    
    return currentText
  }, [])

  // 📝 완전한 문장 판단
  const isCompleteSentence = useCallback((text: string): boolean => {
    const trimmed = text.trim()
    
    // 문장 부호로 끝나는지 확인
    if (/[.!?]$/.test(trimmed)) return true
    
    // 일반적인 문장 끝 패턴 확인
    const endPatterns = [
      /(thank you|thanks)$/i,
      /(goodbye|bye)$/i,
      /(that's all|that is all)$/i,
      /(the end)$/i
    ]
    
    if (endPatterns.some(pattern => pattern.test(trimmed))) return true
    
    // 문장 길이와 구조 분석
    const words = trimmed.split(' ')
    if (words.length >= 5 && words.length <= 50) {
      // 주어-동사 구조 확인 (간단한 버전)
      const hasSubject = /^(I|you|he|she|it|we|they|this|that|there)/i.test(trimmed)
      const hasVerb = /\b(am|is|are|was|were|have|has|had|do|does|did|can|could|will|would|should|may|might)\b/i.test(trimmed)
      
      if (hasSubject && hasVerb) return true
    }
    
    return false
  }, [])

  // Start recording
  const startRecording = useCallback(async () => {
    if (isStartingRef.current || isListening || mediaRecorderRef.current) {
      console.log('⚠️ Already recording or starting, skipping...')
      return
    }

    isStartingRef.current = true
    console.log('🚀 Starting Whisper STT recording...')

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

      // 🎵 MediaRecorder 설정 - 더 안정적인 형식 사용
      let mimeType = 'audio/webm;codecs=opus'
      
      // Whisper API와 호환되는 형식 우선순위
      const formats = [
        'audio/webm;codecs=opus',  // 최고 품질
        'audio/webm',              // 기본 webm
        'audio/mp4',               // MP4
        'audio/wav'                // WAV
      ]
      
      // 지원되는 형식 찾기
      for (const format of formats) {
        if (MediaRecorder.isTypeSupported(format)) {
          mimeType = format
          console.log(`✅ Using audio format: ${format}`)
          break
        }
      }
      
      // 지원되는 형식이 없으면 기본값 사용
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/webm'
        console.log(`⚠️ Using fallback format: ${mimeType}`)
      }
      
      // 지원되는 형식 로깅
      console.log(`🎵 Final MIME type: ${mimeType}`)
      console.log(`🎵 Supported formats:`, formats.map(f => `${f}: ${MediaRecorder.isTypeSupported(f)}`))
      
      // MediaRecorder 설정 - 더 높은 품질
      mediaRecorderRef.current = new MediaRecorder(stream, {
        mimeType: mimeType,
        audioBitsPerSecond: 32000, // 더 높은 비트레이트
      })

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          console.log(`🎵 Audio chunk received: ${event.data.size} bytes, type: ${event.data.type}`)
          audioChunksRef.current.push(event.data)
          
          // 청크 크기 기반 처리 (더 정확한 계산)
          const totalSize = audioChunksRef.current.reduce((total, chunk) => total + chunk.size, 0)
          const estimatedDuration = (totalSize / 32000) * 8 // 32kbps 기준
          
          console.log(`📊 Buffer stats: ${audioChunksRef.current.length} chunks, ${totalSize} bytes, ~${Math.round(estimatedDuration)}ms`)
          
          if (estimatedDuration >= MAX_CHUNK_DURATION) {
            console.log('⏰ Max duration reached, processing chunk...')
            processAudioChunk()
          }
        }
      }

      mediaRecorderRef.current.start(CHUNK_INTERVAL)
      setIsListening(true)
      setStatus('Listening with Whisper...')

      console.log('✅ Whisper STT recording started')

    } catch (error) {
      console.error('❌ Failed to start Whisper STT recording:', error)
      setStatus('Failed to start')
      onError('Failed to start Whisper STT recording')
    } finally {
      isStartingRef.current = false
    }
  }, [hasPermission, isListening, requestMicrophonePermission, startAudioAnalysis, processAudioChunk, onError])

  // Stop recording
  const stopRecording = useCallback(() => {
    console.log('🛑 Stopping Whisper STT recording...')

    if (mediaRecorderRef.current && isListening) {
      mediaRecorderRef.current.stop()
    }

    // Process any remaining audio chunks and buffer
    if (audioChunksRef.current.length > 0) {
      processAudioChunk()
    }
    
    // Process any remaining audio buffer
    if (audioBufferRef.current.length > 0) {
      processAudioBuffer()
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
          <span className='rounded bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700'>Whisper STT</span>
        </div>

        <button
          onClick={requestMicrophonePermission}
          className='w-full rounded-lg bg-blue-100 px-3 py-2 text-sm text-blue-800 hover:bg-blue-200'
        >
          🎤 Grant Microphone Permission for Whisper STT
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
          {isListening ? '🎤 Listening with Whisper' : status}
        </span>
        <span className='rounded bg-purple-100 px-2 py-1 text-xs font-medium text-purple-700'>Whisper STT</span>
      </div>

      {isListening && (
        <div className='rounded-lg border border-purple-200 bg-purple-50 p-3'>
          <div className='flex items-center space-x-2 text-purple-800'>
            <div className='h-2 w-2 animate-pulse rounded-full bg-purple-500'></div>
            <span className='text-sm font-medium'>Whisper STT Active</span>
          </div>
          <p className='mt-1 text-xs text-purple-700'>
            🔇 Noise filtering enabled • 🎯 Smart chunking • 🌍 High accuracy
          </p>
        </div>
      )}
    </div>
  )
} 