'use client'

import { useState, useEffect, useCallback } from 'react'
import { RealtimeSTT } from '@/components/RealtimeSTT'

export default function TestSTTPage() {
  const [sessionId, setSessionId] = useState<string>('')
  const [transcript, setTranscript] = useState('')
  const [isPartial, setIsPartial] = useState(false)
  const [error, setError] = useState('')
  const [testStatus, setTestStatus] = useState('Ready')

  // 🆕 UUID 생성 및 로깅 개선
  useEffect(() => {
    const newSessionId = crypto.randomUUID()
    setSessionId(newSessionId)
    console.log('🆔 Generated Session ID:', newSessionId)
  }, [])

  const handleTranscriptUpdate = useCallback((newTranscript: string, partial: boolean) => {
    setTranscript(newTranscript)
    setIsPartial(partial)
    console.log('📝 Transcript update:', newTranscript, partial)
  }, [])

  const handleError = useCallback((errorMessage: string) => {
    console.error('❌ STT Error:', errorMessage)
    setError(errorMessage)
    setTestStatus('Error')
  }, [])

  // 🆕 마이크 권한 테스트
  const testMicrophonePermission = async () => {
    try {
      setTestStatus('Testing microphone...')
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach(track => track.stop())
      setTestStatus('Microphone ready')
      console.log('✅ Microphone permission test successful')
    } catch (error) {
      setTestStatus('Microphone permission denied')
      setError('Microphone permission denied')
      console.error('❌ Microphone permission test failed:', error)
    }
  }

  return (
    <div className="container mx-auto p-4 space-y-8">
      <h1 className="text-3xl font-bold text-center mb-8">LiveTranscribe - Real-Time STT Test</h1>
      
      {/* 🆕 마이크 권한 요청 버튼 */}
      <div className="text-center">
        <button
          onClick={testMicrophonePermission}
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
        >
          Test Microphone Permission
        </button>
        <p className="text-sm text-gray-600 mt-2">Status: {testStatus}</p>
      </div>

      {/* 🆕 RealtimeSTT 컴포넌트 */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Realtime STT (Live)</h2>
        <RealtimeSTT
          sessionId={sessionId}
          onTranscriptUpdate={handleTranscriptUpdate}
          onError={handleError}
          lang="en-US"
        />
      </div>

      {/* 🆕 결과 표시 */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Results</h2>
        
        <div className="space-y-4">
          <div className="border border-blue-300 rounded p-3 bg-blue-50">
            <h3 className="font-semibold text-blue-800">Session Info:</h3>
            <p><strong>Session ID:</strong> {sessionId}</p>
            <p><strong>Status:</strong> {testStatus}</p>
            <p><strong>Length:</strong> {transcript.length} characters</p>
            <p><strong>Partial:</strong> {isPartial ? 'Yes' : 'No'}</p>
          </div>
          
          {error && (
            <div className="border border-red-300 rounded p-3 bg-red-50">
              <h3 className="font-semibold text-red-800">Error:</h3>
              <p className="text-red-700">{error}</p>
            </div>
          )}
          
          <div className="border border-gray-300 rounded p-3">
            <h3 className="font-semibold">Transcript:</h3>
            <p className="whitespace-pre-wrap min-h-[100px]">{transcript || 'No transcript yet...'}</p>
          </div>
        </div>
      </div>

      {/* 🆕 테스트 방법 안내 */}
      <div className="bg-gray-100 rounded-lg p-4">
        <h3 className="font-semibold mb-2">How to Test:</h3>
        <ol className="list-decimal list-inside space-y-1 text-sm">
          <li>Click "Test Microphone Permission" to allow microphone access</li>
          <li>Click "Start Realtime STT" to begin recording</li>
          <li>Speak clearly into your microphone (English recommended)</li>
          <li>Watch the transcript update in real-time</li>
          <li>Click "Stop Realtime STT" to end recording</li>
        </ol>
        
        <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
          <h4 className="font-semibold text-yellow-800 mb-2">Troubleshooting:</h4>
          <ul className="text-sm text-yellow-700 space-y-1">
            <li>• Make sure your microphone is working and not muted</li>
            <li>• Speak clearly and at a normal volume</li>
            <li>• Check browser console for detailed error messages</li>
            <li>• Try refreshing the page if issues persist</li>
          </ul>
        </div>
      </div>
    </div>
  )
} 