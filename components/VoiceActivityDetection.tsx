import { useEffect, useRef, useState } from 'react'

interface VoiceActivityDetectionProps {
  onSpeechStart: () => void
  onSpeechEnd: (audioBlob: Blob) => void
  onSpeechActivity: (isActive: boolean) => void
  threshold?: number
  silenceDuration?: number
}

export function VoiceActivityDetection({
  onSpeechStart,
  onSpeechEnd,
  onSpeechActivity,
  threshold = 0.01,
  silenceDuration = 1000 // 1초 침묵 후 구간 종료
}: VoiceActivityDetectionProps) {
  const [isRecording, setIsRecording] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const animationFrameRef = useRef<number | null>(null)

  // 음성 활동 감지 함수
  const detectVoiceActivity = () => {
    if (!analyserRef.current) return

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount)
    analyserRef.current.getByteFrequencyData(dataArray)

    // RMS (Root Mean Square) 계산
    const rms = Math.sqrt(
      dataArray.reduce((sum, value) => sum + value * value, 0) / dataArray.length
    ) / 255

    const isCurrentlySpeaking = rms > threshold

    // 음성 활동 상태 변화 감지
    if (isCurrentlySpeaking && !isSpeaking) {
      // 음성 시작
      console.log('🎤 Speech started (RMS:', rms.toFixed(3), ')')
      setIsSpeaking(true)
      onSpeechActivity(true)
      onSpeechStart()
      
      // 침묵 타이머 취소
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current)
        silenceTimerRef.current = null
      }
      
      // 새로운 녹음 시작
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'inactive') {
        audioChunksRef.current = []
        mediaRecorderRef.current.start()
      }
    } else if (!isCurrentlySpeaking && isSpeaking) {
      // 침묵 감지 - 타이머 시작
      if (!silenceTimerRef.current) {
        silenceTimerRef.current = setTimeout(() => {
          console.log('🔇 Speech ended (silence detected)')
          setIsSpeaking(false)
          onSpeechActivity(false)
          
          // 녹음 중지 및 오디오 전송
          if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop()
          }
          
          silenceTimerRef.current = null
        }, silenceDuration)
      }
    } else if (isCurrentlySpeaking && isSpeaking) {
      // 계속 말하고 있음 - 침묵 타이머 취소
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current)
        silenceTimerRef.current = null
      }
    }

    // 다음 프레임에서 다시 검사
    animationFrameRef.current = requestAnimationFrame(detectVoiceActivity)
  }

  // 마이크 초기화
  const initializeMicrophone = async () => {
    try {
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
      audioContextRef.current = new AudioContext()
      const source = audioContextRef.current.createMediaStreamSource(stream)
      analyserRef.current = audioContextRef.current.createAnalyser()
      
      analyserRef.current.fftSize = 2048
      analyserRef.current.smoothingTimeConstant = 0.8
      source.connect(analyserRef.current)

      // MediaRecorder 설정
      mediaRecorderRef.current = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      })

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        if (audioBlob.size > 0) {
          onSpeechEnd(audioBlob)
        }
        audioChunksRef.current = []
      }

      setIsRecording(true)
      
      // 음성 활동 감지 시작
      detectVoiceActivity()

    } catch (error) {
      console.error('Microphone initialization failed:', error)
    }
  }

  // 정리 함수
  const cleanup = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
    }
    
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current)
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop()
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
    }

    if (audioContextRef.current) {
      audioContextRef.current.close()
    }

    setIsRecording(false)
    setIsSpeaking(false)
  }

  useEffect(() => {
    initializeMicrophone()
    return cleanup
  }, [])

  return (
    <div className="flex items-center space-x-2">
      <div className={`w-3 h-3 rounded-full ${isSpeaking ? 'bg-red-500 animate-pulse' : 'bg-gray-300'}`} />
      <span className="text-sm text-gray-600">
        {isSpeaking ? 'Speaking...' : 'Listening...'}
      </span>
    </div>
  )
} 