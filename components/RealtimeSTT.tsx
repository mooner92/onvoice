'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'

// Web Speech API 타입 정의
declare global {
  interface Window {
    webkitSpeechRecognition: any
    SpeechRecognition: any
  }
}

interface RealtimeSTTProps {
  sessionId: string
  onTranscriptUpdate: (transcript: string, isPartial: boolean) => void
  onError: (error: string) => void
  primaryLanguage?: string
  secondaryLanguage?: string
}

export function RealtimeSTT({ 
  sessionId, 
  onTranscriptUpdate, 
  onError, 
  primaryLanguage = 'en-US', 
  secondaryLanguage = 'ko-KR' 
}: RealtimeSTTProps) {
  const [isRecording, setIsRecording] = useState(false)
  const [status, setStatus] = useState('Ready')
  const [currentTranscript, setCurrentTranscript] = useState('')
  const [chunks, setChunks] = useState(0)
  const [duplicatesBlocked] = useState(0)
  const [autoReconnect] = useState('Scheduled')

  // Web Speech API 관련 refs
  const recognitionRef = useRef<any>(null)
  const isListeningRef = useRef(false)
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null)

  // 🎯 적응형 버퍼링 시스템 (Otter AI 스타일)
  const adaptiveBufferRef = useRef('')
  const confidenceScoresRef = useRef<Array<{text: string, confidence: number, timestamp: number}>>([])
  const lastProcessedRef = useRef<string>('')
  const bufferStartTimeRef = useRef<number>(0)
  const semanticTimerRef = useRef<NodeJS.Timeout | null>(null)
  
  // 적응형 설정 (실시간성과 정확도 균형)
  const MIN_BUFFER_SIZE = 15        // 최소 15자 (짧은 문장도 처리하면서 정확도 향상)
  const MAX_BUFFER_SIZE = 60        // 최대 60자 (오타 감소를 위해 더 작게 조정)
  const SEMANTIC_TIMEOUT = 600      // 0.6초 후 처리 (빠른 응답으로 실시간성 향상)
  const OVERLAP_SIZE = 20           // 20자 오버랩 (적절한 중복 제거)
  
  // 침묵 감지를 위한 오디오 분석
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const silenceDetectionRef = useRef<NodeJS.Timeout | null>(null)
  const lastSpeechTimeRef = useRef<number>(Date.now())
  const SILENCE_THRESHOLD = -50 // dB 기준 (조정 가능)
  const SILENCE_DURATION = 2000 // 2초 침묵 감지
  
  // 🔄 4분마다 자동 재연결 시스템
  const lastReconnectTimeRef = useRef<number>(Date.now())
  const RECONNECT_INTERVAL = 4 * 60 * 1000 // 4분 (240초)

  // Web Speech API 지원 확인
  const isSupported = typeof window !== 'undefined' && 'webkitSpeechRecognition' in window

  // 언어 설정
  const [currentPrimaryLanguage, setCurrentPrimaryLanguage] = useState(primaryLanguage)
  const [currentSecondaryLanguage, setCurrentSecondaryLanguage] = useState(secondaryLanguage)

  // 🎯 오디오 레벨 분석 및 침묵 감지
  const analyzeAudioLevel = useCallback(() => {
    if (!analyserRef.current) return false
    
    const bufferLength = analyserRef.current.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)
    analyserRef.current.getByteFrequencyData(dataArray)
    
    // 평균 볼륨 계산
    let sum = 0
    for (let i = 0; i < bufferLength; i++) {
      sum += dataArray[i]
    }
    const average = sum / bufferLength
    
    // dB로 변환
    const decibels = 20 * Math.log10(average / 255)
    
    const isSpeaking = decibels > SILENCE_THRESHOLD
    if (isSpeaking) {
      lastSpeechTimeRef.current = Date.now()
    }
    
    return isSpeaking
  }, [])
  
  // 🔄 4분마다 부드러운 자동 재연결 타이머
  // 4분마다 예방적 재연결 (5분 제한 방지) - 중복 DB 저장 방지
  const startAutoReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current)
    }
    
    console.log(`🔄 Setting up 4-minute preventive reconnection timer (${RECONNECT_INTERVAL/1000}s)`)
    
    reconnectTimerRef.current = setTimeout(() => {
      console.log('🔄 4분 경과 - 예방적 재연결 시작 (5분 제한 방지)')
      
      // 현재 버퍼의 내용을 먼저 처리 (중복 DB 저장 방지)
      if (adaptiveBufferRef.current.trim()) {
        console.log('📦 Processing remaining buffer before preventive reconnection')
        // 강제 처리하되 새로운 세션을 시작하지 않음
        processChunk(adaptiveBufferRef.current, true)
        adaptiveBufferRef.current = ''
      }
      
      // 현재 인식 중지하고 즉시 재시작 (세션 유지)
      if (recognitionRef.current) {
        try {
          console.log('🔄 Stopping current recognition for preventive restart')
          recognitionRef.current.stop()
          // onend 이벤트에서 자동으로 재시작됨 (세션 유지)
        } catch (error) {
          console.warn('🔄 Error stopping recognition for preventive restart:', error)
        }
      }

      // 다음 재연결 타이머 설정
      console.log('🔄 Setting up next 4-minute preventive reconnection timer')
      startAutoReconnectTimer()
    }, RECONNECT_INTERVAL)
    
    lastReconnectTimeRef.current = Date.now()
  }, [isRecording])

  // 🎯 침묵 모니터링 시작 (더 적극적으로)
  const startSilenceDetection = useCallback(() => {
    const checkSilence = () => {
      const isSpeaking = analyzeAudioLevel()
      const timeSinceLastSpeech = Date.now() - lastSpeechTimeRef.current
      
      // 2초 이상 침묵이면 현재 버퍼 강제 처리
      if (!isSpeaking && timeSinceLastSpeech > SILENCE_DURATION) {
        console.log('🔇 Silence detected, forcing chunk processing')
        if (adaptiveBufferRef.current.trim()) {
          processChunk(adaptiveBufferRef.current, true) // 강제 처리 플래그
          adaptiveBufferRef.current = ''
        }
        lastSpeechTimeRef.current = Date.now() // 리셋하여 반복 방지
      }
      
      // 계속 모니터링 (더 자주 체크)
      if (isRecording) {
        silenceDetectionRef.current = setTimeout(checkSilence, 50) // 50ms마다 체크 (100ms → 50ms)
      }
    }
    
    checkSilence()
  }, [isRecording])
  
  // 🎯 문장 완성 체크 (균형잡힌 버전)
  const isCompleteSentence = (text: string): boolean => {
    const trimmed = text.trim()
    if (!trimmed) return false
    
    // 문장 끝 부호가 있는지 확인 (가장 확실한 신호)
    const hasEndPunctuation = /[.!?。！？]/.test(trimmed.slice(-1))
    
    // 최소 길이 확인 (더 낮춤)
    const hasMinimumLength = trimmed.length > 5
    
    // 자연어 패턴 확인
    const hasWordPattern = /\w/.test(trimmed)
    
    // 쉼표나 자연스러운 휴식이 있는지 확인
    const hasNaturalBreak = /[,，、]/.test(trimmed)
    
    // 길이 기반 분할 (50자 이상이면 강제로 완성된 것으로 간주) - 더 적극적
    const isLengthForced = trimmed.length > 50
    
    // 시간 기반 강제 분할 (8초 이상이면 강제로 완성된 것으로 간주) - 더 적극적
    const timeSinceLastSpeech = Date.now() - lastSpeechTimeRef.current
    const isTimeForced = timeSinceLastSpeech > 8000 && trimmed.length > 20
    
    // 단어 수 기반 분할 (8개 단어 이상이면 완성된 것으로 간주) - 더 적극적
    const wordCount = trimmed.split(/\s+/).length
    const isWordCountForced = wordCount > 8
    
    // 더 적극적인 조건들
    return (hasEndPunctuation && hasMinimumLength) || 
           (hasNaturalBreak && trimmed.length > 15) || // 쉼표 기준도 낮춤
           isLengthForced ||
           isTimeForced ||
           isWordCountForced
  }

  // 🎯 문장 분할 및 전송 (더 유연한 버전)
  const processCompleteSentences = (text: string): string => {
    const trimmed = text.trim()
    if (!trimmed) return ''
    
    // 문장 끝 부호로 분할
    const sentences = trimmed.split(/(?<=[.!?。！？])\s+/)
    
    if (sentences.length > 1) {
      // 완전한 문장들을 전송
      const completeSentences = sentences.slice(0, -1)
      completeSentences.forEach(sentence => {
        if (sentence.trim()) {
          console.log('✅ Complete sentence detected:', sentence.trim())
          sendToSTTStream(sentence.trim())
        }
      })
      
      // 남은 부분 반환
      return sentences[sentences.length - 1] || ''
    }
    
    // 길이 기반 강제 분할 (50자 이상) - 더 적극적
    if (trimmed.length > 50) {
      // 중간에서 자연스럽게 분할
      const midPoint = Math.floor(trimmed.length / 2)
      const splitPoint = trimmed.lastIndexOf(' ', midPoint) || 
                        trimmed.lastIndexOf(',', midPoint) ||
                        trimmed.lastIndexOf('，', midPoint) ||
                        midPoint
      
      if (splitPoint > trimmed.length * 0.3) { // 30% 이상에서 분할 - 더 적극적
        const firstPart = trimmed.substring(0, splitPoint).trim()
        const secondPart = trimmed.substring(splitPoint).trim()
        
        if (firstPart) {
          console.log('📏 Length-based sentence split:', firstPart)
          sendToSTTStream(firstPart)
        }
        return secondPart
      }
    }
    
    // 시간 기반 강제 분할 (8초 이상) - 더 적극적
    const timeSinceLastSpeech = Date.now() - lastSpeechTimeRef.current
    if (timeSinceLastSpeech > 8000 && trimmed.length > 20) {
      // 중간에서 자연스럽게 분할
      const midPoint = Math.floor(trimmed.length / 2)
      const splitPoint = trimmed.lastIndexOf(' ', midPoint) || 
                        trimmed.lastIndexOf(',', midPoint) ||
                        midPoint
      
      if (splitPoint > trimmed.length * 0.3) { // 30% 이상에서 분할
        const firstPart = trimmed.substring(0, splitPoint).trim()
        const secondPart = trimmed.substring(splitPoint).trim()
        
        if (firstPart) {
          console.log('⏰ Time-based sentence split:', firstPart)
          sendToSTTStream(firstPart)
        }
        return secondPart
      }
    }
    
    // 단어 수 기반 분할 (8개 단어 이상) - 더 적극적
    const wordCount = trimmed.split(/\s+/).length
    if (wordCount > 8) {
      const words = trimmed.split(/\s+/)
      const firstPart = words.slice(0, Math.floor(wordCount / 2)).join(' ')
      const secondPart = words.slice(Math.floor(wordCount / 2)).join(' ')
      
      if (firstPart) {
        console.log('📝 Word-count-based sentence split:', firstPart)
        sendToSTTStream(firstPart)
      }
      return secondPart
    }
    
    return trimmed
  }

  // 🎯 5초 청크 처리 (메인 큐) - 개선된 버전
  const processChunk = async (text: string, forced = false) => {
    const cleanText = text.trim()
    if (!cleanText) return
    
    const timestamp = Date.now()
    console.log(`📦 Processing ${forced ? 'FORCED' : 'SCHEDULED'} chunk: "${cleanText.substring(0, 30)}..."`)
    
    // 문장 분할 및 완전한 문장들 전송
    const remainingText = processCompleteSentences(cleanText)
    
    // 메인 큐에 추가
    // adaptiveBufferRef.current += ' ' + cleanText // 이제 버퍼에 직접 추가하지 않음
    
    // 완전한 문장이 있으면 즉시 전송, 없으면 버퍼에 유지
    if (remainingText !== cleanText) {
      // 일부가 전송되었으므로 남은 부분만 버퍼에 유지
      adaptiveBufferRef.current = remainingText
      lastProcessedRef.current = remainingText // 마지막 처리된 텍스트 업데이트
    }
    
    // 큐 크기 제한 (메모리 관리)
    // adaptiveBufferRef.current.length > 1000 // 버퍼 크기 제한 제거
    
    // 타이머 시작
    if (bufferStartTimeRef.current === 0) {
      bufferStartTimeRef.current = timestamp
    }
  }
  
  // 🎯 지연 큐 처리 (백업 및 품질 검증)
  const processDelayedChunk = async (text: string) => {
    const cleanText = text.trim()
    if (!cleanText) return
    
    const timestamp = Date.now()
    console.log(`⏰ Processing delayed chunk: "${cleanText.substring(0, 30)}..."`)
    
    // 지연 큐에 추가
    // delayedQueueRef.current.push({ text: cleanText, timestamp }) // 이제 버퍼에 직접 추가하지 않음
    
    // 메인 큐와 비교하여 누락된 내용 확인
    // const recentMainChunks = chunkQueueRef.current
    //   .filter(chunk => timestamp - chunk.timestamp < CHUNK_INTERVAL * 2)
    //   .map(chunk => chunk.text)
    
    // 메인 큐에 없는 내용이라면 백업으로 전송
    // const isNewContent = !recentMainChunks.some(mainText => 
    //   mainText.includes(cleanText.substring(0, 20)) || 
    //   cleanText.includes(mainText.substring(0, 20))
    // )
    
    // if (isNewContent) {
    //   console.log('🔄 Delayed queue found missing content, sending as backup')
    //   await sendToSTTStream(cleanText)
    // }
    
    // 큐 크기 제한
    // if (delayedQueueRef.current.length > 5) {
    //   delayedQueueRef.current = delayedQueueRef.current.slice(-3)
    // }
  }
  
  // 🎯 STT 스트림으로 전송
  const sendToSTTStream = async (text: string) => {
    try {
      console.log('📡 Sending to STT stream:', text.substring(0, 50) + '...')
      
      const response = await fetch('/api/stt-stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'transcript',
          sessionId: sessionId,
          transcript: text,
          isPartial: false
        }),
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const result = await response.json()
      console.log('✅ STT stream response:', result)
      
      // 상태 업데이트
      setChunks(prev => prev + 1)
      if (result.success) {
        onTranscriptUpdate(text, false)
        setCurrentTranscript(text)
      }
      
    } catch (error) {
      console.error('❌ STT stream failed:', error)
      onError(`STT processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  // 🎯 적응형 버퍼링 타이머 시작
  const startAdaptiveTimer = useCallback(() => {
    // 의미 단위 분할 타이머
    const scheduleSemanticChunk = () => {
      // 버퍼가 비어있지 않으면 처리
      if (adaptiveBufferRef.current.trim()) {
        processChunk(adaptiveBufferRef.current)
        adaptiveBufferRef.current = ''
        lastProcessedRef.current = '' // 버퍼가 비워지면 마지막 처리된 텍스트도 초기화
        bufferStartTimeRef.current = 0 // 타이머 시작 시간 초기화
      }
      
      // 타이머 재설정
      if (isRecording) {
        const currentTime = Date.now()
        const elapsed = currentTime - bufferStartTimeRef.current
        const remainingTime = SEMANTIC_TIMEOUT - elapsed
        
        if (remainingTime > 0) {
          semanticTimerRef.current = setTimeout(scheduleSemanticChunk, remainingTime)
        } else {
          semanticTimerRef.current = setTimeout(scheduleSemanticChunk, SEMANTIC_TIMEOUT)
        }
      }
    }
    
    // 타이머 시작
    semanticTimerRef.current = setTimeout(scheduleSemanticChunk, SEMANTIC_TIMEOUT)
    
    console.log('⏰ Started adaptive semantic timer: 3s semantic chunks')
  }, [isRecording])

  // 🎯 적응형 버퍼링 로직 (문맥 보존 우선)
  const shouldProcessBuffer = useCallback((text: string): boolean => {
    const bufferLength = adaptiveBufferRef.current.length
    const timeSinceStart = Date.now() - bufferStartTimeRef.current
    
    // 1. 최소 버퍼 크기 확인
    if (bufferLength < MIN_BUFFER_SIZE) {
      return false
    }
    
    // 2. 문장 완성도 확인 (가장 우선 - 문맥 보존)
    if (isCompleteSentence(adaptiveBufferRef.current)) {
      console.log('✅ Complete sentence detected - processing buffer')
      return true
    }
    
    // 3. 자연스러운 휴식 감지 (문맥 보존)
    if (hasNaturalBreak(adaptiveBufferRef.current)) {
      console.log('✅ Natural break detected - processing buffer')
      return true
    }
    
    // 4. 최대 버퍼 크기 확인 (강제 분할 방지)
    if (bufferLength > MAX_BUFFER_SIZE) {
      console.log('📦 Buffer full - processing buffer')
      return true
    }
    
    // 5. 시간 기반 처리 (마지막 수단)
    if (timeSinceStart > SEMANTIC_TIMEOUT && bufferLength > 20) {
      console.log('⏰ Semantic timeout - processing buffer')
      return true
    }
    
    return false
  }, [])

  // 🎯 자연스러운 휴식 감지 (문맥 보존)
  const hasNaturalBreak = useCallback((text: string): boolean => {
    const trimmed = text.trim()
    
    // 1. 문장 부호로 끝나는 경우
    if (/[.!?。！？]/.test(trimmed.slice(-1))) {
      return true
    }
    
    // 2. 쉼표 + 충분한 길이 (자연스러운 휴식)
    if (trimmed.includes(',') && trimmed.length > 25) {
      return true
    }
    
    // 3. 연결사나 전치사로 끝나는 경우 (문맥 유지를 위해 대기)
    const endingWords = ['and', 'or', 'but', 'so', 'because', 'when', 'if', 'that', 'which', 'who', 'what', 'where', 'why', 'how']
    const lastWord = trimmed.split(/\s+/).pop()?.toLowerCase()
    if (endingWords.includes(lastWord || '')) {
      return false // 문맥 유지를 위해 대기
    }
    
    // 4. 관사나 전치사로 시작하는 경우 (문맥 유지를 위해 대기)
    const startingWords = ['a', 'an', 'the', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'about', 'against', 'between', 'into', 'through', 'during', 'before', 'after', 'above', 'below']
    const firstWord = trimmed.split(/\s+/)[0]?.toLowerCase()
    if (startingWords.includes(firstWord || '')) {
      return false // 문맥 유지를 위해 대기
    }
    
    // 5. 충분한 길이 + 자연스러운 단어 경계
    if (trimmed.length > 30 && !trimmed.endsWith(' ')) {
      return true
    }
    
    return false
  }, [])

  // 🎯 적응형 텍스트 추가
  const addToAdaptiveBuffer = useCallback((text: string) => {
    // 버퍼 시작 시간 설정
    if (bufferStartTimeRef.current === 0) {
      bufferStartTimeRef.current = Date.now()
    }
    
    // 텍스트 추가
    adaptiveBufferRef.current += ' ' + text
    adaptiveBufferRef.current = adaptiveBufferRef.current.trim()
    
    // 🚨 강제 청크 분할: 너무 큰 덩어리 방지
    if (adaptiveBufferRef.current.length > MAX_BUFFER_SIZE * 1.5) {
      console.log(`🚨 Buffer too large (${adaptiveBufferRef.current.length} chars) - forcing chunk split`)
      
      // 문장 단위로 분할 시도
      const sentences = adaptiveBufferRef.current.split(/[.!?。！？]/)
      if (sentences.length > 1) {
        // 첫 번째 완전한 문장만 처리
        const firstSentence = sentences[0].trim() + '.'
        if (firstSentence.length > MIN_BUFFER_SIZE) {
          adaptiveBufferRef.current = firstSentence
          processAdaptiveChunk()
          
          // 나머지 텍스트를 새 버퍼에 추가
          const remainingText = sentences.slice(1).join('. ').trim()
          if (remainingText.length > MIN_BUFFER_SIZE) {
            adaptiveBufferRef.current = remainingText
            bufferStartTimeRef.current = Date.now()
          }
          return
        }
      }
      
      // 문장 분할이 안되면 강제로 MAX_BUFFER_SIZE로 자르기
      const forcedChunk = adaptiveBufferRef.current.substring(0, MAX_BUFFER_SIZE)
      adaptiveBufferRef.current = forcedChunk
      processAdaptiveChunk()
      
      // 나머지 텍스트를 새 버퍼에 추가
      const remainingText = adaptiveBufferRef.current.substring(MAX_BUFFER_SIZE).trim()
      if (remainingText.length > MIN_BUFFER_SIZE) {
        adaptiveBufferRef.current = remainingText
        bufferStartTimeRef.current = Date.now()
      }
      return
    }
    
    // 텍스트 기록
    confidenceScoresRef.current.push({
      text: text,
      confidence: 0.8, // 기본값
      timestamp: Date.now()
    })
    
    console.log(`📦 Added to adaptive buffer: "${text}"`)
    console.log(`📦 Buffer length: ${adaptiveBufferRef.current.length} chars`)
    
    // 음성 활동 시간 업데이트
    lastSpeechTimeRef.current = Date.now()
    
    // 실시간 피드백 업데이트
    onTranscriptUpdate(adaptiveBufferRef.current, true)
    
    // 적응형 처리 조건 확인
    if (shouldProcessBuffer(text)) {
      processAdaptiveChunk()
    }
  }, [shouldProcessBuffer])

  // 🎯 적응형 청크 처리
  const processAdaptiveChunk = useCallback(async () => {
    const text = adaptiveBufferRef.current.trim()
    if (!text) return
    
    console.log(`🎯 Processing adaptive chunk: "${text.substring(0, 50)}..."`)
    
    try {
      // STT 스트림으로 전송
      await sendToSTTStream(text)
      
      // 오버랩을 위해 마지막 부분 유지
      const overlapText = text.slice(-OVERLAP_SIZE)
      adaptiveBufferRef.current = overlapText
      
      // 버퍼 상태 초기화
      bufferStartTimeRef.current = Date.now()
      confidenceScoresRef.current = []
      lastProcessedRef.current = text
      
      console.log(`✅ Adaptive chunk processed, keeping overlap: "${overlapText}"`)
      
    } catch (error) {
      console.error('❌ Adaptive chunk processing failed:', error)
      // 에러 시 버퍼 유지
    }
  }, [])

  // 🎯 오디오 컨텍스트 초기화
  const initializeAudioContext = useCallback(async () => {
    try {
      // 마이크 접근
      mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true })
      
      // 오디오 컨텍스트 설정
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
      analyserRef.current = audioContextRef.current.createAnalyser()
      
      const source = audioContextRef.current.createMediaStreamSource(mediaStreamRef.current)
      source.connect(analyserRef.current)
      
      analyserRef.current.fftSize = 256
      analyserRef.current.smoothingTimeConstant = 0.8
      
      console.log('🔊 Audio context initialized for silence detection')
      return true
    } catch (error) {
      console.error('❌ Audio context initialization failed:', error)
      return false
    }
  }, [])

  // Web Speech API 초기화
  const initializeSpeechRecognition = useCallback(() => {
    if (!isSupported) {
      onError('Speech recognition is not supported in this browser')
      return null
    }

    const SpeechRecognition = window.webkitSpeechRecognition || window.SpeechRecognition
    const recognition = new SpeechRecognition()

    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = currentPrimaryLanguage

    recognition.onstart = () => {
      console.log('🎤 Speech recognition started')
      setIsRecording(true)
      setStatus('Recording with 5s Chunk System...')
      isListeningRef.current = true
      
      // 🔄 4분마다 자동 재연결 타이머 시작
      startAutoReconnectTimer()
    }

    recognition.onresult = (event: any) => {
      let finalTranscript = ''
      let interimTranscript = ''

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          finalTranscript += transcript
        } else {
          interimTranscript += transcript
        }
      }

      // 최종 결과가 있으면 청크 버퍼에 추가
      if (finalTranscript.trim()) {
        addToAdaptiveBuffer(finalTranscript)
      }

      // 임시 결과도 표시 (실시간 피드백)
      if (interimTranscript.trim()) {
        const fullBuffer = (adaptiveBufferRef.current + ' ' + interimTranscript).trim()
        console.log('�� Interim transcript:', interimTranscript)
        onTranscriptUpdate(fullBuffer, true)
      }
    }

    recognition.onerror = (event: any) => {
      console.error('❌ Speech recognition error:', event.error)
      
      // no-speech 에러는 완전히 무시하고 조용히 재시작 (이전 코드와 동일)
      if (event.error === 'no-speech') {
        console.log('🔇 No speech detected, silently restarting...')
        setTimeout(() => {
          if (isRecording) {
            try {
              recognition.start()
              isListeningRef.current = true
              console.log('✅ Speech recognition silently restarted')
            } catch (error) {
              console.log('🔄 Silent restart failed, retrying...')
              // 재시도
              setTimeout(() => {
                if (isRecording) {
                  try {
                    recognition.start()
                    isListeningRef.current = true
                    console.log('✅ Speech recognition restarted on retry')
                  } catch (retryError) {
                    console.log('🔄 Silent restart retry failed, continuing...')
                  }
                }
              }, 50) // 50ms 후 재시도 (매우 빠르게)
            }
          }
        }, 50) // 50ms 후 재시작 (매우 빠르게)
        return // 에러를 표시하지 않고 조용히 처리
      } else if (event.error === 'network') {
        // 네트워크 에러는 4분 타임아웃일 가능성이 높음
        console.log('🌐 Network error detected, attempting restart...')
        setTimeout(() => {
          try {
            recognition.start()
            isListeningRef.current = true
            console.log('✅ Speech recognition restarted after network error')
          } catch (error) {
            console.log('🔄 Network error restart failed, will retry...')
            // 재시도
            setTimeout(() => {
              try {
                recognition.start()
                isListeningRef.current = true
                console.log('✅ Speech recognition restarted on network error retry')
              } catch (retryError) {
                console.log('🔄 Network error restart retry failed, continuing...')
              }
            }, 1000)
          }
        }, 1000)
        return // 네트워크 에러도 조용히 처리
      } else {
        // 다른 에러들만 사용자에게 표시
        console.log(`❌ Setting isRecording to false due to error: ${event.error}`)
        onError(`Speech recognition error: ${event.error}`)
        setIsRecording(false)
        setStatus('Speech recognition error')
      }
    }

    recognition.onend = () => {
      console.log('🛑 Speech recognition ended')
      isListeningRef.current = false
      
      // 예방적 재연결과 일치하는 자동 재시작
      if (isRecording) {
        console.log('🔄 Restarting speech recognition after end event...')
        setTimeout(() => {
          if (isRecording) {
            try {
              recognition.start()
              isListeningRef.current = true
              console.log('✅ Speech recognition restarted successfully after end event')
            } catch (error) {
              console.log('🔄 Speech recognition restart failed after end event, will retry...')
              // 재시작 실패시 다시 시도
              setTimeout(() => {
                if (isRecording) {
                  try {
                    recognition.start()
                    isListeningRef.current = true
                    console.log('✅ Speech recognition restarted on retry after end event')
                  } catch (retryError) {
                    console.log('🔄 Second retry failed after end event, trying again...')
                    // 두 번째 재시도도 실패하면 다시 시도
                    setTimeout(() => {
                      if (isRecording) {
                        try {
                          recognition.start()
                          isListeningRef.current = true
                          console.log('✅ Speech recognition restarted on third try after end event')
                        } catch (thirdRetryError) {
                          console.error('❌ Speech recognition restart failed after third retry')
                          console.log('❌ Setting isRecording to false due to restart failure')
                          setIsRecording(false)
                          setStatus('Speech recognition restart failed')
                        }
                      }
                    }, 500) // 0.5초 후 세 번째 시도
                  }
                }
              }, 500) // 0.5초 후 두 번째 시도
            }
          }
        }, 200) // 0.2초 후 재시작 (예방적 재연결과 일치)
      } else {
        console.log('🛑 Speech recognition ended and isRecording is false - not restarting')
        setStatus('Ready')
      }
    }

    return recognition
  }, [isSupported, currentPrimaryLanguage, onError, onTranscriptUpdate, isRecording])

  // 녹음 시작
  const startRecording = useCallback(async () => {
    console.log('🎤 Starting 5-second chunk-based speech recognition...')
    
    if (!isSupported) {
      onError('Speech recognition is not supported in this browser')
      return
    }

    // 버퍼 및 큐 초기화
    adaptiveBufferRef.current = ''
    confidenceScoresRef.current = []
    lastProcessedRef.current = ''
    bufferStartTimeRef.current = 0
    // sentenceBufferRef.current = '' // 이제 버퍼에 직접 추가하지 않음
    // chunkBufferRef.current = '' // 이제 버퍼에 직접 추가하지 않음
    // processedSentencesRef.current.clear() // 이제 버퍼에 직접 추가하지 않음
    // chunkQueueRef.current = [] // 이제 버퍼에 직접 추가하지 않음
    // delayedQueueRef.current = [] // 이제 버퍼에 직접 추가하지 않음
    lastSpeechTimeRef.current = Date.now()

    // 오디오 컨텍스트 초기화
    const audioInitialized = await initializeAudioContext()
    if (!audioInitialized) {
      console.warn('⚠️ Audio context initialization failed, continuing without silence detection')
    }

    const recognition = initializeSpeechRecognition()
    if (recognition) {
      recognitionRef.current = recognition
      recognition.start()
      
      // 적응형 타이머 시작
      startAdaptiveTimer()
      
      // 침묵 감지 시작 (오디오 컨텍스트가 초기화된 경우만)
      if (audioInitialized) {
        startSilenceDetection()
      }
      
      // STT 스트림 세션 시작 알림
      try {
        await fetch('/api/stt-stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'start', sessionId: sessionId })
        })
        console.log('✅ STT stream session started')
      } catch (error) {
        console.error('❌ Failed to start STT stream session:', error)
      }
    }
  }, [isSupported, initializeSpeechRecognition, initializeAudioContext, startAdaptiveTimer, startSilenceDetection, onError, sessionId])

  // 녹음 중지
  const stopRecording = useCallback(async () => {
    console.log('🛑 Stopping chunk-based speech recognition...')
    
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      recognitionRef.current = null
    }
    
    isListeningRef.current = false
    console.log('🛑 Setting isRecording to false in stopRecording')
    setIsRecording(false)
    setStatus('Processing remaining chunks...')
    
    // 모든 타이머 정리
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
    
    if (semanticTimerRef.current) {
      clearTimeout(semanticTimerRef.current)
      semanticTimerRef.current = null
    }
    
    if (silenceDetectionRef.current) {
      clearTimeout(silenceDetectionRef.current)
      silenceDetectionRef.current = null
    }
    
    // 남은 청크 버퍼 처리
    if (adaptiveBufferRef.current.trim()) {
      console.log('📦 Processing final chunk buffer')
      await processChunk(adaptiveBufferRef.current, true)
      adaptiveBufferRef.current = ''
    }
    
    // 오디오 컨텍스트 정리
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
    
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop())
      mediaStreamRef.current = null
    }
    
    // STT 스트림 세션 종료 알림
    try {
      await fetch('/api/stt-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'end', sessionId: sessionId })
      })
      console.log('✅ STT stream session ended')
    } catch (error) {
      console.error('❌ Failed to end STT stream session:', error)
    }
    
    setStatus('Ready')
    setCurrentTranscript('')
  }, [sessionId])

  // 언어 변경 처리
  const handlePrimaryLanguageChange = (language: string) => {
    setCurrentPrimaryLanguage(language)
    if (isRecording && recognitionRef.current) {
      recognitionRef.current.stop()
    }
  }

  const handleSecondaryLanguageChange = (language: string) => {
    setCurrentSecondaryLanguage(language)
  }

  // 컴포넌트 언마운트 시 정리
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop()
      }
      
      // 모든 타이머 정리
      const timers = [
        reconnectTimerRef.current,
        semanticTimerRef.current,
        silenceDetectionRef.current
      ]
      
      timers.forEach(timer => {
        if (timer) clearTimeout(timer)
      })
      
      // 오디오 리소스 정리
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close()
      }
      
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop())
      }
    }
  }, [])

  // 상태 텍스트 생성
  const getStatusText = () => {
    if (!isSupported) return 'Speech recognition not supported'
    return status
  }

  return (
    <div className="space-y-4">
      {/* 상태 정보 */}
      <div className="text-sm text-gray-600 space-y-1">
        <div>Status: {getStatusText()}</div>
        <div>Chunks Sent: {chunks}</div>
        <div>Adaptive Buffer: {adaptiveBufferRef.current.length} chars</div>
        <div>Confidence Scores: {confidenceScoresRef.current.length}</div>
        <div>Session ID: {sessionId}</div>
        <div>Primary: {currentPrimaryLanguage}</div>
        <div>Secondary: {currentSecondaryLanguage}</div>
        <div>Duplicates Blocked: {duplicatesBlocked}</div>
        <div>Auto-reconnect: {autoReconnect}</div>
        <div>Chunk Buffer: &quot;{adaptiveBufferRef.current.substring(0, 50)}...&quot;</div>
        <div>Last Processed: &quot;{lastProcessedRef.current.substring(0, 30)}...&quot;</div>
        <div>Last Speech: {Math.round((Date.now() - lastSpeechTimeRef.current) / 1000)}s ago</div>
      </div>

      {/* 언어 설정 */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Presentation Language Setup</h3>
        
        <div className="space-y-2">
          <label className="block text-sm font-medium">
            Main Presentation Language
          </label>
          <select
            value={currentPrimaryLanguage}
            onChange={(e) => handlePrimaryLanguageChange(e.target.value)}
            className="w-full p-2 border rounded-md"
            disabled={isRecording}
          >
            <option value="en-US">English (English)</option>
            <option value="ko-KR">Korean (한국어)</option>
            <option value="zh-CN">Chinese (中文)</option>
            <option value="ja-JP">Japanese (日本語)</option>
            <option value="es-ES">Spanish (Español)</option>
            <option value="fr-FR">French (Français)</option>
            <option value="de-DE">German (Deutsch)</option>
            <option value="it-IT">Italian (Italiano)</option>
            <option value="pt-BR">Portuguese (Português)</option>
            <option value="ru-RU">Russian (Русский)</option>
            <option value="hi-IN">Hindi (हिन्दी)</option>
            <option value="ar-SA">Arabic (العربية)</option>
          </select>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium">
            Emphasis Language (for Special Points)
          </label>
          <select
            value={currentSecondaryLanguage}
            onChange={(e) => handleSecondaryLanguageChange(e.target.value)}
            className="w-full p-2 border rounded-md"
            disabled={isRecording}
          >
            <option value="ko-KR">Korean (한국어)</option>
            <option value="en-US">English (English)</option>
            <option value="zh-CN">Chinese (中文)</option>
            <option value="ja-JP">Japanese (日本語)</option>
            <option value="es-ES">Spanish (Español)</option>
            <option value="fr-FR">French (Français)</option>
            <option value="de-DE">German (Deutsch)</option>
            <option value="it-IT">Italian (Italiano)</option>
            <option value="pt-BR">Portuguese (Português)</option>
            <option value="ru-RU">Russian (Русский)</option>
            <option value="hi-IN">Hindi (हिन्दी)</option>
            <option value="ar-SA">Arabic (العربية)</option>
          </select>
        </div>

        <div className="text-sm text-gray-600">
          <div>Main: {currentPrimaryLanguage}</div>
          <div>Emphasis: {currentSecondaryLanguage}</div>
          <div>Speech Recognition: {currentPrimaryLanguage}</div>
        </div>
      </div>

      {/* 제어 버튼 */}
      <div className="flex space-x-4">
        {!isRecording ? (
          <button
            onClick={startRecording}
            disabled={!isSupported}
            className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:bg-gray-400"
          >
            {!isSupported ? 'Speech Recognition Not Supported' : 'Start Presenting'}
          </button>
        ) : (
          <button
            onClick={stopRecording}
            className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 flex items-center space-x-2"
          >
            <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
            <span>Adaptive Recording...</span>
          </button>
        )}
      </div>

      {/* 현재 전사 결과 */}
      {currentTranscript && (
        <div className="mt-4 p-4 bg-gray-100 rounded-md">
          <div className="text-sm text-gray-500">
            {new Date().toLocaleTimeString()}
          </div>
          <div className="mt-1">{currentTranscript}</div>
        </div>
      )}
    </div>
  )
}
