"use client"

import { useEffect, useRef, useState, useCallback } from 'react'
import { Mic, MicOff, Volume2 } from 'lucide-react'

interface VadGeminiLiveProps {
  sessionId: string
  onTranscriptUpdate: (text: string, translations: Record<string, string>) => void
  onPartialUpdate?: (text: string) => void
}

export function VadGeminiLive({ 
  sessionId, 
  onTranscriptUpdate, 
  onPartialUpdate 
}: VadGeminiLiveProps) {
  // 상태 관리
  const [isRecording, setIsRecording] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [audioLevel, setAudioLevel] = useState(0)
  
  // Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunkIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const audioLevelIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const isProcessingRef = useRef(false)
  
  // 설정
  const CHUNK_DURATION = 2000 // 2초 청크
  const AUDIO_LEVEL_UPDATE_INTERVAL = 100 // 100ms마다 오디오 레벨 업데이트

  // 오디오 레벨 모니터링
  const updateAudioLevel = useCallback(() => {
    if (!analyserRef.current) return

    const bufferLength = analyserRef.current.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)
    analyserRef.current.getByteFrequencyData(dataArray)

    // RMS 계산
    const rms = Math.sqrt(
      dataArray.reduce((sum, value) => sum + value * value, 0) / bufferLength
    ) / 255

    setAudioLevel(rms)
  }, [])

  // 오디오 세그먼트 처리
  const processAudioSegment = useCallback(async (audioBlob: Blob) => {
    if (audioBlob.size < 1000 || isProcessingRef.current) {
      return
    }

    console.log('🎵 Processing audio segment:', {
      size: `${(audioBlob.size / 1024).toFixed(1)}KB`,
      duration: `~${(audioBlob.size / 16000).toFixed(1)}s`
    })

    isProcessingRef.current = true
    setIsProcessing(true)

    try {
      // Blob을 Base64로 변환
      const arrayBuffer = await audioBlob.arrayBuffer()
      const base64Audio = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))

      // Gemini Live API 호출
      const response = await fetch('/api/gemini-live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'audio',
          sessionId,
          audioData: base64Audio,
          realtime: true,
          audioQuality: {
            confidence: 0.9,
            hasSpeech: true
          }
        })
      })

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`)
      }

      const result = await response.json()
      
      if (result.success && result.result?.transcriptionText) {
        const { transcriptionText, translations } = result.result
        
        console.log('✅ Transcription:', {
          text: transcriptionText,
          translations: Object.keys(translations || {})
        })
        
        // 콜백 호출
        onTranscriptUpdate(transcriptionText, translations || {})
      }

    } catch (error) {
      console.error('❌ Audio processing error:', error)
      setError(`Processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      isProcessingRef.current = false
      setIsProcessing(false)
    }
  }, [sessionId, onTranscriptUpdate])

  // 마이크 초기화
  const initializeMicrophone = useCallback(async () => {
    try {
      console.log('🎤 Initializing microphone...')
      
      // 마이크 권한 요청
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      })

      streamRef.current = stream

      // AudioContext 설정
      audioContextRef.current = new AudioContext({ sampleRate: 16000 })
      const source = audioContextRef.current.createMediaStreamSource(stream)
      analyserRef.current = audioContextRef.current.createAnalyser()
      
      analyserRef.current.fftSize = 2048
      analyserRef.current.smoothingTimeConstant = 0.3
      
      source.connect(analyserRef.current)

      // MediaRecorder 설정
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : 'audio/wav'

      mediaRecorderRef.current = new MediaRecorder(stream, { mimeType })

      // 녹음 이벤트 핸들러
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType })
        if (audioBlob.size > 0) {
          processAudioSegment(audioBlob)
        }
        audioChunksRef.current = []
      }

      // Gemini Live 세션 시작
      const response = await fetch('/api/gemini-live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'start',
          sessionId,
          targetLanguages: ['ko', 'zh', 'hi']
        })
      })

      if (!response.ok) {
        throw new Error(`Failed to start Gemini session: ${response.status}`)
      }

      setIsRecording(true)
      setError(null)
      
      console.log('✅ Microphone initialized')

    } catch (error) {
      console.error('❌ Microphone initialization failed:', error)
      setError(`Microphone access failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }, [sessionId, processAudioSegment])

  // 녹음 시작
  const startRecording = useCallback(() => {
    if (!mediaRecorderRef.current || !isRecording) return

    try {
      audioChunksRef.current = []
      mediaRecorderRef.current.start()
      console.log('🔴 Recording started')
    } catch (error) {
      console.error('❌ Failed to start recording:', error)
    }
  }, [isRecording])

  // 정리 함수
  const cleanup = useCallback(() => {
    console.log('🧹 Cleaning up resources...')
    
    setIsRecording(false)
    setIsProcessing(false)
    setAudioLevel(0)
    setError(null)
    
    // 인터벌 정리
    if (chunkIntervalRef.current) {
      clearInterval(chunkIntervalRef.current)
      chunkIntervalRef.current = null
    }
    
    if (audioLevelIntervalRef.current) {
      clearInterval(audioLevelIntervalRef.current)
      audioLevelIntervalRef.current = null
    }

    // MediaRecorder 정리
    if (mediaRecorderRef.current) {
      try {
        if (mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.stop()
        }
      } catch (e) {
        console.warn('MediaRecorder stop error:', e)
      }
      mediaRecorderRef.current = null
    }

    // 스트림 정리
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        try {
          track.stop()
        } catch (e) {
          console.warn('Track stop error:', e)
        }
      })
      streamRef.current = null
    }

    // AudioContext 정리
    if (audioContextRef.current) {
      try {
        if (audioContextRef.current.state !== 'closed') {
          audioContextRef.current.close()
        }
      } catch (e) {
        console.warn('AudioContext close error:', e)
      }
      audioContextRef.current = null
    }

    // 오디오 청크 정리
    audioChunksRef.current = []
    isProcessingRef.current = false

    // Gemini Live 세션 종료
    fetch('/api/gemini-live', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'end',
        sessionId
      })
    }).catch(console.error)
  }, [sessionId])

  // 컴포넌트 마운트/언마운트
  useEffect(() => {
    initializeMicrophone()
    return cleanup
  }, [initializeMicrophone, cleanup])

  // 청크 기반 녹음 시작
  useEffect(() => {
    if (isRecording) {
      // 정기적으로 청크 생성
      chunkIntervalRef.current = setInterval(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.stop()
          setTimeout(startRecording, 100) // 100ms 후 다시 시작
        } else {
          startRecording()
        }
      }, CHUNK_DURATION)

      // 오디오 레벨 모니터링
      audioLevelIntervalRef.current = setInterval(updateAudioLevel, AUDIO_LEVEL_UPDATE_INTERVAL)
      
      console.log('🔄 Chunk-based recording started')
    }
    
    return () => {
      if (chunkIntervalRef.current) {
        clearInterval(chunkIntervalRef.current)
        chunkIntervalRef.current = null
      }
      if (audioLevelIntervalRef.current) {
        clearInterval(audioLevelIntervalRef.current)
        audioLevelIntervalRef.current = null
      }
    }
  }, [isRecording, startRecording, updateAudioLevel])

  // 오디오 레벨 시각화
  const getAudioLevelColor = () => {
    if (audioLevel < 0.01) return 'bg-gray-300'
    if (audioLevel < 0.03) return 'bg-yellow-400'
    if (audioLevel < 0.06) return 'bg-orange-500'
    return 'bg-red-500'
  }

  const getAudioLevelWidth = () => {
    return Math.min(audioLevel * 200, 100) // 최대 100%
  }

  return (
    <div className="space-y-4">
      {/* 상태 표시 */}
      <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
        <div className="flex items-center space-x-3">
          {/* 마이크 아이콘 */}
          <div className={`p-2 rounded-full ${isRecording ? 'bg-green-100' : 'bg-gray-100'}`}>
            {isRecording ? (
              <Mic className="h-5 w-5 text-green-600" />
            ) : (
              <MicOff className="h-5 w-5 text-gray-400" />
            )}
          </div>
          
          {/* 상태 텍스트 */}
          <div>
            <div className="font-medium">
              {isProcessing ? '🤖 Processing...' : 
               isRecording ? '🎤 Recording' : '❌ Disconnected'}
            </div>
            <div className="text-sm text-gray-500">
              Chunk-based Speech Recognition
            </div>
          </div>
        </div>

        {/* 오디오 레벨 표시 */}
        <div className="flex items-center space-x-2">
          <Volume2 className="h-4 w-4 text-gray-400" />
          <div className="w-20 h-2 bg-gray-200 rounded-full overflow-hidden">
            <div 
              className={`h-full transition-all duration-100 ${getAudioLevelColor()}`}
              style={{ width: `${getAudioLevelWidth()}%` }}
            />
          </div>
        </div>
      </div>

      {/* 에러 표시 */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
          <div className="text-sm text-red-800">{error}</div>
        </div>
      )}

      {/* 설정 정보 */}
      <div className="text-xs text-gray-500 space-y-1">
        <div>• Chunk Duration: {CHUNK_DURATION}ms</div>
        <div>• Audio Level: {(audioLevel * 100).toFixed(1)}%</div>
        <div>• Status: {isRecording ? 'Active' : 'Inactive'}</div>
      </div>
    </div>
  )
} 