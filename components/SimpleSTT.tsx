'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Button } from './ui/button'

interface SimpleSTTProps {
  sessionId: string
  onTranscriptUpdate: (transcript: string, isPartial: boolean) => void
  onError: (error: string) => void
  lang?: string
}

export function SimpleSTT({ sessionId, onTranscriptUpdate, onError, lang = 'en-US' }: SimpleSTTProps) {
  const [isRecording, setIsRecording] = useState(false)
  const [hasPermission, setHasPermission] = useState(false)
  const [status, setStatus] = useState('Initializing...')
  const [chunkCount, setChunkCount] = useState(0) // 🆕 실시간 청크 카운터
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const isProcessingRef = useRef(false)

  // 🎤 마이크 권한 요청
  const requestPermission = useCallback(async () => {
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

  // 🧹 정리 함수
  const cleanup = useCallback(() => {
    console.log('🧹 Cleaning up Simple STT...')
    
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

          audioChunksRef.current = []
      setChunkCount(0) // 🆕 청크 카운터 리셋
      setIsRecording(false)
  }, [])

  // 🎵 오디오 청크 처리
  const processAudioChunk = useCallback(async () => {
    if (audioChunksRef.current.length === 0 || isProcessingRef.current) return

    isProcessingRef.current = true
    console.log('🎵 Processing audio chunk...')

    try {
      // 가장 안정적인 형식 사용
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
      audioChunksRef.current = []
      
      console.log(`📊 Audio blob: ${audioBlob.size} bytes, type: ${audioBlob.type}`)
      
      if (audioBlob.size < 1000) {
        console.log('⚠️ Audio too small, skipping...')
        return
      }

      // Whisper API 호출
      const formData = new FormData()
      formData.append('audio', audioBlob, 'audio.webm')
      formData.append('sessionId', sessionId)
      formData.append('language', lang)
      formData.append('model', 'whisper-1')
      formData.append('response_format', 'verbose_json')
      formData.append('temperature', '0')
      formData.append('prompt', 'This is a lecture or presentation. Focus on clear speech.')
      formData.append('enableGrammarCheck', 'true')

      const response = await fetch('/api/stt', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        throw new Error(`STT API failed: ${response.status}`)
      }

      const result = await response.json()
      console.log('✅ STT result:', result)

      if (result.transcript && result.transcript.trim()) {
        console.log('📝 Updating transcript:', result.transcript.trim())
        onTranscriptUpdate(result.transcript.trim(), false)
      } else {
        console.log('⚠️ No transcript in result:', result)
      }
    } catch (error) {
      console.error('❌ STT processing failed:', error)
      onError('STT processing failed')
    } finally {
      isProcessingRef.current = false
    }
  }, [sessionId, lang, onTranscriptUpdate, onError])

  // 🎤 녹음 시작
  const startRecording = useCallback(async () => {
    if (isRecording) return

    try {
      // 권한 확인
      if (!hasPermission) {
        const granted = await requestPermission()
        if (!granted) return
      }

      // 오디오 스트림 가져오기
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

      // MediaRecorder 설정
      const options = { 
        mimeType: 'audio/webm;codecs=opus',
        audioBitsPerSecond: 16000
      }
      
      mediaRecorderRef.current = new MediaRecorder(stream, options)
      
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          console.log(`🎵 Chunk: ${event.data.size} bytes`)
          audioChunksRef.current.push(event.data)
          setChunkCount(prev => prev + 1) // 🆕 실시간 카운터 업데이트
        }
      }

      mediaRecorderRef.current.onstop = () => {
        console.log('🛑 Recording stopped, processing final chunk...')
        processAudioChunk()
      }

      // 2초마다 청크 생성 (더 빠른 피드백)
      mediaRecorderRef.current.start(2000)
      setIsRecording(true)
      setStatus('Recording...')
      setChunkCount(0) // 카운터 리셋
      
      console.log('✅ Simple STT recording started')

    } catch (error) {
      console.error('❌ Failed to start recording:', error)
      setStatus('Failed to start')
      onError('Failed to start recording')
    }
  }, [hasPermission, isRecording, requestPermission, processAudioChunk, onError])

  // 🛑 녹음 중지
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      setStatus('Ready')
      console.log('🛑 Simple STT recording stopped')
    }
  }, [isRecording])

  // 🧹 컴포넌트 언마운트 시 정리
  useEffect(() => {
    return () => {
      cleanup()
    }
  }, [cleanup])

  if (!hasPermission) {
    return (
      <div className="flex flex-col gap-4 p-4 border rounded-lg">
        <div className="text-sm text-gray-600">{status}</div>
        <Button onClick={requestPermission} className="bg-blue-500 hover:bg-blue-600">
          🎤 Grant Microphone Permission
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 p-4 border rounded-lg">
      <div className="flex items-center gap-4">
        <Button
          onClick={isRecording ? stopRecording : startRecording}
          className={isRecording ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'}
        >
          {isRecording ? '🛑 Stop' : '🎤 Start'} Simple STT
        </Button>
        
        <div className="text-sm text-gray-600">
          {isRecording ? '🔴 Recording...' : '⚪ Ready'}
        </div>
      </div>
      
      <div className="text-xs text-gray-500">
        <div>Status: {status}</div>
        <div>Chunks: {chunkCount}</div>
        <div>Processing: {isProcessingRef.current ? 'Yes' : 'No'}</div>
        <div>Session ID: {sessionId.substring(0, 8)}...</div>
      </div>
    </div>
  )
} 