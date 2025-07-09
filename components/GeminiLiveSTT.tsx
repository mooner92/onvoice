"use client"

import { useEffect, useRef, useState, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'

interface TranscriptData {
  id: string
  sessionId: string
  timestamp: string
  original_text: string
  translations: {
    ko?: string
    zh?: string
    hi?: string
  }
  confidence: number
  streaming: boolean
  is_final: boolean
}

interface SessionStats {
  participantCount: number
  transcriptCount: number
  wordsTranscribed: number
  lastUpdate: string
}

interface GeminiLiveSTTProps {
  sessionId: string
  userId: string
  userName: string
  userType: 'speaker' | 'audience'
  isRecording?: boolean
  onTranscriptUpdate: (data: TranscriptData) => void
  onError: (error: string) => void
  onSessionStatsUpdate?: (stats: SessionStats) => void
  onSummaryGenerated?: (summary: any) => void
  onRecordingError?: () => void
  onSessionJoined?: () => void // 세션 조인 시 콜백
}

export function GeminiLiveSTT({ 
  sessionId, 
  userId,
  userName,
  userType,
  onTranscriptUpdate, 
  onError,
  onSessionStatsUpdate,
  onSummaryGenerated,
  onRecordingError,
  onSessionJoined
}: GeminiLiveSTTProps) {
  const [isConnected, setIsConnected] = useState(false)
  const [isJoined, setIsJoined] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [hasPermission, setHasPermission] = useState(false)
  const [status, setStatus] = useState('Initializing...')
  
  // 🆕 무한 루프 방지를 위한 ref들
  const isStreamingRef = useRef(false)
  const hasErrorRef = useRef(false)
  const mountedRef = useRef(true)
  const socketRef = useRef<Socket | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioSequenceRef = useRef(0)
  
  // 🆕 에러 상태 리셋 함수
  const resetErrorState = useCallback(() => {
    console.log('🔄 Resetting error state')
    hasErrorRef.current = false
    setStatus('Ready to retry')
    
    // MediaRecorder 정리
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop()
        mediaRecorderRef.current = null
      } catch (error) {
        console.error('Error stopping MediaRecorder during reset:', error)
      }
    }
    
    // 스트리밍 상태 리셋
    isStreamingRef.current = false
    setIsStreaming(false)
    
    // 스트림 상태 확인 및 재요청
    if (!streamRef.current || streamRef.current.getAudioTracks().length === 0) {
      setHasPermission(false)
      setStatus('Permission needed')
    }
  }, [])
  
  // Gemini Live 스트리밍 중지
  const stopStreaming = useCallback(() => {
    console.log('🛑 Stopping Gemini Live streaming...')
    
    try {
      if (mediaRecorderRef.current) {
        const state = mediaRecorderRef.current.state
        console.log('🔍 MediaRecorder state:', state)
        
        if (state === 'recording') {
          mediaRecorderRef.current.stop()
        } else if (state === 'paused') {
          mediaRecorderRef.current.resume()
          mediaRecorderRef.current.stop()
        }
        
        mediaRecorderRef.current = null
      }
    } catch (error) {
      console.error('❌ Error stopping MediaRecorder:', error)
    }
    
    // 백엔드에 Gemini Live 중지 요청
    if (socketRef.current?.connected && isJoined) {
      socketRef.current.emit('stop-gemini-live-streaming', {
        sessionId
      })
    }
    
    isStreamingRef.current = false
    setIsStreaming(false)
    setStatus('Gemini Live stopped')
  }, [sessionId, isJoined])
  
  // 수동 스트리밍 중지
  const forceStopStreaming = useCallback(() => {
    console.log('🛑 Force stopping Gemini Live streaming...')
    
    // 백엔드에 강제 중지 요청
    if (socketRef.current?.connected) {
      socketRef.current.emit('force-stop-gemini-live', { sessionId })
    }
    
    // MediaRecorder 강제 중지
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop()
        mediaRecorderRef.current = null
      } catch (error) {
        console.error('Error force stopping MediaRecorder:', error)
      }
    }
    
    // 상태 강제 리셋
    isStreamingRef.current = false
    setIsStreaming(false)
    setStatus('Gemini Live force stopped')
  }, [sessionId])
  
  // 브라우저 지원 여부 확인
  const checkBrowserSupport = useCallback(() => {
    const support = {
      mediaDevices: !!navigator.mediaDevices,
      getUserMedia: !!navigator.mediaDevices?.getUserMedia,
      mediaRecorder: !!window.MediaRecorder,
      webSocket: !!window.WebSocket,
      supportedMimeTypes: [] as string[]
    }
    
    if (window.MediaRecorder) {
      const types = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/ogg;codecs=opus'
      ]
      
      support.supportedMimeTypes = types.filter(type => 
        MediaRecorder.isTypeSupported(type)
      )
    }
    
    console.log('🔍 Browser support check:', support)
    return support
  }, [])
  
  // WebSocket 연결 초기화
  const initializeSocket = useCallback(() => {
    if (socketRef.current?.connected) {
      console.log('🔌 Socket already connected, reusing existing connection')
      return
    }
    
    console.log('🔌 Initializing WebSocket connection to backend...')
    
    // 백엔드 포트 자동 감지 (3001이 주로 사용됨)
    const backendUrl = process.env.NODE_ENV === 'production' 
      ? 'wss://your-backend-domain.com' 
      : 'http://localhost:3001'
    
    const socket = io(backendUrl, {
      transports: ['websocket'],
      timeout: 10000,
      forceNew: false,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000
    })
    
    socketRef.current = socket
    
    // 연결 이벤트
    socket.on('connect', () => {
      console.log('✅ WebSocket connected to backend at:', backendUrl)
      setIsConnected(true)
      setStatus('Connected to Gemini Live Backend')
      hasErrorRef.current = false
    })
    
    socket.on('disconnect', (reason) => {
      console.log('❌ WebSocket disconnected from backend:', reason)
      setIsConnected(false)
      setIsJoined(false)
      setIsStreaming(false)
      isStreamingRef.current = false
      setStatus(`Disconnected: ${reason}`)
    })
    
    socket.on('connect_error', (error) => {
      console.error('❌ Connection error:', error)
      onError(`Backend connection failed: ${error.message}. Please ensure backend is running on port 3001.`)
      setStatus('Backend connection failed')
      hasErrorRef.current = true
    })
    
    // 세션 참여 응답
    socket.on('session-joined', (data) => {
      console.log('🎯 Session joined:', data)
      setIsJoined(true)
      setStatus('Joined session - Ready for Gemini Live')
      hasErrorRef.current = false
    })
    
    // Gemini Live 실시간 전사 수신
    socket.on('real-time-transcript', (data: TranscriptData) => {
      console.log('📝 Gemini Live transcript received:', data)
      onTranscriptUpdate(data)
    })
    
    // 부분 전사 결과 (Gemini Live 스트리밍)
    socket.on('partial-transcript', (data) => {
      console.log('🔄 Partial transcript from Gemini Live:', data)
      // 부분 결과도 UI에 표시 (실시간성 향상)
      if (data.partial_text) {
        onTranscriptUpdate({
          id: `partial_${data.sessionId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          sessionId: data.sessionId,
          timestamp: new Date().toISOString(),
          original_text: data.partial_text,
          translations: data.translations || {},
          confidence: data.confidence || 0.8,
          streaming: true,
          is_final: false
        })
      }
    })
    
    // 세션 통계 업데이트
    socket.on('session-stats-update', (stats: SessionStats) => {
      console.log('📊 Session stats update:', stats)
      if (onSessionStatsUpdate) {
        onSessionStatsUpdate(stats)
      }
    })
    
    // 요약 생성 완료
    socket.on('summary-generated', (summaryData) => {
      console.log('📄 Summary generated:', summaryData)
      if (onSummaryGenerated) {
        onSummaryGenerated(summaryData)
      }
    })
    
    // Gemini Live 스트리밍 상태 업데이트
    socket.on('gemini-live-started', (data) => {
      console.log('🎤 Gemini Live streaming started:', data)
      setIsStreaming(true)
      isStreamingRef.current = true
      setStatus('Gemini Live Active - Real-time STT+Translation')
      hasErrorRef.current = false
    })
    
    socket.on('gemini-live-stopped', (data) => {
      console.log('🛑 Gemini Live streaming stopped:', data)
      setIsStreaming(false)
      isStreamingRef.current = false
      setStatus('Gemini Live Stopped')
    })
    
    // 백엔드 스트리밍 확인 (기존 호환성)
    socket.on('streaming-started', (data) => {
      console.log('🎤 Backend streaming confirmed:', data)
      if (data.success) {
        setIsStreaming(true)
        isStreamingRef.current = true
        setStatus('Backend streaming active')
        hasErrorRef.current = false
      }
    })
    
    socket.on('streaming-stopped', () => {
      console.log('🛑 Backend streaming stopped')
      setIsStreaming(false)
      isStreamingRef.current = false
      setStatus('Backend streaming stopped')
    })
    
    // 에러 처리
    socket.on('error', (error) => {
      console.error('❌ WebSocket error:', error)
      onError(`Backend error: ${error.message || error}`)
      hasErrorRef.current = true
    })
    
    // Gemini Live 특화 에러
    socket.on('gemini-live-error', (error) => {
      console.error('❌ Gemini Live error:', error)
      onError(`Gemini Live error: ${error.message || error}`)
      hasErrorRef.current = true
      setStatus('Gemini Live Error')
    })
    
    // 연결 상태 확인용 ping/pong
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: Date.now() })
    })
    
  }, [onTranscriptUpdate, onError, onSessionStatsUpdate, onSummaryGenerated])
  
  // 세션 참여
  const joinSession = useCallback(() => {
    if (!socketRef.current || !isConnected) {
      console.log('❌ Cannot join session: not connected')
      return
    }
    
    console.log('🎯 Joining session with new backend API:', { sessionId, userId, userName, userType })
    
    socketRef.current.emit('join-session', {
      sessionId,
      userId,
      userName,
      userType
    })
  }, [sessionId, userId, userName, userType, isConnected])
  
  // 마이크 권한 요청
  const requestMicrophonePermission = useCallback(async () => {
    try {
      console.log('🎤 Requesting microphone permission...')
      
      // 기존 스트림이 있다면 정리
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
        streamRef.current = null
      }
      
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000
        }
      })
      
      // 스트림 상태 검증
      const audioTracks = stream.getAudioTracks()
      console.log('🎤 Audio tracks:', audioTracks.length, audioTracks.map(t => ({ 
        label: t.label, 
        enabled: t.enabled, 
        readyState: t.readyState,
        muted: t.muted 
      })))
      
      if (audioTracks.length === 0) {
        throw new Error('No audio tracks available')
      }
      
      // 첫 번째 오디오 트랙 상태 확인
      const firstTrack = audioTracks[0]
      if (firstTrack.readyState !== 'live') {
        throw new Error(`Audio track not ready: ${firstTrack.readyState}`)
      }
      
      console.log('✅ Microphone permission granted with valid stream')
      setHasPermission(true)
      setStatus('Microphone ready')
      
      // 스트림 저장
      streamRef.current = stream
      
      return true
    } catch (error) {
      console.error('❌ Microphone permission error:', error)
      setHasPermission(false)
      
      let errorMessage = 'Microphone permission denied.'
      if (error instanceof Error) {
        if (error.name === 'NotAllowedError') {
          errorMessage = 'Microphone access denied. Please allow microphone access in your browser settings.'
        } else if (error.name === 'NotFoundError') {
          errorMessage = 'No microphone found. Please check your microphone connection.'
        } else if (error.name === 'NotReadableError') {
          errorMessage = 'Microphone is being used by another application. Please close other apps using the microphone.'
        } else {
          errorMessage = `Microphone error: ${error.message}`
        }
      }
      
      onError(errorMessage)
      return false
    }
  }, [onError])
  
  // Gemini Live 스트리밍 시작 (최적화된 실시간 STT+번역)
  const startStreaming = useCallback(async () => {
    console.log('[startGeminiLiveStreaming] Called with state:', {
      socket: !!socketRef.current?.connected,
      isJoined,
      hasPermission,
      isStreamingRef: isStreamingRef.current,
      hasError: hasErrorRef.current,
      mediaRecorderState: mediaRecorderRef.current?.state
    })
    
    // 이미 스트리밍 중이거나 에러가 발생한 경우 방지
    if (isStreamingRef.current) {
      console.log('🚫 Already streaming, skipping')
      return
    }
    
    if (hasErrorRef.current) {
      console.log('🚫 Has error state, skipping')
      return
    }
    
    if (!socketRef.current?.connected || !isJoined || !hasPermission) {
      console.log('❌ Not ready for Gemini Live streaming:', { 
        socket: !!socketRef.current?.connected, 
        joined: isJoined, 
        permission: hasPermission 
      })
      onError('Not ready for Gemini Live streaming')
      setStatus('Not ready for streaming')
      hasErrorRef.current = true
      if (onRecordingError) onRecordingError()
      return
    }
    
    // MediaRecorder가 이미 실행 중인지 확인
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      console.log('⚠️ MediaRecorder already active:', mediaRecorderRef.current.state)
      onError('이미 오디오 스트리밍이 진행 중입니다.')
      hasErrorRef.current = true
      if (onRecordingError) onRecordingError()
      return
    }
    
    // 스트림이 없거나 유효하지 않은 경우 권한 재요청
    if (!streamRef.current) {
      console.log('🎤 No stream available, requesting permission...')
      const granted = await requestMicrophonePermission()
      if (!granted) {
        onError('Microphone permission denied')
        setStatus('Microphone permission denied')
        hasErrorRef.current = true
        if (onRecordingError) onRecordingError()
        return
      }
      await new Promise(res => setTimeout(res, 500))
    }
    
    // 스트림 상태 재검증
    if (!streamRef.current) {
      onError('스트림을 가져올 수 없습니다.')
      setStatus('No stream available')
      hasErrorRef.current = true
      if (onRecordingError) onRecordingError()
      return
    }
    
    const audioTracks = streamRef.current.getAudioTracks()
    console.log('🔍 Stream validation for Gemini Live:', {
      hasStream: !!streamRef.current,
      audioTracksCount: audioTracks.length,
      tracksState: audioTracks.map(t => ({ 
        label: t.label, 
        enabled: t.enabled, 
        readyState: t.readyState,
        muted: t.muted 
      }))
    })
    
    if (audioTracks.length === 0) {
      onError('오디오 트랙이 없습니다. 마이크를 다시 연결해 주세요.')
      setStatus('No audio tracks')
      hasErrorRef.current = true
      if (onRecordingError) onRecordingError()
      return
    }
    
    const firstTrack = audioTracks[0]
    if (firstTrack.readyState !== 'live') {
      onError(`오디오 트랙이 비활성 상태입니다: ${firstTrack.readyState}`)
      setStatus('Audio track not ready')
      hasErrorRef.current = true
      if (onRecordingError) onRecordingError()
      return
    }
    
    if (firstTrack.muted) {
      onError('마이크가 음소거 상태입니다.')
      setStatus('Microphone muted')
      hasErrorRef.current = true
      if (onRecordingError) onRecordingError()
      return
    }
    
    // 백엔드에 Gemini Live 스트리밍 시작 요청
    try {
      console.log('🎤 Requesting Gemini Live streaming start from backend...')
      
      // Gemini Live 전용 이벤트로 변경
      socketRef.current.emit('start-gemini-live-streaming', { 
        sessionId,
        options: {
          model: 'gemini-2.0-flash-exp', // Flash 2.5 모델 사용
          language: 'en', // 원본 언어
          targetLanguages: ['ko', 'zh', 'hi'], // 번역 대상 언어들
          realTimeTranslation: true, // 실시간 번역 활성화
          partialResults: true, // 부분 결과 활성화 (더 빠른 응답)
          audioFormat: 'webm', // 오디오 포맷
          sampleRate: 16000 // 샘플링 레이트
        }
      })
      
      // 백엔드 응답을 기다림 (Gemini Live 초기화 시간 고려하여 5초)
      const geminiLiveStarted = await new Promise<boolean>((resolve) => {
        const timeout = setTimeout(() => {
          console.log('❌ Gemini Live start timeout')
          resolve(false)
        }, 5000)
        
        const handler = (data: any) => {
          clearTimeout(timeout)
          socketRef.current?.off('gemini-live-started', handler)
          socketRef.current?.off('streaming-started', handler) // 기존 호환성
          console.log('✅ Gemini Live started successfully:', data)
          resolve(data.success === true || data.status === 'started')
        }
        
        // 두 이벤트 모두 리슨 (호환성)
        socketRef.current?.once('gemini-live-started', handler)
        socketRef.current?.once('streaming-started', handler)
      })
      
      if (!geminiLiveStarted) {
        throw new Error('Gemini Live did not start within timeout period')
      }
      
    } catch (error) {
      console.error('❌ Gemini Live streaming start failed:', error)
      onError('Gemini Live 스트리밍 시작 실패')
      hasErrorRef.current = true
      if (onRecordingError) onRecordingError()
      return
    }
    
    // MediaRecorder 설정 (Gemini Live에 최적화)
    let mimeType = ''
    const supportedTypes = [
      'audio/webm;codecs=opus', // Gemini Live 최적화
      'audio/webm',
      'audio/mp4'
    ]
    
    for (const type of supportedTypes) {
      if (window.MediaRecorder && MediaRecorder.isTypeSupported(type)) {
        mimeType = type
        break
      }
    }
    
    console.log('🎵 MediaRecorder setup for Gemini Live:', {
      available: !!window.MediaRecorder,
      selectedType: mimeType,
      allSupported: supportedTypes.map(type => ({
        type,
        supported: window.MediaRecorder ? MediaRecorder.isTypeSupported(type) : false
      }))
    })
    
    if (!mimeType) {
      onError('이 브라우저는 Gemini Live 스트리밍을 지원하지 않습니다.')
      setStatus('MediaRecorder not supported')
      hasErrorRef.current = true
      if (onRecordingError) onRecordingError()
      return
    }
    
    try {
      console.log('🎤 Creating MediaRecorder for Gemini Live:', { mimeType, streamId: streamRef.current.id })
      
      // Gemini Live에 최적화된 MediaRecorder 설정
      const mediaRecorder = new MediaRecorder(streamRef.current, { 
        mimeType,
        audioBitsPerSecond: 128000, // Gemini Live 권장 비트레이트
      })
      
      mediaRecorderRef.current = mediaRecorder
      audioSequenceRef.current = 0
      
      // MediaRecorder에서 오디오 청크 전송
      mediaRecorder.ondataavailable = (event) => {
        // Gemini Live가 백엔드에서 활성화된 경우에만 전송
        if (isStreamingRef.current && event.data && event.data.size > 0) {
          socketRef.current?.emit('gemini-live-audio-chunk', {
            sessionId,
            audio: event.data
          })
        } else {
          // 아직 Gemini Live가 시작되지 않은 경우 전송하지 않음
          console.log('⏸️ Gemini Live not started yet, skipping audio chunk')
        }
      }
      
      mediaRecorder.onerror = (event) => {
        console.error('❌ MediaRecorder error:', event)
        onError(`MediaRecorder error: ${event.error?.message || 'Unknown error'}`)
        hasErrorRef.current = true
        isStreamingRef.current = false
        if (onRecordingError) onRecordingError()
      }
      
      mediaRecorder.onstart = () => {
        console.log('✅ MediaRecorder started for Gemini Live')
        isStreamingRef.current = true
        setIsStreaming(true)
        setStatus('Gemini Live Active - Real-time STT+Translation')
        hasErrorRef.current = false
      }
      
      mediaRecorder.onstop = () => {
        console.log('🛑 MediaRecorder stopped')
        isStreamingRef.current = false
        setIsStreaming(false)
      }
      
      // MediaRecorder 시작 (50ms 간격으로 더 빠른 전송)
      mediaRecorder.start(50)
      
    } catch (error) {
      console.error('❌ Failed to start MediaRecorder for Gemini Live:', error)
      onError(`Failed to start Gemini Live streaming: ${error instanceof Error ? error.message : 'Unknown error'}`)
      setStatus('Gemini Live error')
      hasErrorRef.current = true
      isStreamingRef.current = false
      if (onRecordingError) onRecordingError()
    }
  }, [sessionId, isJoined, hasPermission, requestMicrophonePermission, onError, onRecordingError])
  
  // 요약 생성 요청
  const generateSummary = useCallback((language: string = 'ko') => {
    if (!socketRef.current || !isJoined) {
      console.log('❌ Cannot generate summary: not connected')
      return
    }
    
    console.log('📄 Requesting summary generation:', { sessionId, language })
    
    socketRef.current.emit('generate-summary', {
      sessionId,
      language
    })
  }, [sessionId, isJoined])
  
  // 컴포넌트 마운트/언마운트 처리
  useEffect(() => {
    mountedRef.current = true
    
    // 브라우저 지원 여부 확인
    const support = checkBrowserSupport()
    if (!support.mediaDevices || !support.getUserMedia) {
      onError('이 브라우저는 마이크 접근을 지원하지 않습니다.')
      setStatus('Browser not supported')
      hasErrorRef.current = true
      return
    }
    
    if (!support.mediaRecorder) {
      onError('이 브라우저는 MediaRecorder를 지원하지 않습니다.')
      setStatus('MediaRecorder not supported')
      hasErrorRef.current = true
      return
    }
    
    if (support.supportedMimeTypes.length === 0) {
      onError('이 브라우저는 지원되는 오디오 형식이 없습니다.')
      setStatus('No supported audio formats')
      hasErrorRef.current = true
      return
    }
    
    initializeSocket()
    
    return () => {
      mountedRef.current = false
      
      console.log('🧹 Cleaning up GeminiLiveSTT component...')
      
      // 스트리밍 정리
      try {
        if (mediaRecorderRef.current) {
          const state = mediaRecorderRef.current.state
          if (state === 'recording' || state === 'paused') {
            mediaRecorderRef.current.stop()
          }
          mediaRecorderRef.current = null
        }
      } catch (error) {
        console.error('❌ Error cleaning up MediaRecorder:', error)
      }
      
      // 스트림 정리
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => {
          try {
            track.stop()
            console.log('🛑 Stopped track:', track.label)
          } catch (error) {
            console.error('❌ Error stopping track:', error)
          }
        })
        streamRef.current = null
      }
      
      // WebSocket 정리
      if (socketRef.current) {
        try {
          socketRef.current.disconnect()
          console.log('🔌 WebSocket disconnected')
        } catch (error) {
          console.error('❌ Error disconnecting WebSocket:', error)
        }
        socketRef.current = null
      }
      
      // 상태 초기화
      isStreamingRef.current = false
      hasErrorRef.current = false
    }
  }, []) // 의존성 배열을 빈 배열로 변경
  
  // 자동 세션 참여 (연결 후)
  useEffect(() => {
    if (isConnected && !isJoined && !hasErrorRef.current) {
      // 연결 후 잠시 대기 후 참여
      setTimeout(() => {
        if (mountedRef.current && !isJoined) {
          joinSession()
        }
      }, 500)
    }
  }, [isConnected, isJoined]) // joinSession 제거

  // 세션 참여 완료 시 콜백 호출
  useEffect(() => {
    if (isJoined && onSessionJoined) {
      console.log('[GeminiLiveSTT] onSessionJoined fired!')
      onSessionJoined()
    }
  }, [isJoined, onSessionJoined])
  
  // 녹음 상태 변경 처리 (무한 루프 방지)
  useEffect(() => {
    if (userType !== 'speaker') return
    if (hasErrorRef.current) return
    
    // 반드시 두 조건이 모두 true일 때만!
    if (isJoined && hasPermission && !isStreamingRef.current) {
      console.log('🎤 Auto-starting streaming...')
      const timeoutId = setTimeout(() => {
        if (mountedRef.current && isJoined && hasPermission && !isStreamingRef.current && !hasErrorRef.current) {
          startStreaming()
        }
      }, 1000) // 1초 지연으로 안정성 확보
      
      return () => clearTimeout(timeoutId)
    }
  }, [isJoined, hasPermission, userType]) // startStreaming 제거
  
  return (
    <div className="space-y-3">
      {/* 상태 표시 */}
      <div className="flex items-center space-x-2 text-sm">
        <div className={`w-3 h-3 rounded-full ${
          isStreaming ? 'bg-green-500 animate-pulse' : 
          isConnected ? 'bg-yellow-500' : 'bg-gray-500'
        }`} />
        <span className={
          isStreaming ? 'text-green-600 font-medium' : 
          isConnected ? 'text-yellow-600' : 'text-gray-600'
        }>
          {isStreaming ? '🎤 Gemini Live Active' : status}
        </span>
        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded font-medium">
          Gemini 2.0 Flash (Real-time STT+Translation)
        </span>
      </div>
      
      {/* 연결 상태 */}
      <div className="text-xs text-gray-500 bg-gray-50 p-2 rounded">
        <div>Backend: {isConnected ? 'Connected' : 'Disconnected'}</div>
        <div>Session: {isJoined ? 'Joined' : 'Not joined'}</div>
        <div>Gemini Live: {isStreaming ? 'Active' : 'Inactive'}</div>
        <div>Permission: {hasPermission ? 'Granted' : 'Denied'}</div>
        <div>User Type: {userType}</div>
        <div>Audio Sequence: {audioSequenceRef.current}</div>
        <div>Error State: {hasErrorRef.current ? '❌ Has Error' : '✅ No Error'}</div>
        <div>Stream Available: {streamRef.current ? '✅ Yes' : '❌ No'}</div>
        <div>MediaRecorder State: {mediaRecorderRef.current ? mediaRecorderRef.current.state : 'None'}</div>
        {streamRef.current && (
          <div>Audio Tracks: {streamRef.current.getAudioTracks().length} 
            {streamRef.current.getAudioTracks().map((track, i) => (
              <span key={i} className="ml-1">
                ({track.readyState === 'live' ? '🟢' : '🔴'} {track.label || `Track ${i}`})
              </span>
            ))}
          </div>
        )}
      </div>
      
      {/* 수동 제어 버튼들 (디버깅용) */}
      {userType === 'speaker' && (
        <div className="space-y-2">
          {!hasPermission && (
            <button
              onClick={requestMicrophonePermission}
              className="text-sm bg-blue-100 hover:bg-blue-200 text-blue-800 px-3 py-2 rounded-lg w-full"
            >
              🎤 Grant Microphone Permission
            </button>
          )}
          
          {!isConnected && (
            <button
              onClick={initializeSocket}
              className="text-sm bg-green-100 hover:bg-green-200 text-green-800 px-3 py-2 rounded-lg w-full"
            >
              🔌 Connect to Gemini Live Backend
            </button>
          )}
          
          {isConnected && !isJoined && (
            <button
              onClick={joinSession}
              className="text-sm bg-yellow-100 hover:bg-yellow-200 text-yellow-800 px-3 py-2 rounded-lg w-full"
            >
              🎯 Join Session
            </button>
          )}
          
          {/* 🆕 에러 상태일 때 재시도 버튼 */}
          {hasErrorRef.current && (
            <button
              onClick={resetErrorState}
              className="text-sm bg-red-100 hover:bg-red-200 text-red-800 px-3 py-2 rounded-lg w-full"
            >
              🔄 Reset Error State & Retry
            </button>
          )}
          
          {/* Gemini Live 스트리밍 중지 버튼 */}
          {isStreaming && (
            <button
              onClick={forceStopStreaming}
              className="text-sm bg-orange-100 hover:bg-orange-200 text-orange-800 px-3 py-2 rounded-lg w-full"
            >
              🛑 Force Stop Gemini Live
            </button>
          )}
          
          {/* 수동 Gemini Live 시작 버튼 */}
          {isJoined && hasPermission && !isStreaming && !hasErrorRef.current && (
            <button
              onClick={startStreaming}
              className="text-sm bg-green-100 hover:bg-green-200 text-green-800 px-3 py-2 rounded-lg w-full"
            >
              🎤 Start Gemini Live STT+Translation
            </button>
          )}
          
          {isJoined && (
            <button
              onClick={() => generateSummary('ko')}
              className="text-sm bg-purple-100 hover:bg-purple-200 text-purple-800 px-3 py-2 rounded-lg w-full"
            >
              📄 Generate AI Summary (Korean)
            </button>
          )}
          
          {/* 디버깅 버튼 */}
          <button
            onClick={checkBrowserSupport}
            className="text-sm bg-gray-100 hover:bg-gray-200 text-gray-800 px-3 py-2 rounded-lg w-full"
          >
            🔍 Check Browser Support
          </button>
        </div>
      )}
    </div>
  )
} 