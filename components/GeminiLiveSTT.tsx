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
    hasErrorRef.current = false
    setStatus('Ready to retry')
  }, [])
  
  // WebSocket 연결 초기화
  const initializeSocket = useCallback(() => {
    if (socketRef.current) return
    
    console.log('🔌 Initializing WebSocket connection to backend...')
    
    const socket = io('ws://localhost:3001', {
      transports: ['websocket'],
      timeout: 10000,
      forceNew: true
    })
    
    socketRef.current = socket
    
    // 연결 이벤트
    socket.on('connect', () => {
      console.log('✅ WebSocket connected to backend')
      setIsConnected(true)
      setStatus('Connected to backend')
    })
    
    socket.on('disconnect', () => {
      console.log('❌ WebSocket disconnected from backend')
      setIsConnected(false)
      setIsJoined(false)
      setIsStreaming(false)
      setStatus('Disconnected')
    })
    
    // 세션 참여 응답
    socket.on('session-joined', (data) => {
      console.log('🎯 Session joined:', data)
      setIsJoined(true)
      setStatus('Joined session')
    })
    
    // 실시간 전사 수신 (새로운 구조)
    socket.on('real-time-transcript', (data: TranscriptData) => {
      console.log('📝 Real-time transcript received:', data)
      onTranscriptUpdate(data)
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
    
    // 스트리밍 상태 업데이트
    socket.on('streaming-started', () => {
      console.log('🎤 Streaming started (backend confirmed)')
      setIsStreaming(true)
      setStatus('Streaming active')
    })
    
    socket.on('streaming-stopped', () => {
      console.log('🛑 Streaming stopped (backend confirmed)')
      setIsStreaming(false)
      setStatus('Streaming stopped')
    })
    
    // 에러 처리
    socket.on('error', (error) => {
      console.error('❌ WebSocket error:', error)
      onError(`WebSocket error: ${error.message || error}`)
    })
    
    socket.on('connect_error', (error) => {
      console.error('❌ Connection error:', error)
      onError(`Connection failed: ${error.message}`)
      setStatus('Connection failed')
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
      
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000
        }
      })
      
      console.log('✅ Microphone permission granted')
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
        }
      }
      
      onError(errorMessage)
      return false
    }
  }, [onError])
  
  // 오디오 스트리밍 시작 (새로운 백엔드 방식)
  const startStreaming = useCallback(async () => {
    console.log('[startStreaming] socket:', !!socketRef.current, 'isJoined:', isJoined, 'hasPermission:', hasPermission)
    // 이미 스트리밍 중이거나 에러가 발생한 경우 방지
    if (isStreamingRef.current || hasErrorRef.current) {
      console.log('🚫 Skipping startStreaming: already streaming or has error')
      return
    }
    if (!socketRef.current || !isJoined || !hasPermission) {
      console.log('❌ Not ready for streaming:', { 
        socket: !!socketRef.current, 
        joined: isJoined, 
        permission: hasPermission 
      })
      onError('Not ready for streaming')
      setStatus('Not ready for streaming')
      hasErrorRef.current = true
      if (onRecordingError) onRecordingError() // 반드시 호출
      return
    }
    if (!streamRef.current) {
      const granted = await requestMicrophonePermission()
      if (!granted) {
        onError('Microphone permission denied')
        setStatus('Microphone permission denied')
        hasErrorRef.current = true
        if (onRecordingError) onRecordingError() // 반드시 호출
        return
      }
      // 권한 승인 직후 스트림이 준비될 때까지 충분히 대기
      await new Promise(res => setTimeout(res, 500))
    }
    // 스트림이 정상인지 체크
    if (!streamRef.current || streamRef.current.getAudioTracks().length === 0) {
      onError('마이크 스트림이 비정상적입니다. 마이크를 다시 연결해 주세요.')
      setStatus('Invalid audio stream')
      hasErrorRef.current = true
      if (onRecordingError) onRecordingError() // 반드시 호출
      return
    }
    // MediaRecorder 지원 여부 체크
    let mimeType = ''
    if (window.MediaRecorder && MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
      mimeType = 'audio/webm;codecs=opus'
    } else if (window.MediaRecorder && MediaRecorder.isTypeSupported('audio/webm')) {
      mimeType = 'audio/webm'
    } else {
      onError('이 브라우저는 실시간 음성 스트리밍을 지원하지 않습니다.')
      setStatus('MediaRecorder not supported')
      hasErrorRef.current = true
      if (onRecordingError) onRecordingError() // 반드시 호출
      return
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      onError('이미 오디오 스트리밍이 진행 중입니다.')
      setStatus('Already recording')
      hasErrorRef.current = true
      if (onRecordingError) onRecordingError() // 반드시 호출
      return
    }
    try {
      const mediaRecorder = new MediaRecorder(streamRef.current, { mimeType })
      mediaRecorderRef.current = mediaRecorder
      audioSequenceRef.current = 0
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0 && socketRef.current) {
          audioSequenceRef.current += 1
          const reader = new FileReader()
          reader.onloadend = () => {
            const base64Audio = (reader.result as string).split(',')[1]
            socketRef.current!.emit('audio-chunk', {
              sessionId,
              audioData: base64Audio,
              sequence: audioSequenceRef.current
            })
          }
          reader.readAsDataURL(event.data)
        }
      }
      mediaRecorder.start(100)
      isStreamingRef.current = true
      setIsStreaming(true)
      setStatus('Streaming to backend...')
      hasErrorRef.current = false // 성공 시 에러 플래그 리셋
    } catch (error) {
      console.error('❌ Failed to start streaming:', error)
      onError('Failed to start audio streaming')
      setStatus('Streaming error')
      hasErrorRef.current = true
      if (onRecordingError) onRecordingError() // 반드시 호출
    }
  }, [sessionId, isJoined, hasPermission, requestMicrophonePermission, onError, onRecordingError])
  
  // 오디오 스트리밍 중지
  const stopStreaming = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      console.log('🛑 Stopping audio streaming...')
      mediaRecorderRef.current.stop()
      mediaRecorderRef.current = null
    }
    
    if (socketRef.current && isJoined) {
      socketRef.current.emit('stop-streaming', {
        sessionId
      })
    }
    
    isStreamingRef.current = false
    setIsStreaming(false)
    setStatus('Streaming stopped')
  }, [sessionId, isJoined])
  
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
    initializeSocket()
    
    return () => {
      mountedRef.current = false
      
      // 스트리밍 정리
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop()
      }
      
      // 스트림 정리
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
      }
      
      // WebSocket 정리
      if (socketRef.current) {
        socketRef.current.disconnect()
        socketRef.current = null
      }
    }
  }, [initializeSocket])
  
  // 자동 세션 참여 (연결 후)
  useEffect(() => {
    if (isConnected && !isJoined) {
      // 연결 후 잠시 대기 후 참여
      setTimeout(() => {
        joinSession()
      }, 500)
    }
  }, [isConnected, isJoined, joinSession])

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
    // 반드시 두 조건이 모두 true일 때만!
    if (isJoined && hasPermission && !isStreamingRef.current && !hasErrorRef.current) {
      console.log('🎤 Starting streaming...')
      startStreaming()
    } else if (isStreamingRef.current && (!isJoined || !hasPermission)) {
      // 권한이 사라지거나 세션이 끊기면 스트리밍 중지
      console.log('🛑 Stopping streaming...')
      stopStreaming()
    }
  }, [isJoined, hasPermission, userType, startStreaming, stopStreaming])
  
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
          {isStreaming ? '🎤 Streaming to Backend' : status}
        </span>
        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded font-medium">
          Gemini Live API (Backend)
        </span>
      </div>
      
      {/* 연결 상태 */}
      <div className="text-xs text-gray-500 bg-gray-50 p-2 rounded">
        <div>Backend: {isConnected ? 'Connected' : 'Disconnected'}</div>
        <div>Session: {isJoined ? 'Joined' : 'Not joined'}</div>
        <div>Streaming: {isStreaming ? 'Active' : 'Inactive'}</div>
        <div>Permission: {hasPermission ? 'Granted' : 'Denied'}</div>
        <div>User Type: {userType}</div>
        <div>Audio Sequence: {audioSequenceRef.current}</div>
        {/* 🆕 에러 상태 표시 */}
        <div>Error State: {hasErrorRef.current ? '❌ Has Error' : '✅ No Error'}</div>
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
              🔌 Connect to Backend
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
          
          {isJoined && (
            <button
              onClick={() => generateSummary('ko')}
              className="text-sm bg-purple-100 hover:bg-purple-200 text-purple-800 px-3 py-2 rounded-lg w-full"
            >
              📄 Generate Summary (Korean)
            </button>
          )}
        </div>
      )}
    </div>
  )
} 