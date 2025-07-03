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
        
        if (permission.state === 'denied') {
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
    checkMicrophoneStatus()
  }, [checkMicrophoneStatus])

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
      }

      recognition.onend = () => {
        if (!mountedRef.current) return
        console.log('🛑 Recognition ended')
        setIsListening(false)
        recognitionRef.current = null
        
        // Auto-restart only if still active and not in error state
        if (isActiveRef.current && currentSessionRef.current) {
          // Add a retry limit to prevent infinite loops
          const retryCount = (window as any).__retryCount || 0
          if (retryCount < 3) {
            (window as any).__retryCount = retryCount + 1
            setStatus('Restarting...')
            setTimeout(() => {
              if (mountedRef.current && isActiveRef.current && currentSessionRef.current) {
                startSpeechRecognition()
              }
            }, 1000) // Increased delay
          } else {
            console.log('⚠️ Max retries reached, stopping auto-restart')
            setStatus('Connection lost - please refresh')
            isActiveRef.current = false
            ;(window as any).__retryCount = 0
          }
        } else {
          setStatus('Ready to start')
          ;(window as any).__retryCount = 0
        }
      }

      recognition.onerror = (event: any) => {
        if (!mountedRef.current) return
        console.log('⚠️ Recognition error:', event.error, event.message)
        console.log('⚠️ Recognition error details:', {
          error: event.error,
          message: event.message,
          timestamp: new Date().toISOString()
        })
        setIsListening(false)
        recognitionRef.current = null
        
        // Reset retry count on critical errors
        if (event.error === 'not-allowed' || event.error === 'aborted') {
          ;(window as any).__retryCount = 0
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
          setStatus('Network error')
          isActiveRef.current = false
          ;(window as any).__retryCount = 0
          onError('Network connection lost. Please check your internet connection and try again.')
        } else if (event.error === 'no-speech') {
          // This is normal, just continue
          console.log('No speech detected, continuing...')
          if (isActiveRef.current && currentSessionRef.current) {
            setTimeout(() => {
              if (mountedRef.current && isActiveRef.current && currentSessionRef.current) {
                startSpeechRecognition()
              }
            }, 100)
          }
        } else if (event.error === 'audio-capture') {
          setStatus('Audio capture error')
          isActiveRef.current = false
          ;(window as any).__retryCount = 0
          onError('Audio capture failed. Please check your microphone connection and try again.')
        } else {
          // For other errors, try limited restart
          const retryCount = (window as any).__retryCount || 0
          if (isActiveRef.current && currentSessionRef.current && retryCount < 3) {
            (window as any).__retryCount = retryCount + 1
            setStatus('Reconnecting...')
            setTimeout(() => {
              if (mountedRef.current && isActiveRef.current && currentSessionRef.current) {
                startSpeechRecognition()
              }
            }, 2000)
          } else {
            console.log('⚠️ Unrecoverable error or max retries')
            setStatus('Error - please refresh')
            isActiveRef.current = false
            ;(window as any).__retryCount = 0
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
            }, 3000) // 3 second timeout
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
      mounted: mountedRef.current 
    })
    
    if (isRecording && sessionId) {
      // Starting new session
      if (currentSessionRef.current !== sessionId) {
        currentSessionRef.current = sessionId
        isActiveRef.current = true
        
        console.log('🚀 Initializing NEW session:', sessionId)
        
        // Reset retry count for new session
        ;(window as any).__retryCount = 0
        
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
            startSpeechRecognition()
          }
        }).catch(error => {
          console.error('❌ Failed to initialize session:', error)
          onError('Failed to initialize session')
        })
      } else {
        console.log('⚠️ Session already active:', sessionId)
      }
      
    } else if (!isRecording) {
      // Stopping session - this should ALWAYS run when isRecording becomes false
      console.log('🛑 isRecording is now FALSE')
      
      if (currentSessionRef.current) {
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
        
      } else {
        console.log('⚠️ No active session to stop')
      }
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
          
          {status.includes('denied') || status.includes('aborted') || status.includes('busy') && (
            <div className="text-xs text-gray-600 bg-yellow-50 p-2 rounded border border-yellow-200">
              <p className="font-medium text-yellow-800">💡 Troubleshooting:</p>
              <ul className="mt-1 space-y-1 text-yellow-700">
                <li>• Click the microphone icon in the address bar</li>
                <li>• Select "Always allow" for this site</li>
                <li>• Close other apps using the microphone</li>
                <li>• Refresh the page and try again</li>
              </ul>
            </div>
          )}
        </div>
      )}
      
      {hasPermission && !isListening && isRecording && (
        <button
          onClick={startSpeechRecognition}
          className="text-sm bg-green-100 hover:bg-green-200 text-green-800 px-3 py-2 rounded-lg w-full"
        >
          ▶️ Start Recognition
        </button>
      )}

      {/* Debug Info (simplified) */}
      <div className="text-xs text-gray-500 bg-gray-50 p-2 rounded">
        <div>Session: {currentSessionRef.current ? 'Active' : 'None'}</div>
        <div>Status: {status}</div>
        <div>Listening: {isListening ? 'Yes' : 'No'}</div>
        <div>Permission: {hasPermission ? 'Granted' : 'Denied'}</div>
        <div>Supported: {isSupported ? 'Yes' : 'No'}</div>
        {status.includes('Error') || status.includes('denied') || status.includes('aborted') ? (
          <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded">
            <p className="font-medium text-red-700">🚨 Error Details:</p>
            <p className="text-red-600">{status}</p>
            <button
              onClick={checkMicrophoneStatus}
              className="mt-1 text-xs bg-red-100 hover:bg-red-200 text-red-700 px-2 py-1 rounded"
            >
              🔍 Check Microphone Status
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
} 