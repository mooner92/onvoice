import React, { useState, useRef, useCallback, useEffect } from 'react'
import { Button } from './ui/button'

interface AudioBufferSTTProps {
  sessionId: string
  onTranscriptUpdate: (transcript: string, isPartial: boolean) => void
  language?: string
}

interface AudioChunk {
  id: string
  audioBlob: Blob
  timestamp: number
  duration: number
  isPartial: boolean
}

interface ProcessedTranscript {
  id: string
  text: string
  confidence: number
  startTime: number
  endTime: number
  isComplete: boolean
}

export default function AudioBufferSTT({ sessionId, onTranscriptUpdate, language = 'en-US' }: AudioBufferSTTProps) {
  const [isRecording, setIsRecording] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [currentTranscript, setCurrentTranscript] = useState('')
  
  // Audio Buffer 관련 상태
  const audioBuffer = useRef<AudioChunk[]>([])
  const processedTranscripts = useRef<ProcessedTranscript[]>([])
  const mediaRecorder = useRef<MediaRecorder | null>(null)
  const audioContext = useRef<AudioContext | null>(null)
  const analyser = useRef<AnalyserNode | null>(null)
  const microphone = useRef<MediaStreamAudioSourceNode | null>(null)
  
  // 청킹 설정
  const CHUNK_INTERVAL = 2000 // 2초마다 청크 생성
  const BUFFER_DURATION = 8000 // 8초 버퍼 유지
  const SILENCE_THRESHOLD = -50 // dB
  const SILENCE_DURATION = 1500 // 1.5초 침묵 감지
  const OVERLAP_DURATION = 1000 // 1초 오버랩
  
  // 실시간 음성 분석
  const silenceStartTime = useRef<number | null>(null)
  const lastSpeechTime = useRef<number>(Date.now())
  const isSpeaking = useRef<boolean>(false)

  // 🎯 스마트 청킹: 문맥 기반 청크 분할
  const shouldCreateChunk = useCallback((currentTime: number): boolean => {
    const timeSinceLastSpeech = currentTime - lastSpeechTime.current
    const bufferSize = audioBuffer.current.reduce((total, chunk) => total + chunk.duration, 0)
    
    // 1. 침묵 감지 (문장 끝)
    if (timeSinceLastSpeech > SILENCE_DURATION && isSpeaking.current) {
      console.log('🔇 Silence detected - creating chunk')
      return true
    }
    
    // 2. 버퍼 크기 제한
    if (bufferSize > BUFFER_DURATION) {
      console.log('📦 Buffer full - creating chunk')
      return true
    }
    
    // 3. 정기적 청킹 (긴 문장 대비)
    if (timeSinceLastSpeech > CHUNK_INTERVAL && bufferSize > 3000) {
      console.log('⏰ Regular chunking - creating chunk')
      return true
    }
    
    return false
  }, [])

  // 🎵 실시간 음성 레벨 분석
  const analyzeAudioLevel = useCallback(() => {
    if (!analyser.current) return

    const dataArray = new Uint8Array(analyser.current.frequencyBinCount)
    analyser.current.getByteFrequencyData(dataArray)
    
    // 평균 볼륨 계산
    const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length
    const db = 20 * Math.log10(average / 255)
    
    const currentTime = Date.now()
    
    if (db > SILENCE_THRESHOLD) {
      // 음성 감지
      if (!isSpeaking.current) {
        console.log('🎤 Speech started')
        isSpeaking.current = true
      }
      lastSpeechTime.current = currentTime
      silenceStartTime.current = null
    } else {
      // 침묵 감지
      if (isSpeaking.current && !silenceStartTime.current) {
        silenceStartTime.current = currentTime
      }
      
      // 침묵 지속 시간 체크
      if (silenceStartTime.current && currentTime - silenceStartTime.current > SILENCE_DURATION) {
        isSpeaking.current = false
        console.log('🔇 Speech ended')
      }
    }
  }, [])

  // 🎯 스마트 청크 생성
  const createSmartChunk = useCallback(async (): Promise<void> => {
    if (audioBuffer.current.length === 0) return

    setIsProcessing(true)
    
    try {
      // 오버랩을 고려한 청크 생성
      const chunks = audioBuffer.current
      const totalDuration = chunks.reduce((sum, chunk) => sum + chunk.duration, 0)
      
      // 마지막 청크의 끝 부분을 다음 청크에 포함 (오버랩)
      const overlapStart = Math.max(0, totalDuration - OVERLAP_DURATION)
      
      // 청크들을 하나로 병합
      const mergedBlob = new Blob(chunks.map(chunk => chunk.audioBlob), { type: 'audio/webm' })
      
      console.log(`🎵 Creating smart chunk: ${chunks.length} chunks, ${totalDuration}ms duration`)
      
      // Whisper API 호출
      const transcript = await sendToWhisper(mergedBlob, language)
      
      if (transcript) {
        // 문맥 기반 후처리
        const processedText = await processTranscriptWithContext(transcript)
        
        // 완전한 문장인지 판단
        const isComplete = isCompleteSentence(processedText)
        
        const processedTranscript: ProcessedTranscript = {
          id: `transcript_${Date.now()}`,
          text: processedText,
          confidence: transcript.confidence || 0.8,
          startTime: chunks[0].timestamp,
          endTime: chunks[chunks.length - 1].timestamp + chunks[chunks.length - 1].duration,
          isComplete
        }
        
        processedTranscripts.current.push(processedTranscript)
        
        // 클라이언트에 업데이트
        const fullTranscript = processedTranscripts.current
          .filter(t => t.isComplete)
          .map(t => t.text)
          .join(' ')
        
        setCurrentTranscript(fullTranscript)
        onTranscriptUpdate(fullTranscript, !isComplete)
        
        console.log(`✅ Smart chunk processed: "${processedText}" (complete: ${isComplete})`)
      }
      
      // 오버랩 부분만 버퍼에 유지
      if (chunks.length > 1) {
        const lastChunk = chunks[chunks.length - 1]
        audioBuffer.current = [lastChunk]
      } else {
        audioBuffer.current = []
      }
      
    } catch (error) {
      console.error('❌ Smart chunk processing failed:', error)
    } finally {
      setIsProcessing(false)
    }
  }, [language, onTranscriptUpdate])

  // 🧠 문맥 기반 후처리
  const processTranscriptWithContext = useCallback(async (transcript: any): Promise<string> => {
    const currentText = transcript.text.trim()
    
    // 이전 문맥과 결합하여 문장 완성도 향상
    const previousTranscripts = processedTranscripts.current
      .filter(t => t.isComplete)
      .slice(-3) // 최근 3개 문장만 참조
    
    const context = previousTranscripts.map(t => t.text).join(' ')
    
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

  // 🎤 Whisper API 호출
  const sendToWhisper = useCallback(async (audioBlob: Blob, targetLanguage: string): Promise<any> => {
    const formData = new FormData()
    formData.append('audio', audioBlob, 'audio.webm')
    formData.append('language', targetLanguage)
    formData.append('sessionId', sessionId)
    
    try {
      const response = await fetch('/api/stt', {
        method: 'POST',
        body: formData
      })
      
      if (response.ok) {
        const result = await response.json()
        return result
      } else {
        throw new Error(`STT API failed: ${response.status}`)
      }
    } catch (error) {
      console.error('Whisper API error:', error)
      throw error
    }
  }, [sessionId])

  // 🎵 오디오 스트림 처리
  const handleAudioData = useCallback((event: BlobEvent) => {
    const audioBlob = event.data
    const currentTime = Date.now()
    
    // 청크 정보 생성
    const chunk: AudioChunk = {
      id: `chunk_${currentTime}`,
      audioBlob,
      timestamp: currentTime,
      duration: CHUNK_INTERVAL,
      isPartial: true
    }
    
    audioBuffer.current.push(chunk)
    
    // 스마트 청킹 조건 확인
    if (shouldCreateChunk(currentTime)) {
      createSmartChunk()
    }
  }, [shouldCreateChunk, createSmartChunk])

  // 🎤 녹음 시작
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      
      // Audio Context 설정
      audioContext.current = new AudioContext()
      analyser.current = audioContext.current.createAnalyser()
      microphone.current = audioContext.current.createMediaStreamSource(stream)
      
      microphone.current.connect(analyser.current)
      analyser.current.fftSize = 256
      
      // 실시간 음성 분석 시작
      const analyzeInterval = setInterval(analyzeAudioLevel, 100)
      
      // MediaRecorder 설정
      const options = { mimeType: 'audio/webm;codecs=opus' }
      mediaRecorder.current = new MediaRecorder(stream, options)
      
      mediaRecorder.current.ondataavailable = handleAudioData
      mediaRecorder.current.start(CHUNK_INTERVAL)
      
      setIsRecording(true)
      console.log('🎤 Audio Buffer STT started')
      
      // 정리 함수 저장
      return () => {
        clearInterval(analyzeInterval)
        stream.getTracks().forEach(track => track.stop())
      }
      
    } catch (error) {
      console.error('Failed to start recording:', error)
    }
  }, [handleAudioData, analyzeAudioLevel])

  // 🛑 녹음 중지
  const stopRecording = useCallback(() => {
    if (mediaRecorder.current && isRecording) {
      mediaRecorder.current.stop()
      setIsRecording(false)
      
      // 마지막 청크 처리
      if (audioBuffer.current.length > 0) {
        createSmartChunk()
      }
      
      console.log('🛑 Audio Buffer STT stopped')
    }
  }, [isRecording, createSmartChunk])

  // 🧹 정리
  useEffect(() => {
    return () => {
      if (audioContext.current) {
        audioContext.current.close()
      }
    }
  }, [])

  return (
    <div className="flex flex-col gap-4 p-4 border rounded-lg">
      <div className="flex items-center gap-4">
        <Button
          onClick={isRecording ? stopRecording : startRecording}
          disabled={isProcessing}
          className={isRecording ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-500 hover:bg-blue-600'}
        >
          {isRecording ? '🛑 Stop' : '🎤 Start'} Audio Buffer STT
        </Button>
        
        {isProcessing && (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
            Processing...
          </div>
        )}
      </div>
      
      <div className="text-sm text-gray-600">
        <div>🎵 Buffer: {audioBuffer.current.length} chunks</div>
        <div>📝 Processed: {processedTranscripts.current.length} transcripts</div>
        <div>🎤 Speaking: {isSpeaking.current ? 'Yes' : 'No'}</div>
      </div>
      
      {currentTranscript && (
        <div className="p-3 bg-gray-50 rounded border">
          <div className="text-sm font-medium text-gray-700 mb-2">Current Transcript:</div>
          <div className="text-gray-900">{currentTranscript}</div>
        </div>
      )}
    </div>
  )
} 