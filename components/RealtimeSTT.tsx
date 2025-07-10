/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import { useEffect, useRef, useState, useCallback } from 'react'

interface RealtimeSTTProps {
  sessionId: string
  isRecording: boolean
  onTranscriptUpdate: (transcript: string, isPartial: boolean) => void
  onError: (error: string) => void
  lang?: string
}

declare global {
  interface Window {
    SpeechRecognition: any
    webkitSpeechRecognition: any
  }
}

export function RealtimeSTT({ 
  sessionId, 
  isRecording, 
  onTranscriptUpdate, 
  onError,
  lang = 'en-US'
}: RealtimeSTTProps) {
  const [isListening, setIsListening] = useState(false)
  const [isSupported, setIsSupported] = useState(false)
  const [hasPermission, setHasPermission] = useState(false)
  const [status, setStatus] = useState('Initializing...')
  
  const recognitionRef = useRef<any>(null)
  const currentSessionRef = useRef<string | null>(null)
  const isActiveRef = useRef(false)
  const mountedRef = useRef(true)
  const finalizeTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const accumulatedTextRef = useRef<string>('')
  
  // 5분 제한 방지를 위한 주기적 재시작 타이머
  const restartTimerRef = useRef<NodeJS.Timeout | null>(null)
  const recognitionStartTimeRef = useRef<number>(0)

  // Track props changes for debugging
  useEffect(() => {
    console.log('🎯 RealtimeSTT Props Update:', {
      sessionId,
      isRecording,
      timestamp: new Date().toLocaleTimeString()
    })
  }, [sessionId, isRecording])

  // Cleanup function
  const cleanup = () => {
    console.log('🧹 Cleaning up recognition...')
    isActiveRef.current = false
    setIsListening(false)
    
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop()
      } catch {
        // Silent cleanup
      }
      recognitionRef.current = null
    }
    
    if (finalizeTimeoutRef.current) {
      clearTimeout(finalizeTimeoutRef.current)
      finalizeTimeoutRef.current = null
    }
    
    // 재시작 타이머도 정리
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current)
      restartTimerRef.current = null
    }
    
    accumulatedTextRef.current = ''
  }

  // Component cleanup on unmount
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      cleanup()
    }
  }, [])

  // Check browser support
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    
    if (SpeechRecognition) {
      setIsSupported(true)
      setStatus('Ready to start')
      console.log('✅ Speech Recognition supported')
    } else {
      setIsSupported(false)
      setStatus('Not supported')
      onError('Speech recognition not supported. Please use Chrome or Edge.')
      console.log('❌ Speech Recognition not supported')
    }
  }, [onError])

  // Check microphone status
  const checkMicrophoneStatus = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      const audioDevices = devices.filter(device => device.kind === 'audioinput')
      
      console.log('🎤 Microphone status check:', {
        devices: audioDevices.length,
        permission: hasPermission,
        isListening,
        timestamp: new Date().toISOString()
      })
      
      if (audioDevices.length === 0) {
        console.warn('⚠️ No microphone devices found')
        return false
      }
      
      // Try to get permission status
      if ('permissions' in navigator) {
        const permission = await navigator.permissions.query({ name: 'microphone' as PermissionName })
        console.log('🎤 Permission status:', permission.state)
        
        if (permission.state === 'granted') {
          setHasPermission(true)
          setStatus('Permission granted')
          console.log('✅ Microphone permission already granted')
          return true
        } else if (permission.state === 'denied') {
          setHasPermission(false)
          setStatus('Permission denied')
          return false
        }
      }
      
      return true
    } catch (error) {
      console.error('❌ Microphone status check failed:', error)
      return false
    }
  }, [hasPermission, isListening])

  // Check microphone status on component mount
  useEffect(() => {
    const initializePermission = async () => {
      const hasPermissionAlready = await checkMicrophoneStatus()
      console.log('🔍 Initial permission check result:', hasPermissionAlready)
      
      // 권한이 이미 있고, 녹음 중이며, 세션이 활성화되어 있다면 자동 시작
      if (hasPermissionAlready && isRecording && sessionId && isActiveRef.current && !isListening) {
        console.log('🚀 Auto-starting recognition on mount (permission already granted)')
        setTimeout(() => {
          if (mountedRef.current && isActiveRef.current && currentSessionRef.current && !isListening) {
            startSpeechRecognition()
          }
        }, 200)
      }
    }
    
    initializePermission()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkMicrophoneStatus, isRecording, sessionId, isListening])

  // Request microphone permission
  const requestMicrophonePermission = async () => {
    try {
      console.log('🎤 Requesting microphone permission...')
      
      // Check if microphone is available
      const devices = await navigator.mediaDevices.enumerateDevices()
      const audioDevices = devices.filter(device => device.kind === 'audioinput')
      console.log('🎤 Available audio devices:', audioDevices.length)
      
      if (audioDevices.length === 0) {
        console.error('❌ No audio input devices found')
        setHasPermission(false)
        setStatus('No microphone found')
        onError('No microphone device found. Please check your microphone connection.')
        return false
      }
      
      // Request permission
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000
        }
      })
      
      console.log('✅ Microphone stream obtained:', {
        tracks: stream.getAudioTracks().length,
        settings: stream.getAudioTracks()[0]?.getSettings()
      })
      
      // Stop the stream immediately
      stream.getTracks().forEach(track => {
        track.stop()
        console.log('🛑 Track stopped:', track.label)
      })
      
      setHasPermission(true)
      setStatus('Permission granted')
      console.log('✅ Microphone permission granted')
      
      // 권한이 부여된 후 즉시 음성 인식 시작 시도
      if (isRecording && sessionId && isActiveRef.current) {
        console.log('🚀 Auto-starting recognition after permission granted')
        setTimeout(() => {
          if (mountedRef.current && isActiveRef.current && currentSessionRef.current) {
            startSpeechRecognition()
          }
        }, 100)
      }
      
      return true
      
    } catch (error) {
      console.error('❌ Microphone permission error:', error)
      setHasPermission(false)
      
      let errorMessage = 'Microphone permission denied.'
      let statusMessage = 'Permission denied'
      
      if (error instanceof Error) {
        if (error.name === 'NotAllowedError') {
          errorMessage = 'Microphone access denied. Please allow microphone access in your browser settings.'
          statusMessage = 'Access denied'
        } else if (error.name === 'NotFoundError') {
          errorMessage = 'No microphone found. Please check your microphone connection.'
          statusMessage = 'No microphone'
        } else if (error.name === 'NotReadableError') {
          errorMessage = 'Microphone is being used by another application. Please close other apps using the microphone.'
          statusMessage = 'Microphone busy'
        } else if (error.name === 'AbortError') {
          errorMessage = 'Microphone access was aborted. Please try again.'
          statusMessage = 'Access aborted'
        } else {
          errorMessage = `Microphone error: ${error.message}`
          statusMessage = 'Error'
        }
      }
      
      setStatus(statusMessage)
      onError(errorMessage)
      return false
    }
  }

  // 5분 제한 방지를 위한 주기적 재시작 함수
  const scheduleRecognitionRestart = () => {
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current)
    }
    
    // 4분 후에 재시작 (5분 제한보다 1분 일찍)
    restartTimerRef.current = setTimeout(() => {
      if (mountedRef.current && isActiveRef.current && currentSessionRef.current) {
        console.log('🔄 Preventive restart to avoid 5-minute timeout (4 minutes elapsed)')
        
        // 현재 인식 중지하고 즉시 재시작
        if (recognitionRef.current) {
          try {
            recognitionRef.current.stop()
          } catch (error) {
            console.warn('Error stopping recognition for restart:', error)
          }
        }
        
        // 짧은 지연 후 재시작
        setTimeout(() => {
          if (mountedRef.current && isActiveRef.current && currentSessionRef.current) {
            console.log('🚀 Restarting recognition after preventive stop')
            startSpeechRecognition()
          }
        }, 200) // 200ms 지연
      }
    }, 4 * 60 * 1000) // 4분으로 단축
  }

  // Start speech recognition
  const startSpeechRecognition = async () => {
    if (!mountedRef.current || !isSupported) {
      console.log('❌ Cannot start: component unmounted or not supported')
      return
    }

    if (!hasPermission) {
      const granted = await requestMicrophonePermission()
      if (!granted) return
    }

    // Prevent duplicate starts
    if (recognitionRef.current || isListening) {
      console.log('⚠️ Recognition already running')
      return
    }

    try {
      console.log('🚀 Starting new recognition instance...')
      recognitionStartTimeRef.current = Date.now()
      
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
      const recognition = new SpeechRecognition()
      
      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = lang

      recognition.onstart = () => {
        if (!mountedRef.current) return
        console.log('🎤 Recognition started')
        setIsListening(true)
        setStatus('Listening...')
        
        // 5분 제한 방지를 위한 재시작 스케줄링
        scheduleRecognitionRestart()
      }

      recognition.onend = () => {
        if (!mountedRef.current) return
        console.log('🛑 Recognition ended')
        setIsListening(false)
        recognitionRef.current = null
        
        // 재시작 타이머 정리
        if (restartTimerRef.current) {
          clearTimeout(restartTimerRef.current)
          restartTimerRef.current = null
        }
        
        // Auto-restart only if still active and not in error state
        if (isActiveRef.current && currentSessionRef.current) {
          console.log('🔄 Auto-restarting recognition...')
          setStatus('Listening...') // Keep showing "Listening" during restart
          setTimeout(() => {
            if (mountedRef.current && isActiveRef.current && currentSessionRef.current) {
              startSpeechRecognition()
            }
          }, 100) // Reduced delay from 1000ms to 100ms
        } else {
          setStatus('Ready to start')
        }
      }

      recognition.onerror = (event: any) => {
        if (!mountedRef.current) return
        console.log('⚠️ Recognition error:', event.error, event.message)
        console.log('⚠️ Recognition error details:', {
          error: event.error,
          message: event.message,
          timestamp: new Date().toISOString(),
          duration: Date.now() - recognitionStartTimeRef.current
        })
        setIsListening(false)
        recognitionRef.current = null
        
        // 재시작 타이머 정리
        if (restartTimerRef.current) {
          clearTimeout(restartTimerRef.current)
          restartTimerRef.current = null
        }
        
        // Reset retry count on critical errors
        if (event.error === 'not-allowed' || event.error === 'aborted') {
          setHasPermission(false)
          isActiveRef.current = false
          
          let errorMessage = 'Speech recognition error.'
          let statusMessage = 'Error'
          
          if (event.error === 'not-allowed') {
            errorMessage = 'Microphone access denied. Please allow microphone access in your browser settings and refresh the page.'
            statusMessage = 'Access denied'
          } else if (event.error === 'aborted') {
            errorMessage = 'Speech recognition was aborted. This usually happens when the microphone is used by another app or browser tab. Please close other apps using the microphone and try again.'
            statusMessage = 'Recognition aborted'
          }
          
          setStatus(statusMessage)
          onError(errorMessage)
          
        } else if (event.error === 'network') {
          // 네트워크 에러 시 자동 재시작 (5분 제한 포함)
          console.log('🌐 Network error detected (likely 5-minute timeout) - restarting silently...')
          setStatus('Reconnecting...')
          
          // 항상 자동으로 재시작 (세션이 활성화되어 있으면)
          if (isActiveRef.current && currentSessionRef.current) {
            setTimeout(() => {
              if (mountedRef.current && isActiveRef.current && currentSessionRef.current) {
                console.log('🔄 Restarting after network error...')
                startSpeechRecognition()
              }
            }, 500) // 0.5초 후 재시작 (더 빠르게)
          } else {
            // 세션이 비활성화된 경우에만 에러 처리
            setStatus('Session ended')
            console.log('🛑 Session ended, not restarting')
          }
        } else if (event.error === 'no-speech') {
          // This is normal during natural pauses, just continue seamlessly
          console.log('⏸️ No speech detected (natural pause), continuing...')
          setStatus('Listening...') // Keep showing "Listening"
          if (isActiveRef.current && currentSessionRef.current) {
            setTimeout(() => {
              if (mountedRef.current && isActiveRef.current && currentSessionRef.current) {
                startSpeechRecognition()
              }
            }, 50) // Very quick restart for natural speech flow
          }
        } else if (event.error === 'audio-capture') {
          setStatus('Audio capture error')
          isActiveRef.current = false
          onError('Audio capture failed. Please check your microphone connection and try again.')
        } else {
          // For other errors, restart immediately without retry limits
          console.log('🔄 Other error, restarting recognition:', event.error)
          setStatus('Listening...') // Keep showing "Listening"
          if (isActiveRef.current && currentSessionRef.current) {
            setTimeout(() => {
              if (mountedRef.current && isActiveRef.current && currentSessionRef.current) {
                startSpeechRecognition()
              }
            }, 200) // Quick restart for other errors
          } else {
            setStatus('Error - please refresh')
            isActiveRef.current = false
            onError(`Speech recognition error: ${event.error}. Please refresh the page and try again.`)
          }
        }
      }

      recognition.onresult = (event: any) => {
        if (!mountedRef.current) return
        
        let currentTranscript = ''
        let isFinalResult = false

        // Process all results from the current recognition
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i]
          const transcript = result[0].transcript

          if (result.isFinal) {
            isFinalResult = true
          }
          currentTranscript += transcript + ' '
        }

        currentTranscript = currentTranscript.trim()
        
        if (currentTranscript) {
          // Clear any existing timeout
          if (finalizeTimeoutRef.current) {
            clearTimeout(finalizeTimeoutRef.current)
            finalizeTimeoutRef.current = null
          }

          // Show interim results immediately for UI
          if (!isFinalResult) {
            // Show accumulated + current for interim results
            const displayText = (accumulatedTextRef.current + ' ' + currentTranscript).trim()
            onTranscriptUpdate(displayText, true) // Show as partial
          } else {
            // Final result: accumulate and send to server
            accumulatedTextRef.current += ' ' + currentTranscript
            accumulatedTextRef.current = accumulatedTextRef.current.trim()
            
            // Only send final results to server (not partial)
            if (accumulatedTextRef.current.length > 0) {
              console.log('🎯 Final transcript:', accumulatedTextRef.current)
              
              // Send to server via STT stream
              fetch('/api/stt-stream', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  type: 'transcript',
                  sessionId: currentSessionRef.current,
                  transcript: accumulatedTextRef.current,
                  isPartial: false // Final result
                })
              }).then(response => {
                if (response.ok) {
                  console.log('✅ Final transcript sent to server')
                } else {
                  console.error('❌ Failed to send transcript to server')
                }
              }).catch(error => {
                console.error('❌ Error sending transcript:', error)
              })
              
              // Show final result in UI
              onTranscriptUpdate(accumulatedTextRef.current, false) // Show as final
              
              // Clear accumulated text for next recognition
              accumulatedTextRef.current = ''
            }
          }

          // Set timeout for finalizing if no more results come
          if (!isFinalResult) {
            finalizeTimeoutRef.current = setTimeout(() => {
              if (mountedRef.current && accumulatedTextRef.current) {
                console.log('⏰ Timeout: Finalizing accumulated text')
                
                // Send accumulated text as final if timeout occurs
                  fetch('/api/stt-stream', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      type: 'transcript',
                      sessionId: currentSessionRef.current,
                      transcript: accumulatedTextRef.current,
                      isPartial: false
                    })
                  }).then(() => {
                  console.log('✅ Timeout transcript sent to server')
                  onTranscriptUpdate(accumulatedTextRef.current, false)
                accumulatedTextRef.current = ''
                })
              }
            }, 600) // 0.6 second timeout - reduced from 3 seconds for better real-time response

          }
        }
      }

      recognitionRef.current = recognition
      recognition.start()
      
    } catch (error) {
      console.error('❌ Failed to start speech recognition:', error)
      setStatus('Failed to start')
      recognitionRef.current = null
    }
  }

  // Handle recording state changes
  useEffect(() => {
    console.log('🔄 Recording state changed:', { 
      isRecording, 
      sessionId, 
      currentSession: currentSessionRef.current,
      isActive: isActiveRef.current,
      mounted: mountedRef.current,
      hasPermission,
      isSupported,
      status
    })
    
    if (isRecording && sessionId) {
      // Starting new session
      if (currentSessionRef.current !== sessionId) {
        currentSessionRef.current = sessionId
        isActiveRef.current = true
        
        console.log('🚀 Initializing NEW session:', sessionId)
        console.log('🔧 Setting isActiveRef to true:', isActiveRef.current)
        
        // Initialize session in database
        fetch('/api/stt-stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'start',
            sessionId
          })
        }).then(() => {
          console.log('✅ Session initialized in DB')
          if (mountedRef.current && isActiveRef.current) {
            console.log('🎯 Attempting to start speech recognition automatically...')
            console.log('🔍 Current state:', { hasPermission, isListening, isActiveRef: isActiveRef.current })
            
            // 권한이 있으면 즉시 시작, 없으면 권한 요청
            if (hasPermission) {
              startSpeechRecognition()
            } else {
              console.log('🎤 No permission yet, will start after permission granted')
              requestMicrophonePermission()
            }
          }
        }).catch(error => {
          console.error('❌ Failed to initialize session:', error)
          onError('Failed to initialize session')
        })
      } else {
        console.log('⚠️ Session already active:', sessionId)
        console.log('🔧 Ensuring isActiveRef is true:', isActiveRef.current)
        
        // 세션이 이미 활성화되어 있다면 isActiveRef도 true로 설정
        if (!isActiveRef.current) {
          isActiveRef.current = true
          console.log('🔧 Set isActiveRef to true for existing session')
        }
        
        // 이미 활성화된 세션이지만 인식이 시작되지 않은 경우 재시도
        if (!isListening && isActiveRef.current) {
          console.log('🔄 Session active but not listening, restarting...')
          console.log('🔍 Current state:', { hasPermission, isListening, isActiveRef: isActiveRef.current })
          
          setTimeout(() => {
            if (mountedRef.current && isActiveRef.current) {
              if (hasPermission) {
                startSpeechRecognition()
              } else {
                console.log('🎤 No permission, requesting...')
                requestMicrophonePermission()
              }
            }
          }, 500)
        }
      }
      
    } else if (!isRecording && currentSessionRef.current) {
      // Stopping session - this should ALWAYS run when isRecording becomes false
      console.log('🛑 isRecording is now FALSE')
      
      const sessionToEnd = currentSessionRef.current
      console.log('🛑 Stopping session:', sessionToEnd)
      console.log('🛑 Before cleanup - isActive:', isActiveRef.current)
      
      // Immediately call STT stream end
      console.log('🛑 IMMEDIATELY calling STT stream end')
      
      fetch('/api/stt-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'end',
          sessionId: sessionToEnd
        })
      }).then(response => {
        console.log('🛑 STT stream end response status:', response.status)
        return response.json()
      })
        .then(data => {
          console.log('✅ STT stream ended successfully:', data)
          if (data.saved) {
            console.log(`📝 Transcript saved with record ID: ${data.recordId}`)
          } else {
            console.log(`⚠️ No transcript content was saved: ${data.message || 'No message'}`)
          }
        })
        .catch(error => {
          console.error('❌ Failed to end STT stream:', error)
        })
      
      // Then cleanup
      cleanup()
      currentSessionRef.current = null
      setStatus('Ready to start')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRecording, sessionId])

  if (!isSupported) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <h4 className="text-sm font-medium text-red-800">Speech Recognition Not Supported</h4>
        <p className="text-xs text-red-700 mt-1">Please use Chrome, Edge, or Safari browser.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Status Display */}
      <div className="flex items-center space-x-2 text-sm">
        <div className={`w-3 h-3 rounded-full ${
          isListening ? 'bg-green-500 animate-pulse' : 
          hasPermission ? 'bg-yellow-500' : 'bg-gray-500'
        }`} />
        <span className={
          isListening ? 'text-green-600 font-medium' : 
          hasPermission ? 'text-yellow-600' : 'text-gray-600'
        }>
          {isListening ? '🎤 Listening' : status}
        </span>
        <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded font-medium">
          Web Speech API
        </span>
      </div>

      {/* Controls */}
      {!hasPermission && (
        <div className="space-y-2">
        <button
          onClick={requestMicrophonePermission}
          className="text-sm bg-blue-100 hover:bg-blue-200 text-blue-800 px-3 py-2 rounded-lg w-full"
        >
          🎤 Grant Microphone Permission
        </button>
          
          {(status.includes('denied') || status.includes('aborted') || status.includes('busy')) && (
            <div className="text-xs text-gray-600 bg-yellow-50 p-2 rounded border border-yellow-200">
              <p className="font-medium text-yellow-800">💡 Troubleshooting:</p>
              <ul className="mt-1 space-y-1 text-yellow-700">
                <li>• Click the microphone icon in the address bar</li>
                <li>• Select &quot;Always allow&quot; for this site</li>
                <li>• Close other apps using the microphone</li>
                <li>• Refresh the page and try again</li>
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Manual Start Button for Debugging */}
      {hasPermission && !isListening && isRecording && (
        <div className="space-y-2">
          <button
            onClick={startSpeechRecognition}
            className="text-sm bg-green-100 hover:bg-green-200 text-green-800 px-3 py-2 rounded-lg w-full"
          >
            🎯 Start Speech Recognition
          </button>
          <div className="text-xs bg-yellow-50 p-2 rounded border border-yellow-200">
            <p className="text-yellow-800">
              ⚠️ Recognition should start automatically. If you see this button, click it to start manually.
            </p>
          </div>
        </div>
      )}

      {/* Debug Info */}
      {process.env.NODE_ENV === 'development' && (
        <div className="text-xs bg-gray-50 p-2 rounded border">
          <p className="text-gray-600">🔍 Debug Info:</p>
          <p className="text-gray-600">• Permission: {hasPermission ? 'Granted' : 'Not granted'}</p>
          <p className="text-gray-600">• Listening: {isListening ? 'Yes' : 'No'}</p>
          <p className="text-gray-600">• Recording: {isRecording ? 'Yes' : 'No'}</p>
          <p className="text-gray-600">• Session: {currentSessionRef.current || 'None'}</p>
          <p className="text-gray-600">• Active: {isActiveRef.current ? 'Yes' : 'No'}</p>
          <p className="text-gray-600">• Status: {status}</p>
          {isListening && (
            <>
              <p className="text-gray-600">• Duration: {Math.floor((Date.now() - recognitionStartTimeRef.current) / 1000)}s</p>
              <p className="text-gray-600">• Next restart: {Math.max(0, Math.floor((240 - (Date.now() - recognitionStartTimeRef.current) / 1000)))}s</p>
            </>
          )}
        </div>
      )}

      {/* Network Error Status */}
      {status === 'Reconnecting...' && (
        <div className="text-xs bg-blue-50 p-2 rounded border border-blue-200">
          <p className="text-blue-800 font-medium">🌐 Network Reconnecting</p>
          <p className="text-blue-700">Automatically restarting speech recognition...</p>
        </div>
      )}
    </div>
  )
} 